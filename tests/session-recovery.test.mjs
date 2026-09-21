import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function harness({ refreshError, rejectAgain = false, networkRetry = false } = {}) {
  let stored = { access_token: 'stored', user: { id: 'one' } };
  const calls = []; let refreshes = 0; let signouts = 0;
  const context = vm.createContext({
    console, setTimeout, AbortController, DOMException,
    state: { session: { access_token: 'stale-memory' }, dataRequestVersion: 0,
      client: { auth: {
        getSession: async () => ({ data: { session: stored } }),
        refreshSession: async () => {
          refreshes++;
          await new Promise(resolve => setTimeout(resolve, 5));
          if (refreshError) return { error: refreshError };
          stored = { access_token: 'fresh', user: { id: 'one' } };
          return { data: { session: stored } };
        },
        signOut: async () => { signouts++; stored = null; },
      } },
    },
    render() {}, apiUrl: path => path, idempotencyKey: () => 'key',
    fetch: async (_path, options) => {
      calls.push(options.headers.Authorization);
      if (networkRetry && options.headers.Authorization === 'Bearer fresh') throw Error('offline');
      const ok = !rejectAgain && options.headers.Authorization === 'Bearer fresh';
      return { ok, status: ok ? 200 : 401,
        json: async () => ok ? { success: true, data: { ready: true } } :
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Token is invalid or expired.' } },
      };
    },
  });
  vm.runInContext('let workspaceGeneration = 0; let workspaceLoadingPromise = null;\n' +
    source.slice(source.indexOf('class ApiError'), source.indexOf('function showNotice')), context);
  return { context, calls, stats: () => ({ refreshes, signouts }),
    run: expression => vm.runInContext(expression, context), setStored: value => { stored = value; } };
}

test('restoration reads persisted session instead of stale memory', async () => {
  const h = harness();
  assert.equal((await h.run('getValidSession()')).access_token, 'stored');
  h.setStored(null);
  assert.equal(await h.run('getValidSession()'), null);
});

test('concurrent rejected requests share one refresh and retry with current token', async () => {
  const h = harness();
  await h.run("Promise.all([api('/one'), api('/two'), api('/three')])");
  assert.equal(h.stats().refreshes, 1);
  assert.equal(h.stats().signouts, 0);
  assert.equal(h.calls.filter(value => value === 'Bearer fresh').length, 3);
});

test('revoked refresh token clears local session and opens sign in', async () => {
  const h = harness({ refreshError: { code: 'refresh_token_not_found', status: 400 } });
  await assert.rejects(h.run("api('/one')"));
  assert.equal(h.context.state.session, null);
  assert.equal(h.context.state.authMode, 'signin');
  assert.equal(h.context.state.workspaceError, '');
  assert.equal(h.stats().signouts, 1);
});

test('second 401 ends session without an infinite retry', async () => {
  const h = harness({ rejectAgain: true });
  await assert.rejects(h.run("api('/one')"));
  assert.equal(h.calls.length, 2);
  assert.equal(h.stats().signouts, 1);
  assert.equal(h.context.state.session, null);
});

test('network failure during refresh preserves the login', async () => {
  const h = harness({ refreshError: { name: 'AuthRetryableFetchError', status: 0, message: 'offline' } });
  await assert.rejects(h.run("api('/one')"));
  assert.equal(h.stats().signouts, 0);
  assert.ok(h.context.state.session);
});

test('network failure on retry does not become session expiry', async () => {
  const h = harness({ networkRetry: true });
  await assert.rejects(h.run("api('/one')"), { code: 'NETWORK_ERROR' });
  assert.equal(h.stats().signouts, 0);
});

test('expired session invalidates pending workspace and merchant reads', async () => {
  const h = harness();
  h.run('workspaceLoadingPromise = Promise.resolve();');
  await h.run('handleSessionExpired()');
  assert.equal(h.context.state.dataRequestVersion, 1);
  assert.equal(h.run('workspaceGeneration'), 1);
  assert.equal(h.run('workspaceLoadingPromise'), null);
  h.setStored({ access_token: 'new-login' });
  assert.equal((await h.run('getValidSession()')).access_token, 'new-login');
});

test('a late rejection from an old session cannot sign out a new login', async () => {
  const h = harness();
  let respond;
  h.context.fetch = () => new Promise(resolve => { respond = resolve; });
  const pending = h.run("api('/old')");
  await new Promise(resolve => setTimeout(resolve, 0));
  await h.run('handleSessionExpired()');
  h.setStored({ access_token: 'new-login' });
  await h.run('getValidSession()');
  respond({ ok: false, status: 401 });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(h.context.state.session.access_token, 'new-login');
  assert.equal(h.stats().signouts, 1);
});
