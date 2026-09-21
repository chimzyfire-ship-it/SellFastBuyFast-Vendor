import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const helperStart = source.indexOf('function productCategoryProfile(categoryName');
const helperEnd = source.indexOf('function safeMediaUrl(value)', helperStart);
const uploadStart = source.indexOf('async function uploadProductMediaImage(file)');
const uploadEnd = source.indexOf("document.addEventListener('dragover'", uploadStart);
function harness(upload = async () => ({ error: null }), dimensions = { width: 1200, height: 1200 }) {
  const nodes = new Map();
  for (const id of ['prod-image', 'prod-image-file', 'prod-image-upload-status', 'cover-thumb-preview']) {
    nodes.set(id, { value: '', style: {}, dispatchEvent() {}, removeAttribute() {}, setAttribute() {} });
  }
  const submit = { disabled: false };
  const notices = [];
  let signingCalls = 0;
  const state = {
    merchant: { id: 'merchant-one' }, productDraft: {},
    client: { storage: { from: () => ({ uploadToSignedUrl: upload }) } },
  };
  const context = vm.createContext({
    state,
    document: {
      getElementById: (id) => nodes.get(id),
      querySelector: () => null,
      querySelectorAll: () => [submit],
    },
    URL: {
      createObjectURL: () => 'blob:test-image',
      revokeObjectURL() {},
    },
    Image: class {
      constructor() {
        this.naturalWidth = dimensions.width;
        this.naturalHeight = dimensions.height;
      }
      set src(_value) {
        this.onload();
      }
    },
    api: async () => { signingCalls++; return { path: 'merchant-one/products/photo.png', token: 'signed', signedUrl: 'https://storage.invalid/upload', publicUrl: 'https://storage.invalid/photo.png' }; },
    showNotice: (message, type) => notices.push({ message, type }),
    escapeHtml: (value) => value, icon: () => '', Event: class {}, console: { error() {} },
  });
  vm.runInContext(source.slice(helperStart, helperEnd) + source.slice(uploadStart, uploadEnd), context);
  return { run: (file) => context.uploadProductMediaImage(file), state, nodes, notices, submit, calls: () => signingCalls };
}
const photo = { name: 'photo.png', type: 'image/png', size: 1024 };

test('Successful upload fills the saved draft and image field only after storage succeeds', async () => {
  const h = harness();
  await h.run(photo);
  assert.equal(h.state.productDraft.imageUrl, 'https://storage.invalid/photo.png');
  assert.equal(h.nodes.get('prod-image').value, h.state.productDraft.imageUrl);
  assert.equal(h.state.isUploadingProductImage, false);
  assert.equal(h.submit.disabled, false);
});

test('Storage failures preserve the previous photo and allow retrying the same file', async () => {
  let attempts = 0;
  const h = harness(async () => ({ error: attempts++ === 0 ? { message: 'Upload interrupted' } : null }));
  h.state.productDraft.imageUrl = 'https://storage.invalid/previous.png';
  h.nodes.get('prod-image-file').value = 'photo.png';
  await h.run(photo);
  assert.equal(h.state.productDraft.imageUrl, 'https://storage.invalid/previous.png');
  assert.equal(h.nodes.get('prod-image-file').value, '');
  assert.equal(h.notices.at(-1).type, 'error');
  await h.run(photo);
  assert.equal(h.state.productDraft.imageUrl, 'https://storage.invalid/photo.png');
});

test('Concurrent uploads are ignored and an upload cannot overwrite a different merchant draft', async () => {
  let complete;
  const h = harness(() => new Promise((resolve) => { complete = resolve; }));
  const pending = h.run(photo);
  await Promise.resolve();
  assert.equal(h.submit.disabled, true);
  await h.run(photo);
  assert.equal(h.calls(), 1);
  h.state.merchant = { id: 'merchant-two' };
  h.state.productDraft = { imageUrl: 'https://storage.invalid/other.png' };
  complete({ error: null });
  await pending;
  assert.equal(h.state.productDraft.imageUrl, 'https://storage.invalid/other.png');
});

test('A non-recommended image size uploads for Operations review instead of blocking the listing', async () => {
  const h = harness(undefined, { width: 320, height: 1200 });
  await h.run(photo);
  assert.equal(h.calls(), 1);
  assert.equal(h.state.productDraft.imageUrl, 'https://storage.invalid/photo.png');
  assert.equal(h.state.productDraft.imageValidation.valid, true);
  assert.equal(h.state.productDraft.imageValidation.meetsGridRecommendation, false);
  assert.match(h.nodes.get('prod-image-upload-status').innerHTML, /Recommended for the customer app grid/);
});

test('Unsupported formats and oversized files never request an upload', async () => {
  const h = harness();
  await h.run({ ...photo, type: 'image/heic' });
  await h.run({ ...photo, size: 6 * 1024 * 1024 });
  assert.equal(h.calls(), 0);
  assert.equal(h.notices.length, 2);
});

test('Save as Draft uses validated server submission instead of adding a temporary catalogue row', () => {
  const actionStart = source.indexOf("  if (action === 'save-as-draft') {");
  const actionEnd = source.indexOf('  // Simulator mini toast helper', actionStart);
  let submitted = false;
  const form = { elements: { submitForReview: { checked: true } }, requestSubmit() { submitted = true; } };
  const state = { productDraft: {} };
  vm.runInNewContext(`(() => { ${source.slice(actionStart, actionEnd)} })()`, {
    action: 'save-as-draft', state, document: { getElementById: () => form },
  });
  assert.equal(submitted, true);
  assert.equal(form.elements.submitForReview.checked, false);
  assert.equal(state.productDraft.submitForReview, false);
});

test('Product Studio uses its native form submit instead of the catalogue-row submit action', () => {
  const studioStart = source.indexOf('<form id="product-form"');
  const studioEnd = source.indexOf('</form>', studioStart);
  const studio = source.slice(studioStart, studioEnd);
  assert.match(studio, /<button class="btn btn-primary" type="submit"/);
  assert.doesNotMatch(studio, /type="submit" data-action="submit-product"/);
});
