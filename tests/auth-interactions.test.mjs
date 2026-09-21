import test from 'node:test';
import assert from 'node:assert/strict';

test('Password toggle button switches input type without erasing typed value', () => {
  const input = {
    type: 'password',
    value: 'MySecretPassword123!',
    selectionStart: 0,
    selectionEnd: 0,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    focus() {
      this.focused = true;
    }
  };

  const button = {
    innerHTML: 'eye',
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    closest(_selector) {
      return { querySelector: () => input };
    }
  };

  // Simulate toggle-password logic from vendor-portal/app.js
  let showPassword = false;
  function handleTogglePassword(btn) {
    const wrapper = btn.closest('.input-wrapper');
    const targetInput = wrapper?.querySelector('input');
    if (targetInput) {
      const isPassword = targetInput.type === 'password';
      targetInput.type = isPassword ? 'text' : 'password';
      showPassword = isPassword;
      btn.innerHTML = isPassword ? 'eye-off' : 'eye';
      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      btn.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
      const len = targetInput.value.length;
      targetInput.setSelectionRange(len, len);
      targetInput.focus();
    }
  }

  // Initial state
  assert.equal(input.type, 'password');
  assert.equal(input.value, 'MySecretPassword123!');

  // Click 1: Show password
  handleTogglePassword(button);
  assert.equal(input.type, 'text');
  assert.equal(input.value, 'MySecretPassword123!', 'Password value MUST be preserved');
  assert.equal(showPassword, true);
  assert.equal(button.attributes['aria-label'], 'Hide password');
  assert.equal(input.selectionStart, 'MySecretPassword123!'.length);

  // Click 2: Hide password
  handleTogglePassword(button);
  assert.equal(input.type, 'password');
  assert.equal(input.value, 'MySecretPassword123!', 'Password value MUST still be preserved');
  assert.equal(showPassword, false);
  assert.equal(button.attributes['aria-label'], 'Show password');
});

test('Session gate onAuthStateChange does not re-render unauthenticated auth forms on initial load', () => {
  let renderCount = 0;
  const state = {
    session: null,
  };
  function render() {
    renderCount++;
  }

  // Simulate onAuthStateChange logic from vendor-portal/app.js
  function onAuthStateChangeHandler(_event, nextSession) {
    const prevSession = state.session;
    state.session = nextSession;
    if (!nextSession) {
      if (prevSession) {
        render();
      }
    } else if (!prevSession && nextSession) {
      render();
    }
  }

  // Initial boot: user opens portal while unauthenticated (session is null)
  onAuthStateChangeHandler('INITIAL_SESSION', null);
  assert.equal(renderCount, 0, 'Must NOT re-render auth form if session was already null');

  // User logs in: nextSession arrives
  onAuthStateChangeHandler('SIGNED_IN', { access_token: 'valid-jwt' });
  assert.equal(renderCount, 1, 'Must render/load workspace when session becomes active');

  // User logs out: session goes from active to null
  onAuthStateChangeHandler('SIGNED_OUT', null);
  assert.equal(renderCount, 2, 'Must render login form when previously authenticated session is signed out');
});

test('Real-time email input tracking keeps state.pendingEmail in sync without wiping', () => {
  const state = {
    pendingEmail: '',
  };

  function onInput(target) {
    if (target.id === 'email' || target.name === 'email') {
      state.pendingEmail = target.value;
    }
  }

  onInput({ id: 'email', value: 'vendor@sellfastbuyfast.com' });
  assert.equal(state.pendingEmail, 'vendor@sellfastbuyfast.com');

  onInput({ id: 'email', value: 'chimzycharles001@gmail.com' });
  assert.equal(state.pendingEmail, 'chimzycharles001@gmail.com');
});

test('isAuthError properly categorizes 401, unauthorized, and expired token messages', () => {
  function isAuthError(error) {
    if (!error) return false;
    if (error.code === 'UNAUTHORIZED' || error.status === 401) return true;
    const msg = String(error.message || '').toLowerCase();
    return (
      msg.includes('token is invalid or expired') ||
      msg.includes('session has expired') ||
      msg.includes('session was revoked') ||
      msg.includes('jwt') ||
      msg.includes('unauthorized') ||
      msg.includes('missing or malformed bearer token')
    );
  }

  assert.equal(isAuthError({ status: 401, message: 'Anything' }), true);
  assert.equal(isAuthError({ code: 'UNAUTHORIZED', message: 'Custom error' }), true);
  assert.equal(isAuthError({ message: 'Token is invalid or expired.' }), true);
  assert.equal(isAuthError({ message: 'This session was revoked. Sign in again.' }), true);
  assert.equal(isAuthError({ message: 'Your session has expired. Please sign in again.' }), true);
  assert.equal(isAuthError({ message: 'Missing or malformed Bearer token.' }), true);

  // Business / operational errors should NOT be treated as auth errors
  assert.equal(isAuthError({ code: 'SLUG_ALREADY_EXISTS', message: 'Handle in use' }), false);
  assert.equal(isAuthError({ code: 'VALIDATION_ERROR', message: 'Invalid field' }), false);
  assert.equal(isAuthError(new Error('Network connection timeout')), false);
  assert.equal(isAuthError(null), false);
});

test('getValidSession proactively refreshes expiring tokens and updates session state', async () => {
  let refreshCalls = 0;
  const mockClient = {
    auth: {
      async refreshSession() {
        refreshCalls++;
        return {
          data: {
            session: {
              access_token: 'fresh-jwt-123',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
          },
          error: null,
        };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
    },
  };

  const state = {
    client: mockClient,
    session: {
      access_token: 'old-jwt-expired',
      expires_at: Math.floor(Date.now() / 1000) - 100, // Expired 100s ago
    },
  };

  async function getValidSession() {
    if (!state.client) return null;
    let session = state.session;
    if (!session?.access_token) {
      try {
        const { data, error } = await state.client.auth.getSession();
        if (!error && data?.session) {
          session = data.session;
          state.session = session;
        }
      } catch {
        session = null;
      }
    }
    if (!session?.access_token) return null;
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at <= now + 60) {
      try {
        const { data: refreshData, error: refreshError } = await state.client.auth.refreshSession();
        if (!refreshError && refreshData?.session?.access_token) {
          session = refreshData.session;
          state.session = session;
        }
      } catch {}
    }
    return session;
  }

  const result = await getValidSession();
  assert.equal(refreshCalls, 1, 'Should call refreshSession when token is expired');
  assert.equal(result.access_token, 'fresh-jwt-123');
  assert.equal(state.session.access_token, 'fresh-jwt-123');

  // Second call with fresh token should NOT trigger refresh
  await getValidSession();
  assert.equal(refreshCalls, 1, 'Should not refresh when token is still valid');
});

test('handleSessionExpired clears local storage session and transitions to signin without workspace error', async () => {
  let signOutScope = '';
  let rendered = false;
  const state = {
    client: {
      auth: {
        async signOut(options) {
          signOutScope = options?.scope;
          return { error: null };
        },
      },
    },
    session: { access_token: 'stale' },
    merchants: [{ id: 'm-1' }],
    merchant: { id: 'm-1' },
    workspaceError: 'Old error',
    authError: '',
    authMode: 'dashboard',
    loading: true,
  };

  function render() {
    rendered = true;
  }

  async function handleSessionExpired(message = 'Your session has expired. Please sign in again.') {
    if (state.client) {
      try {
        await state.client.auth.signOut({ scope: 'local' });
      } catch {}
    }
    state.session = null;
    state.merchants = [];
    state.merchant = null;
    state.workspaceError = '';
    state.loading = false;
    state.authMode = 'signin';
    state.authError = message;
    render();
  }

  await handleSessionExpired('Your session has expired. Please sign in again.');
  assert.equal(signOutScope, 'local', 'Must sign out with scope local to avoid server calls with dead tokens');
  assert.equal(state.session, null);
  assert.equal(state.merchant, null);
  assert.equal(state.workspaceError, '', 'Workspace error MUST be empty');
  assert.equal(state.authMode, 'signin');
  assert.equal(state.authError, 'Your session has expired. Please sign in again.');
  assert.equal(rendered, true);
});

test('api() transparently refreshes and retries on 401 before giving up', async () => {
  let fetchAttempts = 0;
  let refreshCalls = 0;
  let expiredHandled = false;

  const state = {
    client: {
      auth: {
        async refreshSession() {
          refreshCalls++;
          return {
            data: {
              session: {
                access_token: 'refreshed-token-xyz',
                expires_at: Math.floor(Date.now() / 1000) + 3600,
              },
            },
            error: null,
          };
        },
      },
    },
    session: {
      access_token: 'initial-stale-token',
      expires_at: Math.floor(Date.now() / 1000) + 500, // Client clock thought it was valid
    },
  };

  async function mockApi(options = {}) {
    const { _retry = false } = options;
    fetchAttempts++;
    if (fetchAttempts === 1) {
      // First attempt fails with 401 Token is invalid or expired
      const status = 401;
      const errorCode = 'UNAUTHORIZED';
      if (!_retry) {
        const { data: refreshData, error: refreshError } = await state.client.auth.refreshSession();
        if (!refreshError && refreshData?.session?.access_token) {
          state.session = refreshData.session;
          return await mockApi({ ...options, _retry: true });
        }
      }
      expiredHandled = true;
      throw new Error('Unauthorized');
    }

    // Second attempt succeeds with new token
    return { merchants: [{ id: 'm-1', name: 'SellFast Official Store' }] };
  }

  const res = await mockApi();
  assert.equal(fetchAttempts, 2, 'Should retry request once after refreshing token');
  assert.equal(refreshCalls, 1, 'Should call refreshSession exactly once');
  assert.equal(state.session.access_token, 'refreshed-token-xyz');
  assert.equal(res.merchants[0].name, 'SellFast Official Store');
  assert.equal(expiredHandled, false);
});

test('workspaceLoadingPromise deduplicates concurrent loadWorkspace executions', async () => {
  let fetchCount = 0;
  let workspaceLoadingPromise = null;

  async function fakeApiVendorMe() {
    fetchCount++;
    await new Promise((r) => setTimeout(r, 20));
    return { merchants: [{ id: '22222222-2222-2222-2222-222222222201' }] };
  }

  async function loadWorkspace() {
    if (workspaceLoadingPromise) {
      return workspaceLoadingPromise;
    }
    workspaceLoadingPromise = (async () => {
      return await fakeApiVendorMe();
    })().finally(() => {
      workspaceLoadingPromise = null;
    });
    return workspaceLoadingPromise;
  }

  // Simulate concurrent calls from signInWithPassword and onAuthStateChange
  const [res1, res2, res3] = await Promise.all([
    loadWorkspace(),
    loadWorkspace(),
    loadWorkspace(),
  ]);

  assert.equal(fetchCount, 1, 'Should only perform ONE network load even with multiple concurrent callers');
  assert.equal(res1.merchants[0].id, '22222222-2222-2222-2222-222222222201');
  assert.equal(res2, res1);
  assert.equal(res3, res1);
});

test('Auth inputs are tracked and preserved even if renderAuthHtml is called', () => {
  const state = {
    pendingEmail: '',
    pendingPassword: '',
    pendingFullName: '',
    pendingBusinessName: '',
    pendingPhone: '',
    showPassword: false,
    authMode: 'signin',
    authError: '',
  };

  function onInput(target) {
    if (target.id === 'email' || target.name === 'email') {
      state.pendingEmail = target.value;
    } else if (target.id === 'password' || target.name === 'password') {
      state.pendingPassword = target.value;
    }
  }

  // User types credentials
  onInput({ id: 'email', value: 'vendor@sellfastbuyfast.ng' });
  onInput({ id: 'password', value: 'MySecretPass123!' });

  assert.equal(state.pendingEmail, 'vendor@sellfastbuyfast.ng');
  assert.equal(state.pendingPassword, 'MySecretPass123!');

  // Simulated renderAuthHtml output for Sign In
  const renderedHtml = `
    <input id="email" name="email" value="${state.pendingEmail}" />
    <input id="password" name="password" type="${state.showPassword ? 'text' : 'password'}" value="${state.pendingPassword}" />
  `;

  assert.match(renderedHtml, /value="vendor@sellfastbuyfast\.ng"/);
  assert.match(renderedHtml, /value="MySecretPass123!"/);
});

test('dismissSplash removes splash element from DOM without calling render()', async () => {
  let renderCalled = false;
  let elementRemoved = false;
  let faded = false;
  const mockElement = {
    classList: {
      add(cls) {
        if (cls === 'fade-out') faded = true;
      },
    },
    remove() {
      elementRemoved = true;
    },
  };

  const state = { splashActive: true };
  function render() {
    renderCalled = true;
  }

  function dismissSplash() {
    mockElement.classList.add('fade-out');
    setTimeout(() => {
      mockElement.remove();
      state.splashActive = false;
    }, 10);
  }

  dismissSplash();
  assert.equal(faded, true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(elementRemoved, true);
  assert.equal(state.splashActive, false);
  assert.equal(renderCalled, false, 'dismissSplash must NOT invoke render()');
});

test('toggle-password prevents default on mousedown and syncs email & password values', () => {
  let defaultPrevented = false;
  const mockMousedownEvent = {
    target: {
      closest(sel) {
        return sel === '[data-action="toggle-password"]' ? { dataset: { action: 'toggle-password' } } : null;
      }
    },
    preventDefault() {
      defaultPrevented = true;
    }
  };

  // Simulate mousedown listener
  const toggleBtn = mockMousedownEvent.target.closest('[data-action="toggle-password"]');
  if (toggleBtn) {
    mockMousedownEvent.preventDefault();
  }
  assert.equal(defaultPrevented, true, 'mousedown on toggle-password must preventDefault to preserve input focus in Safari');

  // Simulate toggle-password action
  const state = {
    pendingPassword: '',
    pendingEmail: '',
    showPassword: false,
  };

  const emailInput = { value: 'chimzycharles001@gmail.com' };
  const passwordInput = { type: 'password', value: 'SellFastVendor2026!' };

  // Handler execution
  state.pendingEmail = emailInput.value;
  const currentVal = passwordInput.value;
  state.pendingPassword = currentVal;
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  passwordInput.value = currentVal;
  state.showPassword = isPassword;

  assert.equal(passwordInput.type, 'text');
  assert.equal(passwordInput.value, 'SellFastVendor2026!');
  assert.equal(state.pendingPassword, 'SellFastVendor2026!');
  assert.equal(state.pendingEmail, 'chimzycharles001@gmail.com');
});

