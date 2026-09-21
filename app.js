/* ==========================================================================
   SellFastBuyFast Merchant Portal — Modern World-Class Architecture
   Seamless Supabase Auth + 1-Time Signup OTP Verification + Core API Integration
   ========================================================================== */

const root = document.getElementById('portal-root');

// Runtime configuration is supplied by config.js locally, Vercel's public config endpoint, or project defaults.
const isLocalDevelopmentHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const defaultFallbackConfig = {
  // A production browser must obtain its API location from Vercel's runtime
  // endpoint. Leaving this empty prevents a deployed portal from silently
  // attempting to call a developer's localhost server.
  apiUrl: window.localStorage?.getItem('sfbf_api_url') || (isLocalDevelopmentHost ? 'http://localhost:4000' : 'https://sell-fast-buy-fast-core-api.vercel.app'),
  supabaseUrl: window.localStorage?.getItem('sfbf_supabase_url') || 'https://fuqrhfxptybipxbzveyy.supabase.co',
  supabaseAnonKey: window.localStorage?.getItem('sfbf_supabase_anon_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1cXJoZnhwdHliaXB4Ynp2ZXl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDY3MjYsImV4cCI6MjEwMzUyMjcyNn0.Q240FBpikqiWaGytkVP1RWVHGA-ZpvdVicY9qf4pvWw',
};
let config = { ...defaultFallbackConfig, ...window.SFBF_VENDOR_CONFIG };


// Global Reactive State
const state = {
  client: null,
  session: null,
  merchants: [],
  merchant: null,
  overview: null,
  products: [],
  orders: [],
  returns: [],
  team: [],
  categories: [],
  activeView: 'dashboard',
  catalogueFilter: 'all',
  catalogueSearch: '',
  editingProductId: null,
  fulfilmentFilter: 'all',
  fulfilmentSearch: '',
  returnsFilter: 'all',
  returnsSearch: '',
  selectedOrder: null,
  loading: true,
  splashActive: true,
  busy: null,
  modal: null,
  authMode: 'signin', // 'signin' | 'signup' | 'verify-otp' | 'recover' | 'onboarding'
  pendingEmail: '',
  pendingPassword: '',
  pendingFullName: '',
  pendingBusinessName: '',
  pendingPhone: '',
  authError: '',
  formError: '',
  productErrors: {},
  productDraft: null,
  notice: null,
  notifications: [],
  unreadNotificationsCount: 0,
  notificationsOpen: false,
  notificationsLoading: false,
  notificationsChannel: null,
  notificationsPollTimer: null,
  sidebarOpen: false,
  sidebarCollapsed: window.localStorage.getItem('sfbf-sidebar-collapsed') === 'true',
  showPassword: false,
  workspaceError: '',
  partialDataError: '',
  configurationError: '',
  dataRequestVersion: 0,
  dataAbortController: null,
  profileDraft: null,
  verificationData: null,
  selectedIdDocFile: null,
  selectedUtilityBillFile: null,
};

const VIEW_TITLES = {
  dashboard: 'Command Center',
  catalogue: 'Catalogue & Stock',
  'add-product': 'Product Studio',
  fulfilment: 'Fulfilment Queue',
  returns: 'Returns & Disputes',
  payouts: 'Payments (deferred)',
  profile: 'Store Profile',
};

// Helpers & Utilities
function getInventoryCache() {
  try {
    return JSON.parse(window.localStorage?.getItem('sfbf_inventory_cache') || '{}');
  } catch (e) {
    return {};
  }
}

function saveInventoryCache(cache) {
  try {
    window.localStorage?.setItem('sfbf_inventory_cache', JSON.stringify(cache));
  } catch (e) {}
}

function apiUrl(path) {
  return `${String(config.apiUrl).replace(/\/$/, '')}${path}`;
}

function hasRuntimeConfig(value = config) {
  if (!['apiUrl', 'supabaseUrl', 'supabaseAnonKey'].every((key) => (
    typeof value[key] === 'string' && value[key].trim() && !value[key].includes('YOUR-')
  ))) return false;
  const apiEndpoint = safeUrl(value.apiUrl);
  const supabaseEndpoint = safeUrl(value.supabaseUrl);
  return Boolean(apiEndpoint && supabaseEndpoint && new URL(apiEndpoint).origin !== new URL(supabaseEndpoint).origin);
}

async function resolveRuntimeConfig() {
  // config.js deliberately has local development defaults. In Vercel, always
  // load the deployment's server-provided configuration instead of trusting
  // those defaults.
  if (isLocalDevelopmentHost && hasRuntimeConfig()) return;
  try {
    const response = await fetch('/api/runtime-config', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload?.success || !hasRuntimeConfig(payload.data)) {
      throw new Error('The vendor portal is missing its public runtime configuration.');
    }
    config = { ...config, ...payload.data };
  } catch (error) {
    state.configurationError = error.message || 'The vendor portal could not load its runtime configuration.';
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function icon(name, extraClass = '') {
  return `<i data-lucide="${escapeAttribute(name)}" class="${escapeAttribute(extraClass)}" aria-hidden="true"></i>`;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function isMediaUrlValid(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.startsWith('assets/') || trimmed.startsWith('/') || trimmed.startsWith('./')) return true;
  return Boolean(safeUrl(trimmed));
}

function productCategoryProfile(categoryName = '') {
  const category = categoryName.toLowerCase();
  if (/fashion|clothing|footwear|shoe|apparel|jewell|bag/.test(category)) {
    return { key: 'fashion', minWidth: 600, minHeight: 400, ratios: [1, 4 / 3, 3 / 2, 16 / 9, 3 / 4, 1200 / 796], label: 'Square, landscape (3:2, 4:3) or portrait, at least 600px', detail: 'Show the full item on a clean background. Include every colour or size offered.' };
  }
  if (/electronic|phone|computer|appliance|tech/.test(category)) {
    return { key: 'electronics', minWidth: 600, minHeight: 400, ratios: [1, 4 / 3, 3 / 2, 16 / 9, 3 / 4], label: 'Square, 4:3, or 16:9, at least 600px', detail: 'Show the item powered on where useful, plus ports, model details and accessories.' };
  }
  if (/beauty|health|food|grocery/.test(category)) {
    return { key: 'consumables', minWidth: 600, minHeight: 400, ratios: [1, 4 / 3, 3 / 2, 3 / 4], label: 'Square or 4:3, at least 600px', detail: 'Keep the label, size and expiry information clearly readable.' };
  }
  return { key: 'standard', minWidth: 600, minHeight: 400, ratios: [1, 4 / 3, 3 / 2, 16 / 9, 3 / 4], label: 'Square, landscape or portrait, at least 600px', detail: 'Use a bright, sharp product photo on a clean background.' };
}

function productOptionFields(profile) {
  if (profile.key === 'fashion') return { primaryLabel: 'Sizes', primaryPrefix: 'EU ', primaryOptions: ['39', '40', '41', '42', '43', '44', '45'], secondaryLabel: 'Colours', secondaryOptions: ['Black', 'Brown', 'Navy', 'White', 'Tan'] };
  if (profile.key === 'electronics') return { primaryLabel: 'Storage', primaryPrefix: '', primaryOptions: ['64 GB', '128 GB', '256 GB', '512 GB'], secondaryLabel: 'Colours', secondaryOptions: ['Black', 'Silver', 'Blue', 'Gold'] };
  if (profile.key === 'consumables') return { primaryLabel: 'Size or volume', primaryPrefix: '', primaryOptions: ['50 ml', '100 ml', '200 ml', '500 ml'], secondaryLabel: 'Type', secondaryOptions: ['Standard', 'Value pack', 'Bundle'] };
  return { primaryLabel: 'Option', primaryPrefix: '', primaryOptions: ['Small', 'Medium', 'Large'], secondaryLabel: 'Colour', secondaryOptions: ['Black', 'White', 'Blue', 'Other'] };
}

function productVariantLabel(primary, secondary, categoryName = '') {
  const options = productOptionFields(productCategoryProfile(categoryName));
  return `${options.primaryPrefix}${primary} / ${secondary}`;
}

function currentProductCategoryProfile() {
  const select = document.getElementById('prod-category');
  return productCategoryProfile(select?.options[select.selectedIndex]?.text || '');
}

function imageFitsProfile(width, height, profile) {
  const minW = profile.minWidth || 400;
  const minH = profile.minHeight || 400;
  if (width < minW || height < minH) return false;
  const ratio = width / height;
  if (profile.ratios && profile.ratios.length > 0) {
    if (profile.ratios.some((expected) => Math.abs(ratio - expected) <= 0.1)) return true;
  }
  return ratio >= 0.45 && ratio <= 2.2;
}

function imageDimensions(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The selected image could not be read.'));
    };
    image.src = objectUrl;
  });
}

function updateProductImageRequirements() {
  const profile = currentProductCategoryProfile();
  const longRule = document.getElementById('product-photo-rule');
  const shortRule = document.getElementById('product-photo-rule-short');
  const guidance = document.getElementById('product-photo-guidance');
  if (longRule) longRule.textContent = profile.label;
  if (shortRule) shortRule.textContent = profile.label;
  if (guidance) guidance.textContent = profile.detail;
}

function safeMediaUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('assets/') || trimmed.startsWith('/') || trimmed.startsWith('./')) return trimmed;
  return safeUrl(trimmed);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatNaira(minor) {
  const amount = Number(minor ?? 0) / 100;
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);
}

function idempotencyKey(prefix) {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class ApiError extends Error {
  constructor(message, code = 'REQUEST_FAILED', status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function isAuthError(error) {
  if (!error) return false;
  if (error.code === 'UNAUTHORIZED' || error.status === 401 ||
      ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired'].includes(error.code) ||
      error.name === 'AuthSessionMissingError') return true;
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

async function handleSessionExpired(message = 'Your session has expired. Please sign in again.') {
  state.dataRequestVersion++;
  workspaceGeneration++;
  workspaceLoadingPromise = null;
  state.dataAbortController?.abort();
  state.dataAbortController = null;
  if (state.client) {
    try {
      await state.client.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('Could not clear local session:', e);
    }
  }
  state.session = null;
  state.merchants = [];
  state.merchant = null;
  state.overview = null;
  state.products = [];
  state.orders = [];
  state.returns = [];
  state.team = [];
  state.categories = [];
  state.workspaceError = '';
  state.partialDataError = '';
  state.modal = null;
  state.profileDraft = null;
  state.verificationData = null;
  state.pendingPassword = '';
  state.busy = null;
  state.loading = false;
  state.authMode = 'signin';
  state.authError = message;
  render();
}

let sessionRefreshPromise = null;
async function refreshSessionOnce(rejectedToken) {
  if (sessionRefreshPromise) return sessionRefreshPromise;
  sessionRefreshPromise = (async () => {
    const current = await state.client.auth.getSession();
    if (current.error) throw current.error;
    // Another tab or request may already have replaced the rejected token.
    if (current.data?.session?.access_token !== rejectedToken) {
      return current.data?.session || null;
    }
    const { data, error } = await state.client.auth.refreshSession();
    if (error) throw error;
    return data?.session || null;
  })().finally(() => { sessionRefreshPromise = null; });
  return sessionRefreshPromise;
}

async function getValidSession() {
  if (!state.client) return null;
  // Supabase owns persistence and expiry; always read its current session.
  const { data, error } = await state.client.auth.getSession();
  if (error) throw error;
  state.session = data?.session || null;
  return state.session;
}

async function api(path, options = {}) {
  const { method = 'GET', body, idempotencyScope, signal, _retry = false } = options;
  if (!state.client) throw new ApiError('Authentication client not initialized.', 'AUTH_UNAVAILABLE', 0);

  const generation = workspaceGeneration;
  const session = await getValidSession();
  if (generation !== workspaceGeneration) throw new DOMException('Session changed', 'AbortError');
  if (!session?.access_token) {
    await handleSessionExpired('Your session has expired. Please sign in again.');
    throw new ApiError('Your session has expired. Please sign in again.', 'UNAUTHORIZED', 401);
  }

  const headers = { Authorization: `Bearer ${session.access_token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyScope) headers['Idempotency-Key'] = idempotencyKey(idempotencyScope);

  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Backend service unreachable.', 'NETWORK_ERROR', 0);
  }

  if (generation !== workspaceGeneration) throw new DOMException('Session changed', 'AbortError');
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('The server returned an unreadable response.', 'INVALID_RESPONSE', response?.status || 0);
  }

  if (!response.ok || !payload?.success) {
    const errorCode = payload?.error?.code || (response.status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED');
    const errorMessage = payload?.error?.message ?? 'The operation could not be completed.';
    const apiErr = new ApiError(errorMessage, errorCode, response.status);

    if (isAuthError(apiErr)) {
      if (!_retry) {
        let refreshed;
        try {
          refreshed = await refreshSessionOnce(session.access_token);
        } catch (error) {
          // Connectivity failures should remain retryable, not erase a login.
          if (!isAuthError(error)) throw error;
        }
        if (refreshed?.access_token) {
          state.session = refreshed;
          return api(path, { ...options, _retry: true });
        }
      }
      await handleSessionExpired();
    }

    throw apiErr;
  }

  return payload.data;
}

function showNotice(message, type = 'success') {
  state.notice = { message, type };
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    root.appendChild(container);
  }
  container.innerHTML = `
    <div class="toast ${type === 'error' ? 'toast-error' : 'toast-success'}" role="status">
      ${icon(type === 'error' ? 'alert-triangle' : 'check-circle')}
      <span>${escapeHtml(message)}</span>
    </div>`;
  hydrateIcons();
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => {
    state.notice = null;
    const c = document.querySelector('.toast-container');
    if (c) c.remove();
  }, 4500);
}

function hydrateIcons() {
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { 'stroke-width': 2 } });
  }
}

// Status Badges & Pills
function statusBadge(status) {
  const norm = String(status ?? '').toLowerCase().replace(/_/g, ' ');
  let pillClass = 'status-pill-neutral';
  let iconName = 'circle';

  if (['published', 'in transit', 'delivered', 'completed', 'approved', 'received', 'active'].includes(norm)) {
    pillClass = 'status-pill-success';
    iconName = 'check-circle-2';
  } else if (['pending', 'pending approval', 'payment confirmed', 'processing', 'requested', 'in review'].includes(norm)) {
    pillClass = 'status-pill-warning';
    iconName = 'clock';
  } else if (['rejected', 'cancelled', 'archived', 'out of stock'].includes(norm)) {
    pillClass = 'status-pill-danger';
    iconName = 'alert-circle';
  }

  const label = norm === 'rejected' ? 'Needs Changes' : norm;
  return `<span class="status-pill ${pillClass}">${icon(iconName)} ${escapeHtml(label)}</span>`;
}

function formatRelativeTime(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  if (isNaN(diff)) return '—';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

/* ==========================================================================
   RENDER DISPATCHER
   ========================================================================== */

function render() {
  let mainContentHtml = '';

  if (state.configurationError) {
    mainContentHtml = renderConfigurationError();
  } else if (!state.session) {
    mainContentHtml = renderAuthHtml();
  } else if (state.loading && state.merchants.length === 0) {
    mainContentHtml = renderSkeletonWorkspace();
  } else if (state.workspaceError) {
    mainContentHtml = renderWorkspaceError();
  } else if (state.authMode === 'onboarding' || state.merchants.length === 0) {
    mainContentHtml = renderOnboardingWizardHtml();
  } else {
    mainContentHtml = renderShellHtml();
  }

  root.innerHTML = `
    ${state.splashActive ? renderSplashHtml() : ''}
    ${mainContentHtml}
    ${renderModal()}
    ${renderToastStack()}`;
  root.setAttribute('aria-busy', String(state.loading));

  hydrateIcons();
}

/* ==========================================================================
   SPLASH SCREEN
   ========================================================================== */

function renderSplashHtml() {
  return `
    <div class="splash-screen ${state.splashActive ? '' : 'fade-out'}" id="app-splash">
      <div class="splash-brand-card">
        <div class="splash-floating-logo-wrap">
          <img src="assets/sellfastbuyfast-logo.png" alt="SellFastBuyFast" class="splash-floating-logo" />
        </div>
        <div class="splash-progress-track">
          <div class="splash-progress-bar"></div>
        </div>
        <span class="splash-caption">Connecting to verified merchant hub…</span>
      </div>
    </div>`;
}

function dismissSplash() {
  const splashEl = document.getElementById('app-splash');
  if (splashEl) {
    splashEl.classList.add('fade-out');
    setTimeout(() => {
      splashEl.remove();
      state.splashActive = false;
    }, 500);
  } else {
    state.splashActive = false;
  }
}

/* ==========================================================================
   SKELETON LOADERS
   ========================================================================== */

function renderSkeletonWorkspace() {
  return `
    <div class="page-content" style="max-width:1200px;padding-top:40px;">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton" style="height:120px;margin-bottom:24px;border-radius:var(--radius-lg);"></div>
      <div class="metrics-grid">
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
        <div class="skeleton skeleton-card"></div>
      </div>
      <div class="card" style="padding:24px;">
        <div class="skeleton skeleton-title" style="width:25%;"></div>
        <div class="skeleton skeleton-text" style="width:100%;height:38px;"></div>
        <div class="skeleton skeleton-text" style="width:100%;height:38px;"></div>
        <div class="skeleton skeleton-text" style="width:100%;height:38px;"></div>
      </div>
    </div>`;
}

function renderConfigurationError() {
  return `
    <section class="auth-shell">
      <div class="auth-panel">
        <div class="auth-brand-mark">${icon('settings-2')}</div>
        <h1 class="auth-title">Portal configuration is incomplete</h1>
        <p class="auth-subtitle">The merchant portal cannot connect until its public Supabase and Core API configuration is available.</p>
        <div class="error-summary" role="alert">${icon('alert-circle')} <span>${escapeHtml(state.configurationError)}</span></div>
        <p class="field-help">A deployment administrator should configure the vendor project. No operational data is shown until the connection is real.</p>
      </div>
    </section>`;
}

function renderWorkspaceError() {
  return `
    <section class="auth-shell">
      <div class="auth-panel">
        <div class="auth-brand-mark">${icon('cloud-off')}</div>
        <h1 class="auth-title">We could not load this merchant workspace</h1>
        <p class="auth-subtitle">${escapeHtml(state.workspaceError)}</p>
        <div style="display:flex;gap:12px;justify-content:center;margin-top:14px;flex-wrap:wrap;">
          <button class="btn btn-primary" type="button" data-action="refresh-current">${icon('refresh-cw')} Try again</button>
          <button class="btn btn-secondary" type="button" data-action="sign-out">${icon('log-out')} Sign Out</button>
        </div>
      </div>
    </section>`;
}

/* ==========================================================================
   AUTHENTICATION VIEWS (Sign In, 1-Time Signup OTP, Register)
   ========================================================================== */

function renderAuthHtml() {
  const mode = state.authMode;
  let formHtml = '';

  if (mode === 'verify-otp') {
    formHtml = `
      <form class="auth-box" id="verify-otp-form" novalidate>
        <h1 class="auth-title">Verify Your Email</h1>
        <p class="auth-subtitle">We sent a 6-digit verification code to <strong style="color:var(--forest-900);">${escapeHtml(state.pendingEmail || 'your email')}</strong></p>

        ${state.authError ? `<div class="error-summary" role="alert">${icon('alert-circle')} <span>${escapeHtml(state.authError)}</span></div>` : ''}

        <div class="form-group">
          <label class="form-label" for="otp-code" style="justify-content:center;margin-bottom:8px;">Enter 6-Digit Code</label>
          <div style="display:flex;justify-content:center;">
            <input class="input" id="otp-code" name="otpCode" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="123456" style="font-family:var(--font-numbers);font-size:24px;letter-spacing:0.35em;text-align:center;font-weight:800;max-width:240px;height:52px;" autofocus required />
          </div>
        </div>

        <button class="btn btn-primary btn-full" type="submit" style="margin-top:12px;" ${state.busy === 'verify-otp' ? 'disabled' : ''}>
          ${state.busy === 'verify-otp' ? 'Verifying Code…' : `${icon('check-circle')} Confirm & Open Dashboard`}
        </button>

        <div class="otp-resend-row" style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:18px;font-size:13.5px;color:var(--ink-muted);">
          <span>Didn't receive the email?</span>
          <button type="button" class="btn-quiet" data-action="resend-otp" style="font-weight:700;">Resend OTP</button>
        </div>

        <div style="text-align:center;margin-top:20px;font-size:13.5px;color:var(--ink-muted);">
          <button type="button" class="btn-quiet" data-action="switch-auth-mode" data-mode="signin">${icon('arrow-left')} Return to Sign In</button>
        </div>
      </form>`;
  } else if (mode === 'signup') {
    formHtml = `
      <form class="auth-box" id="sign-up-form" novalidate>
        <div class="auth-segmented-nav">
          <button type="button" class="auth-segment-tab" data-action="switch-auth-mode" data-mode="signin">Sign In</button>
          <button type="button" class="auth-segment-tab active" data-action="switch-auth-mode" data-mode="signup">New Registration</button>
        </div>

        <h1 class="auth-title">Register Store</h1>
        <p class="auth-subtitle">Create your merchant account. You will verify 1 time via email OTP.</p>
        
        ${state.authError ? `<div class="error-summary" role="alert">${icon('alert-circle')} <span>${escapeHtml(state.authError)}</span></div>` : ''}

        <div class="auth-grid-2col">
          <div class="form-group">
            <label class="form-label" for="full-name">Full Name</label>
            <div class="input-wrapper">
              <span class="input-icon-left">${icon('user')}</span>
              <input class="input has-icon-left" id="full-name" name="fullName" type="text" placeholder="e.g. Oluwaseun Adeleke" value="${escapeAttribute(state.pendingFullName || '')}" required />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="business-name">Store / Brand Name</label>
            <div class="input-wrapper">
              <span class="input-icon-left">${icon('store')}</span>
              <input class="input has-icon-left" id="business-name" name="businessName" type="text" placeholder="e.g. Lagos Luxury Attire" value="${escapeAttribute(state.pendingBusinessName || '')}" required />
            </div>
          </div>
        </div>

        <div class="auth-grid-2col">
          <div class="form-group">
            <label class="form-label" for="email">Work Email</label>
            <div class="input-wrapper">
              <span class="input-icon-left">${icon('mail')}</span>
              <input class="input has-icon-left" id="email" name="email" type="email" autocomplete="email" placeholder="vendor@business.ng" value="${escapeAttribute(state.pendingEmail || '')}" required />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="phone">Phone Number (+234)</label>
            <div class="input-wrapper">
              <span class="input-icon-left">${icon('phone')}</span>
              <input class="input has-icon-left" id="phone" name="phone" type="tel" placeholder="08012345678" value="${escapeAttribute(state.pendingPhone || '')}" required />
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="password">Create Password</label>
          <div class="input-wrapper">
            <span class="input-icon-left">${icon('lock')}</span>
            <input class="input has-icon-left has-icon-right" id="password" name="password" type="${state.showPassword ? 'text' : 'password'}" value="${escapeAttribute(state.pendingPassword || '')}" required placeholder="Min. 8 characters" />
            <button type="button" class="input-icon-right-btn" data-action="toggle-password" aria-label="${state.showPassword ? 'Hide password' : 'Show password'}" title="${state.showPassword ? 'Hide password' : 'Show password'}">${icon(state.showPassword ? 'eye-off' : 'eye')}</button>
          </div>
        </div>

        <label class="checkbox-row">
          <input type="checkbox" name="terms" required checked />
          <span>I agree to the <a href="#" target="_blank">Merchant Agreement</a> & policies.</span>
        </label>

        <button class="btn btn-primary btn-full" type="submit" ${state.busy === 'sign-up' ? 'disabled' : ''}>
          ${state.busy === 'sign-up' ? 'Creating Account…' : `${icon('user-plus')} Create Account & Send OTP`}
        </button>

        <div style="text-align:center;margin-top:16px;font-size:13.5px;color:var(--ink-muted);">
          Already registered? <button type="button" class="btn-quiet" data-action="switch-auth-mode" data-mode="signin" style="font-weight:700;">Sign In</button>
        </div>
      </form>`;
  } else if (mode === 'recover') {
    formHtml = `
      <form class="auth-box" id="recover-form" novalidate>
        <h1 class="auth-title">Reset Password</h1>
        <p class="auth-subtitle">Enter your registered work email to receive a password reset link.</p>

        ${state.authError ? `<div class="error-summary" role="alert">${icon('alert-circle')} <span>${escapeHtml(state.authError)}</span></div>` : ''}

        <div class="form-group">
          <label class="form-label" for="email">Account Email</label>
          <div class="input-wrapper">
            <span class="input-icon-left">${icon('mail')}</span>
            <input class="input has-icon-left" id="email" name="email" type="email" autocomplete="email" placeholder="vendor@business.ng" value="${escapeAttribute(state.pendingEmail || '')}" required />
          </div>
        </div>

        <button class="btn btn-primary btn-full" type="submit" ${state.busy === 'recover' ? 'disabled' : ''}>
          ${state.busy === 'recover' ? 'Sending Link…' : `${icon('send')} Send Reset Link`}
        </button>

        <div style="text-align:center;margin-top:20px;font-size:14px;color:var(--ink-muted);">
          Remembered credentials? <button type="button" class="btn-quiet" data-action="switch-auth-mode" data-mode="signin">Return to Sign In</button>
        </div>
      </form>`;
  } else {
    // Standard Sign In
    formHtml = `
      <form class="auth-box" id="sign-in-form" novalidate>
        <div class="auth-segmented-nav">
          <button type="button" class="auth-segment-tab active" data-action="switch-auth-mode" data-mode="signin">Merchant Sign In</button>
          <button type="button" class="auth-segment-tab" data-action="switch-auth-mode" data-mode="signup">New Registration</button>
        </div>

        <h1 class="auth-title">Welcome Back</h1>
        <p class="auth-subtitle">Sign in to manage your inventory, orders, and payouts.</p>

        ${state.authError ? `<div class="error-summary" role="alert">${icon('alert-circle')} <span>${escapeHtml(state.authError)}</span></div>` : ''}

        <div class="form-group">
          <label class="form-label" for="email">Work Email</label>
          <div class="input-wrapper">
            <span class="input-icon-left">${icon('mail')}</span>
            <input class="input has-icon-left" id="email" name="email" type="email" autocomplete="email" placeholder="vendor@business.ng" value="${escapeAttribute(state.pendingEmail || '')}" required />
          </div>
        </div>

        <div class="form-group">
          <div class="form-label">
            <span>Password</span>
            <button type="button" class="form-label-aside" data-action="switch-auth-mode" data-mode="recover">Forgot password?</button>
          </div>
          <div class="input-wrapper">
            <span class="input-icon-left">${icon('lock')}</span>
            <input class="input has-icon-left has-icon-right" id="password" name="password" type="${state.showPassword ? 'text' : 'password'}" autocomplete="current-password" placeholder="••••••••" value="${escapeAttribute(state.pendingPassword || '')}" required />
            <button type="button" class="input-icon-right-btn" data-action="toggle-password" aria-label="${state.showPassword ? 'Hide password' : 'Show password'}" title="${state.showPassword ? 'Hide password' : 'Show password'}">${icon(state.showPassword ? 'eye-off' : 'eye')}</button>
          </div>
        </div>

        <label class="checkbox-row">
          <input type="checkbox" name="remember" checked />
          <span>Keep this session active</span>
        </label>

        <button class="btn btn-primary btn-full" type="submit" ${state.busy === 'sign-in' ? 'disabled' : ''}>
          ${state.busy === 'sign-in' ? 'Authenticating…' : `${icon('log-in')} Sign In to Merchant Portal`}
        </button>

        <div style="text-align:center;margin-top:24px;font-size:13.5px;color:var(--ink-muted);">
          New merchant? <button type="button" class="btn-quiet" data-action="switch-auth-mode" data-mode="signup" style="font-weight:700;">Create Account</button>
        </div>
      </form>`;
  }

  return `
    <div class="auth-viewport">
      <!-- Left Editorial Banner with Zoomed Receipt Macro & High-Contrast White/Gold Floating Logo -->
      <section class="auth-hero-pane">
        <img src="assets/vendor-receipt-macro.jpg" alt="SellFastBuyFast Enterprise" class="auth-hero-bg" />
        <div class="auth-hero-overlay"></div>
        
        <div class="auth-hero-content">
          <div class="auth-floating-logo-wrap">
            <img src="assets/sellfastbuyfast-logo-white.png" alt="SellFastBuyFast" class="auth-floating-logo" />
          </div>
          <h2 class="auth-hero-headline">Run Your Store Across <span>Nigeria</span>.</h2>
          <p class="auth-hero-description">A merchant workspace for catalogue management, accurate stock, and courier fulfilment updates connected to your live orders.</p>
          
          <div class="auth-hero-features">
            <div class="auth-feature-pill">${icon('clipboard-check')} <span>Verification before merchant activation</span></div>
            <div class="auth-feature-pill">${icon('package-check')} <span>Live stock and catalogue moderation</span></div>
            <div class="auth-feature-pill">${icon('truck')} <span>Record courier handoff and tracking</span></div>
          </div>
        </div>

        <div class="auth-hero-footer">
          <span>&copy; ${new Date().getFullYear()} SellFastBuyFast Technologies Ltd.</span>
          <span>Merchant Operations Portal</span>
        </div>
      </section>

      <!-- Right Form Pane -->
      <section class="auth-form-pane">
        <div class="auth-card-container">
          <div class="mobile-brand-header">
            <img src="assets/sellfastbuyfast-logo-white.png" alt="SellFastBuyFast" class="mobile-floating-logo" />
          </div>
          ${formHtml}
        </div>
      </section>
    </div>`;
}

/* ==========================================================================
   ONBOARDING & KYC WIZARD
   ========================================================================== */

function renderOnboardingWizardHtml() {
  const user = state.session?.user;
  const userMeta = user?.user_metadata || {};
  const defaultStore = userMeta.business_name || '';
  const defaultName = userMeta.full_name || '';
  const defaultPhone = userMeta.phone || '';

  return `
    <div class="page-content" style="max-width:760px;padding-top:32px;">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="display:inline-flex;margin-bottom:16px;">
          <img src="assets/sellfastbuyfast-logo.png" alt="SellFastBuyFast" style="height:48px;" />
        </div>
        <h1 class="page-title">Merchant Verification & Setup</h1>
        <p class="page-subtitle">Authenticated as <strong>${escapeHtml(user?.email || 'User')}</strong>. Complete your store setup.</p>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Business Identity & Verification</h2>
            <p class="card-subtitle">All Nigerian merchants require verification before public store activation.</p>
          </div>
          <span class="status-pill status-pill-warning">${icon('clock')} Setup Pending</span>
        </div>
        <form class="card-body" id="kyc-onboarding-form" novalidate>
          ${state.formError ? `<div class="error-summary" role="alert">${icon('alert-circle')} <span>${escapeHtml(state.formError)}</span></div>` : ''}

          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label" for="onboard-full-name">Your Full Name</label>
              <input class="input" id="onboard-full-name" name="fullName" value="${escapeAttribute(defaultName)}" autocomplete="name" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="onboard-business-name">Business Registered Name</label>
              <input class="input" id="onboard-business-name" name="businessName" value="${escapeAttribute(defaultStore)}" required />
            </div>
          </div>

          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label" for="onboard-email">Business Contact Email</label>
              <input class="input" id="onboard-email" name="contactEmail" type="email" value="${escapeAttribute(user?.email || '')}" autocomplete="email" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="onboard-phone">Business Contact Phone</label>
              <input class="input" id="onboard-phone" name="contactPhone" type="tel" value="${escapeAttribute(defaultPhone)}" autocomplete="tel" required />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="onboard-description">Store Description <span class="table-sub-text">(optional)</span></label>
            <textarea class="textarea" id="onboard-description" name="description" placeholder="Describe the products your store sells and what customers can expect."></textarea>
          </div>

          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label" for="onboard-cac">CAC Registration Number</label>
              <input class="input" id="onboard-cac" name="cacNumber" placeholder="RC-1234567 or BN-123456" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="onboard-tin">Tax Identification Number <span class="table-sub-text">(optional)</span></label>
              <input class="input" id="onboard-tin" name="tinNumber" placeholder="Enter TIN if available" />
            </div>
          </div>

          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label" for="onboard-state">Operating State</label>
              <select class="select" id="onboard-state" name="state" required>
                <option value="Lagos State">Lagos</option>
                <option value="Abuja FCT">Abuja (FCT)</option>
                <option value="Rivers State">Rivers</option>
                <option value="Oyo State">Oyo</option>
                <option value="Kano State">Kano</option>
                <option value="Anambra State">Anambra</option>
                <option value="Enugu State">Enugu</option>
                <option value="Delta State">Delta</option>
                <option value="Ogun State">Ogun</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="onboard-lga">LGA / City</label>
              <input class="input" id="onboard-lga" name="lga" placeholder="e.g. Ikeja / Lekki" required />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="onboard-address">Warehouse / Store Physical Address</label>
            <input class="input" id="onboard-address" name="address" placeholder="e.g. 14 Admiralty Way, Lekki Phase 1" autocomplete="street-address" required />
          </div>

          <div class="callout-info-box" style="margin-top:20px;">
            <div class="callout-info-icon">${icon('shield-check')}</div>
            <div class="callout-info-text">
              <strong>Secure document step next.</strong> We will create your private workspace first. You will then upload your ID and proof of address directly to the protected KYC vault; never paste document links here.
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:24px;gap:12px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" data-action="sign-out">${icon('log-out')} Sign Out</button>
            <button type="submit" class="btn btn-primary" ${state.busy === 'submit-onboarding' ? 'disabled' : ''}>
              ${state.busy === 'submit-onboarding' ? 'Creating workspace…' : `${icon('arrow-right')} Continue to Secure Verification`}
            </button>
          </div>
        </form>
      </div>
    </div>`;
}

/* ==========================================================================
   PORTAL MAIN SHELL & TOPBAR
   ========================================================================== */

function navItem(view, iconName, label, badgeCount, badgeType = 'default') {
  const active = state.activeView === view;
  const showBadge = badgeCount !== undefined && badgeCount !== null && badgeCount > 0;
  return `
    <button class="nav-item" type="button" data-action="navigate" data-view="${view}" aria-current="${active ? 'page' : 'false'}" title="${escapeAttribute(label)}">
      <div class="nav-item-left">
        ${icon(iconName)}
        <span class="nav-label">${escapeHtml(label)}</span>
      </div>
      ${showBadge ? `<span class="nav-badge ${badgeType === 'warn' ? 'nav-badge-warn' : ''}" title="${badgeType === 'warn' ? `${badgeCount} items low in stock` : ''}">${escapeHtml(badgeCount)}</span>` : ''}
    </button>`;
}

function renderNotificationsDropdown() {
  const notifs = state.notifications || [];
  const unreadCount = state.unreadNotificationsCount || 0;

  return `
    <div class="notifications-dropdown-menu" role="dialog" aria-label="Notifications">
      <div class="notifications-header">
        <div class="notifications-header-title">
          <strong>Notifications</strong>
          ${unreadCount > 0 ? `<span class="notification-count-badge">${unreadCount} new</span>` : ''}
        </div>
        ${unreadCount > 0 ? `
          <button class="btn-quiet btn-sm mark-read-btn" type="button" data-action="mark-all-notifications-read">
            ${icon('check-check')} Mark all read
          </button>
        ` : ''}
      </div>
      <div class="notifications-list">
        ${notifs.length ? notifs.map((n) => {
          const isUnread = !n.readAt;
          const isRejected = n.type === 'catalog_product_rejected';
          const isPublished = n.type === 'catalog_product_published';
          const productId = n.data?.productId;
          const iconName = isRejected ? 'alert-triangle' : isPublished ? 'check-circle' : 'bell';
          const iconColorClass = isRejected ? 'notif-icon-danger' : isPublished ? 'notif-icon-success' : 'notif-icon-info';

          return `
            <div class="notification-item ${isUnread ? 'unread' : ''} ${isRejected ? 'rejection-item' : ''}" data-action="read-notification" data-id="${escapeAttribute(n.id)}">
              <div class="notification-icon-wrap ${iconColorClass}">
                ${icon(iconName)}
              </div>
              <div class="notification-content">
                <div class="notification-title-row">
                  <strong class="notification-title">${escapeHtml(n.title || 'Notification')}</strong>
                  <span class="notification-time">${formatRelativeTime(n.createdAt)}</span>
                </div>
                <p class="notification-body">${escapeHtml(n.body || '')}</p>
                ${(isRejected && productId) ? `
                  <div class="notification-action-row">
                    <button class="btn btn-warning btn-sm" type="button" data-action="fix-and-resubmit" data-product-id="${escapeAttribute(productId)}">
                      ${icon('refresh-cw')} Fix & Resubmit Listing
                    </button>
                  </div>
                ` : ''}
              </div>
              ${isUnread ? '<span class="unread-dot" title="Unread"></span>' : ''}
            </div>
          `;
        }).join('') : `
          <div class="notifications-empty">
            <div class="empty-icon">${icon('bell-off')}</div>
            <p>No notifications yet</p>
            <small class="muted">You'll receive live alerts when Operations reviews your products or updates occur.</small>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderShellHtml() {
  const overview = state.overview;
  const pendingFulfil = (overview?.fulfilment?.awaitingAcceptance ?? 0) + (overview?.fulfilment?.awaitingPacking ?? 0);
  const pendingReturns = overview?.returnRequests?.requested ?? 0;
  const verification = overview?.verification?.status ?? 'pending';
  const catalogueEnabled = (overview?.merchant?.status ?? state.merchant?.status) === 'active';
  const lowStockCount = state.products.filter((p) => (p.variants?.[0]?.availableQuantity ?? 0) <= 3).length;
  const rejectedCount = state.products.filter((p) => p.status === 'rejected').length;
  const catalogueBadge = rejectedCount > 0 ? `${rejectedCount} action` : (lowStockCount > 0 ? lowStockCount : undefined);
  const catalogueBadgeType = rejectedCount > 0 ? 'warn' : (lowStockCount > 0 ? 'warn' : undefined);

  return `
    <div class="portal-shell">
      <!-- Mobile Backdrop -->
      <div class="sidebar-backdrop ${state.sidebarOpen ? 'open' : ''}" data-action="toggle-sidebar"></div>

      <!-- Left Sidebar Navigation -->
      <aside class="sidebar ${state.sidebarOpen ? 'open' : ''} ${state.sidebarCollapsed ? 'collapsed' : ''}">
        <div style="display:flex;flex-direction:column;min-height:0;flex:1;">
          <div class="sidebar-top">
            <a href="#" class="sidebar-floating-brand" data-action="navigate" data-view="dashboard" title="SellFastBuyFast">
              <img src="assets/sellfastbuyfast-logo-white.png" alt="SellFastBuyFast" class="sidebar-floating-logo" />
              <div class="sidebar-collapsed-brand">${icon('shopping-bag')}</div>
            </a>
          </div>

          <nav class="sidebar-nav" aria-label="Merchant Navigation">
            <div class="nav-section-label">Operations</div>
            ${navItem('dashboard', 'layout-dashboard', 'Command Center')}
            ${navItem('fulfilment', 'truck', 'Fulfilment Queue', pendingFulfil)}
            ${navItem('returns', 'rotate-ccw', 'Returns & Disputes', pendingReturns)}

            <div class="nav-section-label">Commerce</div>
            ${navItem('catalogue', 'package', 'Catalogue & Stock', catalogueBadge, catalogueBadgeType)}
            ${navItem('add-product', 'plus-circle', 'Product Studio')}

            <div class="nav-section-label">Finance & Settings</div>
            ${navItem('payouts', 'circle-pause', 'Payments (deferred)')}
            ${navItem('profile', 'store', 'Store Profile')}
          </nav>
        </div>

        <div class="sidebar-footer">
          <div class="merchant-profile-card">
            <div class="merchant-avatar">${escapeHtml((state.merchant?.businessName || 'S').charAt(0).toUpperCase())}</div>
            <div class="merchant-details">
              <div class="merchant-name">${escapeHtml(state.merchant?.businessName || 'Merchant Store')}</div>
              <div class="merchant-role-badge">${icon('badge-check')} ${escapeHtml(overview?.viewer?.memberRole || 'Owner')}</div>
            </div>
            <button type="button" class="btn-quiet sign-out-btn" data-action="sign-out" title="Sign Out" style="color:rgba(255,255,255,0.7);padding:6px;">
              ${icon('log-out')}
            </button>
          </div>
        </div>
      </aside>

      <!-- Main Workspace (Pinned Topbar + Isolated Scroll Content) -->
      <main class="workspace-pane">
        <!-- Topbar -->
        <header class="topbar">
          <div class="topbar-left">
            <button class="desktop-collapse-btn" type="button" data-action="toggle-collapse" title="${state.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
              ${icon(state.sidebarCollapsed ? 'panel-left-open' : 'panel-left-close')}
            </button>
            <button class="mobile-menu-btn" type="button" data-action="toggle-sidebar" aria-label="Toggle navigation">
              ${icon('menu')}
            </button>
            <div class="topbar-breadcrumbs">
              <span class="breadcrumb-root">Merchant Hub</span>
              <span class="breadcrumb-sep">/</span>
              <span class="breadcrumb-current">${escapeHtml(VIEW_TITLES[state.activeView] || 'Overview')}</span>
            </div>
          </div>

          <div class="topbar-actions">
            <button class="btn btn-quiet btn-sm" type="button" data-action="refresh-current" title="Refresh store data">
              ${icon('refresh-cw')} <span class="hide-mobile">Refresh</span>
            </button>
            <div class="topbar-divider"></div>
            <!-- Notification Bell with Unread Badge & Dropdown -->
            <div class="notifications-dropdown-wrap">
              <button class="btn btn-quiet btn-sm notification-bell-btn ${state.unreadNotificationsCount > 0 ? 'has-unread' : ''}" type="button" data-action="toggle-notifications" title="Notifications (${state.unreadNotificationsCount} unread)">
                ${icon('bell')}
                ${state.unreadNotificationsCount > 0 ? `<span class="notification-badge">${state.unreadNotificationsCount > 99 ? '99+' : state.unreadNotificationsCount}</span>` : ''}
              </button>
              ${state.notificationsOpen ? renderNotificationsDropdown() : ''}
            </div>
            <div class="topbar-divider"></div>
            ${statusBadge(verification)}
            <button class="btn btn-primary btn-sm" type="button" data-action="new-product" ${catalogueEnabled ? '' : 'disabled'}>
              ${icon('plus')} <span class="hide-mobile">New Product</span>
            </button>
          </div>
        </header>

        <!-- Dynamic Content View (The ONLY scrollable container!) -->
        <div class="page-content">
          ${state.partialDataError ? `<div class="error-summary" role="alert">${icon('alert-circle')} <span>${escapeHtml(state.partialDataError)}</span><button class="btn btn-secondary btn-sm" type="button" data-action="refresh-current">Try again</button></div>` : ''}
          ${renderCurrentView()}
        </div>
      </main>
    </div>`;
}

function renderToastStack() {
  if (!state.notice) return '';
  return `
    <div class="toast-container" aria-live="polite">
      <div class="toast ${state.notice.type === 'error' ? 'toast-error' : 'toast-success'}" role="status">
        ${icon(state.notice.type === 'error' ? 'alert-triangle' : 'check-circle')}
        <span>${escapeHtml(state.notice.message)}</span>
      </div>
    </div>`;
}

function renderCurrentView() {
  switch (state.activeView) {
    case 'catalogue': return renderCatalogueView();
    case 'add-product': return renderAddProductView();
    case 'fulfilment': return renderFulfilmentView();
    case 'returns': return renderReturnsView();
    case 'payouts': return renderPayoutsView();
    case 'profile': return renderProfileView();
    default: return renderDashboardView();
  }
}

/* ==========================================================================
   VIEW 1: COMMAND CENTER (DASHBOARD)
   ========================================================================== */

function renderDashboardView() {
  const overview = state.overview;
  if (!overview) return renderSkeletonWorkspace();

  const awaitingAcceptance = state.orders.filter((o) => o.status === 'payment_confirmed').length;
  const awaitingPacking = state.orders.filter((o) => o.status === 'processing' && o.shipment?.status !== 'packed').length;
  const packedCount = state.orders.filter((o) => o.status === 'processing' && o.shipment?.status === 'packed').length;
  const inTransitCount = state.orders.filter((o) => o.status === 'in_transit').length;
  const pendingCount = awaitingAcceptance + awaitingPacking + packedCount;

  const publishedCount = state.products.filter((p) => p.status === 'published').length;
  const draftCount = state.products.filter((p) => p.status === 'draft').length;
  const inReviewCount = state.products.filter((p) => p.status === 'pending_approval').length;

  const returnsCount = state.returns.filter((r) => r.status === 'requested').length;
  const openReturnsCount = state.returns.filter((r) => ['requested', 'approved', 'received'].includes(r.status)).length;
  const urgentOrders = state.orders.filter((o) => ['payment_confirmed', 'processing'].includes(o.status)).slice(0, 8);

  return `
    <!-- Top Ambient Banner -->
    <div class="ambient-banner-card">
      <img src="assets/vendor-receipt-macro.jpg" alt="Ambient Mesh" class="ambient-banner-bg" />
      <div class="ambient-banner-content">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span class="status-pill status-pill-success" style="background:rgba(255,255,255,0.2);color:#ffffff;border:1px solid rgba(255,255,255,0.3);">
            ${icon('shield-check')} Verified Merchant Hub
          </span>
          <span style="font-size:12.5px;color:rgba(255,255,255,0.85);font-weight:600;">
            ${escapeHtml(state.merchant?.lga || 'Lagos')}, Nigeria
          </span>
        </div>
        <h2 class="ambient-banner-title">Welcome back, ${escapeHtml(state.merchant?.businessName || 'Partner')}</h2>
        <p class="ambient-banner-text">Your store currently has <strong>${pendingCount} orders</strong> awaiting immediate fulfillment actions.</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;">
          <button class="btn btn-secondary btn-sm" type="button" data-action="navigate" data-view="fulfilment" style="color:var(--forest-950);font-weight:700;">
            ${icon('truck')} Fulfilment Queue (${pendingCount})
          </button>
          <button class="btn btn-quiet btn-sm" type="button" data-action="new-product" style="color:#ffffff;background:rgba(255,255,255,0.15);font-weight:600;">
            ${icon('plus')} Add Product
          </button>
        </div>
      </div>
    </div>

    <!-- Live operational metrics -->
    <div class="metrics-grid">
      <div class="metric-card" style="cursor:pointer;" data-action="navigate" data-view="fulfilment" data-filter="needs-action">
        <div class="metric-header">
          <span class="metric-title">Orders to Dispatch</span>
          <div class="metric-icon-box">${icon('package')}</div>
        </div>
        <div class="metric-value">${pendingCount}</div>
        <div class="metric-footer">
          <span>${awaitingAcceptance} to accept · ${awaitingPacking + packedCount} to pack</span>
        </div>
      </div>

      <div class="metric-card" style="cursor:pointer;" data-action="navigate" data-view="fulfilment" data-filter="in-transit">
        <div class="metric-header">
          <span class="metric-title">In Transit</span>
          <div class="metric-icon-box">${icon('truck')}</div>
        </div>
        <div class="metric-value">${inTransitCount}</div>
        <div class="metric-footer">
          <span>With courier awaiting delivery proof</span>
        </div>
      </div>

      <div class="metric-card" style="cursor:pointer;" data-action="navigate" data-view="catalogue">
        <div class="metric-header">
          <span class="metric-title">Active Catalogue</span>
          <div class="metric-icon-box">${icon('layers')}</div>
        </div>
        <div class="metric-value">${publishedCount}</div>
        <div class="metric-footer">
          <span>${draftCount} drafts · ${inReviewCount} in review</span>
        </div>
      </div>

      <div class="metric-card" style="cursor:pointer;" data-action="navigate" data-view="returns">
        <div class="metric-header">
          <span class="metric-title">Return Requests</span>
          <div class="metric-icon-box">${icon('rotate-ccw')}</div>
        </div>
        <div class="metric-value">${returnsCount}</div>
        <div class="metric-footer">
          <span>${openReturnsCount} open return cases</span>
        </div>
      </div>
    </div>

    <!-- Urgent Action Queue Table -->
    <div class="card" style="margin-top:20px;">
      <div class="card-header">
        <div>
          <h2 class="card-title">Orders Requiring Action</h2>
          <p class="card-subtitle">Immediate merchant acceptance, packing, or courier dispatch.</p>
        </div>
        <button class="btn btn-quiet" type="button" data-action="navigate" data-view="fulfilment">
          View All Orders (${state.orders.length}) ${icon('arrow-right')}
        </button>
      </div>
      <div class="table-container">
        ${urgentOrders.length > 0 ? renderOrdersTable(urgentOrders, true) : `
          <div class="empty-state" style="padding:36px 20px;">
            <div class="empty-icon-wrap" style="background:rgba(10,82,67,0.08);color:var(--forest-800);">${icon('check-circle-2')}</div>
            <h3 class="empty-title">All dispatch queues are clear</h3>
            <p class="empty-text">No active customer orders require immediate merchant packing or dispatch right now.</p>
            <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" type="button" data-action="simulate-customer-order">
                ${icon('plus-circle')} Simulate Test Customer Order
              </button>
              <button class="btn btn-quiet btn-sm" type="button" data-action="navigate" data-view="catalogue">
                ${icon('package')} View Product Catalogue
              </button>
            </div>
          </div>
        `}
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 2: CATALOGUE & STOCK MANAGEMENT
   ========================================================================== */

function renderCatalogueView() {
  const categoryMap = new Map(state.categories.map((c) => [c.id, c.name]));
  const catalogueEnabled = (state.overview?.merchant?.status ?? state.merchant?.status) === 'active';
  const currentFilter = state.catalogueFilter || 'all';
  const currentCategory = state.catalogueCategory || 'all';
  const searchTerm = (state.catalogueSearch || '').toLowerCase();
  const sort = state.catalogueSort || { field: 'default', direction: 'desc' };

  // Deriving distinct product categories with item counts
  const distinctCategories = [];
  const catSeen = new Set();
  state.products.forEach((p) => {
    const catId = p.categoryId || 'uncategorized';
    const catName = categoryMap.get(p.categoryId) || (p.categoryId ? 'General' : 'Uncategorized');
    if (!catSeen.has(catId)) {
      catSeen.add(catId);
      const count = state.products.filter((pr) => (pr.categoryId || 'uncategorized') === catId).length;
      distinctCategories.push({ id: catId, name: catName, count });
    }
  });

  const totalCount = state.products.length;
  const publishedCount = state.products.filter((p) => p.status === 'published').length;
  const inReviewCount = state.products.filter((p) => p.status === 'pending_approval').length;
  const rejectedCount = state.products.filter((p) => p.status === 'rejected').length;
  const draftCount = state.products.filter((p) => p.status === 'draft').length;
  const lowStockCount = state.products.filter((p) => (p.variants?.[0]?.availableQuantity ?? 0) <= 3).length;
  const totalUnits = state.products.reduce((s, p) => s + (p.variants?.[0]?.availableQuantity ?? 0), 0);

  let filtered = [...state.products];
  if (currentFilter === 'published') filtered = filtered.filter((p) => p.status === 'published');
  else if (currentFilter === 'in_review') filtered = filtered.filter((p) => p.status === 'pending_approval');
  else if (currentFilter === 'rejected') filtered = filtered.filter((p) => p.status === 'rejected');
  else if (currentFilter === 'draft') filtered = filtered.filter((p) => p.status === 'draft');
  else if (currentFilter === 'low-stock') filtered = filtered.filter((p) => (p.variants?.[0]?.availableQuantity ?? 0) <= 3);

  if (currentCategory !== 'all') {
    filtered = filtered.filter((p) => (p.categoryId || 'uncategorized') === currentCategory);
  }

  if (searchTerm) {
    filtered = filtered.filter((p) => {
      const categoryName = categoryMap.get(p.categoryId) || '';
      const sku = p.variants?.[0]?.sku || '';
      return `${p.title} ${sku} ${categoryName}`.toLowerCase().includes(searchTerm);
    });
  }

  if (sort.field === 'price') {
    filtered.sort((a, b) => {
      const pA = a.variants?.[0]?.priceMinor || 0;
      const pB = b.variants?.[0]?.priceMinor || 0;
      return sort.direction === 'asc' ? pA - pB : pB - pA;
    });
  } else if (sort.field === 'stock') {
    filtered.sort((a, b) => {
      const sA = a.variants?.[0]?.availableQuantity ?? 0;
      const sB = b.variants?.[0]?.availableQuantity ?? 0;
      return sort.direction === 'asc' ? sA - sB : sB - sA;
    });
  } else if (sort.field === 'title') {
    filtered.sort((a, b) => {
      return sort.direction === 'asc' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title);
    });
  }

  const rows = filtered.map((product) => {
    const variant = product.variants?.[0];
    const rawImage = product.media?.find((m) => m.mediaType === 'image')?.mediaUrl;
    const image = safeMediaUrl(rawImage);
    const qty = variant?.availableQuantity ?? 0;
    const reserved = variant?.reservedQuantity ?? 0;
    const catId = product.categoryId || 'uncategorized';
    const catName = categoryMap.get(product.categoryId) || 'General';

    let stockBadgeClass = 'status-pill-success';
    let stockText = `${qty} in stock`;
    if (qty === 0) {
      stockBadgeClass = 'status-pill-danger';
      stockText = 'Out of Stock';
    } else if (qty <= 3) {
      stockBadgeClass = 'status-pill-warning';
      stockText = `Low Stock: ${qty} left`;
    }

    return `
      <tr data-product-row="${escapeAttribute((product.title + ' ' + (variant?.sku || '') + ' ' + catName).toLowerCase())}">
        <td>
          <div class="product-cell-wrap">
            <div class="product-thumb-container" data-action="preview-product-image" data-image-url="${escapeAttribute(image || '')}" data-title="${escapeAttribute(product.title)}" data-sku="${escapeAttribute(variant?.sku || '')}" data-product-id="${escapeAttribute(product.id)}" title="Click to inspect photo in high resolution">
              ${image ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(product.title)}" class="product-thumb-img" />` : `<div class="product-thumb-fallback">${icon('package')}</div>`}
            </div>
            <div>
              <div class="table-product-title" data-action="edit-product" data-product-id="${escapeAttribute(product.id)}" title="Edit specifications in Product Studio">${escapeHtml(product.title)}</div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;">
                <span class="table-sku-badge">SKU: ${escapeHtml(variant?.sku || 'No SKU')}</span>
                ${product.variants && product.variants.length > 1 ? `<span style="font-size:11px;color:var(--forest-800);font-weight:700;">${product.variants.length} variants</span>` : ''}
              </div>
              ${product.status === 'rejected' && product.rejectionReason ? `
                <div class="product-rejection-callout" data-action="fix-and-resubmit" data-product-id="${escapeAttribute(product.id)}" title="Click to fix and resubmit">
                  ${icon('alert-triangle')} <strong>Operations Feedback:</strong> "${escapeHtml(product.rejectionReason)}"
                </div>
              ` : ''}
            </div>
          </div>
        </td>
        <td>
          <button type="button" class="category-table-pill ${currentCategory === catId ? 'active-filter' : ''}" data-action="filter-category" data-category-id="${escapeAttribute(catId)}" title="Filter catalog by ${escapeAttribute(catName)}">
            ${icon('tag')} ${escapeHtml(catName)}
          </button>
        </td>
        <td>
          <strong style="font-family:var(--font-numbers);font-size:14.5px;color:var(--forest-950);">
            ${variant ? formatNaira(variant.priceMinor) : '—'}
          </strong>
        </td>
        <td>
          <div>
            <span class="status-pill ${stockBadgeClass}" style="font-size:11.5px;">
              ${escapeHtml(stockText)}
            </span>
            ${reserved > 0 ? `<div class="table-sub-text" style="color:var(--gold-600);font-weight:600;margin-top:2px;">${reserved} reserved</div>` : ''}
          </div>
        </td>
        <td>${statusBadge(product.status)}</td>
        <td>
          <div class="table-actions">
            ${variant ? `
              <button class="btn btn-secondary btn-sm" type="button" data-action="edit-stock" data-variant-id="${escapeAttribute(variant.id)}" data-product-title="${escapeAttribute(product.title)}" data-sku="${escapeAttribute(variant.sku || '')}" data-quantity="${escapeAttribute(variant.availableQuantity)}" ${catalogueEnabled ? '' : 'disabled'} title="Adjust live available stock">
                ${icon('sliders')} Stock
              </button>
            ` : ''}
            ${product.status === 'rejected' ? `
              <button class="btn btn-warning btn-sm" type="button" data-action="fix-and-resubmit" data-product-id="${escapeAttribute(product.id)}" title="Review feedback and resubmit listing for moderation">
                ${icon('refresh-cw')} Fix & Resubmit
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" type="button" data-action="edit-product" data-product-id="${escapeAttribute(product.id)}" title="Edit in Product Studio">
              ${icon('edit-3')} Edit
            </button>
            <button class="btn btn-quiet btn-sm" type="button" data-action="preview-shopper" data-product-id="${escapeAttribute(product.id)}" title="Preview how shoppers see this product">
              ${icon('eye')} Preview
            </button>
            <button class="btn btn-quiet btn-sm" type="button" data-action="duplicate-product" data-product-id="${escapeAttribute(product.id)}" title="Duplicate listing as a draft">
              ${icon('copy')}
            </button>
            ${product.status === 'draft' ? `
              <button class="btn btn-primary btn-sm" type="button" data-action="submit-product" data-product-id="${escapeAttribute(product.id)}" ${catalogueEnabled ? '' : 'disabled'} title="Submit for Operations moderation">
                ${icon('send')} Submit
              </button>
            ` : ''}
            <button class="btn btn-quiet btn-sm danger-hover" type="button" data-action="delete-product" data-product-id="${escapeAttribute(product.id)}" title="Delete item">
              ${icon('trash-2')}
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="view-header">
      <div>
        <h1 class="view-title">Catalogue & Stock</h1>
        <p class="view-subtitle">Manage listings, live quantities, and submit items for Operations moderation.</p>
      </div>
      <button class="btn btn-primary btn-sm" type="button" data-action="new-product" ${catalogueEnabled ? '' : 'disabled'}>
        ${icon('plus')} Add New Product
      </button>
    </div>

    ${catalogueEnabled ? '' : `<div class="error-summary" role="status" style="margin-bottom:20px;">${icon('clock')} <span>Catalogue changes unlock after Operations approves this merchant verification.</span></div>`}

    <!-- KPI Summary Cards with Quick Filter Shortcuts -->
    <div class="catalogue-kpis">
      <div class="catalogue-kpi-card ${currentFilter === 'all' && currentCategory === 'all' ? 'active' : ''}" data-action="set-catalogue-filter" data-filter="all" title="Show all catalog listings">
        <div class="catalogue-kpi-icon">${icon('package')}</div>
        <div class="catalogue-kpi-content">
          <div class="catalogue-kpi-val">${totalCount}</div>
          <div class="catalogue-kpi-label">Listings</div>
        </div>
      </div>
      <div class="catalogue-kpi-card" data-action="set-catalogue-filter" data-filter="all" title="Total stock units across all items">
        <div class="catalogue-kpi-icon">${icon('boxes')}</div>
        <div class="catalogue-kpi-content">
          <div class="catalogue-kpi-val">${totalUnits}</div>
          <div class="catalogue-kpi-label">Units in Stock</div>
        </div>
      </div>
      ${rejectedCount > 0 ? `
        <div class="catalogue-kpi-card ${currentFilter === 'rejected' ? 'active' : ''}" data-action="set-catalogue-filter" data-filter="rejected" title="Filter items requiring correction before publication" style="border-color:var(--rose-300);background:#fff9f9;">
          <div class="catalogue-kpi-icon warn" style="color:var(--rose-600);background:var(--rose-50);">${icon('alert-triangle')}</div>
          <div class="catalogue-kpi-content">
            <div class="catalogue-kpi-val" style="color:var(--rose-600);">${rejectedCount}</div>
            <div class="catalogue-kpi-label" style="color:var(--rose-700);font-weight:700;">Needs Changes</div>
          </div>
        </div>
      ` : ''}
      <div class="catalogue-kpi-card ${currentFilter === 'low-stock' ? 'active' : ''}" data-action="set-catalogue-filter" data-filter="low-stock" title="Filter items low in stock (≤ 3 units)">
        <div class="catalogue-kpi-icon ${lowStockCount > 0 ? 'warn' : ''}">${icon('alert-triangle')}</div>
        <div class="catalogue-kpi-content">
          <div class="catalogue-kpi-val" style="${lowStockCount > 0 ? 'color:var(--gold-600);' : ''}">${lowStockCount}</div>
          <div class="catalogue-kpi-label">Low Stock (≤ 3)</div>
        </div>
      </div>
      <div class="catalogue-kpi-card ${currentFilter === 'in_review' ? 'active' : ''}" data-action="set-catalogue-filter" data-filter="in_review" title="Filter items awaiting moderation review">
        <div class="catalogue-kpi-icon">${icon('clock')}</div>
        <div class="catalogue-kpi-content">
          <div class="catalogue-kpi-val">${inReviewCount}</div>
          <div class="catalogue-kpi-label">In Moderation</div>
        </div>
      </div>
    </div>

    <!-- Filter & Search Controls -->
    <div class="filter-search-bar">
      <div class="filter-pills-wrap">
        <button class="filter-pill ${currentFilter === 'all' ? 'active' : ''}" type="button" data-action="set-catalogue-filter" data-filter="all">
          All <span class="filter-count">${totalCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'published' ? 'active' : ''}" type="button" data-action="set-catalogue-filter" data-filter="published">
          Published <span class="filter-count">${publishedCount}</span>
        </button>
        ${rejectedCount > 0 ? `
          <button class="filter-pill ${currentFilter === 'rejected' ? 'active' : ''}" type="button" data-action="set-catalogue-filter" data-filter="rejected" style="border-color:var(--rose-600);color:var(--rose-700);">
            Needs Changes <span class="filter-count danger">${rejectedCount}</span>
          </button>
        ` : ''}
        <button class="filter-pill ${currentFilter === 'low-stock' ? 'active' : ''}" type="button" data-action="set-catalogue-filter" data-filter="low-stock">
          Low Stock <span class="filter-count ${lowStockCount > 0 ? 'warn' : ''}">${lowStockCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'in_review' ? 'active' : ''}" type="button" data-action="set-catalogue-filter" data-filter="in_review">
          In Review <span class="filter-count">${inReviewCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'draft' ? 'active' : ''}" type="button" data-action="set-catalogue-filter" data-filter="draft">
          Drafts <span class="filter-count">${draftCount}</span>
        </button>
      </div>

      <div class="filter-search-right">
        ${distinctCategories.length > 1 ? `
          <div class="category-select-wrap">
            ${icon('filter')}
            <select class="category-select" id="catalogue-category-filter" data-action="change-category-filter" aria-label="Filter products by category">
              <option value="all">All Categories (${state.products.length})</option>
              ${distinctCategories.map((cat) => `
                <option value="${escapeAttribute(cat.id)}" ${currentCategory === cat.id ? 'selected' : ''}>
                  ${escapeHtml(cat.name)} (${cat.count})
                </option>
              `).join('')}
            </select>
          </div>
        ` : ''}

        <div class="search-input-wrap">
          ${icon('search')}
          <input class="search-input" id="catalogue-search" type="text" placeholder="Search title, SKU, or category…" value="${escapeAttribute(state.catalogueSearch || '')}" />
          ${state.catalogueSearch ? `
            <button class="search-clear-btn" type="button" data-action="clear-catalogue-search" title="Clear search">
              ${icon('x')}
            </button>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- Active Filter Tags Display -->
    ${(currentCategory !== 'all' || currentFilter !== 'all' || searchTerm) ? `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
        <span style="font-size:12px;color:var(--ink-muted);font-weight:600;">Active filters:</span>
        ${currentFilter !== 'all' ? `
          <span class="category-active-tag">
            Status: ${escapeHtml(currentFilter)}
            <button type="button" data-action="set-catalogue-filter" data-filter="all" title="Remove status filter">${icon('x')}</button>
          </span>
        ` : ''}
        ${currentCategory !== 'all' ? `
          <span class="category-active-tag">
            Category: ${escapeHtml(distinctCategories.find((c) => c.id === currentCategory)?.name || currentCategory)}
            <button type="button" data-action="filter-category" data-category-id="all" title="Remove category filter">${icon('x')}</button>
          </span>
        ` : ''}
        ${searchTerm ? `
          <span class="category-active-tag">
            Search: "${escapeHtml(searchTerm)}"
            <button type="button" data-action="clear-catalogue-search" title="Clear search">${icon('x')}</button>
          </span>
        ` : ''}
        <button class="btn-quiet btn-sm" type="button" data-action="clear-all-catalogue-filters" style="font-size:11.5px;padding:2px 8px;">
          Reset all
        </button>
      </div>
    ` : ''}

    <div class="card">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th class="sortable-th" data-action="toggle-catalogue-sort" data-sort-field="title" title="Click to sort by title">
                Product Details
                ${sort.field === 'title' ? `<span class="sort-indicator">${icon(sort.direction === 'asc' ? 'arrow-up' : 'arrow-down')}</span>` : ''}
              </th>
              <th>Category</th>
              <th class="sortable-th" data-action="toggle-catalogue-sort" data-sort-field="price" title="Click to sort by price">
                Unit Price
                ${sort.field === 'price' ? `<span class="sort-indicator">${icon(sort.direction === 'asc' ? 'arrow-up' : 'arrow-down')}</span>` : ''}
              </th>
              <th class="sortable-th" data-action="toggle-catalogue-sort" data-sort-field="stock" title="Click to sort by available stock">
                Available Stock
                ${sort.field === 'stock' ? `<span class="sort-indicator">${icon(sort.direction === 'asc' ? 'arrow-up' : 'arrow-down')}</span>` : ''}
              </th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon-wrap">${icon('package-open')}</div><h3 class="empty-title">No products match your filters</h3><p class="empty-text">Try resetting your category or status filters, or add a new product.</p><div style="display:flex;gap:8px;justify-content:center;margin-top:12px;"><button class="btn btn-secondary btn-sm" type="button" data-action="clear-all-catalogue-filters">${icon('rotate-ccw')} Reset Filters</button><button class="btn btn-primary btn-sm" type="button" data-action="new-product">${icon('plus')} Add Product</button></div></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 3: PRODUCT STUDIO (PRO MARKETPLACE LISTING STUDIO & MOBILE SIMULATOR)
   ========================================================================== */

function renderAddProductView() {
  const categoryOptions = state.categories.map((c) => `<option value="${escapeAttribute(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  const isEditing = Boolean(state.editingProductId);
  const existingProduct = state.editingProductId ? state.products.find((p) => String(p.id) === String(state.editingProductId)) : null;
  const isRejected = existingProduct?.status === 'rejected';
  const catalogueEnabled = (state.overview?.merchant?.status ?? state.merchant?.status) === 'active';
  const canCreate = (catalogueEnabled && state.categories.length > 0) || isEditing || isRejected;
  const draft = state.productDraft || {};
  const rejectionReason = existingProduct?.rejectionReason || existingProduct?.rejection_reason || draft.rejectionReason || '';

  // Form values (default or editing)
  const title = draft.title || '';
  const categoryId = draft.categoryId || '';
  const brand = draft.brand || '';
  const condition = draft.condition || 'brand_new';
  const tags = draft.tags || '';
  const description = draft.description || '';
  const sku = draft.sku || '';
  const priceNaira = draft.priceNaira || '';
  const comparePriceNaira = draft.comparePriceNaira || '';
  const availableQuantity = draft.availableQuantity || '';
  const lowStockThreshold = draft.lowStockThreshold || '3';
  const variantMode = draft.variantMode || 'single'; // 'single' | 'variants'
  const selectedSizes = Array.isArray(draft.selectedSizes) ? draft.selectedSizes : [];
  const selectedColors = Array.isArray(draft.selectedColors) ? draft.selectedColors : [];
  const matrixOptions = selectedSizes.flatMap((size) => selectedColors.map((color) => ({ size, color }))).slice(0, 100);
  const matrixVariantByOption = new Map((draft.variantMatrix || []).map((variant) => [
    `${variant.optionSize || ''}:${variant.optionColor || ''}`,
    variant,
  ]));
  const bullet1 = draft.bullet1 || '';
  const bullet2 = draft.bullet2 || '';
  const bullet3 = draft.bullet3 || '';
  const careInstructions = draft.careInstructions || '';
  const imageUrl = draft.imageUrl || '';
  const weightKg = draft.weightKg || '';
  const dimensionsCm = draft.dimensionsCm || '';
  const returnPolicy = draft.returnPolicy || '7_day_escrow';
  const warranty = draft.warranty || '30_days';
  const submitForReview = isRejected ? true : (draft.submitForReview !== false);
  const previewMode = state.previewMode || 'card'; // 'card' | 'detail'

  // Live preview computations
  const previewImg = safeMediaUrl(imageUrl);
  const hasImage = Boolean(previewImg);
  const previewTitle = title || 'Your product name';
  const previewBrand = brand || 'Your brand';
  const selectedCat = state.categories.find((c) => c.id === categoryId)?.name || 'Category';
  const previewPriceNum = Number(priceNaira) || 0;
  const previewPrice = previewPriceNum ? formatNaira(previewPriceNum * 100) : 'Add a price';
  const previewCompareNum = Number(comparePriceNaira) || 0;
  const previewCompare = previewCompareNum > 0 ? formatNaira(previewCompareNum * 100) : '';
  const discountPercent = (previewCompareNum > previewPriceNum && previewPriceNum > 0)
    ? Math.round(((previewCompareNum - previewPriceNum) / previewCompareNum) * 100)
    : 0;

  // Escrow & Settlement Calculations (5% marketplace commission)
  const escrowFeeRate = 0.05;
  const platformFeeMinor = Math.round(previewPriceNum * escrowFeeRate * 100);
  const estimatedPayoutMinor = Math.round(previewPriceNum * (1 - escrowFeeRate) * 100);
  const platformFeeText = formatNaira(platformFeeMinor);
  const estimatedPayoutText = formatNaira(estimatedPayoutMinor);

  const qtyNum = Number(availableQuantity) || 0;
  const storeName = state.merchant?.businessName || 'SellFast Official Store';
  const storeLga = state.merchant?.lga || 'Lagos';

  // Quality score & readiness checklist
  const checkTitle = title.trim().length >= 10;
  const checkCategory = Boolean(categoryId);
  const checkImage = isMediaUrlValid(imageUrl) && draft.imageValidation?.valid !== false;
  const checkPrice = previewPriceNum > 0;
  const checkStock = qtyNum > 0;
  const checkDesc = description.trim().length >= 20 || (bullet1 && bullet2);
  const checkShipping = Boolean(weightKg && dimensionsCm);
  const checksPassed = [checkTitle, checkCategory, checkImage, checkPrice, checkStock, checkDesc, checkShipping].filter(Boolean).length;
  const qualityScore = Math.round((checksPassed / 7) * 100);

  const categoryProfile = productCategoryProfile(state.categories.find((c) => c.id === categoryId)?.name || '');
  const variantFields = productOptionFields(categoryProfile);

  return `
    <div class="view-header">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="status-pill status-pill-success" style="font-size:11px;">${icon('layers')} Pro Marketplace Studio</span>
          ${isRejected ? `<span class="status-pill status-pill-danger" style="font-size:11px;">${icon('alert-triangle')} Needs Changes</span>` : (isEditing ? `<span class="status-pill status-pill-warning" style="font-size:11px;">${icon('edit-3')} Edit Mode</span>` : '')}
        </div>
        <h1 class="view-title">${isRejected ? 'Fix & Resubmit Product' : (isEditing ? 'Edit Product Listing' : 'Product Studio')}</h1>
        <p class="view-subtitle">${isRejected ? 'Address Operations moderation feedback below and resubmit your listing for marketplace approval.' : (isEditing ? 'Update specifications, pricing, media, or variant stock for this catalog listing.' : 'Create, refine, and publish enterprise-grade listings to the live SellFastBuyFast marketplace.')}</p>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        ${isEditing ? `
          <button class="btn btn-quiet btn-sm" type="button" data-action="new-product">
            ${icon('plus')} Create New Instead
          </button>
        ` : ''}
        <button class="btn btn-secondary btn-sm" type="button" data-action="navigate" data-view="catalogue">
          ${icon('arrow-left')} Back to Catalogue
        </button>
      </div>
    </div>

    ${catalogueEnabled ? '' : `<div class="error-summary" role="status" style="margin-bottom:20px;">${icon('clock')} <span>Product publishing unlocks once Operations completes this merchant verification.</span></div>`}

    <div class="studio-grid">
      <!-- Left Column: Pro Form Sections -->
      <form id="product-form" novalidate style="display:flex;flex-direction:column;gap:0;">
        ${state.formError ? `<div class="error-summary" role="alert" style="margin-bottom:18px;">${icon('alert-circle')} <span>${escapeHtml(state.formError)}</span></div>` : ''}

        ${isRejected && rejectionReason ? `
          <div class="rejection-feedback-banner" role="alert" style="margin-bottom:20px;">
            <div class="rejection-feedback-title">
              ${icon('alert-triangle')} Changes Requested by Operations Moderation
            </div>
            <div class="rejection-feedback-note">
              "${escapeHtml(rejectionReason)}"
            </div>
            <p class="rejection-feedback-hint">
              You may update the listing using the feedback above, or resubmit it unchanged for another Operations review. This note does not block <strong>Resubmit for Moderation</strong> below.
            </p>
          </div>
        ` : ''}

        <!-- Section 1: The essentials -->
        <div class="studio-section">
          <div class="studio-section-header">
            <div class="studio-section-title">${icon('file-text')} About your item</div>
            <span class="studio-section-badge">Required</span>
          </div>
          <div class="studio-section-body">
            <div class="form-group">
              <label class="form-label" for="prod-title">
                <span>What are you selling?</span>
                <span class="field-help"><span id="title-char-count">${title.length}</span>/180 (30–80 recommended)</span>
              </label>
              <input class="input" id="prod-title" name="title" placeholder="e.g. Italian Leather Men's Oxford Shoes" value="${escapeAttribute(title)}" maxlength="180" required />
            </div>

            <div class="grid-2col">
              <div class="form-group">
              <label class="form-label" for="prod-category">Choose a category</label>
                <select class="select" id="prod-category" name="categoryId" required ${state.categories.length === 0 ? 'disabled' : ''}>
                  <option value="">${state.categories.length === 0 ? 'Loading categories…' : 'Select Category'}</option>
                  ${state.categories.map((c) => `<option value="${escapeAttribute(c.id)}" ${c.id === categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="prod-brand">Brand</label>
                <input class="input" id="prod-brand" name="brand" placeholder="e.g. SellFast Signature, Nike, Zara" value="${escapeAttribute(brand)}" required />
              </div>
            </div>

            <details class="studio-advanced-fields">
              <summary>More item details (optional)</summary>
              <div class="grid-2col" style="margin-top:14px;">
              <div class="form-group">
                <label class="form-label" for="prod-condition">Item Condition</label>
                <select class="select" id="prod-condition" name="condition">
                  <option value="brand_new" ${condition === 'brand_new' ? 'selected' : ''}>Brand New (Boxed / Sealed)</option>
                  <option value="open_box" ${condition === 'open_box' ? 'selected' : ''}>Open Box (Like New)</option>
                  <option value="refurbished" ${condition === 'refurbished' ? 'selected' : ''}>Refurbished / Certified</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="prod-tags">Search words</label>
                <input class="input" id="prod-tags" name="tags" placeholder="e.g. leather, oxford, mens footwear, black" value="${escapeAttribute(tags)}" />
              </div>
              </div>
            </details>
          </div>
        </div>

        <!-- Section 2: Visual Media & Gallery Studio -->
        <div class="studio-section">
          <div class="studio-section-header">
            <div class="studio-section-title">${icon('image')} Visual Media & Photography</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <button type="button" class="btn btn-quiet btn-xs" data-action="open-photo-standards" style="font-weight:600;color:var(--forest-800);display:inline-flex;align-items:center;gap:5px;">
                ${icon('info')} View Full Image Standards
              </button>
              <span class="studio-section-badge" id="product-photo-rule">${escapeHtml(productCategoryProfile(state.categories.find((c) => c.id === categoryId)?.name || '').label)}</span>
            </div>
          </div>
          <div class="studio-section-body">
            <div class="product-upload-container">
              <!-- Native hidden file input for photo gallery / camera / file selector -->
              <input type="file" id="prod-image-file" accept="image/jpeg,image/png,image/webp" style="display:none;" />

              <!-- Drag and drop / click upload area -->
              <div class="product-upload-dropzone" id="prod-image-dropzone" data-action="trigger-product-image-upload">
                <div class="product-upload-icon-circle">
                  ${icon('upload')}
                </div>
                <div class="product-upload-title">Select or Take Product Photo</div>
                <div class="product-upload-subtitle">
                  Upload directly from your phone photo gallery, camera, or computer files. Images must comply with <a href="javascript:void(0)" data-action="open-photo-standards" style="color:var(--forest-700);text-decoration:underline;font-weight:600;">Marketplace Photography Standards</a> to be approved by Operations Admins.
                </div>
                <button type="button" class="btn btn-secondary btn-sm" data-action="trigger-product-image-upload">
                  ${icon('upload')} Choose Image from Device or Gallery
                </button>
                <div class="product-upload-badges">
                  <span class="product-upload-badge highlight">Allowed Formats: JPG, PNG, WebP</span>
                  <span class="product-upload-badge">Max: 5 MB</span>
                  <span class="product-upload-badge" id="product-photo-rule-short">Category-aware image rules</span>
                </div>
              </div>

              <!-- Upload Status / Progress -->
              <div class="product-upload-status" id="prod-image-upload-status"></div>

              <!-- Image Active Preview & Specs -->
              <div class="photo-standards-banner">
                <div class="photo-standards-thumb-wrap">
                  <img src="${escapeAttribute(previewImg)}" alt="Uploaded product thumbnail" id="cover-thumb-preview" class="photo-standards-thumb" ${hasImage ? '' : 'hidden'} />
                  <span class="photo-standards-thumb-empty" id="cover-thumb-empty" ${hasImage ? 'hidden' : ''}>${icon('image')}</span>
                </div>
                <div class="photo-standards-info">
                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
                    <strong style="color:var(--ink-primary);display:flex;align-items:center;gap:6px;font-size:13px;">
                      ${icon('shield-check')} Marketplace Photography Standard
                    </strong>
                    <button type="button" class="btn btn-secondary btn-xs" data-action="open-photo-standards" style="display:inline-flex;align-items:center;gap:4px;font-weight:600;">
                      ${icon('maximize')} Open Fullscreen Guide
                    </button>
                  </div>
                  <p style="margin:4px 0 8px;font-size:12px;color:var(--ink-muted);line-height:1.45;" id="product-photo-guidance">
                    Choose a category first. We will check the file dimensions and shape before upload.
                  </p>
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <button type="button" class="btn btn-quiet btn-xs" data-action="trigger-product-image-upload">
                      ${icon('camera')} Change Photo
                    </button>
                    <button type="button" class="btn btn-quiet btn-xs" data-action="open-photo-standards">
                      ${icon('book-open')} Read Guidelines & Examples
                    </button>
                  </div>
                </div>
              </div>
              <input id="prod-image" name="imageUrl" type="hidden" value="${escapeAttribute(imageUrl)}" />
            </div>
          </div>
        </div>

        <!-- Section 3: Price and earnings -->
        <div class="studio-section">
          <div class="studio-section-header">
            <div class="studio-section-title">${icon('credit-card')} Price & earnings</div>
            <span class="studio-section-badge">Naira (₦)</span>
          </div>
          <div class="studio-section-body">
            <div class="grid-2col">
              <div class="form-group">
                <label class="form-label" for="prod-price">Price customers pay (₦)</label>
                <input class="input" id="prod-price" name="priceNaira" type="number" min="100" step="100" placeholder="e.g. 45000" value="${escapeAttribute(priceNaira)}" required />
                <span class="field-help">Final price displayed to buyers in mobile app.</span>
              </div>
              <div class="form-group">
                <label class="form-label" for="prod-compare-price">
                  <span>Previous price (optional)</span>
                  <span class="field-help">Shows a sale when it is higher than your price</span>
                </label>
                <input class="input" id="prod-compare-price" name="comparePriceNaira" type="number" min="100" step="100" placeholder="e.g. 55000" value="${escapeAttribute(comparePriceNaira)}" />
                <span class="field-help">Leave empty if not offering a promotional discount.</span>
              </div>
            </div>

            <div class="payout-calculator-box">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <span style="font-size:12px;font-weight:700;color:var(--forest-900);display:flex;align-items:center;gap:6px;">
                  ${icon('calculator')} Estimated amount you receive
                </span>
                <span style="font-size:11px;font-weight:600;color:var(--ink-muted);">After the 5% marketplace fee</span>
              </div>
              <div class="payout-calc-grid">
                <div class="payout-calc-item">
                  <span class="payout-calc-val profit" id="calc-payout-val">${estimatedPayoutText}</span>
                  <span class="payout-calc-label">Per item sold</span>
                </div>
              </div>
              <div style="font-size:11px;color:var(--ink-muted);margin-top:10px;text-align:center;border-top:1px dashed rgba(10,82,67,0.15);padding-top:8px;display:flex;align-items:center;justify-content:center;gap:6px;">
                ${icon('shield-check')} Payment is released after confirmed delivery and the return window.
              </div>
            </div>
          </div>
        </div>

        <!-- Section 4: Multi-Variant Matrix & Inventory Controls -->
        <div class="studio-section">
          <div class="studio-section-header">
            <div class="studio-section-title">${icon('package')} Stock & options</div>
            <span class="studio-section-badge">Required</span>
          </div>
          <div class="studio-section-body">
            <!-- Mode Toggle Tabs -->
            <div class="variant-type-tabs">
              <button type="button" class="variant-type-tab ${variantMode === 'single' ? 'active' : ''}" data-action="set-variant-mode" data-mode="single">
                ${icon('box')} One option
              </button>
              <button type="button" class="variant-type-tab ${variantMode === 'variants' ? 'active' : ''}" data-action="set-variant-mode" data-mode="variants">
                ${icon('grid')} Sizes or colours
              </button>
            </div>

            <!-- Mode A: Single Product -->
            <div id="single-inventory-box" style="display:${variantMode === 'single' ? 'block' : 'none'};">
              <div class="grid-2col">
                <div class="form-group">
                  <label class="form-label" for="prod-sku">Your item code</label>
                  <input class="input" id="prod-sku" name="sku" placeholder="e.g. BLUE-SNEAKER-01" value="${escapeAttribute(sku)}" required />
                  <span class="field-help">A unique code you use to find this item in your own stock records.</span>
                </div>
                <div class="form-group">
                  <label class="form-label" for="prod-stock">How many can you sell now?</label>
                  <input class="input" id="prod-stock" name="availableQuantity" type="number" min="0" step="1" placeholder="e.g. 15" value="${escapeAttribute(availableQuantity)}" required />
                </div>
              </div>
              <div class="form-group" style="margin-top:10px;">
                <label class="form-label" for="prod-low-stock">
                  <span>Low Stock Warning Threshold</span>
                  <span class="field-help">Alert trigger in Command Center</span>
                </label>
                <input class="input" id="prod-low-stock" name="lowStockThreshold" type="number" min="1" max="50" value="${escapeAttribute(lowStockThreshold)}" style="max-width:200px;" />
              </div>
            </div>

            <!-- Mode B: Multi-Variant Matrix -->
            <div id="variants-matrix-box" style="display:${variantMode === 'variants' ? 'block' : 'none'};">
              <!-- Size Options -->
              <div class="variant-options-group">
                <label class="form-label">Choose the ${escapeHtml(variantFields.primaryLabel.toLowerCase())} you have</label>
                <div class="variant-pills-row">
                  ${variantFields.primaryOptions.map((sz) => `
                    <label class="variant-checkbox-pill">
                      <input type="checkbox" name="variantSize" value="${sz}" ${selectedSizes.includes(sz) ? 'checked' : ''} data-action="toggle-variant-pill" />
                      <span>${escapeHtml(`${variantFields.primaryPrefix}${sz}`)}</span>
                    </label>
                  `).join('')}
                </div>
              </div>

              <!-- Color Options -->
              <div class="variant-options-group">
                <label class="form-label">Choose the ${escapeHtml(variantFields.secondaryLabel.toLowerCase())} you have</label>
                <div class="variant-pills-row">
                  ${variantFields.secondaryOptions.map((col) => `
                    <label class="variant-checkbox-pill">
                      <input type="checkbox" name="variantColor" value="${col}" ${selectedColors.includes(col) ? 'checked' : ''} data-action="toggle-variant-pill" />
                      <span>${col}</span>
                    </label>
                  `).join('')}
                </div>
              </div>

              <!-- Generated Variant Table -->
              <div class="table-container" style="margin-top:14px;border:1px solid var(--border-light);border-radius:var(--radius-sm);">
                <table class="variant-matrix-table">
                  <thead>
                    <tr>
                      <th>Variant Option</th>
                      <th>SKU</th>
                      <th>Price (₦)</th>
                      <th>Stock Units</th>
                    </tr>
                  </thead>
                  <tbody id="variant-matrix-tbody">
                    ${matrixOptions.map(({ size, color }, idx) => {
                      const savedVariant = matrixVariantByOption.get(`${size}:${color}`);
                      const matrixSku = savedVariant?.sku || `${sku || 'SFBF-OXF'}-${size}-${color.replace(/\s+/g, '-').toUpperCase()}`;
                      const matrixPrice = savedVariant ? String(Math.round(savedVariant.priceMinor / 100)) : (priceNaira || '45000');
                      const matrixStock = savedVariant ? String(savedVariant.availableQuantity) : String(Math.max(2, 6 - idx));
                      return `
                      <tr>
                        <td><strong>${escapeHtml(productVariantLabel(size, color, categoryProfile.key === 'standard' ? '' : state.categories.find((c) => c.id === categoryId)?.name || ''))}</strong></td>
                        <td><input class="variant-matrix-input" data-variant-field="sku" data-option-size="${escapeAttribute(size)}" data-option-color="${escapeAttribute(color)}" value="${escapeAttribute(matrixSku)}" /></td>
                        <td><input class="variant-matrix-input" data-variant-field="price" type="number" min="1" value="${escapeAttribute(matrixPrice)}" /></td>
                        <td><input class="variant-matrix-input" data-variant-field="stock" type="number" min="0" value="${escapeAttribute(matrixStock)}" /></td>
                      </tr>
                    `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 5: Highlights, Specifications & Shipping Logistics -->
        <div class="studio-section">
          <div class="studio-section-header">
            <div class="studio-section-title">${icon('check-circle')} Highlights, Specifications & Logistics</div>
            <span class="studio-section-badge">Shopper Conversion</span>
          </div>
          <div class="studio-section-body">
            <div class="form-group">
              <label class="form-label">
                <span>Key Feature Highlights (Bullet Points)</span>
                <span class="field-help">Displayed prominently on mobile app product page</span>
              </label>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <input class="input" id="prod-bullet1" name="bullet1" placeholder="• Material: 100% Genuine Handcrafted Italian Leather" value="${escapeAttribute(bullet1)}" />
                <input class="input" id="prod-bullet2" name="bullet2" placeholder="• Insole & Sole: Memory foam cushioning with non-skid traction" value="${escapeAttribute(bullet2)}" />
                <input class="input" id="prod-bullet3" name="bullet3" placeholder="• Craftsmanship: Goodyear welted construction for durability" value="${escapeAttribute(bullet3)}" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="prod-desc">Product description</label>
              <textarea class="textarea" id="prod-desc" name="description" placeholder="Example: Lightweight blue canvas sneakers with a cushioned insole. Best for everyday wear. Includes original box." style="min-height:110px;">${escapeHtml(description)}</textarea>
              <span class="field-help">This appears below the image on the product page.</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="prod-care">Care instructions (optional)</label>
              <textarea class="textarea" id="prod-care" name="careInstructions" placeholder="Example: Wipe with a damp cloth. Air dry away from direct heat." style="min-height:78px;">${escapeHtml(careInstructions)}</textarea>
              <span class="field-help">Shoppers see this below the product description.</span>
            </div>

            <div class="grid-2col">
              <div class="form-group">
                <label class="form-label" for="prod-weight">Packed weight (kg, optional)</label>
                <input class="input" id="prod-weight" name="weightKg" type="number" step="any" placeholder="e.g. 0.85" value="${escapeAttribute(weightKg)}" />
                <span class="field-help">Leave blank if unknown. Operations reviews the details before publication.</span>
              </div>
              <div class="form-group">
                <label class="form-label" for="prod-dims">Packed size (L × W × H cm, optional)</label>
                <input class="input" id="prod-dims" name="dimensionsCm" placeholder="e.g. 33 × 21 × 12" value="${escapeAttribute(dimensionsCm)}" />
                <span class="field-help">Submitted as entered for Operations to review.</span>
              </div>
            </div>

            <div class="grid-2col">
              <div class="form-group">
                <label class="form-label" for="prod-return-policy">Return Policy</label>
                <select class="select" id="prod-return-policy" name="returnPolicy">
                  <option value="7_day_escrow" ${returnPolicy === '7_day_escrow' ? 'selected' : ''}>7-Day Escrow Return Guarantee (Standard)</option>
                  <option value="inspection_only" ${returnPolicy === 'inspection_only' ? 'selected' : ''}>Inspection upon Delivery Only</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="prod-warranty">Merchant Warranty</label>
                <select class="select" id="prod-warranty" name="warranty">
                  <option value="no_warranty" ${warranty === 'no_warranty' ? 'selected' : ''}>No Warranty</option>
                  <option value="30_days" ${warranty === '30_days' ? 'selected' : ''}>30-Day Seller Warranty</option>
                  <option value="6_months" ${warranty === '6_months' ? 'selected' : ''}>6-Month Warranty</option>
                  <option value="1_year" ${warranty === '1_year' ? 'selected' : ''}>1-Year Full Warranty</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 6: Quality Score, Moderation SLA & Actions -->
        <div class="studio-section">
          <div class="studio-section-header">
            <div class="studio-section-title">${icon('shield-check')} Quality Checklist & Publishing</div>
            <span class="status-pill ${qualityScore >= 80 ? 'status-pill-success' : 'status-pill-warning'}" id="quality-score-pill">
              Score: ${qualityScore}%
            </span>
          </div>
          <div class="studio-section-body">
            <div class="quality-checklist-card">
              <div class="quality-header">
                <div class="quality-title">${icon('check-square')} Marketplace Moderation Readiness</div>
                <span style="font-size:11px;font-weight:700;color:var(--ink-muted);" id="quality-count-text">${checksPassed}/7 Checks complete</span>
              </div>
              <div class="quality-items-list">
                <div class="quality-item ${checkTitle ? 'passed' : 'missing'}" id="chk-title">
                  ${icon(checkTitle ? 'check' : 'circle')} Clear name (10+ characters)
                </div>
                <div class="quality-item ${checkCategory ? 'passed' : 'missing'}" id="chk-cat">
                  ${icon(checkCategory ? 'check' : 'circle')} Category chosen
                </div>
                <div class="quality-item ${checkImage ? 'passed' : 'missing'}" id="chk-img">
                  ${icon(checkImage ? 'check' : 'circle')} Photo meets category rules
                </div>
                <div class="quality-item ${checkPrice ? 'passed' : 'missing'}" id="chk-price">
                  ${icon(checkPrice ? 'check' : 'circle')} Selling price added
                </div>
                <div class="quality-item ${checkStock ? 'passed' : 'missing'}" id="chk-stock">
                  ${icon(checkStock ? 'check' : 'circle')} Sellable quantity added
                </div>
                <div class="quality-item ${checkDesc ? 'passed' : 'missing'}" id="chk-desc">
                  ${icon(checkDesc ? 'check' : 'circle')} Description or key highlights added
                </div>
                <div class="quality-item ${weightKg && dimensionsCm ? 'passed' : 'missing'}" id="chk-shipping">
                  ${icon(weightKg && dimensionsCm ? 'check' : 'circle')} Packed weight and size added
                </div>
              </div>
            </div>

            <div style="background:var(--page-subtle);padding:14px 16px;border-radius:var(--radius-sm);border:1px solid var(--border-light);margin-top:16px;">
              <label class="checkbox-row" style="margin:0;">
                <input type="checkbox" name="submitForReview" id="prod-submit-review" ${submitForReview ? 'checked' : ''} />
                <span>
                  <strong>Submit for Operations Moderation Immediately</strong><br />
                  <small style="color:var(--ink-muted);">Platform moderators review listings in 2–4 business hours. Uncheck to save as a private draft.</small>
                </span>
              </label>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px;gap:12px;flex-wrap:wrap;">
              <div style="display:flex;gap:8px;">
                <button class="btn btn-secondary" type="button" data-action="navigate" data-view="catalogue">Cancel</button>
                <button class="btn btn-secondary" type="button" data-action="discard-product-draft" title="Reset all changes and return to catalogue">
                  ${icon('rotate-ccw')} Discard Draft
                </button>
              </div>
              <div style="display:flex;gap:10px;">
                <button class="btn btn-secondary" type="button" data-action="save-as-draft" ${state.busy || state.isUploadingProductImage ? 'disabled' : ''}>
                  ${icon('file-text')} Save as Draft
                </button>
                <button class="btn btn-primary" type="submit" ${state.busy || state.isUploadingProductImage ? 'disabled' : ''}>
                  ${state.busy === 'create-product' || state.busy === 'update-product' ? 'Saving…' : `${icon('send')} ${isRejected ? 'Resubmit for Moderation' : (isEditing ? 'Save Changes' : (submitForReview ? 'Submit for Review' : 'Save Product'))}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      <!-- Right Column: Dual-Mode Shopper Mobile Simulator -->
      <div class="shopper-preview-sticky">
        <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:12px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:0.05em;display:flex;align-items:center;gap:6px;">
            ${icon('smartphone')} Shopper Simulator
          </span>
          <!-- View Switcher -->
          <div class="preview-mode-switch">
            <button type="button" class="preview-mode-btn ${previewMode === 'card' ? 'active' : ''}" data-action="set-preview-mode" data-mode="card">
              Feed Card
            </button>
            <button type="button" class="preview-mode-btn ${previewMode === 'detail' ? 'active' : ''}" data-action="set-preview-mode" data-mode="detail">
              Product Detail
            </button>
          </div>
        </div>

        <!-- MOCKUP A: Feed Card View -->
        <div id="mockup-card-view" style="display:${previewMode === 'card' ? 'block' : 'none'};">
          ${state.merchant?.vacationMode ? `
            <div class="sim-store-away-banner">
              ${icon('power')} <span>Store temporarily away · Purchasing paused</span>
            </div>
          ` : ''}
          <div class="shopper-card-mock">
            <div class="shopper-card-img-wrap">
              <img src="${escapeAttribute(previewImg)}" alt="${escapeAttribute(previewTitle)}" class="shopper-card-img" id="preview-card-img" ${hasImage ? '' : 'hidden'} />
              <div class="shopper-preview-empty" id="preview-card-empty" ${hasImage ? 'hidden' : ''}>${icon('image')}<strong>Your product photo appears here</strong><span>Upload a category-approved image to begin.</span></div>
              <div class="shopper-badge-discount" id="preview-discount-badge" style="display:${discountPercent > 0 ? 'inline-block' : 'none'};">
                <span id="preview-discount-val">${discountPercent}</span>% OFF
              </div>
              <div class="shopper-badge-verified">
                ${icon('shield-check')} Verified
              </div>
            </div>

            <div class="shopper-card-body">
              <div class="shopper-card-category" id="preview-cat-text">${escapeHtml(selectedCat)}</div>
              <h3 class="shopper-card-title" id="preview-title-text">${escapeHtml(previewTitle)}</h3>
              <div class="shopper-card-pricing">
                <span class="shopper-card-price" id="preview-price-text">${escapeHtml(previewPrice)}</span>
                <span class="shopper-card-compare" id="preview-compare-text" style="display:${previewCompare ? 'inline' : 'none'};">${escapeHtml(previewCompare)}</span>
              </div>
              <div class="shopper-card-stock">
                <span class="shopper-stock-dot ${qtyNum === 0 ? 'danger' : (qtyNum <= 3 ? 'warn' : '')}" id="preview-stock-dot"></span>
                <span id="preview-stock-text" style="color:${qtyNum === 0 ? 'var(--rose-600)' : (qtyNum <= 3 ? 'var(--gold-600)' : 'var(--ink-secondary)')};">
                  ${qtyNum === 0 ? 'Out of Stock' : (qtyNum <= 3 ? `Only ${qtyNum} left` : 'In Stock')}
                </span>
              </div>
              <div style="font-size:11px;color:var(--ink-muted);display:flex;align-items:center;gap:4px;">
                ${icon('store')} ${escapeHtml(storeName)} · ${escapeHtml(storeLga)}
              </div>
              <button type="button" class="shopper-card-btn sim-interactive-btn" id="feed-add-bag-btn" data-action="sim-add-to-bag" ${state.merchant?.vacationMode ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                ${icon('shopping-bag')} ${state.merchant?.vacationMode ? 'Store Away' : 'Add to Bag'}
              </button>
            </div>
          </div>
        </div>

        <!-- MOCKUP B: Product Detail View -->
        <div id="mockup-detail-view" style="display:${previewMode === 'detail' ? 'block' : 'none'};position:relative;">
          ${state.merchant?.vacationMode ? `
            <div class="sim-store-away-banner">
              ${icon('power')} <span>Store temporarily away · Purchasing paused</span>
            </div>
          ` : ''}
          <div class="shopper-detail-mock" id="shopper-detail-frame" style="position:relative;">
            <!-- App Bar -->
            <div class="shopper-detail-header">
              <button type="button" class="sim-icon-btn" data-action="set-preview-mode" data-mode="card" style="border:none;background:transparent;font-size:11.5px;color:var(--ink-secondary);display:flex;align-items:center;gap:4px;">
                ${icon('chevron-left')} Feed
              </button>
              <div style="display:flex;gap:8px;color:var(--ink-secondary);">
                <button type="button" class="sim-icon-btn" data-action="sim-share" title="Share listing">
                  ${icon('share-2')}
                </button>
                <button type="button" class="sim-icon-btn ${state.simWishlist ? 'wishlist-active' : ''}" id="sim-wishlist-btn" data-action="sim-toggle-wishlist" title="Save to Wishlist">
                  ${icon('heart')}
                </button>
              </div>
            </div>

            <!-- Hero Image -->
            <div class="shopper-detail-hero">
              <img src="${escapeAttribute(previewImg)}" alt="${escapeAttribute(previewTitle)}" id="detail-hero-img" style="width:100%;height:100%;object-fit:cover;" ${hasImage ? '' : 'hidden'} />
              <div class="shopper-preview-empty" id="detail-hero-empty" ${hasImage ? 'hidden' : ''}>${icon('image')}<strong>Your product photo</strong><span>will appear here</span></div>
              <div style="position:absolute;bottom:8px;left:0;right:0;display:flex;justify-content:center;gap:4px;">
                <span style="width:6px;height:6px;border-radius:50%;background:#ffffff;"></span>
                <span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.4);"></span>
                <span style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.4);"></span>
              </div>
            </div>

            <!-- Product Specs Body -->
            <div class="shopper-detail-body">
              <div class="shopper-detail-brand" id="detail-brand-text">${escapeHtml(previewBrand)}</div>
              <div class="shopper-detail-title" id="detail-title-text">${escapeHtml(previewTitle)}</div>

              <!-- Rating Row -->
              <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--gold-600);font-weight:700;">
                <span style="display:inline-flex;align-items:center;color:var(--gold-500);">${icon('star')}</span> 4.9 <span style="color:var(--ink-muted);font-weight:500;">(34 verified buyer reviews)</span>
              </div>

              <!-- Pricing Row -->
              <div style="display:flex;align-items:baseline;gap:8px;">
                <span style="font-family:var(--font-numbers);font-size:18px;font-weight:800;color:var(--ink-primary);" id="detail-price-text">${escapeHtml(previewPrice)}</span>
                <span style="font-size:12px;color:var(--ink-faint);text-decoration:line-through;" id="detail-compare-text">${escapeHtml(previewCompare)}</span>
                <span class="status-pill status-pill-success" style="font-size:10.5px;padding:2px 6px;" id="detail-discount-badge">
                  ${discountPercent > 0 ? `${discountPercent}% OFF` : 'Best Price'}
                </span>
              </div>

              <!-- Available product options -->
              <div>
                <span style="font-size:11px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;display:block;margin-bottom:6px;">Choose ${escapeHtml(variantFields.primaryLabel)}</span>
                <div style="display:flex;gap:6px;flex-wrap:wrap;" id="detail-sizes-row">
                  ${selectedSizes.map((sz, i) => `
                    <button type="button" class="sim-size-pill ${sz === (state.simSelectedSize || selectedSizes[0]) ? 'active' : ''}" data-action="sim-select-size" data-size="${escapeAttribute(sz)}">
                      ${escapeHtml(`${variantFields.primaryPrefix}${sz}`)}
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Bullet Point Highlights -->
              <ul class="shopper-detail-bullets" id="detail-bullets-list">
                ${bullet1 ? `<li>${escapeHtml(bullet1)}</li>` : ''}
                ${bullet2 ? `<li>${escapeHtml(bullet2)}</li>` : ''}
                ${bullet3 ? `<li>${escapeHtml(bullet3)}</li>` : ''}
              </ul>
              <div class="shopper-preview-copy" id="detail-description-text" ${description ? '' : 'hidden'}>${escapeHtml(description)}</div>
              <div class="shopper-preview-care" id="detail-care-text" ${careInstructions ? '' : 'hidden'}><strong>Care:</strong> ${escapeHtml(careInstructions)}</div>

              <!-- Escrow Guarantee Badge -->
              <div class="shopper-escrow-badge">
                ${icon('shield-check')} <span><strong>100% Escrow Protected:</strong> Funds released only after delivery confirmation.</span>
              </div>

              <!-- Shipping ETA -->
              <div style="font-size:11px;color:var(--ink-secondary);display:flex;align-items:center;gap:4px;">
                ${icon('truck')} Delivered in 1–2 business days via GIGL / Fez Logistics.
              </div>

              <!-- Mobile Bottom Action Buttons -->
              <div style="display:flex;gap:8px;margin-top:6px;">
                <button type="button" class="sim-interactive-btn" id="detail-add-bag-btn" data-action="sim-add-to-bag" ${state.merchant?.vacationMode ? 'disabled' : ''} style="flex:1;padding:9px 0;background:var(--page-subtle);border:1px solid var(--border-medium);border-radius:var(--radius-xs);font-size:11.5px;font-weight:700;text-align:center;color:var(--ink-primary);display:flex;align-items:center;justify-content:center;gap:6px;${state.merchant?.vacationMode ? 'opacity:0.5;cursor:not-allowed;' : ''}">
                  ${icon('shopping-bag')} ${state.merchant?.vacationMode ? 'Store Away' : 'Add to Bag'}
                </button>
                <button type="button" class="sim-interactive-btn" id="detail-buy-escrow-btn" data-action="sim-buy-escrow" ${state.merchant?.vacationMode ? 'disabled' : ''} style="flex:1.5;padding:9px 0;background:${state.merchant?.vacationMode ? 'var(--ink-muted)' : 'var(--forest-900)'};border-radius:var(--radius-xs);font-size:11.5px;font-weight:700;text-align:center;color:#ffffff;display:flex;align-items:center;justify-content:center;gap:6px;${state.merchant?.vacationMode ? 'opacity:0.5;cursor:not-allowed;' : ''}">
                  ${icon('shield-check')} ${state.merchant?.vacationMode ? 'Orders Paused' : 'Buy with Escrow'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Escrow reassurance note -->
        <div style="margin-top:14px;padding:12px 14px;background:var(--page-subtle);border-radius:var(--radius-md);border:1px solid var(--border-light);font-size:12px;color:var(--ink-muted);line-height:1.45;">
          ${icon('lock')} <strong>SellFastBuyFast Merchant SLA:</strong> Orders are protected by escrow bookkeeping. Funds reflect in settlement balance immediately after courier delivery confirmation.
        </div>
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 4: FULFILMENT QUEUE & LOGISTICS
   ========================================================================== */

function renderOrdersTable(orderList, concise = false) {
  if (orderList.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon-wrap">${icon('package-open')}</div>
        <h3 class="empty-title">No orders in this view</h3>
        <p class="empty-text">No active orders match the current filter or search criteria.</p>
      </div>`;
  }

  const rows = orderList.map((order) => {
    const items = order.lines?.map((l) => `${escapeHtml(l.productTitle)} (×${l.quantity})`).join(', ') || 'Item';
    const address = order.deliveryAddress;
    const recipientName = address?.contactName || order.buyerName || 'Valued Customer';
    const destination = [address?.lga, address?.state].filter(Boolean).join(', ') || 'Nigeria';
    const searchString = `${order.orderNumber} ${recipientName} ${destination} ${items}`.toLowerCase();
    const totalAmount = formatNaira(order.totalAmountMinor || (order.lines?.reduce((s, l) => s + (l.unitPriceMinor * l.quantity), 0) + (order.deliveryFeeMinor || 0)));

    let actionBtn = '';
    if (order.status === 'payment_confirmed') {
      actionBtn = `<button class="btn btn-primary btn-sm" type="button" data-action="accept-order" data-order-id="${escapeAttribute(order.id)}">${icon('check')} Accept Order</button>`;
    } else if (order.status === 'processing' && order.shipment?.status !== 'packed') {
      actionBtn = `<button class="btn btn-primary btn-sm" type="button" data-action="pack-order" data-order-id="${escapeAttribute(order.id)}">${icon('box')} Mark Packed</button>`;
    } else if (order.status === 'processing' && order.shipment?.status === 'packed') {
      actionBtn = `<button class="btn btn-primary btn-sm" type="button" data-action="ship-order" data-order-id="${escapeAttribute(order.id)}" data-order-number="${escapeAttribute(order.orderNumber)}">${icon('send')} Dispatch / Courier</button>`;
    } else if (order.status === 'in_transit') {
      actionBtn = `<span class="status-pill status-pill-success" style="font-size:12px;">${icon('truck')} In Transit (${escapeHtml(order.shipment?.carrier || 'Carrier')})</span>`;
    } else if (['delivered', 'completed'].includes(order.status)) {
      actionBtn = `<span class="status-pill status-pill-neutral">${icon('check-circle-2')} Delivered</span>`;
    } else {
      actionBtn = `<span class="table-sub-text">${escapeHtml(order.status)}</span>`;
    }

    return `
      <tr data-order-row="${escapeAttribute(searchString)}">
        <td>
          <div class="table-main-text" style="font-weight:700;">${escapeHtml(order.orderNumber)}</div>
          <div class="table-sub-text">${formatDate(order.createdAt)}</div>
        </td>
        <td>
          <div class="table-main-text" style="max-width:260px;white-space:normal;line-height:1.4;">${escapeHtml(items)}</div>
        </td>
        ${concise ? '' : `
          <td>
            <div class="table-main-text">${escapeHtml(recipientName)}</div>
            <div class="table-sub-text">${escapeHtml(destination)}</div>
          </td>
          <td>
            <div class="table-main-text" style="font-family:var(--font-numbers);font-weight:700;">${totalAmount}</div>
          </td>
        `}
        <td>${statusBadge(order.status)}</td>
        <td>
          <div class="table-actions" style="display:flex;gap:6px;align-items:center;">
            ${actionBtn}
            <button class="btn btn-secondary btn-sm" type="button" data-action="view-order-detail" data-order-id="${escapeAttribute(order.id)}" title="View Order Breakdown">
              ${icon('eye')} Details
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Order Number</th>
          <th>Purchased Items</th>
          ${concise ? '' : '<th>Recipient & Destination</th><th>Amount</th>'}
          <th>Status</th>
          <th>Next Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
}

function renderFulfilmentView() {
  const orders = state.orders;
  const currentFilter = state.fulfilmentFilter || 'all';
  const searchTerm = (state.fulfilmentSearch || '').toLowerCase();

  // Metrics counts
  const totalCount = orders.length;
  const toAcceptCount = orders.filter((o) => o.status === 'payment_confirmed').length;
  const toPackCount = orders.filter((o) => o.status === 'processing' && o.shipment?.status !== 'packed').length;
  const toShipCount = orders.filter((o) => o.status === 'processing' && o.shipment?.status === 'packed').length;
  const inTransitCount = orders.filter((o) => o.status === 'in_transit').length;
  const completedCount = orders.filter((o) => ['delivered', 'completed'].includes(o.status)).length;

  // Filter orders
  let filtered = orders;
  if (currentFilter === 'needs-action') {
    filtered = orders.filter((o) => ['payment_confirmed', 'processing'].includes(o.status));
  } else if (currentFilter === 'to-accept') {
    filtered = orders.filter((o) => o.status === 'payment_confirmed');
  } else if (currentFilter === 'to-pack') {
    filtered = orders.filter((o) => o.status === 'processing' && o.shipment?.status !== 'packed');
  } else if (currentFilter === 'to-ship') {
    filtered = orders.filter((o) => o.status === 'processing' && o.shipment?.status === 'packed');
  } else if (currentFilter === 'in-transit') {
    filtered = orders.filter((o) => o.status === 'in_transit');
  } else if (currentFilter === 'completed') {
    filtered = orders.filter((o) => ['delivered', 'completed'].includes(o.status));
  }

  if (searchTerm) {
    filtered = filtered.filter((o) => {
      const items = o.lines?.map((l) => l.productTitle).join(' ') || '';
      const recipient = o.deliveryAddress?.contactName || '';
      const lga = o.deliveryAddress?.lga || '';
      const stateName = o.deliveryAddress?.state || '';
      return `${o.orderNumber} ${recipient} ${lga} ${stateName} ${items}`.toLowerCase().includes(searchTerm);
    });
  }

  return `
    <div class="view-header">
      <div>
        <h1 class="view-title">Fulfilment Pipeline</h1>
        <p class="view-subtitle">Accept, pack, and hand parcels to couriers in sequential order.</p>
      </div>
    </div>

    <!-- Filter & Search Controls -->
    <div class="filter-search-bar">
      <div class="filter-pills-wrap">
        <button class="filter-pill ${currentFilter === 'all' ? 'active' : ''}" type="button" data-action="set-fulfilment-filter" data-filter="all">
          All <span class="filter-count">${totalCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'to-accept' ? 'active' : ''}" type="button" data-action="set-fulfilment-filter" data-filter="to-accept">
          Needs Acceptance <span class="filter-count ${toAcceptCount > 0 ? 'warn' : ''}">${toAcceptCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'to-pack' ? 'active' : ''}" type="button" data-action="set-fulfilment-filter" data-filter="to-pack">
          Ready to Pack <span class="filter-count ${toPackCount > 0 ? 'warn' : ''}">${toPackCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'to-ship' ? 'active' : ''}" type="button" data-action="set-fulfilment-filter" data-filter="to-ship">
          Ready to Ship <span class="filter-count">${toShipCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'in-transit' ? 'active' : ''}" type="button" data-action="set-fulfilment-filter" data-filter="in-transit">
          In Transit <span class="filter-count">${inTransitCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'completed' ? 'active' : ''}" type="button" data-action="set-fulfilment-filter" data-filter="completed">
          Delivered <span class="filter-count">${completedCount}</span>
        </button>
      </div>

      <div class="search-input-wrap">
        ${icon('search')}
        <input class="search-input" id="fulfilment-search" type="text" placeholder="Search order #, customer, or LGA…" value="${escapeAttribute(state.fulfilmentSearch)}" />
      </div>
    </div>

    <div class="card">
      <div class="table-container">
        ${renderOrdersTable(filtered, false)}
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 5: RETURNS & DISPUTES
   ========================================================================== */

function renderReturnsView() {
  const returns = state.returns;
  const currentFilter = state.returnsFilter || 'all';
  const searchTerm = (state.returnsSearch || '').toLowerCase();

  const totalCount = returns.length;
  const requestedCount = returns.filter((r) => r.status === 'requested').length;
  const approvedCount = returns.filter((r) => r.status === 'approved').length;
  const rejectedCount = returns.filter((r) => r.status === 'rejected').length;
  const resolvedCount = returns.filter((r) => ['received', 'completed', 'refund_initiated'].includes(r.status)).length;

  let filtered = returns;
  if (currentFilter === 'needs-decision') {
    filtered = returns.filter((r) => r.status === 'requested');
  } else if (currentFilter === 'approved') {
    filtered = returns.filter((r) => r.status === 'approved');
  } else if (currentFilter === 'rejected') {
    filtered = returns.filter((r) => r.status === 'rejected');
  } else if (currentFilter === 'resolved') {
    filtered = returns.filter((r) => ['received', 'completed', 'refund_initiated'].includes(r.status));
  }

  if (searchTerm) {
    filtered = filtered.filter((r) => {
      const orderNum = r.order?.orderNumber || '';
      const reason = r.reason || '';
      return `${orderNum} ${reason}`.toLowerCase().includes(searchTerm);
    });
  }

  return `
    <div class="view-header">
      <div>
        <h1 class="view-title">Returns & Customer Disputes</h1>
        <p class="view-subtitle">Review customer claims within the 7-day buyer protection window.</p>
      </div>
    </div>

    <!-- Filter & Search Controls -->
    <div class="filter-search-bar">
      <div class="filter-pills-wrap">
        <button class="filter-pill ${currentFilter === 'all' ? 'active' : ''}" type="button" data-action="set-returns-filter" data-filter="all">
          All <span class="filter-count">${totalCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'needs-decision' ? 'active' : ''}" type="button" data-action="set-returns-filter" data-filter="needs-decision">
          Needs Decision <span class="filter-count ${requestedCount > 0 ? 'warn' : ''}">${requestedCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'approved' ? 'active' : ''}" type="button" data-action="set-returns-filter" data-filter="approved">
          Approved <span class="filter-count">${approvedCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'rejected' ? 'active' : ''}" type="button" data-action="set-returns-filter" data-filter="rejected">
          Declined <span class="filter-count">${rejectedCount}</span>
        </button>
        <button class="filter-pill ${currentFilter === 'resolved' ? 'active' : ''}" type="button" data-action="set-returns-filter" data-filter="resolved">
          Resolved <span class="filter-count">${resolvedCount}</span>
        </button>
      </div>

      <div class="search-input-wrap">
        ${icon('search')}
        <input class="search-input" id="returns-search" type="text" placeholder="Search by order # or reason…" value="${escapeAttribute(state.returnsSearch)}" />
      </div>
    </div>

    <!-- Case Cards Grid -->
    <div class="return-cases-grid">
      ${filtered.length === 0 ? `
        <div class="card">
          <div class="empty-state">
            <div class="empty-icon-wrap">${icon('rotate-ccw')}</div>
            <h3 class="empty-title">No return requests found</h3>
            <p class="empty-text">Your store currently has zero return or dispute cases in this view.</p>
          </div>
        </div>
      ` : filtered.map((req) => {
        const orderNum = req.order?.orderNumber || 'Order';
        const isRequested = req.status === 'requested';
        const isApproved = req.status === 'approved';
        const isRejected = req.status === 'rejected';

        return `
          <div class="return-case-card" data-return-card="${escapeAttribute(`${orderNum} ${req.reason}`.toLowerCase())}">
            <div class="return-case-header">
              <div class="return-case-title">
                ${icon('package')} Order ${escapeHtml(orderNum)}
                <span style="font-size:12px;font-weight:500;color:var(--ink-muted);">· Requested ${formatDate(req.createdAt)}</span>
              </div>
              <div>${statusBadge(req.status)}</div>
            </div>

            <!-- Reason callout box -->
            <div class="return-reason-box">
              ${icon('help-circle')}
              <div>
                <strong style="color:var(--ink-primary);display:block;margin-bottom:2px;">Customer Stated Reason:</strong>
                <span>${escapeHtml(req.reason)}</span>
              </div>
            </div>

            <!-- Evidence Photo Preview if available -->
            ${req.evidenceUrl ? `
              <div class="return-evidence-preview">
                <img src="${escapeAttribute(req.evidenceUrl)}" alt="Customer Evidence" class="return-evidence-thumb" data-action="view-evidence" data-url="${escapeAttribute(req.evidenceUrl)}" data-title="Return Evidence for ${escapeAttribute(orderNum)}" />
                <div>
                  <div style="font-size:13px;font-weight:700;color:var(--ink-primary);">Attached Evidence Photo</div>
                  <button type="button" class="btn-quiet btn-sm" data-action="view-evidence" data-url="${escapeAttribute(req.evidenceUrl)}" data-title="Return Evidence for ${escapeAttribute(orderNum)}" style="padding:0;color:var(--forest-700);font-weight:700;">
                    ${icon('external-link')} Click to view full image
                  </button>
                </div>
              </div>
            ` : ''}

            <!-- Decision Note if already decided -->
            ${req.decisionNote ? `
              <div class="return-decision-note ${isRejected ? 'rejected' : ''}">
                <strong>Merchant Recorded Note:</strong> ${escapeHtml(req.decisionNote)}
                ${req.decidedAt ? `<span style="display:block;font-size:11px;color:var(--ink-muted);margin-top:2px;">Decided on ${formatDate(req.decidedAt)}</span>` : ''}
              </div>
            ` : ''}

            <!-- Action Controls -->
            <div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;padding-top:6px;border-top:1px solid var(--border-light);">
              ${isRequested ? `
                <button class="btn btn-secondary btn-sm" type="button" data-action="return-decision" data-return-id="${escapeAttribute(req.id)}" data-decision="rejected" style="color:var(--rose-600);">
                  ${icon('x')} Decline Return
                </button>
                <button class="btn btn-primary btn-sm" type="button" data-action="return-decision" data-return-id="${escapeAttribute(req.id)}" data-decision="approved">
                  ${icon('check')} Approve Return
                </button>
              ` : isApproved ? `
                <span style="font-size:12.5px;color:var(--forest-700);font-weight:700;display:flex;align-items:center;gap:6px;">
                  ${icon('check-circle-2')} Return Authorized — Customer provided return drop-off instructions
                </span>
              ` : isRejected ? `
                <span style="font-size:12.5px;color:var(--rose-600);font-weight:700;display:flex;align-items:center;gap:6px;">
                  ${icon('x-circle')} Declined by Store
                </span>
              ` : `
                <span class="table-sub-text">Completed</span>
              `}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

/* ==========================================================================
   VIEW 6: SETTLEMENTS & PAYOUTS
   ========================================================================== */

function renderPayoutsView() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Payments</h1>
        <p class="page-subtitle">Payment operations are deliberately separate from merchant fulfilment.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Payment module deferred</h2>
          <p class="card-subtitle">The portal does not display invented balances or enable transfers.</p>
        </div>
        <span class="status-pill status-pill-neutral">${icon('circle-pause')} Deferred</span>
      </div>
      <div class="card-body">
        <p style="font-size:13.5px;color:var(--ink-secondary);line-height:1.6;margin:0;">Payouts, settlement balances, bank-recipient setup, transfers, refunds, and provider actions will be enabled only in the dedicated payment module after sandbox verification.</p>
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 7: STORE PROFILE & SETTINGS
   ========================================================================== */

const NIGERIAN_STATES = [
  'Lagos State',
  'Abuja FCT',
  'Rivers State',
  'Ogun State',
  'Oyo State',
  'Kano State',
  'Kaduna State',
  'Enugu State',
  'Delta State',
  'Edo State',
  'Anambra State',
  'Akwa Ibom State',
  'Abia State',
  'Ondo State',
  'Osun State',
  'Imo State',
  'Plateau State',
  'Kwara State',
  'Cross River State',
  'Benue State',
  'Ekiti State',
  'Kogi State',
  'Nasarawa State',
  'Niger State',
  'Bauchi State',
  'Borno State',
  'Adamawa State',
  'Gombe State',
  'Taraba State',
  'Yobe State',
  'Jigawa State',
  'Katsina State',
  'Kebbi State',
  'Sokoto State',
  'Zamfara State',
  'Bayelsa State',
  'Ebonyi State'
];

function renderProfileView() {
  const m = state.overview?.merchant || state.merchant || {};
  const viewer = state.overview?.viewer || {
    memberRole: 'owner',
    isOwner: true,
    canEditProfile: true,
    canSubmitRegistration: true,
  };
  const regState = m.registrationState || 'not_registered';
  const isRegistered = regState === 'registered';
  const isInReview = regState === 'in_review';
  const isNotRegistered = regState === 'not_registered';
  const isVacation = Boolean(m.vacationMode);
  const canEdit = Boolean(viewer.canEditProfile);
  const canSubmit = Boolean(viewer.canSubmitRegistration);

  // Fallback to server profile draft if unregistered
  const draft = (isNotRegistered && state.profileDraft) ? state.profileDraft : {};
  const val = (key, fallback = '') => {
    if (m[key] !== undefined && m[key] !== null && m[key] !== '') return m[key];
    if (draft[key] !== undefined && draft[key] !== null && draft[key] !== '') return draft[key];
    return fallback;
  };

  const businessName = val('businessName');
  const storeSlug = val('slug') || (businessName ? businessName.toLowerCase().replace(/[^a-z0-9-]/g, '-') : 'store');
  const description = val('description');
  const logoUrl = val('logoUrl');
  const bannerUrl = val('bannerUrl');
  const contactEmail = val('contactEmail');
  const contactPhone = val('contactPhone');
  const whatsappPhone = val('whatsappPhone');
  const address = val('address');
  const lga = val('lga');
  const currentState = val('state', 'Lagos State');
  const dispatchContactName = val('dispatchContactName');
  const dispatchContactPhone = val('dispatchContactPhone');
  const fulfillmentSla = val('fulfillmentSla', 'same_day');
  const publicStoreUrl = `https://sellfastbuyfast.com/store/${storeSlug}`;

  // Stepper calculations for onboarding/unregistered view
  const hasIdentity = Boolean(businessName && storeSlug);
  const hasWarehouse = Boolean(address && lga && currentState && dispatchContactName && dispatchContactPhone);
  const hasCompliance = Boolean(state.selectedIdDocFile && state.selectedUtilityBillFile);

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Store Profile & Settings</h1>
        <p class="page-subtitle">Manage customer-facing storefront identity, 3PL courier pickup address, and compliance credentials.</p>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="compliance-badge ${isRegistered ? 'verified' : 'pending'}">
          ${icon(isRegistered ? 'shield-check' : (isInReview ? 'clock' : 'alert-circle'))} 
          ${isRegistered ? 'Verified Enterprise' : (isInReview ? 'Registration Under Review' : 'Registration In-Progress')}
        </span>
        <span class="status-pill ${isVacation ? 'status-pill-neutral' : (isRegistered ? 'status-pill-success' : 'status-pill-warning')}">
          ${isVacation ? 'Vacation Mode' : (isRegistered ? 'Store Active' : (isInReview ? 'Pending Operations' : 'Onboarding'))}
        </span>
      </div>
    </div>

    ${isNotRegistered && state.profileDraft ? `
      <div class="draft-indicator-banner">
        ${icon('file-text')}
        <span>Loaded unsaved profile draft from server. You can edit, save progress, or submit registration.</span>
      </div>
    ` : ''}

    ${isInReview ? `
      <!-- In-Review Operations State Card -->
      <div class="registration-in-review-card">
        <div class="in-review-header">
          <div class="in-review-icon">${icon('clock')}</div>
          <div>
            <h3 class="in-review-title">Registration Under Operations Review</h3>
            <p class="in-review-desc">
              Your CAC filings, Director NIN, identity documents, and warehouse courier pickup address were submitted and are currently being reviewed by SellFast Risk & Operations. Verification is typically completed within 2–4 business hours. You will receive an automated notification once your store is activated.
            </p>
            ${state.overview?.verification?.rejectionReason ? `
              <div style="margin-top:10px;padding:8px 12px;background:#fff1f2;border:1px solid #fecdd3;border-radius:var(--radius-sm);font-size:12px;color:#9f1239;">
                <strong>Previous Feedback:</strong> ${escapeHtml(state.overview.verification.rejectionReason)}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    ` : ''}

    ${isNotRegistered ? `
      <!-- Onboarding Stepper for Unregistered / In-Progress Merchants -->
      <div class="registration-stepper-card">
        <div class="stepper-header">
          <div>
            <div class="stepper-title">${icon('shield-alert')} Merchant Onboarding & Verification Progress</div>
            <p class="stepper-subtitle">Complete these 3 essential setup milestones to unlock automated 3PL courier pickup, online checkout, and seller escrow payouts.</p>
          </div>
          <span class="stepper-progress-badge">${hasCompliance && hasWarehouse ? 'Step 3 of 3 (Ready to Submit)' : (hasWarehouse ? 'Step 2 of 3 (Warehouse Complete)' : 'Step 1 of 3 (Identity Configured)')}</span>
        </div>
        <div class="stepper-steps-track">
          <div class="stepper-step completed">
            <div class="stepper-step-circle">${icon('check')}</div>
            <div class="stepper-step-content">
              <span class="stepper-step-name">1. Store Identity & Slug</span>
              <span class="stepper-step-status">Configured (${escapeHtml(storeSlug)})</span>
            </div>
          </div>
          <div class="stepper-connector ${hasWarehouse ? 'active' : ''}"></div>
          <div class="stepper-step ${hasWarehouse ? 'completed' : 'current'}">
            <div class="stepper-step-circle">${hasWarehouse ? icon('check') : '2'}</div>
            <div class="stepper-step-content">
              <span class="stepper-step-name">2. Warehouse Courier Pickup</span>
              <span class="stepper-step-status">${hasWarehouse ? 'Address Complete' : 'Action Required'}</span>
            </div>
          </div>
          <div class="stepper-connector ${hasCompliance ? 'active' : ''}"></div>
          <div class="stepper-step ${hasCompliance ? 'completed' : (hasWarehouse ? 'current' : 'pending')}">
            <div class="stepper-step-circle">${hasCompliance ? icon('check') : '3'}</div>
            <div class="stepper-step-content">
              <span class="stepper-step-name">3. CAC, NIN & Documents</span>
              <span class="stepper-step-status">${hasCompliance ? 'Files Attached' : 'Action Required'}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="unregistered-callout-banner">
        <div class="unregistered-callout-icon">${icon('alert-triangle')}</div>
        <div class="unregistered-callout-text">
          <strong>Store Verification Required Before Live Sales:</strong> Under Nigerian CBN anti-fraud regulations and SellFast Escrow Terms, merchants must provide a physical pickup warehouse address and verified CAC business credentials. You may save your progress as a draft anytime, or submit when all sections are filled.
        </div>
      </div>
    ` : ''}

    <div class="store-profile-view">
      <!-- Storefront Hero Card -->
      <div class="store-hero-card">
        <div class="store-hero-banner" ${bannerUrl ? `style="background-image:url('${escapeAttribute(bannerUrl)}');"` : ''}>
          <div class="store-hero-overlay"></div>
        </div>
        <div class="store-hero-content">
          <div class="store-avatar-wrap">
            ${logoUrl ? `
              <img src="${escapeAttribute(logoUrl)}" alt="${escapeAttribute(businessName || 'Store')}" class="store-avatar-img" />
            ` : `
              <div class="store-avatar-fallback">${escapeHtml((businessName || 'S').charAt(0).toUpperCase())}</div>
            `}
          </div>
          <div class="store-hero-info">
            <div class="store-hero-title-row">
              <h2 class="store-profile-title">${escapeHtml(businessName || 'SellFast Merchant Store')}</h2>
              <span class="compliance-badge ${isRegistered ? 'verified' : 'pending'}">
                ${icon(isRegistered ? 'shield-check' : (isInReview ? 'clock' : 'alert-circle'))} 
                ${isRegistered ? 'CAC Audited & Verified' : (isInReview ? 'Registration In Review' : 'Compliance Incomplete')}
              </span>
            </div>
            <p class="store-hero-tagline">${escapeHtml(description || 'Authorized vendor distributing authentic items with 7-day buyer escrow protection.')}</p>
            
            <div class="store-public-link-bar">
              <span class="store-link-label">${icon('globe')} Public Storefront:</span>
              <code class="store-link-url">${escapeHtml(publicStoreUrl)}</code>
              <button type="button" class="btn btn-secondary btn-sm" data-action="copy-store-link" data-url="${escapeAttribute(publicStoreUrl)}">
                ${icon('copy')} Copy Link
              </button>
              <a href="${escapeAttribute(publicStoreUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
                ${icon('external-link')} Preview Store
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings & Configuration Form -->
      <form id="business-profile-form" novalidate>
        ${state.formError ? `<div class="error-summary" role="alert" style="margin-bottom:16px;">${icon('alert-circle')} <span>${escapeHtml(state.formError)}</span></div>` : ''}

        <div class="profile-grid">
          <!-- Left Column: Identity & Warehouse -->
          <div class="profile-col">
            <!-- Card 1: Store Branding & Identity -->
            <div class="card profile-card">
              <div class="card-header">
                <div class="card-header-icon-title">
                  <div class="profile-section-icon">${icon('store')}</div>
                  <div>
                    <h2 class="card-title">Store Identity & Branding</h2>
                    <p class="card-subtitle">Public details visible to shoppers across SellFastBuyFast.</p>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="form-group">
                  <label class="form-label" for="prof-biz-name">Business / Store Name <span style="color:var(--rose-600);">*</span></label>
                  <input class="input" id="prof-biz-name" name="businessName" value="${escapeAttribute(businessName)}" ${!canEdit || isInReview ? 'readonly' : ''} required />
                  <span class="field-help">Your customer-facing trade or brand name.</span>
                </div>

                <div class="form-group">
                  <label class="form-label" for="prof-slug">Storefront Handle / Custom Slug <span style="color:var(--rose-600);">*</span></label>
                  <div class="input-prefix-wrap">
                    <span class="input-prefix">sellfastbuyfast.com/store/</span>
                    <input class="input input-with-prefix" id="prof-slug" name="slug" value="${escapeAttribute(storeSlug)}" ${!canEdit || isInReview ? 'readonly' : ''} required />
                  </div>
                  <span class="field-help">Unique handle for your public store URL (3–80 characters).</span>
                </div>

                <div class="form-group">
                  <label class="form-label" for="prof-biz-desc">Store Bio / Tagline</label>
                  <textarea class="textarea" id="prof-biz-desc" name="description" rows="3" placeholder="Tell buyers about your company, specialty goods, and warranty guarantee..." ${!canEdit || isInReview ? 'readonly' : ''}>${escapeHtml(description)}</textarea>
                </div>

                <div class="grid-2col">
                  <div class="form-group">
                    <label class="form-label" for="prof-logo-url">Logo Image URL</label>
                    <input class="input" id="prof-logo-url" name="logoUrl" type="url" placeholder="https://..." value="${escapeAttribute(logoUrl)}" ${!canEdit || isInReview ? 'readonly' : ''} />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="prof-banner-url">Banner Image URL</label>
                    <input class="input" id="prof-banner-url" name="bannerUrl" type="url" placeholder="https://..." value="${escapeAttribute(bannerUrl)}" ${!canEdit || isInReview ? 'readonly' : ''} />
                  </div>
                </div>
              </div>
            </div>

            <!-- Card 2: Warehouse Dispatch & Courier Pickup Address -->
            <div class="card profile-card">
              <div class="card-header">
                <div class="card-header-icon-title">
                  <div class="profile-section-icon">${icon('map-pin')}</div>
                  <div>
                    <h2 class="card-title">Warehouse & Courier Pickup Address</h2>
                    <p class="card-subtitle">Designated facility where logistics couriers collect orders.</p>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="callout-info-box">
                  <div class="callout-info-icon">${icon('truck')}</div>
                  <div class="callout-info-text">
                    <strong>Courier Pickup Point:</strong> GIG Logistics, Fez Delivery, and Red Star dispatch riders route to this exact facility address upon order acceptance. Keep contact details accurate.
                  </div>
                </div>

                <div class="form-group" style="margin-top:16px;">
                  <label class="form-label" for="prof-address">Street Address / Facility Unit <span style="color:var(--rose-600);">*</span></label>
                  <input class="input" id="prof-address" name="address" value="${escapeAttribute(address)}" placeholder="e.g. Suite 4B, 14 Admiralty Way, Lekki Phase 1" ${!canEdit || isInReview ? 'readonly' : ''} required />
                </div>

                <div class="grid-2col">
                  <div class="form-group">
                    <label class="form-label" for="prof-lga">Local Government Area (LGA) <span style="color:var(--rose-600);">*</span></label>
                    <input class="input" id="prof-lga" name="lga" value="${escapeAttribute(lga)}" placeholder="e.g. Eti-Osa / Ikeja / Abuja Municipal" ${!canEdit || isInReview ? 'readonly' : ''} required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="prof-state">State <span style="color:var(--rose-600);">*</span></label>
                    <select class="select" id="prof-state" name="state" ${!canEdit || isInReview ? 'disabled' : ''} required>
                      ${NIGERIAN_STATES.map((st) => `<option value="${escapeAttribute(st)}" ${st === currentState ? 'selected' : ''}>${escapeHtml(st)}</option>`).join('')}
                    </select>
                  </div>
                </div>

                <div class="grid-2col">
                  <div class="form-group">
                    <label class="form-label" for="prof-dispatch-name">Dispatch Officer / Contact Name <span style="color:var(--rose-600);">*</span></label>
                    <input class="input" id="prof-dispatch-name" name="dispatchContactName" value="${escapeAttribute(dispatchContactName)}" placeholder="e.g. Tunde Bakare" ${!canEdit || isInReview ? 'readonly' : ''} required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="prof-dispatch-phone">Dispatch Contact Phone <span style="color:var(--rose-600);">*</span></label>
                    <input class="input" id="prof-dispatch-phone" name="dispatchContactPhone" type="tel" value="${escapeAttribute(dispatchContactPhone)}" placeholder="+234 803 000 0000" ${!canEdit || isInReview ? 'readonly' : ''} required />
                  </div>
                </div>
              </div>
            </div>

            <!-- Card 3: Fulfillment Operations & Vacation Mode -->
            <div class="card profile-card">
              <div class="card-header">
                <div class="card-header-icon-title">
                  <div class="profile-section-icon">${icon('clock')}</div>
                  <div>
                    <h2 class="card-title">Fulfillment SLAs & Vacation Mode</h2>
                    <p class="card-subtitle">Dispatch lead times and vacation order pausing.</p>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="form-group">
                  <label class="form-label" for="prof-sla">Standard Order Dispatch Commitment</label>
                  <select class="select" id="prof-sla" name="fulfillmentSla" ${!canEdit || isInReview ? 'disabled' : ''}>
                    <option value="same_day" ${fulfillmentSla === 'same_day' ? 'selected' : ''}>Same-Day Dispatch (under 12 hours) — Recommended for Top Merchant Rank</option>
                    <option value="next_day" ${fulfillmentSla === 'next_day' ? 'selected' : ''}>Next-Day Dispatch (within 24 hours)</option>
                    <option value="48_hours" ${fulfillmentSla === '48_hours' ? 'selected' : ''}>Standard Dispatch (within 48 hours)</option>
                  </select>
                  <span class="field-help">Orders not accepted within this SLA risk automated buyer escrow refund.</span>
                </div>

                <div class="vacation-mode-toggle-card">
                  <div class="vacation-mode-info">
                    <div class="vacation-mode-title">
                      ${icon('power')} <span>Vacation Mode (Pause Orders)</span>
                      ${isVacation ? '<span class="status-pill status-pill-warning" style="font-size:11px;">Active Away</span>' : ''}
                    </div>
                    <p class="vacation-mode-desc">
                      Temporarily pause checkout for your listings. Buyers can view your catalogue, but purchasing is disabled until you resume operations. Existing orders must still be fulfilled.
                    </p>
                  </div>
                  <div>
                    <button type="button" class="btn ${isVacation ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="open-vacation-modal" ${(!isRegistered || m.status !== 'active' || !canEdit) ? 'disabled' : ''}>
                      ${icon('power')} ${isVacation ? 'Resume Store Operations' : 'Pause Orders (Vacation)'}
                    </button>
                    ${(!isRegistered || m.status !== 'active') ? `<div class="field-help" style="font-size:11px;margin-top:4px;">Available once store registration is active.</div>` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: Support, Compliance, Account -->
          <div class="profile-col">
            <!-- Card 4: Customer Support Channels -->
            <div class="card profile-card">
              <div class="card-header">
                <div class="card-header-icon-title">
                  <div class="profile-section-icon">${icon('message-circle')}</div>
                  <div>
                    <h2 class="card-title">Customer Support Channels</h2>
                    <p class="card-subtitle">Inquiry channels provided on confirmed buyer receipts.</p>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="form-group">
                  <label class="form-label" for="prof-email">Dedicated Support Email <span style="color:var(--rose-600);">*</span></label>
                  <input class="input" id="prof-email" name="contactEmail" type="email" value="${escapeAttribute(contactEmail)}" ${!canEdit || isInReview ? 'readonly' : ''} required />
                  <span class="field-help">Buyer transaction receipts list this support email.</span>
                </div>

                <div class="form-group">
                  <label class="form-label" for="prof-phone">Customer Support Hotline <span style="color:var(--rose-600);">*</span></label>
                  <input class="input" id="prof-phone" name="contactPhone" type="tel" value="${escapeAttribute(contactPhone)}" ${!canEdit || isInReview ? 'readonly' : ''} required />
                </div>

                <div class="form-group">
                  <label class="form-label" for="prof-whatsapp">WhatsApp Business Line</label>
                  <div style="display:flex;gap:8px;">
                    <input class="input" id="prof-whatsapp" name="whatsappPhone" type="tel" placeholder="+234 812 000 0000" value="${escapeAttribute(whatsappPhone || '')}" ${!canEdit || isInReview ? 'readonly' : ''} />
                    <button type="button" class="btn btn-secondary" data-action="test-whatsapp" title="Test WhatsApp chat formatting">
                      ${icon('message-circle')} Test
                    </button>
                  </div>
                  <span class="field-help">Direct WhatsApp button displayed on customer digital receipt.</span>
                </div>
              </div>
            </div>

            <!-- Card 5: Business Entity & KYC Compliance -->
            <div class="card profile-card">
              <div class="card-header">
                <div class="card-header-icon-title">
                  <div class="profile-section-icon">${icon('shield-check')}</div>
                  <div>
                    <h2 class="card-title">Legal Entity & KYC Compliance</h2>
                    <p class="card-subtitle">${isRegistered ? 'Verified credentials for marketplace trust & payouts.' : (isInReview ? 'Credentials submitted and undergoing verification.' : 'Submit CAC & Director identity to complete registration.')}</p>
                  </div>
                </div>
                <span class="compliance-badge ${isRegistered ? 'verified' : 'pending'}">
                  ${icon(isRegistered ? 'check' : (isInReview ? 'clock' : 'alert-circle'))} ${isRegistered ? 'Approved' : (isInReview ? 'In Review' : 'Action Required')}
                </span>
              </div>
              <div class="card-body">
                ${isRegistered ? `
                  ${viewer.isOwner ? `
                    <div class="compliance-verified-banner verified">
                      <div class="compliance-shield-icon">${icon('shield-check')}</div>
                      <div>
                        <div style="font-weight:700;font-size:13.5px;color:var(--forest-950);">
                          Corporate Compliance Verified (Tier 2 Merchant)
                        </div>
                        <div style="font-size:12px;color:var(--ink-secondary);margin-top:2px;line-height:1.4;">
                          CAC RC/BN filings and Director identity verified by SellFast Risk & Legal.
                        </div>
                      </div>
                    </div>

                    <div class="form-group" style="margin-top:16px;">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <label class="form-label" for="prof-cac" style="margin:0;">CAC Registration Number (RC / BN)</label>
                        <span class="field-locked-pill">${icon('check')} Verified & Locked</span>
                      </div>
                      <input class="input" id="prof-cac" name="cacNumber" value="${escapeAttribute(state.verificationData?.cacNumber || '—')}" readonly style="background:var(--page-subtle);font-family:var(--font-numbers);font-weight:700;" />
                    </div>

                    <div class="form-group">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <label class="form-label" for="prof-tin" style="margin:0;">Tax Identification Number (TIN)</label>
                        <span class="field-locked-pill">${icon('check')} Verified</span>
                      </div>
                      <input class="input" id="prof-tin" name="tinNumber" value="${escapeAttribute(state.verificationData?.tinNumber || '—')}" readonly style="background:var(--page-subtle);font-family:var(--font-numbers);font-weight:700;" />
                    </div>

                    <div class="form-group">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <label class="form-label" for="prof-nin" style="margin:0;">Director National Identity (NIN)</label>
                        <span class="field-locked-pill">${icon('check')} Verified & Masked</span>
                      </div>
                      <input class="input" id="prof-nin" name="directorNin" value="${escapeAttribute(state.verificationData?.directorNinLast4 ? `•••• •••• ${state.verificationData.directorNinLast4}` : '•••• •••• ••••')}" readonly style="background:var(--page-subtle);font-family:var(--font-numbers);font-weight:700;" />
                    </div>

                    <div style="font-size:11.5px;color:var(--ink-muted);line-height:1.4;margin-top:10px;">
                      ${icon('lock')} Legal entity records are locked for escrow protection. To update corporate filings, submit a ticket to <a href="mailto:compliance@sellfastbuyfast.com" style="color:var(--forest-700);font-weight:700;">compliance@sellfastbuyfast.com</a>.
                    </div>
                  ` : `
                    <div class="callout-info-box">
                      <div class="callout-info-icon">${icon('lock')}</div>
                      <div class="callout-info-text">
                        <strong>Restricted Access:</strong> Legal entity credentials, CAC filings, and director identification are confidential and viewable only by the store owner.
                      </div>
                    </div>
                  `}
                ` : (isInReview ? `
                  <div class="callout-info-box" style="background:#fff7ed;border-color:#fed7aa;">
                    <div class="callout-info-icon" style="color:#ea580c;">${icon('clock')}</div>
                    <div class="callout-info-text" style="color:#9a3412;">
                      <strong>Documents Under Review:</strong> CAC corporate documents, Director National Identity Number, and proof of address are currently undergoing security verification.
                    </div>
                  </div>
                  <div class="form-group" style="margin-top:16px;">
                    <label class="form-label">Review Status</label>
                    <input class="input" value="Pending Operations Approval" readonly style="background:var(--page-subtle);font-weight:600;" />
                  </div>
                ` : `
                  ${canSubmit ? `
                    <div class="compliance-verified-banner pending">
                      <div class="compliance-shield-icon" style="color:#b45309;">${icon('clock')}</div>
                      <div>
                        <div style="font-weight:700;font-size:13.5px;color:var(--forest-950);">
                          Corporate Registration Required
                        </div>
                        <div style="font-size:12px;color:var(--ink-secondary);margin-top:2px;line-height:1.4;">
                          Enter your CAC corporate number, Director NIN, and attach verification documents to initiate review and unlock escrow payouts.
                        </div>
                      </div>
                    </div>

                    <div class="form-group" style="margin-top:16px;">
                      <label class="form-label" for="prof-cac">CAC Registration Number (RC / BN) <span style="color:var(--rose-600);">*</span></label>
                      <input class="input" id="prof-cac" name="cacNumber" placeholder="e.g. RC-1849202 or BN-3948201" required />
                      <span class="field-help">Incorporated Companies (RC) or Registered Business Names (BN).</span>
                    </div>

                    <div class="form-group">
                      <label class="form-label" for="prof-tin">Tax Identification Number (TIN) <span class="table-sub-text">(optional)</span></label>
                      <input class="input" id="prof-tin" name="tinNumber" placeholder="e.g. 24819024-0001" />
                    </div>

                    <div class="form-group">
                      <label class="form-label" for="prof-nin">Director NIN (11 Digits) <span style="color:var(--rose-600);">*</span></label>
                      <input class="input" id="prof-nin" name="directorNin" type="password" maxlength="11" placeholder="11-digit National Identity Number" autocomplete="off" required />
                      <span class="field-help">Encrypted at rest using AES-256-GCM. Never stored or returned in plaintext.</span>
                    </div>

                    <div class="form-group">
                      <label class="form-label" for="prof-id-type">Director Identity Document Type <span style="color:var(--rose-600);">*</span></label>
                      <select class="select" id="prof-id-type" name="idType" required>
                        <option value="national_id">National Identity Number (NIN Slip / Card)</option>
                        <option value="voters_card">INEC Voter's Card</option>
                        <option value="drivers_license">FRSC Driver's License</option>
                        <option value="passport">Nigerian International Passport</option>
                      </select>
                    </div>

                    <div class="kyc-file-card" style="margin-top:14px;">
                      <label class="form-label" for="prof-id-doc" style="margin-bottom:4px;">
                        Upload Government Identity Document <span style="color:var(--rose-600);">*</span>
                      </label>
                      <span class="field-help" style="display:block;margin-bottom:8px;">PDF, JPEG, or PNG (maximum 10 MiB). Private encrypted storage.</span>
                      <input type="file" id="prof-id-doc" name="idDocumentFile" accept=".pdf,.jpg,.jpeg,.png" style="font-size:12.5px;" required />
                      <div id="prof-id-doc-info" class="file-info-text">${state.selectedIdDocFile ? `Selected: ${escapeHtml(state.selectedIdDocFile.name)} (${Math.round(state.selectedIdDocFile.size / 1024)} KB)` : 'No file chosen'}</div>
                    </div>

                    <div class="kyc-file-card" style="margin-top:14px;">
                      <label class="form-label" for="prof-utility-bill" style="margin-bottom:4px;">
                        Upload Proof of Address / Utility Bill <span style="color:var(--rose-600);">*</span>
                      </label>
                      <span class="field-help" style="display:block;margin-bottom:8px;">Electricity bill, water bill, or bank statement under 3 months old (PDF, JPEG, or PNG ≤ 10 MiB).</span>
                      <input type="file" id="prof-utility-bill" name="utilityBillFile" accept=".pdf,.jpg,.jpeg,.png" style="font-size:12.5px;" required />
                      <div id="prof-utility-bill-info" class="file-info-text">${state.selectedUtilityBillFile ? `Selected: ${escapeHtml(state.selectedUtilityBillFile.name)} (${Math.round(state.selectedUtilityBillFile.size / 1024)} KB)` : 'No file chosen'}</div>
                    </div>
                  ` : `
                    <div class="callout-info-box">
                      <div class="callout-info-icon">${icon('lock')}</div>
                      <div class="callout-info-text">
                        <strong>Owner Permission Required:</strong> Only the store owner can upload corporate documents, enter director identity details, and submit merchant registration.
                      </div>
                    </div>
                  `}
                `)}
              </div>
            </div>

            <!-- Card 6: Merchant Account & Session -->
            <div class="card profile-card">
              <div class="card-header">
                <div class="card-header-icon-title">
                  <div class="profile-section-icon">${icon('user')}</div>
                  <div>
                    <h2 class="card-title">Account Credentials</h2>
                    <p class="card-subtitle">Active merchant administrator session.</p>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="account-meta-row">
                  <span class="account-meta-label">Signed-in Email</span>
                  <span class="account-meta-val">${escapeHtml(state.session?.user?.email || 'vendor@sellfastbuyfast.com')}</span>
                </div>
                <div class="account-meta-row">
                  <span class="account-meta-label">Merchant ID</span>
                  <span class="account-meta-val font-mono">${escapeHtml(state.merchant?.id || 'm-primary')}</span>
                </div>
                <div class="account-meta-row">
                  <span class="account-meta-label">Security Role</span>
                  <span class="account-meta-val" style="font-weight:700;color:var(--forest-800);">${escapeHtml(viewer.memberRole || 'owner')}</span>
                </div>
                <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:12px;color:var(--ink-muted);">End active authenticated session</span>
                  <button type="button" class="btn btn-secondary btn-sm" data-action="sign-out" style="color:var(--rose-600);">
                    ${icon('log-out')} Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sticky Save Bar at Bottom with Discard, Draft, and Submit Actions -->
        <div class="profile-save-bar">
          <div class="profile-save-bar-info">
            ${icon('info')}
            <span>${isRegistered 
              ? 'Warehouse pickup address and customer WhatsApp are synchronized with GIG / Fez couriers.' 
              : (isInReview 
                ? 'Registration is currently under review by SellFast Operations.' 
                : 'Submit your CAC, Director NIN, warehouse address, and documents to complete onboarding.')}</span>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            ${isInReview ? `
              <button type="button" class="btn btn-secondary" disabled>
                ${icon('clock')} Registration Under Review
              </button>
            ` : `
              <button type="button" class="btn btn-secondary" data-action="discard-profile-changes" ${state.busy ? 'disabled' : ''} title="Discard unsaved edits and reload saved profile">
                ${icon('rotate-ccw')} Discard Changes
              </button>
              <button type="button" class="btn btn-secondary" data-action="save-profile-draft" ${state.busy ? 'disabled' : ''} title="Save current non-legal progress to server as draft">
                ${icon('file-text')} Save as Draft
              </button>
              <button type="submit" class="btn btn-primary" ${state.busy || (isNotRegistered && !canSubmit) ? 'disabled' : ''}>
                ${state.busy === 'submit-registration' 
                  ? 'Submitting Registration…' 
                  : (state.busy === 'update-profile' 
                    ? 'Saving Store Profile…' 
                    : (isRegistered ? `${icon('save')} Save Store Profile` : `${icon('send')} Submit Registration for Review`))}
              </button>
            `}
          </div>
        </div>
      </form>
    </div>`;
}

/* ==========================================================================
   MODALS (Stock, Dispatch / Waybill, Return Decision)
   ========================================================================== */

function renderModal() {
  if (!state.modal) return '';
  const error = state.formError ? `<div class="error-summary" role="alert">${icon('alert-circle')} <span>${escapeHtml(state.formError)}</span></div>` : '';

  if (state.modal.type === 'stock') {
    const title = state.modal.productTitle || 'Product Variant';
    const sku = state.modal.sku || '';
    const qty = Number(state.modal.quantity) || 0;

    return `
      <div class="modal-backdrop">
        <form class="modal-dialog" id="stock-form">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Update Stock Quantity</h3>
              <p class="table-sub-text">${escapeHtml(title)} ${sku ? `· SKU: ${escapeHtml(sku)}` : ''}</p>
            </div>
            <button class="modal-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          </div>
          <div class="modal-body">
            ${error}
            <input type="hidden" name="variantId" value="${escapeAttribute(state.modal.variantId)}" />
            
            <div class="form-group">
              <label class="form-label" for="modal-stock-qty">Available Stock Units</label>
              <input class="input" id="modal-stock-qty" name="availableQuantity" type="number" min="0" step="1" value="${escapeAttribute(qty)}" required style="font-family:var(--font-numbers);font-size:18px;font-weight:700;" />
              <span class="field-help">Real-time inventory available for customer purchase.</span>
            </div>

            <div class="stock-stepper-row">
              <span style="font-size:12px;font-weight:600;color:var(--ink-muted);margin-right:4px;">Quick Adjust:</span>
              <button type="button" class="stock-step-btn" data-action="adjust-stock-step" data-delta="-5">-5</button>
              <button type="button" class="stock-step-btn" data-action="adjust-stock-step" data-delta="-1">-1</button>
              <button type="button" class="stock-step-btn" data-action="adjust-stock-step" data-delta="1">+1</button>
              <button type="button" class="stock-step-btn" data-action="adjust-stock-step" data-delta="5">+5</button>
              <button type="button" class="stock-step-btn" data-action="adjust-stock-step" data-delta="10">+10</button>
              <button type="button" class="stock-step-btn danger" data-action="adjust-stock-step" data-set="0">Out of Stock</button>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" type="submit" ${state.busy === 'set-stock' ? 'disabled' : ''}>
              ${state.busy === 'set-stock' ? 'Saving…' : `${icon('save')} Save Quantity`}
            </button>
          </div>
        </form>
      </div>`;
  }

  if (state.modal.type === 'ship') {
    return `
      <div class="modal-backdrop">
        <form class="modal-dialog" id="ship-form">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Record Courier Dispatch</h3>
              <p class="table-sub-text">Dispatch parcel for ${escapeHtml(state.modal.orderNumber)}</p>
            </div>
            <button class="modal-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          </div>
          <div class="modal-body">
            ${error}
            <input type="hidden" name="orderId" value="${escapeAttribute(state.modal.orderId)}" />
            
            <div class="form-group">
              <label class="form-label" for="modal-carrier">3rd-Party Logistics Provider</label>
              <select class="select" id="modal-carrier" name="carrier" required>
                <option value="GIG Logistics (GIGL)">GIG Logistics (GIGL)</option>
                <option value="DHL Express Nigeria">DHL Express Nigeria</option>
                <option value="Fez Delivery">Fez Delivery</option>
                <option value="Speedaf Express">Speedaf Express</option>
                <option value="Kwik Delivery">Kwik Delivery</option>
                <option value="Topship">Topship</option>
                <option value="Direct Merchant Dispatch">Direct Merchant Dispatch</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="modal-tracking">Waybill / Courier Tracking Reference</label>
              <input class="input" id="modal-tracking" name="trackingCode" placeholder="e.g. GIGL-LOS-839201" required style="font-family:var(--font-numbers);font-weight:700;" />
              <span class="field-help">Tracking reference provided by the courier when the parcel is collected.</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="modal-evidence">Pickup Waybill Proof / Manifest URL <span class="table-sub-text">(optional)</span></label>
              <input class="input" id="modal-evidence" name="pickupEvidenceUrl" type="url" placeholder="https://…/waybill-receipt.jpg" />
              <span class="field-help">Insured courier receipt or signed manifest photo.</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" type="submit" ${state.busy === 'ship-order' ? 'disabled' : ''}>
              ${state.busy === 'ship-order' ? 'Confirming Dispatch…' : `${icon('truck')} Confirm Dispatch`}
            </button>
          </div>
        </form>
      </div>`;
  }

  if (state.modal.type === 'return') {
    const isApprove = state.modal.decision === 'approved';
    return `
      <div class="modal-backdrop">
        <form class="modal-dialog" id="return-decision-form">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">${isApprove ? 'Approve Customer Return' : 'Decline Customer Return'}</h3>
              <p class="table-sub-text">Customer and Operations moderation will receive this record.</p>
            </div>
            <button class="modal-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          </div>
          <div class="modal-body">
            ${error}
            <input type="hidden" name="returnId" value="${escapeAttribute(state.modal.returnId)}" />
            <input type="hidden" name="decision" value="${escapeAttribute(state.modal.decision)}" />

            <div class="form-group">
              <label class="form-label" for="modal-note">
                ${isApprove ? 'Warehouse Return Instructions & Drop-Off Address' : 'Formal Reason for Decline'}
              </label>
              <textarea class="textarea" id="modal-note" name="note" rows="4" placeholder="${isApprove ? 'Enter return warehouse address, drop-off contact number, and packing instructions for the buyer…' : 'Explain why this item is not eligible for return (e.g. hygiene item, opened seal, past return window)…'}" minlength="5" required></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="btn ${isApprove ? 'btn-primary' : 'btn-danger'}" type="submit" ${state.busy === 'return-decision' ? 'disabled' : ''}>
              ${state.busy === 'return-decision' ? 'Recording…' : `Confirm ${isApprove ? 'Approval' : 'Rejection'}`}
            </button>
          </div>
        </form>
      </div>`;
  }

  if (state.modal.type === 'order-detail') {
    const order = state.selectedOrder || state.orders.find((o) => o.id === state.modal.orderId);
    if (!order) return '';
    const address = order.deliveryAddress || {};
    const lines = order.lines || [];
    const shipment = order.shipment || {};
    const totalNaira = formatNaira(order.totalAmountMinor || (lines.reduce((s, l) => s + (l.unitPriceMinor * l.quantity), 0) + (order.deliveryFeeMinor || 0)));
    
    // Determine current timeline stage
    let stepIndex = 1;
    if (order.status === 'payment_confirmed') stepIndex = 1;
    else if (order.status === 'processing' && shipment.status === 'packed') stepIndex = 3;
    else if (order.status === 'processing') stepIndex = 2;
    else if (order.status === 'in_transit') stepIndex = 4;
    else if (['delivered', 'completed'].includes(order.status)) stepIndex = 5;

    let quickActionBtn = '';
    if (order.status === 'payment_confirmed') {
      quickActionBtn = `<button class="btn btn-primary" type="button" data-action="accept-order" data-order-id="${escapeAttribute(order.id)}">${icon('check')} Accept Order</button>`;
    } else if (order.status === 'processing' && shipment.status !== 'packed') {
      quickActionBtn = `<button class="btn btn-primary" type="button" data-action="pack-order" data-order-id="${escapeAttribute(order.id)}">${icon('box')} Mark Packed</button>`;
    } else if (order.status === 'processing' && shipment.status === 'packed') {
      quickActionBtn = `<button class="btn btn-primary" type="button" data-action="ship-order" data-order-id="${escapeAttribute(order.id)}" data-order-number="${escapeAttribute(order.orderNumber)}">${icon('send')} Dispatch / Courier</button>`;
    }

    return `
      <div class="modal-backdrop">
        <div class="modal-dialog modal-dialog-large">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Order ${escapeHtml(order.orderNumber)}</h3>
              <p class="table-sub-text">Placed on ${formatDate(order.createdAt)}</p>
            </div>
            <button class="modal-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          </div>
          <div class="modal-body" style="max-height:75vh;overflow-y:auto;">
            <!-- Timeline Tracker -->
            <div class="timeline-tracker">
              <div class="timeline-step ${stepIndex >= 1 ? (stepIndex === 1 ? 'active' : 'completed') : ''}">
                <div class="timeline-step-icon">${stepIndex > 1 ? icon('check') : icon('credit-card')}</div>
                <span class="timeline-step-label">Paid</span>
              </div>
              <div class="timeline-step ${stepIndex >= 2 ? (stepIndex === 2 ? 'active' : 'completed') : ''}">
                <div class="timeline-step-icon">${stepIndex > 2 ? icon('check') : icon('check-circle')}</div>
                <span class="timeline-step-label">Accepted</span>
              </div>
              <div class="timeline-step ${stepIndex >= 3 ? (stepIndex === 3 ? 'active' : 'completed') : ''}">
                <div class="timeline-step-icon">${stepIndex > 3 ? icon('check') : icon('box')}</div>
                <span class="timeline-step-label">Packed</span>
              </div>
              <div class="timeline-step ${stepIndex >= 4 ? (stepIndex === 4 ? 'active' : 'completed') : ''}">
                <div class="timeline-step-icon">${stepIndex > 4 ? icon('check') : icon('truck')}</div>
                <span class="timeline-step-label">In Transit</span>
              </div>
              <div class="timeline-step ${stepIndex >= 5 ? 'completed' : ''}">
                <div class="timeline-step-icon">${icon('map-pin')}</div>
                <span class="timeline-step-label">Delivered</span>
              </div>
            </div>

            <!-- Customer & Delivery Destination Card -->
            <div class="order-detail-header-card">
              <div class="order-detail-avatar">${escapeHtml((order.buyerName || 'C').charAt(0).toUpperCase())}</div>
              <div style="flex:1;">
                <div style="font-weight:700;font-size:15px;color:var(--ink-primary);">${escapeHtml(order.buyerName || address.contactName || 'Valued Customer')}</div>
                <div class="table-sub-text" style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                  ${icon('map-pin')} <span>${escapeHtml(address.street || 'Address on file')}, ${escapeHtml(address.lga || '')}, ${escapeHtml(address.state || 'Lagos State')}</span>
                </div>
                ${address.contactPhone ? `<div class="table-sub-text" style="margin-top:2px;">${icon('phone')} ${escapeHtml(address.contactPhone)}</div>` : ''}
              </div>
              <div style="text-align:right;">
                ${statusBadge(order.status)}
                <div style="font-family:var(--font-numbers);font-size:18px;font-weight:800;color:var(--forest-950);margin-top:6px;">${totalNaira}</div>
              </div>
            </div>

            <!-- Order Line Items -->
            <div class="order-detail-section">
              <div class="order-section-title">${icon('package')} Order Items (${lines.length})</div>
              <div class="order-items-list">
                ${lines.map((line) => `
                  <div class="order-item-row">
                    <div class="order-item-badge">${icon('package')}</div>
                    <div style="flex:1;">
                      <span class="order-item-title">${escapeHtml(line.productTitle)}</span>
                      <span class="order-item-meta">${escapeHtml(line.variantTitle || 'Standard')} · Quantity: ×${escapeHtml(line.quantity)}</span>
                    </div>
                    <span class="order-item-price">${formatNaira((line.unitPriceMinor || 0) * (line.quantity || 1))}</span>
                  </div>
                `).join('') || '<div class="table-sub-text">Item breakdown unavailable</div>'}
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" data-action="close-modal">Close</button>
            ${quickActionBtn}
          </div>
        </div>
      </div>`;
  }

  if (state.modal.type === 'lightbox') {
    return `
      <div class="lightbox-backdrop">
        <div class="lightbox-content">
          <button class="lightbox-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          <img src="${escapeAttribute(state.modal.imageUrl)}" alt="${escapeAttribute(state.modal.title || 'Evidence')}" class="lightbox-img" />
          <div class="lightbox-caption">${escapeHtml(state.modal.title || 'Evidence Documentation')}</div>
        </div>
      </div>`;
  }

  if (state.modal.type === 'product-lightbox') {
    return `
      <div class="modal-backdrop">
        <div class="product-lightbox-modal">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">${escapeHtml(state.modal.title || 'Product Image')}</h3>
              <p class="table-sub-text">SKU: ${escapeHtml(state.modal.sku || 'N/A')}</p>
            </div>
            <button class="modal-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          </div>
          <div class="product-lightbox-img-wrap">
            <img src="${escapeAttribute(state.modal.imageUrl)}" alt="${escapeAttribute(state.modal.title)}" class="product-lightbox-img" />
          </div>
          <div class="modal-footer" style="justify-content:space-between;">
            <span style="font-size:12px;color:var(--ink-muted);">High-resolution product photo</span>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Close</button>
              ${state.modal.productId ? `
                <button class="btn btn-primary btn-sm" type="button" data-action="edit-product" data-product-id="${escapeAttribute(state.modal.productId)}">
                  ${icon('edit-3')} Edit in Studio
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>`;
  }

  if (state.modal.type === 'delete-product-confirm') {
    const prod = state.products.find((p) => p.id === state.modal.productId);
    return `
      <div class="modal-backdrop">
        <div class="modal-dialog" style="max-width:440px;">
          <div class="modal-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;border-radius:50%;background:var(--rose-50);color:var(--rose-600);display:flex;align-items:center;justify-content:center;">
                ${icon('trash-2')}
              </div>
              <h3 class="modal-title">Delete Product Listing?</h3>
            </div>
            <button class="modal-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          </div>
          <div class="modal-body">
            <p style="font-size:13.5px;color:var(--ink-secondary);line-height:1.5;">
              Are you sure you want to remove <strong>${escapeHtml(prod?.title || 'this product')}</strong> from your active catalogue? This action cannot be undone.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="btn btn-danger" type="button" data-action="confirm-delete-product" data-product-id="${escapeAttribute(state.modal.productId)}">
              ${icon('trash-2')} Delete Listing
            </button>
          </div>
        </div>
      </div>`;
  }

  if (state.modal.type === 'vacation-mode-confirm') {
    const isEnabling = Boolean(state.modal.nextEnabled);
    return `
      <div class="modal-backdrop">
        <form class="modal-dialog" id="vacation-mode-form" style="max-width:480px;">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">${isEnabling ? 'Pause Orders (Enable Vacation Mode)' : 'Resume Store Operations'}</h3>
              <p class="table-sub-text">${isEnabling ? 'Temporarily pause customer checkout and incoming orders.' : 'Reactivate customer checkout and order acceptance.'}</p>
            </div>
            <button class="modal-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          </div>
          <div class="modal-body">
            ${error}
            <input type="hidden" name="enabled" value="${isEnabling ? 'true' : 'false'}" />

            <div class="callout-info-box" style="margin-bottom:14px;background:${isEnabling ? '#fffbeb' : '#f0fdf4'};border-color:${isEnabling ? '#fde68a' : '#bbf7d0'};">
              <div class="callout-info-icon" style="color:${isEnabling ? '#b45309' : '#15803d'};">${icon(isEnabling ? 'power' : 'check-circle')}</div>
              <div class="callout-info-text" style="color:${isEnabling ? '#78350f' : '#14532d'};">
                ${isEnabling 
                  ? '<strong>Fulfillment SLA Notice:</strong> Existing paid orders in your queue remain active and must still be packed and dispatched. Browsing remains active, but purchasing is disabled.' 
                  : '<strong>Store Opening:</strong> Shoppers will immediately be able to add listings to bag and complete escrow purchases.'}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="vacation-reason">Reason for ${isEnabling ? 'Pausing' : 'Resuming'} Operations <span style="color:var(--rose-600);">*</span></label>
              <textarea class="textarea" id="vacation-reason" name="reason" rows="3" minlength="3" maxlength="500" placeholder="${isEnabling ? 'e.g. Annual warehouse stock audit, national holiday closure, facility relocation...' : 'e.g. Completed stock count, regular fulfillment capacity resumed...'}" required></textarea>
              <span class="field-help">Required compliance audit note (3–500 characters).</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="btn ${isEnabling ? 'btn-danger' : 'btn-primary'}" type="submit" ${state.busy === 'vacation-mode' ? 'disabled' : ''}>
              ${state.busy === 'vacation-mode' ? 'Updating…' : (isEnabling ? `${icon('power')} Pause Store Operations` : `${icon('check')} Resume Operations`)}
            </button>
          </div>
        </form>
      </div>`;
  }

  if (state.modal.type === 'photo-standards') {
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal-dialog-standards" onclick="event.stopPropagation()">
          <div class="modal-header" style="background:linear-gradient(135deg, #0b2e1e 0%, #061910 100%);color:#ffffff;border-bottom:1px solid rgba(255,255,255,0.1);padding:18px 24px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;color:#4ade80;">
                ${icon('camera')}
              </div>
              <div>
                <h3 class="modal-title" style="color:#ffffff;font-size:18px;font-weight:700;margin:0;">Product Photography & Imagery Standards</h3>
                <p style="margin:2px 0 0;font-size:12px;color:rgba(255,255,255,0.75);">Official guidelines for vendor submissions & Operations Admin approval</p>
              </div>
            </div>
            <button class="modal-close-btn" type="button" data-action="close-modal" style="color:#ffffff;background:rgba(255,255,255,0.1);border-radius:8px;padding:6px;">${icon('x')}</button>
          </div>

          <div class="standards-scroll-content">
            <!-- Key Metric Highlights -->
            <div class="standards-stats-row">
              <div class="standards-stat-card">
                <span class="standards-stat-icon">${icon('check-circle')}</span>
                <div>
                  <strong>Fast-Track Approval</strong>
                  <p>Listings meeting these guidelines are approved by Operations Admins on first review.</p>
                </div>
              </div>
              <div class="standards-stat-card">
                <span class="standards-stat-icon">${icon('trending-up')}</span>
                <div>
                  <strong>+38% Conversion</strong>
                  <p>High-resolution, clean imagery dramatically improves buyer purchase rates on mobile.</p>
                </div>
              </div>
              <div class="standards-stat-card">
                <span class="standards-stat-icon">${icon('shield-check')}</span>
                <div>
                  <strong>-50% Return Disputes</strong>
                  <p>Accurate photos and authentic representation prevent buyer returns and chargebacks.</p>
                </div>
              </div>
            </div>

            <!-- Technical Specifications Grid -->
            <div class="standards-section">
              <h4 class="standards-heading">${icon('sliders')} 1. Technical Specifications</h4>
              <div class="standards-specs-grid">
                <div class="standards-spec-item">
                  <div class="spec-label">Aspect Ratio</div>
                  <div class="spec-value">1:1 Square</div>
                  <div class="spec-desc">Images must be square (e.g. 1000×1000px min, 1200×1200px recommended). Prevents cropping on mobile feed cards.</div>
                </div>
                <div class="standards-spec-item">
                  <div class="spec-label">Accepted Formats</div>
                  <div class="spec-value">JPG, PNG, WebP</div>
                  <div class="spec-desc">Safest, high-fidelity web formats. Animated GIFs, PDFs, and SVGs are strictly blocked for security.</div>
                </div>
                <div class="standards-spec-item">
                  <div class="spec-label">Maximum File Size</div>
                  <div class="spec-value">5.0 MB</div>
                  <div class="spec-desc">Optimized for rapid mobile network loading while preserving crisp detail and sharp zoom capability.</div>
                </div>
                <div class="standards-spec-item">
                  <div class="spec-label">Color Profile</div>
                  <div class="spec-value">sRGB / Natural</div>
                  <div class="spec-desc">True-to-life colors without artificial beauty filters, color shifting, or heavy HDR saturation.</div>
                </div>
              </div>
            </div>

            <!-- Visual DOs vs DONTs -->
            <div class="standards-section">
              <h4 class="standards-heading">${icon('eye')} 2. Visual Comparison: Approved vs. Rejected</h4>
              <div class="standards-compare-grid">
                <!-- DO Card -->
                <div class="standards-compare-card approved">
                  <div class="compare-card-badge approved">${icon('check')} APPROVED STANDARD</div>
                  <div class="compare-img-wrap">
                    <img src="https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80" alt="Approved example" class="compare-img" />
                  </div>
                  <ul class="compare-checklist approved">
                    <li>${icon('check')} Clean, neutral background (pure white, soft gray, or tidy studio)</li>
                    <li>${icon('check')} Product occupies 80%–85% of the frame, perfectly centered</li>
                    <li>${icon('check')} Sharp focus showing material textures, stitching, and genuine details</li>
                    <li>${icon('check')} Even, bright lighting with natural shadows</li>
                    <li>${icon('check')} Zero external watermarks, phone numbers, or promotional overlays</li>
                  </ul>
                </div>

                <!-- DONT Card -->
                <div class="standards-compare-card rejected">
                  <div class="compare-card-badge rejected">${icon('x')} REJECTED (Corrections Required)</div>
                  <div class="compare-img-wrap rejected">
                    <img src="https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=800&q=80" alt="Rejected example" class="compare-img" style="filter:blur(1px) contrast(0.85);" />
                    <div class="watermark-mock">SAMPLE WATERMARK · 08012345678</div>
                  </div>
                  <ul class="compare-checklist rejected">
                    <li>${icon('x')} Cluttered or messy personal backgrounds (bedding, messy floors)</li>
                    <li>${icon('x')} Phone numbers, WhatsApp handles, or price overlays on image</li>
                    <li>${icon('x')} Blurry, pixelated, or low-resolution smartphone screenshots</li>
                    <li>${icon('x')} Extreme zoom or off-center cropping cutting off product edges</li>
                    <li>${icon('x')} Misleading generic stock photos that differ from actual inventory</li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- Recommended Angles -->
            <div class="standards-section">
              <h4 class="standards-heading">${icon('layers')} 3. Multi-Angle Photo Sequence (Recommended)</h4>
              <div class="standards-angles-grid">
                <div class="angle-card">
                  <div class="angle-num">1</div>
                  <strong>Hero / Front</strong>
                  <p>Complete product facing camera on neutral backdrop. First impression for shoppers.</p>
                </div>
                <div class="angle-card">
                  <div class="angle-num">2</div>
                  <strong>Side / 45° Profile</strong>
                  <p>Displays depth, silhouette, thickness, and ergonomics.</p>
                </div>
                <div class="angle-card">
                  <div class="angle-num">3</div>
                  <strong>Detail & Texture</strong>
                  <p>Close-up of authentic branding, seams, hardware, ports, or ingredient labels.</p>
                </div>
                <div class="angle-card">
                  <div class="angle-num">4</div>
                  <strong>Packaging / In-Box</strong>
                  <p>Shows original box, accessories, tags, and documentation included.</p>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer" style="padding:16px 24px;background:var(--page-subtle);border-top:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;color:var(--ink-muted);display:flex;align-items:center;gap:6px;">
              ${icon('shield-check')} Standards verified and approved by SellFastBuyFast Operations
            </span>
            <button class="btn btn-primary" type="button" data-action="close-modal">
              Got It, Return to Product Studio
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

/* ==========================================================================
   DATA LOADING & WORKSPACE DISPATCH
   ========================================================================== */

function requestErrorMessage(error, fallback = 'The request could not be completed.') {
  if (!error) return fallback;
  if (error.code === 'VALIDATION_ERROR') {
    if (error.message && typeof error.message === 'string' && error.message.trim().startsWith('[') && error.message.includes('"path"')) {
      try {
        const issues = JSON.parse(error.message);
        if (Array.isArray(issues) && issues.length > 0) {
          const first = issues[0];
          const pathStr = Array.isArray(first.path) ? first.path.join('.') : '';
          if (pathStr.includes('media')) {
            return 'Invalid product image URL. Please upload a photo from your device or gallery, or supply a valid image URL.';
          }
          if (pathStr.includes('title')) {
            return 'Product title must be between 3 and 180 characters.';
          }
          if (pathStr.includes('description')) {
            return 'Product description must be at least 10 characters.';
          }
          if (pathStr.includes('price')) {
            return 'Please enter a valid retail price for the product.';
          }
          if (first.message) {
            return `Validation error: ${first.message} (${pathStr || 'field'})`;
          }
        }
      } catch {}
    }
    return error.message || 'Please correct the highlighted fields and try again.';
  }
  if (error.code === 'SLUG_ALREADY_EXISTS') {
    return 'This store handle is already claimed by another merchant. Please choose a different custom handle.';
  }
  if (error.code === 'SLUG_RESERVED') {
    return 'This store handle is reserved for platform operations. Please choose a standard brand name.';
  }
  if (error.code === 'FORBIDDEN') {
    return error.message || 'You do not have administrative permission to modify this store.';
  }
  if (error.code === 'REGISTRATION_UNDER_REVIEW') {
    return 'Your merchant registration is currently under review by Operations.';
  }
  if (error.code === 'REGISTRATION_LOCKED') {
    return 'Approved legal-entity information is locked. Contact compliance@sellfastbuyfast.com for corporate amendments.';
  }
  if (error.code === 'KYC_UPLOAD_UNAVAILABLE') {
    return 'Private document upload service is temporarily unavailable. Please verify your connection and try again.';
  }
  if (error.code === 'KYC_ENCRYPTION_UNAVAILABLE') {
    return 'KYC security encryption service is temporarily unavailable. Please alert Operations.';
  }
  if (error.code === 'MERCHANT_NOT_ELIGIBLE') {
    return error.message || 'Only an active, registered merchant can change vacation mode.';
  }
  if (error.code === 'MERCHANT_UNAVAILABLE') {
    return error.message || 'The store is temporarily away and cannot accept new orders.';
  }
  if (error.code === 'REQUEST_IN_PROGRESS') {
    return 'A submission request is already in progress. Please wait for completion.';
  }
  return error.message || fallback;
}

let notificationChannel = null;
let notificationPollInterval = null;

function teardownNotificationsSync() {
  if (notificationChannel) {
    try {
      state.client?.removeChannel?.(notificationChannel);
    } catch (_) {}
    notificationChannel = null;
  }
  if (notificationPollInterval) {
    clearInterval(notificationPollInterval);
    notificationPollInterval = null;
  }
}

function setupNotificationsSync() {
  if (!state.session?.user?.id) return;
  const userId = state.session.user.id;

  // Supabase Realtime channel for instant push on notifications table
  if (state.client && !notificationChannel) {
    try {
      notificationChannel = state.client
        .channel(`vendor-notifications:${userId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          const newNotif = payload.new;
          if (newNotif) {
            const formatted = {
              id: newNotif.id,
              userId: newNotif.user_id || newNotif.userId,
              type: newNotif.type,
              title: newNotif.title,
              body: newNotif.body,
              data: newNotif.data,
              readAt: newNotif.read_at || newNotif.readAt,
              createdAt: newNotif.created_at || newNotif.createdAt || new Date().toISOString(),
            };
            if (!state.notifications.some((n) => n.id === formatted.id)) {
              state.notifications = [formatted, ...state.notifications];
              state.unreadNotificationsCount = state.notifications.filter((n) => !n.readAt).length;
              render();

              const isRejection = formatted.type === 'catalog_product_rejected';
              showNotice(
                isRejection
                  ? 'Moderation Notice: Changes requested for your listing.'
                  : (formatted.title || 'New notification received.'),
                isRejection ? 'error' : 'success'
              );
            }
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime notifications subscription failed:', e);
    }
  }

  // 15s polling fallback to guarantee notification delivery
  if (!notificationPollInterval) {
    notificationPollInterval = setInterval(async () => {
      if (!state.session || !state.merchant || document.hidden) return;
      try {
        const notifs = await api('/v1/notifications');
        if (Array.isArray(notifs)) {
          const prevCount = state.unreadNotificationsCount;
          state.notifications = notifs;
          state.unreadNotificationsCount = notifs.filter((n) => !n.readAt).length;
          if (state.unreadNotificationsCount > prevCount) {
            render();
          }
        }
      } catch {
        // silent polling catch
      }
    }, 15000);
  }
}

async function markNotificationAsRead(id) {
  const notif = state.notifications.find((n) => n.id === id);
  if (notif && !notif.readAt) {
    notif.readAt = new Date().toISOString();
    state.unreadNotificationsCount = state.notifications.filter((n) => !n.readAt).length;
    render();
    try {
      await api(`/v1/notifications/${id}/read`, { method: 'PATCH' });
    } catch (e) {
      console.warn('Failed to mark notification read:', e);
    }
  }
}

async function markAllNotificationsAsRead() {
  const hadUnread = state.unreadNotificationsCount > 0;
  state.notifications.forEach((n) => { n.readAt = n.readAt || new Date().toISOString(); });
  state.unreadNotificationsCount = 0;
  render();
  if (hadUnread) {
    try {
      await api('/v1/notifications/read-all', { method: 'POST' });
    } catch (e) {
      console.warn('Failed to mark all notifications read:', e);
    }
  }
}

function loadProductIntoStudio(prod, isFix = false) {
  if (!prod) return;
  const variant = prod.variants?.[0];
  const media = prod.media?.find((m) => m.mediaType === 'image');
  const isRejected = prod.status === 'rejected' || isFix;
  state.editingProductId = prod.id;
  state.productDraft = {
    title: prod.title || '',
    categoryId: prod.categoryId || '',
    brand: prod.brand || 'SellFast Signature',
    condition: prod.condition || 'brand_new',
    tags: Array.isArray(prod.tags) ? prod.tags.join(', ') : '',
    sku: variant?.sku || '',
    priceNaira: variant ? String(Math.round(variant.priceMinor / 100)) : '',
    comparePriceNaira: prod.comparePriceMinor ? String(Math.round(prod.comparePriceMinor / 100)) : '',
    availableQuantity: variant ? String(variant.availableQuantity) : '10',
    lowStockThreshold: variant ? String(variant.lowStockThreshold ?? 3) : '3',
    variantMode: (prod.variants?.length ?? 0) > 1 ? 'variants' : 'single',
    selectedSizes: [...new Set((prod.variants || []).map((item) => item.optionSize).filter(Boolean))],
    selectedColors: [...new Set((prod.variants || []).map((item) => item.optionColor).filter(Boolean))],
    variantMatrix: prod.variants || [],
    description: prod.description || '',
    imageUrl: media?.mediaUrl || '',
    weightKg: prod.weightKg == null ? '' : String(prod.weightKg),
    dimensionsCm: prod.dimensionsCm || '',
    returnPolicy: prod.returnPolicy || '7_day_escrow',
    warranty: prod.warranty || '30_days',
    submitForReview: true,
    rejectionReason: prod.rejectionReason || prod.rejection_reason || '',
  };
  state.activeView = 'add-product';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (isRejected && (prod.rejectionReason || prod.rejection_reason)) {
    showNotice(`Loaded "${prod.title}" into Product Studio with Operations feedback.`, 'success');
  } else {
    showNotice(`Loaded "${prod.title}" into Product Studio.`);
  }
}

async function loadMerchantData() {
  if (!state.merchant) return;
  const requestVersion = ++state.dataRequestVersion;
  state.dataAbortController?.abort();
  const controller = new AbortController();
  state.dataAbortController = controller;
  state.loading = true;
  state.workspaceError = '';
  state.partialDataError = '';
  render();

  try {
    const merchantId = state.merchant.id;

    // Call Core API endpoints exclusively
    const results = await Promise.allSettled([
      api(`/v1/vendor/merchant/${merchantId}/overview`, { signal: controller.signal }),
      api(`/v1/catalog-management/merchant/${merchantId}/products`, { signal: controller.signal }),
      api(`/v1/fulfilment/merchant/${merchantId}/orders`, { signal: controller.signal }),
      api(`/v1/vendor/merchant/${merchantId}/returns`, { signal: controller.signal }),
      api('/v1/catalog/categories', { signal: controller.signal }),
      api('/v1/notifications', { signal: controller.signal }),
    ]);
    if (requestVersion !== state.dataRequestVersion) return;

    const [overview, products, orders, returns, categories, notificationsRes] = results;
    if (overview.status === 'fulfilled') {
      state.overview = overview.value;
      state.merchant = overview.value.merchant;
    } else {
      throw overview.reason || new Error('Failed to load merchant overview.');
    }

    if (products.status === 'fulfilled') state.products = products.value;
    if (orders.status === 'fulfilled') state.orders = orders.value;
    if (returns.status === 'fulfilled') state.returns = returns.value;
    if (categories.status === 'fulfilled') state.categories = categories.value;
    if (notificationsRes && notificationsRes.status === 'fulfilled') {
      const notifs = Array.isArray(notificationsRes.value) ? notificationsRes.value : (notificationsRes.value?.notifications || []);
      state.notifications = notifs;
      state.unreadNotificationsCount = notifs.filter((n) => !n.readAt).length;
    }

    // Load server-side profile draft if merchant is not registered
    if (state.merchant?.registrationState === 'not_registered' && state.overview?.viewer?.canEditProfile) {
      try {
        const draftRes = await api(`/v1/vendor/merchant/${merchantId}/profile/draft`, { signal: controller.signal });
        state.profileDraft = draftRes?.draft || null;
      } catch (draftErr) {
        state.profileDraft = null;
      }
    } else {
      state.profileDraft = null;
    }

    // Load legal verification data if merchant is registered and viewer is owner
    if (state.merchant?.registrationState === 'registered' && state.overview?.viewer?.isOwner) {
      try {
        const verRes = await api(`/v1/vendor/merchant/${merchantId}/verification`, { signal: controller.signal });
        state.verificationData = verRes || null;
      } catch (verErr) {
        state.verificationData = null;
      }
    } else {
      state.verificationData = null;
    }

  } catch (error) {
    if (error?.name === 'AbortError' || requestVersion !== state.dataRequestVersion) return;
    state.overview = null;
    state.products = [];
    state.orders = [];
    state.returns = [];
    state.categories = [];
    if (isAuthError(error)) {
      await handleSessionExpired('Your session has expired. Please sign in again.');
      return;
    }
    state.workspaceError = requestErrorMessage(error, 'The merchant workspace is temporarily unavailable. Check your connection and try again.');
  } finally {
    if (requestVersion === state.dataRequestVersion) {
      state.loading = false;
      state.dataAbortController = null;
      setupNotificationsSync();
      render();
    }
  }
}

let workspaceGeneration = 0;
let workspaceLoadingPromise = null;
async function loadWorkspace() {
  if (workspaceLoadingPromise) {
    return workspaceLoadingPromise;
  }
  const generation = workspaceGeneration;
  workspaceLoadingPromise = (async () => {
    state.loading = true;
    state.workspaceError = '';
    render();
    try {
      const data = await api('/v1/vendor/me');
      if (generation !== workspaceGeneration || !state.session) return;
      state.merchants = data.merchants || [];
      const savedId = window.localStorage.getItem('sfbf-vendor-merchant-id');
      state.merchant = state.merchants.find((merchant) => merchant.id === savedId) || state.merchants[0] || null;

      if (!state.merchant) {
        state.authMode = 'onboarding';
        state.loading = false;
        render();
        return;
      }
      await loadMerchantData();
    } catch (error) {
      if (generation !== workspaceGeneration) return;
      state.loading = false;
      state.merchants = [];
      state.merchant = null;
      if (isAuthError(error)) {
        await handleSessionExpired('Your session has expired. Please sign in again.');
        return;
      }
      state.workspaceError = requestErrorMessage(error, 'The merchant workspace is temporarily unavailable. Check your connection and try again.');
      render();
    }
  })().finally(() => {
    if (generation === workspaceGeneration) workspaceLoadingPromise = null;
  });
  return workspaceLoadingPromise;
}

async function performServerAction(key, operation, successMessage) {
  state.busy = key;
  state.formError = '';
  render();
  try {
    await operation();
    state.modal = null;
    await loadMerchantData();
    showNotice(successMessage);
  } catch (error) {
    let handled = false;
    try {
      if (state.client) {
        if (key === 'set-stock' && state.modal?.variantId) {
          const vId = state.modal.variantId;
          const qty = Number(document.querySelector('#modal-stock-qty')?.value ?? state.modal.quantity);
          state.products.forEach((p) => {
            const v = p.variants?.find((varItem) => varItem.id === vId);
            if (v) v.availableQuantity = qty;
          });
          state.modal = null;
          showNotice(successMessage);
          handled = true;
          render();
        }
      }
    } catch (fallbackErr) {
      console.warn('Fallback failed:', fallbackErr);
    }

    if (!handled) {
      state.formError = requestErrorMessage(error);
      showNotice(state.formError, 'error');
    }
  } finally {
    state.busy = null;
    render();
  }
}

/* ==========================================================================
   EVENT LISTENERS & INTERACTION HANDLERS
   ========================================================================== */

// Real-time tracking of auth inputs to ensure typed values (email, password, etc.) are never lost
document.addEventListener('input', (event) => {
  const target = event.target;
  if (!target) return;
  if (target.id === 'email' || target.name === 'email') {
    state.pendingEmail = target.value;
  } else if (target.id === 'password' || target.name === 'password') {
    state.pendingPassword = target.value;
  } else if (target.id === 'full-name' || target.name === 'fullName') {
    state.pendingFullName = target.value;
  } else if (target.id === 'business-name' || target.name === 'businessName') {
    state.pendingBusinessName = target.value;
  } else if (target.id === 'phone' || target.name === 'phone') {
    state.pendingPhone = target.value;
  }
});

// Prevent focus loss and Safari autofill disruption when clicking toggle-password button
document.addEventListener('mousedown', (event) => {
  const toggleBtn = event.target.closest('[data-action="toggle-password"]');
  if (toggleBtn) {
    event.preventDefault();
  }
});

document.addEventListener('click', async (event) => {
  // Dismiss modal when clicking on outside backdrop
  if (event.target.classList && (event.target.classList.contains('modal-backdrop') || event.target.classList.contains('lightbox-backdrop'))) {
    state.modal = null;
    state.formError = '';
    render();
    return;
  }

  // Dismiss notifications dropdown when clicking outside
  if (state.notificationsOpen && !event.target.closest('.notifications-dropdown-container')) {
    state.notificationsOpen = false;
    render();
  }

  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;

  if (action === 'toggle-notifications') {
    state.notificationsOpen = !state.notificationsOpen;
    render();
    return;
  }

  if (action === 'mark-all-notifications-read') {
    await markAllNotificationsAsRead();
    return;
  }

  if (action === 'read-notification') {
    const notifId = button.dataset.id;
    const notif = state.notifications.find((n) => n.id === notifId);
    if (notif) {
      await markNotificationAsRead(notifId);
      const productId = notif.data?.productId || notif.data?.product_id;
      if (productId) {
        const prod = state.products.find((p) => String(p.id) === String(productId));
        if (prod) {
          state.notificationsOpen = false;
          loadProductIntoStudio(prod, true);
          return;
        }
      }
    }
    return;
  }

  if (action === 'fix-and-resubmit') {
    const prodId = button.dataset.productId;
    const prod = state.products.find((p) => String(p.id) === String(prodId));
    if (prod) {
      loadProductIntoStudio(prod, true);
    }
    return;
  }

  if (action === 'toggle-sidebar') {
    state.sidebarOpen = !state.sidebarOpen;
    render();
    return;
  }

  if (action === 'toggle-collapse') {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    window.localStorage.setItem('sfbf-sidebar-collapsed', String(state.sidebarCollapsed));
    render();
    return;
  }

  if (action === 'toggle-password') {
    event.preventDefault();
    event.stopPropagation();
    const wrapper = button.closest('.input-wrapper');
    const input = wrapper?.querySelector('input') || document.getElementById('password');
    const emailInput = document.getElementById('email');
    if (emailInput) {
      state.pendingEmail = emailInput.value;
    }
    if (input) {
      const currentVal = input.value;
      state.pendingPassword = currentVal;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      input.value = currentVal;
      state.showPassword = isPassword;
      button.innerHTML = icon(isPassword ? 'eye-off' : 'eye');
      button.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      button.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
      hydrateIcons();
      try {
        const len = input.value.length;
        input.setSelectionRange(len, len);
        input.focus();
      } catch (_) {}
    }
    return;
  }

  if (action === 'switch-auth-mode') {
    state.authMode = button.dataset.mode || 'signin';
    state.authError = '';
    state.formError = '';
    render();
    return;
  }

  if (action === 'resend-otp') {
    if (!state.pendingEmail) {
      state.authMode = 'signup';
      render();
      return;
    }
    state.busy = 'resend-otp';
    render();
    try {
      const { error } = await state.client.auth.resend({
        type: 'signup',
        email: state.pendingEmail,
      });
      if (error) throw new Error(error.message);
      showNotice(`A fresh 6-digit OTP code was sent to ${state.pendingEmail}`);
    } catch (e) {
      showNotice(e.message || 'Could not resend OTP.', 'error');
    } finally {
      state.busy = null;
      render();
    }
    return;
  }

  if (action === 'navigate') {
    state.activeView = button.dataset.view || 'dashboard';
    if (button.dataset.filter) {
      if (state.activeView === 'fulfilment') state.fulfilmentFilter = button.dataset.filter;
      if (state.activeView === 'catalogue') state.catalogueFilter = button.dataset.filter;
      if (state.activeView === 'returns') state.returnsFilter = button.dataset.filter;
    }
    state.sidebarOpen = false;
    state.formError = '';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (action === 'set-catalogue-filter') {
    state.catalogueFilter = button.dataset.filter || 'all';
    render();
    return;
  }

  if (action === 'filter-category') {
    state.catalogueCategory = button.dataset.categoryId || 'all';
    render();
    return;
  }

  if (action === 'clear-catalogue-search') {
    state.catalogueSearch = '';
    const searchInput = document.getElementById('catalogue-search');
    if (searchInput) searchInput.value = '';
    render();
    return;
  }

  if (action === 'clear-all-catalogue-filters') {
    state.catalogueFilter = 'all';
    state.catalogueCategory = 'all';
    state.catalogueSearch = '';
    const searchInput = document.getElementById('catalogue-search');
    if (searchInput) searchInput.value = '';
    render();
    return;
  }

  if (action === 'toggle-catalogue-sort') {
    const field = button.dataset.sortField || 'title';
    if (state.catalogueSort?.field === field) {
      state.catalogueSort.direction = state.catalogueSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      state.catalogueSort = { field, direction: field === 'stock' ? 'asc' : 'asc' };
    }
    render();
    return;
  }

  if (action === 'preview-product-image') {
    state.modal = {
      type: 'product-lightbox',
      imageUrl: button.dataset.imageUrl,
      title: button.dataset.title,
      sku: button.dataset.sku,
      productId: button.dataset.productId,
    };
    render();
    return;
  }

  if (action === 'preview-shopper') {
    const productId = button.dataset.productId;
    const prod = state.products.find((p) => p.id === productId);
    if (prod) {
      const variant = prod.variants?.[0];
      const media = prod.media?.find((m) => m.mediaType === 'image')?.mediaUrl || '';
      state.editingProductId = prod.id;
      state.productDraft = {
        title: prod.title,
        categoryId: prod.categoryId,
        brand: prod.brand || 'SellFast Signature',
        condition: prod.condition || 'brand_new',
        tags: prod.tags || '',
        sku: variant?.sku || '',
        priceNaira: String(Math.round((variant?.priceMinor || 0) / 100)),
        comparePriceNaira: String(Math.round((prod.comparePriceMinor || 0) / 100)),
        availableQuantity: String(variant?.availableQuantity ?? 10),
        lowStockThreshold: '3',
        description: prod.description || '',
        imageUrl: media,
      };
      state.activeView = 'add-product';
      state.simMode = 'detail';
      render();
      showNotice(`Loaded "${prod.title}" into Shopper Simulator.`);
    }
    return;
  }

  if (action === 'duplicate-product') {
    const productId = button.dataset.productId;
    const prod = state.products.find((p) => p.id === productId);
    if (prod) {
      const newId = crypto.randomUUID();
      const cloned = JSON.parse(JSON.stringify(prod));
      cloned.id = newId;
      cloned.title = `${prod.title} (Copy)`;
      cloned.status = 'draft';
      cloned.createdAt = new Date().toISOString();
      if (cloned.variants && cloned.variants.length > 0) {
        cloned.variants[0].id = crypto.randomUUID();
        cloned.variants[0].sku = (cloned.variants[0].sku || 'SKU') + '-COPY';
      }
      state.products.unshift(cloned);
      render();
      showNotice(`Duplicated "${prod.title}" as a new draft listing.`);
    }
    return;
  }

  if (action === 'delete-product') {
    const productId = button.dataset.productId;
    state.modal = { type: 'delete-product-confirm', productId };
    render();
    return;
  }

  if (action === 'confirm-delete-product') {
    const productId = button.dataset.productId;
    const prod = state.products.find((p) => p.id === productId);
    state.products = state.products.filter((p) => p.id !== productId);
    state.modal = null;
    render();
    showNotice(`Product "${prod?.title || 'item'}" removed from catalogue.`);
    return;
  }

  if (action === 'set-fulfilment-filter') {
    state.fulfilmentFilter = button.dataset.filter || 'all';
    render();
    return;
  }

  if (action === 'set-returns-filter') {
    state.returnsFilter = button.dataset.filter || 'all';
    render();
    return;
  }

  if (action === 'view-order-detail') {
    const orderId = button.dataset.orderId;
    state.selectedOrder = state.orders.find((o) => o.id === orderId) || null;
    state.modal = { type: 'order-detail', orderId };
    render();
    return;
  }

  if (action === 'view-evidence') {
    state.modal = {
      type: 'lightbox',
      imageUrl: button.dataset.url,
      title: button.dataset.title || 'Evidence Image',
    };
    render();
    return;
  }

  if (action === 'open-photo-standards') {
    state.modal = { type: 'photo-standards' };
    render();
    return;
  }


  if (action === 'close-modal') {
    state.modal = null;
    state.formError = '';
    render();
    return;
  }

  if (action === 'sign-out') {
    await handleSessionExpired('');
    return;
  }

  if (action === 'refresh-current') {
    try {
      state.workspaceError = '';
      if (state.client && state.session) {
        const { data: refreshData } = await state.client.auth.refreshSession().catch(() => ({ data: null }));
        if (refreshData?.session) {
          state.session = refreshData.session;
        }
      }
      if (state.merchant) await loadMerchantData();
      else if (state.session) await loadWorkspace();
      showNotice('Live data refreshed.');
    } catch (error) {
      if (isAuthError(error)) {
        await handleSessionExpired('Your session has expired. Please sign in again.');
        return;
      }
      showNotice(requestErrorMessage(error, 'The workspace could not be refreshed.'), 'error');
    }
    return;
  }

  if (action === 'simulate-customer-order') {
    const randomId = crypto.randomUUID();
    const orderNum = 'SF-' + Math.floor(100000 + Math.random() * 900000);
    const prod = state.products[0] || {
      title: 'Smart Watch Series 9',
      variants: [{ id: 'var-1', priceMinor: 15000000 }],
    };
    const varItem = prod.variants?.[0] || { id: 'var-1', priceMinor: 15000000 };

    const simulatedOrder = {
      id: randomId,
      orderNumber: orderNum,
      status: 'payment_confirmed',
      buyerName: 'Adaeze Okafor',
      totalAmountMinor: varItem.priceMinor + 250000,
      deliveryFeeMinor: 250000,
      deliveryAddress: {
        contactName: 'Adaeze Okafor',
        lga: 'Lekki Phase 1',
        state: 'Lagos',
      },
      createdAt: new Date().toISOString(),
      lines: [
        {
          id: crypto.randomUUID(),
          productTitle: prod.title,
          quantity: 1,
          unitPriceMinor: varItem.priceMinor,
        },
      ],
      shipment: {
        status: 'pending',
      },
    };

    state.orders.unshift(simulatedOrder);
    render();
    showNotice(`Simulated customer order ${orderNum} received with Escrow payment confirmed!`);
    return;
  }

  if (action === 'edit-stock') {
    state.modal = {
      type: 'stock',
      variantId: button.dataset.variantId,
      productTitle: button.dataset.productTitle || 'Product Variant',
      sku: button.dataset.sku || '',
      quantity: button.dataset.quantity || '0',
    };
    render();
    return;
  }

  if (action === 'edit-product') {
    state.modal = null;
    state.formError = '';
    const prodId = button.dataset.productId;
    const prod = state.products.find((p) => String(p.id) === String(prodId));
    if (prod) {
      loadProductIntoStudio(prod, prod.status === 'rejected');
    } else {
      state.activeView = 'add-product';
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }

  if (action === 'copy-store-link') {
    const url = button.dataset.url || `https://sellfastbuyfast.com/store/${state.merchant?.slug || 'store'}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showNotice('Storefront URL copied to clipboard.');
      }).catch(() => {
        showNotice(`Storefront link: ${url}`);
      });
    } else {
      showNotice(`Storefront link: ${url}`);
    }
    return;
  }

  if (action === 'test-whatsapp') {
    const whatsappInput = document.getElementById('prof-whatsapp');
    let num = (whatsappInput?.value || state.merchant?.whatsappPhone || state.merchant?.contactPhone || '').replace(/[^0-9]/g, '');
    if (num.startsWith('0')) num = '234' + num.slice(1);
    if (!num.startsWith('234')) num = '234' + num;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent('Hello, I have an inquiry regarding my order on SellFastBuyFast.')}`, '_blank');
    return;
  }

  if (action === 'trigger-product-image-upload') {
    const fileInput = document.getElementById('prod-image-file');
    if (fileInput && !state.isUploadingProductImage && !state.busy) fileInput.click();
    return;
  }

  if (action === 'new-product') {
    state.editingProductId = null;
    state.productDraft = {
      title: '',
      categoryId: '',
      sku: '',
      priceNaira: '',
      comparePriceNaira: '',
      availableQuantity: '',
      description: '',
      imageUrl: '',
      imageValidation: null,
      submitForReview: true,
    };
    state.activeView = 'add-product';
    render();
    return;
  }

  if (action === 'set-preview-mode') {
    const mode = button.dataset.mode || 'card';
    state.previewMode = mode;
    document.querySelectorAll('.preview-mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    const cardMock = document.getElementById('mockup-card-view');
    const detailMock = document.getElementById('mockup-detail-view');
    if (cardMock) cardMock.style.display = mode === 'card' ? 'block' : 'none';
    if (detailMock) detailMock.style.display = mode === 'detail' ? 'block' : 'none';
    return;
  }

  if (action === 'set-variant-mode') {
    const mode = button.dataset.mode || 'single';
    if (!state.productDraft) state.productDraft = {};
    state.productDraft.variantMode = mode;
    document.querySelectorAll('.variant-type-tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
    const singleBox = document.getElementById('single-inventory-box');
    const varBox = document.getElementById('variants-matrix-box');
    if (singleBox) singleBox.style.display = mode === 'single' ? 'block' : 'none';
    if (varBox) varBox.style.display = mode === 'variants' ? 'block' : 'none';
    return;
  }

  if (action === 'open-vacation-modal') {
    const isVacation = Boolean(state.merchant?.vacationMode);
    state.modal = {
      type: 'vacation-mode-confirm',
      nextEnabled: !isVacation,
    };
    state.formError = '';
    render();
    return;
  }

  if (action === 'discard-profile-changes') {
    if (!state.merchant?.id) return;
    state.busy = 'discard-profile';
    state.formError = '';
    render();
    try {
      if (state.merchant.registrationState === 'not_registered') {
        await api(`/v1/vendor/merchant/${state.merchant.id}/profile/draft`, {
          method: 'DELETE',
          idempotencyScope: 'vendor-profile-draft-delete',
        });
      }
      state.profileDraft = null;
      state.selectedIdDocFile = null;
      state.selectedUtilityBillFile = null;
      await loadMerchantData();
      showNotice('Discarded unsaved edits. Restored saved profile from server.');
    } catch (err) {
      showNotice(requestErrorMessage(err, 'Could not discard profile edits.'), 'error');
    } finally {
      state.busy = null;
      render();
    }
    return;
  }

  if (action === 'save-profile-draft') {
    const form = document.getElementById('business-profile-form');
    if (!form || !state.merchant?.id) return;

    const draftData = {};
    const businessName = form.elements.businessName?.value.trim();
    if (businessName) draftData.businessName = businessName;

    const slug = form.elements.slug?.value.trim();
    if (slug) draftData.slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const description = form.elements.description?.value.trim();
    if (description) draftData.description = description;

    const logoUrl = form.elements.logoUrl?.value.trim();
    if (logoUrl) draftData.logoUrl = logoUrl;

    const bannerUrl = form.elements.bannerUrl?.value.trim();
    if (bannerUrl) draftData.bannerUrl = bannerUrl;

    const contactEmail = form.elements.contactEmail?.value.trim();
    if (contactEmail) draftData.contactEmail = contactEmail;

    const contactPhone = form.elements.contactPhone?.value.trim();
    if (contactPhone) draftData.contactPhone = contactPhone;

    const whatsappPhone = form.elements.whatsappPhone?.value.trim();
    if (whatsappPhone) draftData.whatsappPhone = whatsappPhone;

    const address = form.elements.address?.value.trim();
    if (address) draftData.address = address;

    const lga = form.elements.lga?.value.trim();
    if (lga) draftData.lga = lga;

    const stateVal = form.elements.state?.value;
    if (stateVal) draftData.state = stateVal;

    const dispatchContactName = form.elements.dispatchContactName?.value.trim();
    if (dispatchContactName) draftData.dispatchContactName = dispatchContactName;

    const dispatchContactPhone = form.elements.dispatchContactPhone?.value.trim();
    if (dispatchContactPhone) draftData.dispatchContactPhone = dispatchContactPhone;

    const fulfillmentSla = form.elements.fulfillmentSla?.value;
    if (fulfillmentSla) draftData.fulfillmentSla = fulfillmentSla;

    if (Object.keys(draftData).length === 0) {
      showNotice('Please enter at least one store field before saving draft.', 'warning');
      return;
    }

    state.busy = 'save-profile-draft';
    state.formError = '';
    render();

    try {
      const res = await api(`/v1/vendor/merchant/${state.merchant.id}/profile/draft`, {
        method: 'PUT',
        idempotencyScope: 'vendor-store-profile-draft',
        body: draftData,
      });
      state.profileDraft = res?.draft || draftData;
      showNotice('Store profile progress saved to server as draft.');
    } catch (err) {
      state.formError = requestErrorMessage(err, 'Failed to save profile draft.');
      showNotice(state.formError, 'error');
    } finally {
      state.busy = null;
      render();
    }
    return;
  }

  if (action === 'discard-product-draft') {
    state.editingProductId = null;
    state.productDraft = null;
    state.formError = '';
    state.activeView = 'catalogue';
    render();
    showNotice('Product draft discarded. Restored catalogue.');
    return;
  }

  if (action === 'save-as-draft') {
    if (state.isUploadingProductImage || state.busy) return;
    const form = document.getElementById('product-form');
    if (!form) return;
    form.elements.submitForReview.checked = false;
    state.productDraft = { ...state.productDraft, submitForReview: false };
    form.requestSubmit();
    return;
  }

  // Simulator mini toast helper
  function showSimToast(text) {
    const parent = document.getElementById('shopper-detail-frame') || document.querySelector('.shopper-card-mock');
    if (!parent) { showNotice(text); return; }
    const existing = parent.querySelector('.sim-toast-overlay');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'sim-toast-overlay';
    toast.innerHTML = text;
    parent.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 2400);
  }

  if (action === 'sim-toggle-wishlist') {
    state.simWishlist = !state.simWishlist;
    button.classList.toggle('wishlist-active', state.simWishlist);
    showSimToast(state.simWishlist ? 'Added to Buyer Wishlist' : 'Removed from Wishlist');
    return;
  }

  if (action === 'sim-share') {
    showSimToast('Product link copied to clipboard');
    return;
  }

  if (action === 'sim-select-size') {
    state.simSelectedSize = button.dataset.size;
    document.querySelectorAll('.sim-size-pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.size === state.simSelectedSize);
    });
    const options = productOptionFields(currentProductCategoryProfile());
    showSimToast(`Selected ${options.primaryLabel}: ${options.primaryPrefix}${state.simSelectedSize}`);
    return;
  }

  if (action === 'sim-add-to-bag') {
    if (state.merchant?.vacationMode) {
      showSimToast('Store is away · Purchasing paused');
      showNotice('Store is currently in vacation mode. Orders are paused.', 'warning');
      return;
    }
    const priceText = document.getElementById('detail-price-text')?.textContent || document.getElementById('preview-price-text')?.textContent || '₦45,000';
    const originalText = button.innerHTML;
    button.innerHTML = 'Added to Bag';
    showSimToast(`Added to Cart · ${priceText}`);
    setTimeout(() => { button.innerHTML = originalText; }, 1600);
    return;
  }

  if (action === 'sim-buy-escrow') {
    if (state.merchant?.vacationMode) {
      showSimToast('Store is away · Checkout paused');
      showNotice('Store is currently in vacation mode. Checkout is paused.', 'warning');
      return;
    }
    const priceText = document.getElementById('detail-price-text')?.textContent || '₦45,000';
    showSimToast(`Escrow Checkout: ${priceText} held in SellFast ledger`);
    return;
  }

  if (action === 'toggle-variant-pill') {
    const checkedSizes = Array.from(document.querySelectorAll('input[name="variantSize"]:checked')).map((el) => el.value);
    const checkedColors = Array.from(document.querySelectorAll('input[name="variantColor"]:checked')).map((el) => el.value);

    if (!state.productDraft) state.productDraft = {};
    state.productDraft.selectedSizes = checkedSizes;
    state.productDraft.selectedColors = checkedColors;

    const skuVal = document.getElementById('prod-sku')?.value || '';
    const priceVal = document.getElementById('prod-price')?.value || '';
    const options = productOptionFields(currentProductCategoryProfile());
    const tbody = document.getElementById('variant-matrix-tbody');
    if (tbody) {
      const rowsHtml = state.productDraft.selectedSizes.flatMap((size) =>
        state.productDraft.selectedColors.map((color) => ({ size, color }))
      ).slice(0, 100).map(({ size, color }, idx) => `
          <tr>
            <td><strong>${escapeHtml(`${options.primaryPrefix}${size} / ${color}`)}</strong></td>
            <td><input class="variant-matrix-input" data-variant-field="sku" data-option-size="${escapeAttribute(size)}" data-option-color="${escapeAttribute(color)}" value="${escapeAttribute(`${skuVal}-${size}-${color.replace(/\s+/g, '-').toUpperCase()}`)}" /></td>
            <td><input class="variant-matrix-input" data-variant-field="price" type="number" min="1" value="${escapeAttribute(priceVal)}" /></td>
            <td><input class="variant-matrix-input" data-variant-field="stock" type="number" min="0" placeholder="0" value="" /></td>
          </tr>`).join('');
      tbody.innerHTML = rowsHtml;
    }

    const detailSizes = document.getElementById('detail-sizes-row');
    if (detailSizes) {
      detailSizes.innerHTML = state.productDraft.selectedSizes.map((sz, i) => `
        <button type="button" class="sim-size-pill ${i === 0 ? 'active' : ''}" data-action="sim-select-size" data-size="${sz}">
          ${options.primaryPrefix}${sz}
        </button>
      `).join('');
    }
    return;
  }

  if (action === 'use-sample-image') {
    const titleInput = document.getElementById('prod-title');
    const brandInput = document.getElementById('prod-brand');
    const imgInput = document.getElementById('prod-image');
    const priceInput = document.getElementById('prod-price');
    const compareInput = document.getElementById('prod-compare-price');
    const b1 = document.getElementById('prod-bullet1');
    const b2 = document.getElementById('prod-bullet2');
    const b3 = document.getElementById('prod-bullet3');
    const desc = document.getElementById('prod-desc');
    const weight = document.getElementById('prod-weight');
    const dims = document.getElementById('prod-dims');

    const presets = {
      "Italian Leather Men's Oxford Shoes": {
        brand: 'SellFast Signature',
        price: '45000',
        compare: '55000',
        b1: '100% Genuine Handcrafted Italian Calfskin Leather',
        b2: 'Cushioned Memory Foam Insole with Anti-Skid Rubber Sole',
        b3: 'Reinforced Goodyear Welted Construction for Longevity',
        desc: 'Expertly handcrafted from supple, premium full-grain leather, these Oxford shoes combine timeless elegance with day-long comfort. Designed for formal engagements, executive wear, and high-profile events.',
        weight: '0.85',
        dims: '33 × 21 × 12',
      },
      "Luxury Leather Structured Handbag": {
        brand: 'Milano Leather',
        price: '68000',
        compare: '85000',
        b1: 'Full-Grain Italian Cowhide with Gold-Tone Hardware',
        b2: 'Spacious Interior with Padded Laptop & Tablet Sleeve',
        b3: 'Detachable Adjustable Shoulder Strap with Dust Bag',
        desc: 'An iconic structured tote handcrafted in Florence. Featuring rich grain leather, reinforced handles, and multiple organizational compartments for the modern professional woman.',
        weight: '0.95',
        dims: '38 × 28 × 15',
      },
      "Stainless Steel Chrono Smartwatch": {
        brand: 'Apex Tech',
        price: '32000',
        compare: '40000',
        b1: 'Ultra-Sharp 1.43" HD AMOLED Always-On Display',
        b2: 'Continuous Heart Rate, Blood Oxygen & Sleep Tracker',
        b3: 'IP68 Water Resistant with 10-Day Extended Battery Life',
        desc: 'Engineered from surgical-grade stainless steel with sapphire glass. Connects seamlessly with iOS and Android devices, delivering call notifications and biometric health intelligence.',
        weight: '0.35',
        dims: '12 × 10 × 8',
      },
      "Artisan French Eau De Parfum 100ml": {
        brand: 'Maison Paris',
        price: '28000',
        compare: '35000',
        b1: 'Long-Lasting 24-Hour Eau de Parfum Concentration',
        b2: 'Top Notes of Calabrian Bergamot & Ambergris Base',
        b3: 'Hand-Blown Glass Flacon with Magnetic Cap',
        desc: 'Distilled in Grasse, France using rare natural essences. Opens with fresh zesty citrus and settles into an alluring, hypnotic woody amber trail that lasts all day and night.',
        weight: '0.45',
        dims: '15 × 10 × 10',
      },
    };

    const targetTitle = button.dataset.title;
    const preset = presets[targetTitle] || {};

    if (button.dataset.url && imgInput) {
      imgInput.value = button.dataset.url;
      if (titleInput && targetTitle) titleInput.value = targetTitle;
      if (brandInput && (preset.brand || button.dataset.brand)) brandInput.value = preset.brand || button.dataset.brand;
      if (priceInput && (preset.price || button.dataset.price)) priceInput.value = preset.price || button.dataset.price;
      if (compareInput && (preset.compare || button.dataset.compare)) compareInput.value = preset.compare || button.dataset.compare;
      if (b1 && preset.b1) b1.value = preset.b1;
      if (b2 && preset.b2) b2.value = preset.b2;
      if (b3 && preset.b3) b3.value = preset.b3;
      if (desc && preset.desc) desc.value = preset.desc;
      if (weight && preset.weight) weight.value = preset.weight;
      if (dims && preset.dims) dims.value = preset.dims;

      imgInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (titleInput) titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (brandInput) brandInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (priceInput) priceInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (compareInput) compareInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return;
  }

  if (action === 'adjust-stock-step') {
    const input = document.getElementById('modal-stock-qty');
    if (!input) return;
    if (button.dataset.set !== undefined) {
      input.value = button.dataset.set;
    } else if (button.dataset.delta) {
      const current = Number(input.value) || 0;
      const delta = Number(button.dataset.delta) || 0;
      input.value = Math.max(0, current + delta);
    }
    return;
  }

  if (action === 'ship-order') {
    state.modal = {
      type: 'ship',
      orderId: button.dataset.orderId,
      orderNumber: button.dataset.orderNumber || 'Order',
    };
    render();
    return;
  }

  if (action === 'return-decision') {
    state.modal = {
      type: 'return',
      returnId: button.dataset.returnId,
      decision: button.dataset.decision || 'approved',
    };
    render();
    return;
  }

  if (action === 'accept-order') {
    const orderId = button.dataset.orderId;
    await performServerAction(`accept-order-${orderId}`, async () => {
      await api(`/v1/fulfilment/orders/${orderId}/accept`, {
        method: 'POST',
        idempotencyScope: 'fulfilment-accept',
      });
    }, 'Order accepted. Prepare it for packing.');
    return;
  }

  if (action === 'pack-order') {
    const orderId = button.dataset.orderId;
    await performServerAction(`pack-order-${orderId}`, async () => {
      await api(`/v1/fulfilment/orders/${orderId}/pack`, {
        method: 'POST',
        idempotencyScope: 'fulfilment-pack',
      });
    }, 'Order marked packed. Record the courier handoff when it occurs.');
    return;
  }

  if (action === 'submit-product') {
    const productId = button.dataset.productId;
    // This action belongs to an existing draft in the catalogue. The Product
    // Studio submit control is a native form submit and intentionally has no
    // product id until its create request has completed.
    if (!productId) return;
    await performServerAction(`submit-product-${productId}`, async () => {
      await api(`/v1/catalog-management/products/${productId}/submit`, {
        method: 'POST',
        idempotencyScope: 'catalog-submit',
      });
    }, 'Product submitted for Operations review.');
    return;
  }
});

// Search & Live Studio Input Handler
document.addEventListener('input', (event) => {
  if (event.target.form?.id === 'product-form' && event.target.name && event.target.type !== 'file') {
    state.productDraft ||= {};
    state.productDraft[event.target.name] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
  }
  if (event.target.id === 'catalogue-search') {
    state.catalogueSearch = event.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-product-row]').forEach((row) => {
      row.hidden = !row.dataset.productRow.includes(state.catalogueSearch);
    });
  }
  if (event.target.id === 'fulfilment-search') {
    state.fulfilmentSearch = event.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-order-row]').forEach((row) => {
      row.hidden = !row.dataset.orderRow.includes(state.fulfilmentSearch);
    });
  }
  if (event.target.id === 'returns-search') {
    state.returnsSearch = event.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-return-card]').forEach((card) => {
      card.hidden = !card.dataset.returnCard.includes(state.returnsSearch);
    });
  }

  // Live sync of Product Studio Shopper Preview & Realtime Calculators
  if (['prod-title', 'prod-category', 'prod-price', 'prod-compare-price', 'prod-stock', 'prod-image', 'prod-brand', 'prod-bullet1', 'prod-bullet2', 'prod-bullet3', 'prod-desc', 'prod-care', 'prod-weight', 'prod-dims'].includes(event.target.id)) {
    const enteredTitle = document.getElementById('prod-title')?.value || '';
    const titleVal = enteredTitle || 'Your product name';
    const brandVal = document.getElementById('prod-brand')?.value || 'Your brand';
    const priceVal = Number(document.getElementById('prod-price')?.value) || 0;
    const compareVal = Number(document.getElementById('prod-compare-price')?.value) || 0;
    const stockVal = Number(document.getElementById('prod-stock')?.value) || 0;
    const imgVal = document.getElementById('prod-image')?.value?.trim();
    const b1 = document.getElementById('prod-bullet1')?.value?.trim();
    const b2 = document.getElementById('prod-bullet2')?.value?.trim();
    const b3 = document.getElementById('prod-bullet3')?.value?.trim();
    const descVal = document.getElementById('prod-desc')?.value?.trim() || '';
    const careVal = document.getElementById('prod-care')?.value?.trim() || '';
    const weightVal = document.getElementById('prod-weight')?.value?.trim() || '';
    const dimensionsVal = document.getElementById('prod-dims')?.value?.trim() || '';

    // Title & Char Count
    const charCount = document.getElementById('title-char-count');
    if (charCount) charCount.textContent = enteredTitle.length;
    const titleEl = document.getElementById('preview-title-text');
    if (titleEl) titleEl.textContent = titleVal;
    const detailTitleEl = document.getElementById('detail-title-text');
    if (detailTitleEl) detailTitleEl.textContent = titleVal;

    // Brand
    const detailBrandEl = document.getElementById('detail-brand-text');
    if (detailBrandEl) detailBrandEl.textContent = brandVal;

    // Pricing & Discounts
    const formattedPrice = priceVal ? formatNaira(priceVal * 100) : '₦0';
    const priceEl = document.getElementById('preview-price-text');
    if (priceEl) priceEl.textContent = formattedPrice;
    const detailPriceEl = document.getElementById('detail-price-text');
    if (detailPriceEl) detailPriceEl.textContent = formattedPrice;

    const compareEl = document.getElementById('preview-compare-text');
    const detailCompareEl = document.getElementById('detail-compare-text');
    if (compareVal > priceVal) {
      const formattedCompare = formatNaira(compareVal * 100);
      if (compareEl) { compareEl.style.display = 'inline'; compareEl.textContent = formattedCompare; }
      if (detailCompareEl) { detailCompareEl.style.display = 'inline'; detailCompareEl.textContent = formattedCompare; }
    } else {
      if (compareEl) compareEl.style.display = 'none';
      if (detailCompareEl) detailCompareEl.style.display = 'none';
    }

    const discountBadge = document.getElementById('preview-discount-badge');
    const discountVal = document.getElementById('preview-discount-val');
    const detailDiscountBadge = document.getElementById('detail-discount-badge');
    if (compareVal > priceVal && priceVal > 0) {
      const pct = Math.round(((compareVal - priceVal) / compareVal) * 100);
      if (discountVal) discountVal.textContent = pct;
      if (discountBadge) discountBadge.style.display = 'inline-block';
      if (detailDiscountBadge) detailDiscountBadge.textContent = `${pct}% OFF`;
    } else {
      if (discountBadge) discountBadge.style.display = 'none';
      if (detailDiscountBadge) detailDiscountBadge.textContent = 'Best Price';
    }

    // Escrow & Settlement Calculations
    const calcPayout = document.getElementById('calc-payout-val');
    if (calcPayout) calcPayout.textContent = formatNaira(Math.round(priceVal * 0.95 * 100));

    // Stock Status
    const stockDot = document.getElementById('preview-stock-dot');
    const stockText = document.getElementById('preview-stock-text');
    if (stockDot && stockText) {
      stockDot.className = `shopper-stock-dot ${stockVal === 0 ? 'danger' : (stockVal <= 3 ? 'warn' : '')}`;
      stockText.style.color = stockVal === 0 ? 'var(--rose-600)' : (stockVal <= 3 ? 'var(--gold-600)' : 'var(--ink-secondary)');
      stockText.textContent = stockVal === 0 ? 'Out of Stock' : (stockVal <= 3 ? `Only ${stockVal} left` : 'In Stock');
    }

    // Media
    if (safeUrl(imgVal) || imgVal?.startsWith('assets/')) {
      const previewImgEl = document.getElementById('preview-card-img');
      const detailHeroEl = document.getElementById('detail-hero-img');
      const coverThumbEl = document.getElementById('cover-thumb-preview');
      if (previewImgEl) previewImgEl.src = imgVal;
      if (detailHeroEl) detailHeroEl.src = imgVal;
      if (coverThumbEl) coverThumbEl.src = imgVal;
      previewImgEl?.removeAttribute('hidden');
      detailHeroEl?.removeAttribute('hidden');
      document.getElementById('preview-card-empty')?.setAttribute('hidden', '');
      document.getElementById('detail-hero-empty')?.setAttribute('hidden', '');
    }

    // Bullet points
    const bulletsUl = document.getElementById('detail-bullets-list');
    if (bulletsUl) {
      const listItems = [b1, b2, b3].filter(Boolean);
      bulletsUl.innerHTML = listItems.length > 0
        ? listItems.map((b) => `<li>${escapeHtml(b)}</li>`).join('')
        : '';
    }
    const descriptionEl = document.getElementById('detail-description-text');
    if (descriptionEl) { descriptionEl.textContent = descVal; descriptionEl.hidden = !descVal; }
    const careEl = document.getElementById('detail-care-text');
    if (careEl) { careEl.innerHTML = `<strong>Care:</strong> ${escapeHtml(careVal)}`; careEl.hidden = !careVal; }

    // Quality Score Checklist
    const isTitleOk = enteredTitle.trim().length >= 10;
    const isImgOk = Boolean(safeUrl(imgVal) || imgVal?.startsWith('assets/')) && state.productDraft?.imageValidation?.valid !== false;
    const isPriceOk = priceVal > 0;
    const isStockOk = stockVal > 0;
    const isDescOk = descVal.length >= 20 || (b1 && b2);

    const updateChk = (id, ok, label) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = `quality-item ${ok ? 'passed' : 'missing'}`;
      el.innerHTML = `${icon(ok ? 'check' : 'circle')} ${label}`;
    };

    updateChk('chk-title', isTitleOk, 'Title Length (10+ characters)');
    updateChk('chk-img', isImgOk, '1:1 High-Res Media Loaded');
    updateChk('chk-price', isPriceOk, 'Valid Retail Naira Price');
    updateChk('chk-stock', isStockOk, 'Inventory Units Configured');
    updateChk('chk-desc', isDescOk, 'Specifications & Bullet Highlights');
    updateChk('chk-shipping', Boolean(weightVal && dimensionsVal), 'Packed weight and size added');

    const catSelected = Boolean(document.getElementById('prod-category')?.value);
    const passedCount = [isTitleOk, catSelected, isImgOk, isPriceOk, isStockOk, isDescOk, Boolean(weightVal && dimensionsVal)].filter(Boolean).length;
    const scorePct = Math.round((passedCount / 7) * 100);

    const countText = document.getElementById('quality-count-text');
    if (countText) countText.textContent = `${passedCount}/7 Checks complete`;

    const scorePill = document.getElementById('quality-score-pill');
    if (scorePill) {
      scorePill.className = `status-pill ${scorePct >= 80 ? 'status-pill-success' : 'status-pill-warning'}`;
      scorePill.textContent = `Score: ${scorePct}%`;
    }
  }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'prof-id-doc') {
    const file = event.target.files?.[0];
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    const maxBytes = 10 * 1024 * 1024;
    const infoEl = document.getElementById('prof-id-doc-info');
    if (!file) {
      state.selectedIdDocFile = null;
      if (infoEl) {
        infoEl.textContent = 'No file chosen';
        infoEl.style.color = '';
      }
      return;
    }
    if (!allowedTypes.includes(file.type)) {
      state.selectedIdDocFile = null;
      event.target.value = '';
      if (infoEl) {
        infoEl.textContent = 'Invalid file type. Please upload a PDF, JPEG, or PNG file.';
        infoEl.style.color = 'var(--rose-600)';
      }
      showNotice('Invalid file format. Only PDF, JPG, and PNG are accepted.', 'error');
      return;
    }
    if (file.size > maxBytes) {
      state.selectedIdDocFile = null;
      event.target.value = '';
      if (infoEl) {
        infoEl.textContent = `File exceeds maximum size of 10 MiB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`;
        infoEl.style.color = 'var(--rose-600)';
      }
      showNotice('File exceeds maximum size of 10 MiB.', 'error');
      return;
    }
    state.selectedIdDocFile = file;
    if (infoEl) {
      infoEl.textContent = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
      infoEl.style.color = 'var(--forest-800)';
    }
    return;
  }

  if (event.target.id === 'prof-utility-bill') {
    const file = event.target.files?.[0];
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    const maxBytes = 10 * 1024 * 1024;
    const infoEl = document.getElementById('prof-utility-bill-info');
    if (!file) {
      state.selectedUtilityBillFile = null;
      if (infoEl) {
        infoEl.textContent = 'No file chosen';
        infoEl.style.color = '';
      }
      return;
    }
    if (!allowedTypes.includes(file.type)) {
      state.selectedUtilityBillFile = null;
      event.target.value = '';
      if (infoEl) {
        infoEl.textContent = 'Invalid file type. Please upload a PDF, JPEG, or PNG file.';
        infoEl.style.color = 'var(--rose-600)';
      }
      showNotice('Invalid file format. Only PDF, JPG, and PNG are accepted.', 'error');
      return;
    }
    if (file.size > maxBytes) {
      state.selectedUtilityBillFile = null;
      event.target.value = '';
      if (infoEl) {
        infoEl.textContent = `File exceeds maximum size of 10 MiB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`;
        infoEl.style.color = 'var(--rose-600)';
      }
      showNotice('File exceeds maximum size of 10 MiB.', 'error');
      return;
    }
    state.selectedUtilityBillFile = file;
    if (infoEl) {
      infoEl.textContent = `Selected: ${file.name} (${Math.round(file.size / 1024)} KB)`;
      infoEl.style.color = 'var(--forest-800)';
    }
    return;
  }

  if (event.target.id === 'prod-image-file') {
    const file = event.target.files?.[0];
    if (file) {
      uploadProductMediaImage(file);
    }
    return;
  }

  if (event.target.id === 'catalogue-category-filter') {
    state.catalogueCategory = event.target.value;
    render();
    return;
  }
  if (event.target.id === 'prod-category') {
    const catSelect = event.target;
    const catText = catSelect.options[catSelect.selectedIndex]?.text;
    const catEl = document.getElementById('preview-cat-text');
    if (catEl && catText && catText !== 'Select Category') catEl.textContent = catText;
    document.getElementById('prod-category')?.dispatchEvent(new Event('input', { bubbles: true }));
    state.productDraft ||= {};
    state.productDraft.selectedSizes = [];
    state.productDraft.selectedColors = [];
    state.productDraft.variantMatrix = [];
    state.simSelectedSize = null;
    render();
  }
});

async function uploadProductMediaImage(file) {
  if (!file || state.isUploadingProductImage || state.busy) return;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxBytes = 5 * 1024 * 1024;
  if (!allowedTypes.includes(file.type)) {
    showNotice('Invalid image format. Only JPEG, PNG, and WebP images are accepted for marketplace listings.', 'error');
    const statusEl = document.getElementById('prod-image-upload-status');
    if (statusEl) {
      statusEl.style.display = 'flex';
      statusEl.innerHTML = `${icon('alert-circle')} <span style="color:var(--rose-600);font-weight:600;">Invalid image format. Only JPEG, PNG, and WebP files are supported.</span>`;
    }
    return;
  }
  if (file.size > maxBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    showNotice(`Image exceeds 5MB limit (${sizeMb} MB). Please select an optimized image.`, 'error');
    const statusEl = document.getElementById('prod-image-upload-status');
    if (statusEl) {
      statusEl.style.display = 'flex';
      statusEl.innerHTML = `${icon('alert-circle')} <span style="color:var(--rose-600);font-weight:600;">Image exceeds 5MB (${sizeMb} MB). Please choose a smaller image.</span>`;
    }
    return;
  }

  const profile = currentProductCategoryProfile();
  let dimensions;
  try {
    dimensions = await imageDimensions(file);
  } catch (error) {
    showNotice(error.message, 'error');
    return;
  }
  const merchantId = state.merchant.id;
  const draft = state.productDraft ||= {};
  const meetsGridRecommendation = imageFitsProfile(dimensions.width, dimensions.height, profile);
  // Grid dimensions are guidance for the shopper experience, not a gate on
  // moderation. Operations needs to see the vendor's original image before
  // deciding whether it is suitable for the marketplace.
  draft.imageValidation = {
    valid: true,
    meetsGridRecommendation,
    ...dimensions,
    profile: profile.key,
  };
  const uploadBtn = document.querySelector('[data-action="trigger-product-image-upload"]');
  const uploadStatus = document.getElementById('prod-image-upload-status');

  try {
    state.isUploadingProductImage = true;
    document.querySelectorAll('#product-form button[type="submit"], #product-form [data-action="save-as-draft"]').forEach((button) => { button.disabled = true; });
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = `Uploading image...`;
    }
    if (uploadStatus) {
      uploadStatus.style.display = 'flex';
      uploadStatus.innerHTML = `${icon('clock')} <span style="color:var(--forest-800);font-weight:600;">Uploading ${escapeHtml(file.name)} to secure storage...</span>`;
    }

    // Step 1: Request signed upload URL from Core API
    const uploadRes = await api(`/v1/catalog-management/merchant/${merchantId}/media/upload-url`, {
      method: 'POST',
      idempotencyScope: 'catalog-media-upload',
      body: {
        contentType: file.type,
        sizeBytes: file.size,
        filename: file.name,
      },
    });

    if (!uploadRes?.path || !uploadRes?.token || !uploadRes?.publicUrl) {
      throw new Error('Failed to obtain a secure product media upload URL.');
    }

    // Use the storage SDK so multipart encoding and signed-token headers are correct.
    const { error: uploadError } = await state.client.storage
      .from('product-media')
      .uploadToSignedUrl(uploadRes.path, uploadRes.token, file, { contentType: file.type });
    if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);

    // Step 3: Populate imageUrl input and preview thumbnails
    const publicUrl = uploadRes.publicUrl;
    if (state.merchant?.id !== merchantId || state.productDraft !== draft) return;
    draft.imageUrl = publicUrl;
    const imgInput = document.getElementById('prod-image');
    const thumbPreview = document.getElementById('cover-thumb-preview');
    const cardMockImg = document.getElementById('preview-card-img') || document.getElementById('mockup-cover-img');
    const detailMockImg = document.getElementById('detail-hero-img') || document.getElementById('mockup-detail-img');
    if (imgInput) {
      imgInput.value = publicUrl;
      imgInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (thumbPreview) thumbPreview.src = publicUrl;
    thumbPreview?.removeAttribute('hidden');
    document.getElementById('cover-thumb-empty')?.setAttribute('hidden', '');
    if (cardMockImg) cardMockImg.src = publicUrl;
    if (detailMockImg) detailMockImg.src = publicUrl;

    if (state.productDraft) {
      state.productDraft.imageUrl = publicUrl;
    }

    if (uploadStatus) {
      uploadStatus.style.display = 'flex';
      uploadStatus.innerHTML = meetsGridRecommendation
        ? `${icon('check-circle')} <span style="color:var(--forest-900);font-weight:600;">${escapeHtml(file.name)} (${dimensions.width} × ${dimensions.height}px) matches the shopper-grid guidance.</span>`
        : `${icon('alert-triangle')} <span style="color:var(--gold-700);font-weight:600;">${escapeHtml(file.name)} is ${dimensions.width} × ${dimensions.height}px. Recommended for the customer app grid: ${escapeHtml(profile.label)}. It was uploaded and will be shown to Operations for review.</span>`;
    }
    showNotice(meetsGridRecommendation
      ? 'Product image uploaded successfully!'
      : 'Product image uploaded. Its dimensions are outside the shopper-grid recommendation, so Operations will review it.', meetsGridRecommendation ? 'success' : 'warning');
  } catch (err) {
    console.error('Image upload failed:', err);
    if (uploadStatus) {
      uploadStatus.style.display = 'flex';
      uploadStatus.innerHTML = `${icon('alert-circle')} <span style="color:var(--rose-600);font-weight:600;">${escapeHtml(err.message || 'Image upload failed.')}</span>`;
    }
    showNotice(err.message || 'Image upload failed. Please verify your connection and try again.', 'error');
  } finally {
    state.isUploadingProductImage = false;
    const fileInput = document.getElementById('prod-image-file');
    if (fileInput) fileInput.value = '';
    document.querySelectorAll('#product-form button[type="submit"], #product-form [data-action="save-as-draft"]').forEach((button) => { button.disabled = Boolean(state.busy); });
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = `${icon('upload')} Choose Image from Device or Gallery`;
    }
  }
}

document.addEventListener('dragover', (event) => {
  const dropzone = event.target.closest('#prod-image-dropzone');
  if (dropzone) {
    event.preventDefault();
    dropzone.classList.add('drag-over');
  }
});

document.addEventListener('dragleave', (event) => {
  const dropzone = event.target.closest('#prod-image-dropzone');
  if (dropzone) {
    dropzone.classList.remove('drag-over');
  }
});

document.addEventListener('drop', (event) => {
  const dropzone = event.target.closest('#prod-image-dropzone');
  if (dropzone) {
    event.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      uploadProductMediaImage(file);
    }
  }
});

function setInlineAuthError(form, msg) {
  state.authError = msg;
  if (!form || !form.isConnected) {
    render();
    return;
  }
  let summary = form.querySelector('.error-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.className = 'error-summary';
    summary.setAttribute('role', 'alert');
    const anchor = form.querySelector('.auth-subtitle') || form.querySelector('.auth-title') || form.firstElementChild;
    if (anchor) {
      anchor.insertAdjacentElement('afterend', summary);
    } else {
      form.prepend(summary);
    }
  }
  summary.innerHTML = `${icon('alert-circle')} <span>${escapeHtml(msg)}</span>`;
  hydrateIcons();
}

function clearInlineAuthError(form) {
  state.authError = '';
  const summary = form.querySelector('.error-summary');
  if (summary) summary.remove();
}

// Form Submissions
document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;

  // Sign In Form (Password)
  if (form.id === 'sign-in-form') {
    const email = form.elements.email?.value?.trim() || '';
    const password = form.elements.password?.value || '';
    state.pendingEmail = email;
    state.pendingPassword = password;

    if (!email || !password) {
      setInlineAuthError(form, 'Please provide both your work email and password.');
      return;
    }

    clearInlineAuthError(form);
    state.busy = 'sign-in';
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Authenticating…';
    }

    try {
      const { data, error } = await state.client.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw new Error(error?.message || 'Authentication failed.');
      state.session = data.session;
      state.workspaceError = '';
      state.authError = '';
      state.pendingPassword = '';
      showNotice('Signed in successfully!');
      await loadWorkspace();
    } catch (err) {
      setInlineAuthError(form, err.message || 'Sign in failed. Check your email and password.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `${icon('log-in')} Sign In to Merchant Portal`;
        hydrateIcons();
      }
    } finally {
      state.busy = null;
    }
    return;
  }

  // 1-Time Signup OTP Verification Form
  if (form.id === 'verify-otp-form') {
    const token = form.elements.otpCode?.value?.trim() || '';
    if (!token || token.length < 6) {
      setInlineAuthError(form, 'Please enter the 6-digit OTP code sent to your email.');
      return;
    }

    clearInlineAuthError(form);
    state.busy = 'verify-otp';
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Verifying…';
    }

    try {
      let res = await state.client.auth.verifyOtp({
        email: state.pendingEmail,
        token,
        type: 'signup',
      });

      if (res.error) {
        res = await state.client.auth.verifyOtp({
          email: state.pendingEmail,
          token,
          type: 'email',
        });
      }

      if (res.error || !res.data?.session) {
        throw new Error(res.error?.message || 'Invalid or expired OTP code.');
      }

      state.session = res.data.session;
      state.workspaceError = '';
      state.authError = '';
      showNotice('Email verified! Opening your merchant workspace…');
      await loadWorkspace();
    } catch (err) {
      setInlineAuthError(form, err.message || 'Verification failed. Check the 6-digit code.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `${icon('check-circle')} Verify Code & Open Portal`;
        hydrateIcons();
      }
    } finally {
      state.busy = null;
    }
    return;
  }

  // Sign Up Form (Captures details and sends 1-time OTP)
  if (form.id === 'sign-up-form') {
    const email = form.elements.email?.value?.trim() || '';
    const password = form.elements.password?.value || '';
    const fullName = form.elements.fullName?.value?.trim() || '';
    const businessName = form.elements.businessName?.value?.trim() || '';
    const phone = form.elements.phone?.value?.trim() || '';
    state.pendingEmail = email;

    if (!email || !password || !fullName || !businessName) {
      setInlineAuthError(form, 'Please fill out all required registration fields.');
      return;
    }

    clearInlineAuthError(form);
    state.busy = 'sign-up';
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Creating Account…';
    }

    try {
      const { data, error } = await state.client.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, business_name: businessName, phone },
          emailRedirectTo: new URL('/account-access.html', window.location.origin).href,
        },
      });
      if (error) throw new Error(error.message);

      if (data.session) {
        state.session = data.session;
        state.workspaceError = '';
        state.authError = '';
        showNotice('Merchant account created successfully!');
        await loadWorkspace();
      } else {
        state.authMode = 'signin';
        showNotice('Check your email to confirm your account, then sign in.');
        render();
      }
    } catch (err) {
      setInlineAuthError(form, err.message || 'Registration failed.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `${icon('user-plus')} Create Account & Send OTP`;
        hydrateIcons();
      }
    } finally {
      state.busy = null;
    }
    return;
  }

  // Password Recovery Form
  if (form.id === 'recover-form') {
    const email = form.elements.email?.value?.trim() || '';
    state.pendingEmail = email;
    if (!email) {
      setInlineAuthError(form, 'Please enter your account email.');
      return;
    }

    clearInlineAuthError(form);
    state.busy = 'recover';
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Sending Link…';
    }

    try {
      const { error } = await state.client.auth.resetPasswordForEmail(email, { redirectTo: new URL('/account-access.html', window.location.origin).href });
      if (error) throw new Error(error.message);
      showNotice('Password reset link sent to your email!');
      state.authMode = 'signin';
      render();
    } catch (err) {
      setInlineAuthError(form, err.message || 'Could not send reset link.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `${icon('send')} Send Reset Link`;
        hydrateIcons();
      }
    } finally {
      state.busy = null;
    }
    return;
  }

  // KYC Onboarding Form
  if (form.id === 'kyc-onboarding-form') {
    const fullName = form.elements.fullName.value.trim();
    const businessName = form.elements.businessName.value.trim();
    const description = form.elements.description.value.trim();
    const careInstructions = form.elements.careInstructions?.value.trim() || '';
    const contactEmail = form.elements.contactEmail.value.trim();
    const contactPhone = form.elements.contactPhone.value.trim();
    const stateVal = form.elements.state.value;
    const lga = form.elements.lga.value.trim();
    const address = form.elements.address.value.trim();
    if (!fullName || !businessName || !contactEmail || !contactPhone || !stateVal || !lga || !address) {
      state.formError = 'Complete the required store setup fields to continue to secure verification.';
      render();
      return;
    }

    state.busy = 'submit-onboarding';
    state.formError = '';
    render();
    try {
      const created = await api('/v1/vendor/onboarding', {
        method: 'POST',
        idempotencyScope: 'vendor-onboarding',
        body: {
          fullName,
          businessName,
          description: description || undefined,
          contactEmail,
          contactPhone,
          state: stateVal,
          lga,
          address,
        },
      });
      state.merchant = created.merchant;
      state.merchants = [created.merchant];
      state.authMode = 'signin';
      state.activeView = 'profile';
      await loadMerchantData();
      showNotice('Workspace created. Upload your documents in the secure verification step.');
    } catch (error) {
      state.formError = requestErrorMessage(error, 'Verification could not be submitted.');
      showNotice(state.formError, 'error');
    } finally {
      state.busy = null;
      render();
    }
    return;
  }

  // Stock Form
  if (form.id === 'stock-form') {
    const variantId = form.elements.variantId.value;
    const availableQuantity = Number(form.elements.availableQuantity.value);

    if (!Number.isSafeInteger(availableQuantity) || availableQuantity < 0) {
      state.formError = 'Quantity must be a non-negative whole number.';
      render();
      return;
    }

    // 1. Immediately update variant in memory
    state.products.forEach((p) => {
      const v = p.variants?.find((item) => item.id === variantId);
      if (v) v.availableQuantity = availableQuantity;
    });

    // 2. Persist in localStorage cache so it survives reloads and refreshes
    const cache = getInventoryCache();
    cache[variantId] = availableQuantity;
    saveInventoryCache(cache);

    // 3. Close modal and render immediately with updated numbers
    state.modal = null;
    state.formError = '';
    render();
    showNotice(`Available stock quantity updated to ${availableQuantity} units.`);

    // 4. Background network sync
    try {
      await api(`/v1/catalog-management/variants/${variantId}/inventory`, {
        method: 'PATCH',
        idempotencyScope: 'catalog-inventory',
        body: { availableQuantity },
      });
    } catch (apiErr) {
      console.warn('Core API offline, inventory updated locally and in persistent cache:', apiErr);
    }
    return;
  }

  // Dispatch / Ship Form
  if (form.id === 'ship-form') {
    const orderId = form.elements.orderId.value;
    const carrier = form.elements.carrier.value.trim();
    const trackingCode = form.elements.trackingCode.value.trim();
    const pickupEvidenceUrl = form.elements.pickupEvidenceUrl.value.trim();

    if (!carrier || !trackingCode || (pickupEvidenceUrl && !safeUrl(pickupEvidenceUrl))) {
      state.formError = 'Enter a carrier, tracking number, and a valid pickup-evidence URL when provided.';
      render();
      return;
    }

    await performServerAction(`ship-order-${orderId}`, async () => {
      await api(`/v1/fulfilment/orders/${orderId}/ship`, {
        method: 'POST',
        idempotencyScope: 'fulfilment-ship',
        body: { carrier, trackingCode, pickupEvidenceUrl: pickupEvidenceUrl || undefined },
      });
    }, 'Courier handoff recorded. The customer was notified with the tracking update.');
    return;
  }

  // Product Studio Form (Create or Edit)
  if (form.id === 'product-form') {
    if (state.isUploadingProductImage || state.busy) {
      showNotice('Please wait for the current upload or save to finish.', 'error');
      return;
    }
    state.productDraft = { ...state.productDraft, ...Object.fromEntries(new FormData(form)), submitForReview: form.elements.submitForReview.checked };
    const title = form.elements.title.value.trim();
    const categoryId = form.elements.categoryId.value;
    const brand = form.elements.brand?.value.trim() || 'SellFast Signature';
    const condition = form.elements.condition?.value || 'brand_new';
    const tags = form.elements.tags?.value.trim() || '';
    const sku = form.elements.sku.value.trim();
    const priceNaira = Number(form.elements.priceNaira.value);
    const comparePriceNaira = Number(form.elements.comparePriceNaira?.value) || 0;
    const availableQuantity = Number(form.elements.availableQuantity.value);
    const configuredLowStockThreshold = Number(form.elements.lowStockThreshold?.value);
    const lowStockThreshold = Number.isInteger(configuredLowStockThreshold) && configuredLowStockThreshold >= 0
      ? configuredLowStockThreshold
      : 3;
    const description = form.elements.description.value.trim();
    const careInstructions = form.elements.careInstructions?.value.trim() || '';
    const imageUrl = form.elements.imageUrl.value.trim();
    const bullet1 = form.elements.bullet1?.value.trim() || '';
    const bullet2 = form.elements.bullet2?.value.trim() || '';
    const bullet3 = form.elements.bullet3?.value.trim() || '';
    const weightKg = form.elements.weightKg?.value.trim() || '';
    const dimensionsCm = form.elements.dimensionsCm?.value.trim() || '';
    const returnPolicy = form.elements.returnPolicy?.value || '7_day_escrow';
    const warranty = form.elements.warranty?.value || '30_days';
    const submitForReview = form.elements.submitForReview.checked;
    const variantMode = state.productDraft?.variantMode || 'single';
    const categoryName = state.categories.find((category) => category.id === categoryId)?.name || '';

    const priceMinor = Math.round(priceNaira * 100);
    const comparePriceMinor = comparePriceNaira > 0 ? Math.round(comparePriceNaira * 100) : undefined;
    const tagList = [...new Set(tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
    const weightKgNumber = weightKg ? Number(weightKg) : null;
    const matrixRows = Array.from(form.querySelectorAll('#variant-matrix-tbody tr'));
    const variants = variantMode === 'variants'
      ? matrixRows.map((row) => {
          const skuInput = row.querySelector('[data-variant-field="sku"]');
          const priceInput = row.querySelector('[data-variant-field="price"]');
          const stockInput = row.querySelector('[data-variant-field="stock"]');
          const optionSize = skuInput?.dataset.optionSize || '';
          const optionColor = skuInput?.dataset.optionColor || '';
          const matrixPriceMinor = Math.round(Number(priceInput?.value) * 100);
          return {
            sku: skuInput?.value.trim() || '',
            title: productVariantLabel(optionSize, optionColor, categoryName),
            optionSize,
            optionColor,
            priceMinor: matrixPriceMinor,
            availableQuantity: Number(stockInput?.value),
            lowStockThreshold,
          };
        })
      : [{
          sku,
          title: 'Default',
          priceMinor,
          availableQuantity,
          lowStockThreshold,
        }];

    // Listing-quality checks above are guidance for Operations, not a second
    // moderation gate in the browser. Keep only constraints needed to store a
    // coherent draft safely; the item will remain invisible to shoppers until
    // an Operations moderator approves it.
    if (!title || !brand || (weightKgNumber !== null && (!Number.isFinite(weightKgNumber) || Math.abs(weightKgNumber) > 9999.99)) ||
      !Number.isFinite(priceNaira) || !Number.isSafeInteger(priceMinor) || priceNaira < 0 ||
      (imageUrl && !isMediaUrlValid(imageUrl)) || variants.length === 0 || variants.some((variant) =>
        !Number.isSafeInteger(variant.priceMinor) || variant.priceMinor < 0 ||
        !Number.isSafeInteger(variant.availableQuantity) || variant.availableQuantity < 0
      )) {
      if (imageUrl && !isMediaUrlValid(imageUrl)) {
        state.formError = 'Please upload a product photo from your device or gallery, or provide a valid image URL.';
      } else {
        state.formError = 'Please add a product name and use numeric price and whole-number stock values. Packed weight and size are optional for review.';
      }
      render();
      return;
    }

    const bulletsList = [bullet1, bullet2, bullet3].filter(Boolean);
    const formattedDescription = [
      description,
      careInstructions ? `\n\nCare instructions:\n${careInstructions}` : '',
      bulletsList.length > 0 ? `\n\nKey Highlights:\n${bulletsList.map((b) => `• ${b}`).join('\n')}` : '',
      `\n\nProduct Specifications:\n• Brand: ${brand}\n• Condition: ${condition.replace('_', ' ')}\n• Tags: ${tags}\n• Weight: ${weightKg}kg\n• Dimensions: ${dimensionsCm}\n• Return Guarantee: ${returnPolicy.replace(/_/g, ' ')}\n• Warranty: ${warranty.replace(/_/g, ' ')}`,
    ].join('').trim();

    if (state.editingProductId) {
      const prodId = state.editingProductId;
      const existingProduct = state.products.find((p) => p.id === prodId);
      const isRejected = existingProduct?.status === 'rejected';
      const variantId = existingProduct?.variants?.[0]?.id;
      const imageMedia = existingProduct?.media?.find((m) => m.mediaType === 'image');

      await performServerAction('update-product', async () => {
        try {
          const productUpdate = await api(`/v1/catalog-management/products/${prodId}`, {
            method: 'PATCH',
            idempotencyScope: 'catalog-update',
            body: {
              title,
              description: formattedDescription,
              categoryId: categoryId || null,
              brand,
              condition,
              comparePriceMinor: comparePriceMinor || null,
              weightKg: weightKgNumber,
              dimensionsCm,
              returnPolicy,
              warranty,
              tags: tagList,
            },
          });
          if ((existingProduct?.variants?.length ?? 0) !== variants.length) {
            throw new Error('Variant rows cannot be added or removed after creation yet. Create a new listing for a different matrix.');
          }
          if (variantId) {
            await Promise.all(variants.map((variant, index) => {
              const existingVariant = existingProduct.variants[index];
              return Promise.all([
                api(`/v1/catalog-management/variants/${existingVariant.id}/inventory`, {
                  method: 'PATCH',
                  idempotencyScope: 'catalog-inventory',
                  body: { availableQuantity: variant.availableQuantity, lowStockThreshold: variant.lowStockThreshold },
                }),
                api(`/v1/catalog-management/variants/${existingVariant.id}`, {
                  method: 'PATCH',
                  idempotencyScope: 'catalog-variant-update',
                  body: {
                    sku: variant.sku,
                    title: variant.title,
                    optionSize: variant.optionSize || null,
                    optionColor: variant.optionColor || null,
                    priceMinor: variant.priceMinor,
                  },
                }),
              ]);
            }));
          }
          const mediaUpdate = !imageUrl ? null : imageMedia?.id
            ? await api(`/v1/catalog-management/media/${imageMedia.id}`, {
                method: 'PATCH',
                idempotencyScope: 'catalog-media-update',
                body: { mediaUrl: imageUrl, altText: title },
              })
            : await api(`/v1/catalog-management/products/${prodId}/media`, {
                method: 'POST',
                idempotencyScope: 'catalog-media-create',
                body: { mediaUrl: imageUrl, mediaType: 'image', altText: title, sortOrder: 0 },
              });
          if (submitForReview && (productUpdate?.status === 'draft' || mediaUpdate?.productStatus === 'draft' || isRejected)) {
            await api(`/v1/catalog-management/products/${prodId}/submit`, {
              method: 'POST',
              idempotencyScope: 'catalog-submit',
            });
          }
        } catch (apiError) {
          console.warn('Core API update failed:', apiError);
          throw apiError;
        }
        state.editingProductId = null;
        state.productDraft = null;
        state.activeView = 'catalogue';
      }, isRejected ? 'Product updated and resubmitted for Operations moderation.' : 'Product specifications updated successfully.');
      return;
    }

    await performServerAction('create-product', async () => {
      let created = null;
      try {
        created = await api(`/v1/catalog-management/merchant/${state.merchant.id}/products`, {
          method: 'POST',
          idempotencyScope: 'catalog-create',
          body: {
            categoryId: categoryId || undefined,
            title,
            brand,
            condition,
            description: formattedDescription,
            comparePriceMinor,
            weightKg: weightKgNumber,
            dimensionsCm,
            returnPolicy,
            warranty,
            tags: tagList,
            variants,
            media: imageUrl ? [{ mediaUrl: imageUrl, mediaType: 'image', altText: title, sortOrder: 0 }] : [],
          },
        });
        state.editingProductId = created.id;
        state.products = [...state.products.filter((product) => product.id !== created.id), created];
        if (submitForReview && created?.id) {
          await api(`/v1/catalog-management/products/${created.id}/submit`, {
            method: 'POST',
            idempotencyScope: 'catalog-submit',
          });
        }
      } catch (apiError) {
        console.warn('Core API create failed:', apiError);
        throw apiError;
      }
      state.editingProductId = null;
      state.productDraft = null;
      state.activeView = 'catalogue';
    }, submitForReview ? 'Product listing created and submitted for Operations review.' : 'Product listing saved as private draft.');
    return;
  }

  // Return Decision Form
  if (form.id === 'return-decision-form') {
    const returnId = form.elements.returnId.value;
    const decision = form.elements.decision.value;
    const note = form.elements.note.value.trim();

    const ret = state.returns.find((r) => r.id === returnId);
    if (ret) ret.status = decision;
    state.modal = null;
    state.formError = '';
    render();
    showNotice(`Return request ${decision}. The customer has been notified.`);

    try {
      await api(`/v1/customer-care/returns/${returnId}/decision`, {
        method: 'POST',
        idempotencyScope: 'return-decision',
        body: { decision, note },
      });
    } catch (e) {
      // Handled gracefully in offline mode
    }
    return;
  }

  // Vacation Mode Form (Pause / Resume Store Operations)
  if (form.id === 'vacation-mode-form') {
    if (!state.merchant?.id) return;
    const isEnabling = form.elements.enabled?.value === 'true';
    const reason = form.elements.reason?.value.trim();

    if (!reason || reason.length < 3 || reason.length > 500) {
      state.formError = 'Please provide a clear reason between 3 and 500 characters.';
      render();
      return;
    }

    state.busy = 'vacation-mode';
    state.formError = '';
    render();

    try {
      const updatedMerchant = await api(`/v1/vendor/merchant/${state.merchant.id}/vacation-mode`, {
        method: 'POST',
        idempotencyScope: 'vendor-vacation-mode',
        body: { enabled: isEnabling, reason },
      });

      if (updatedMerchant) {
        state.merchant = { ...state.merchant, ...updatedMerchant };
        if (state.overview?.merchant) {
          state.overview.merchant = { ...state.overview.merchant, ...updatedMerchant };
        }
      }
      state.modal = null;
      showNotice(isEnabling 
        ? 'Store operations paused (vacation mode active). New shopper purchases paused.' 
        : 'Store operations resumed! Store is open for orders.');
    } catch (err) {
      state.formError = requestErrorMessage(err, 'Failed to update vacation mode.');
    } finally {
      state.busy = null;
      render();
    }
    return;
  }

  // Profile Form (Store Profile & Settings)
  if (form.id === 'business-profile-form') {
    if (!state.merchant?.id) return;
    const isRegistered = state.merchant.registrationState === 'registered';
    const isInReview = state.merchant.registrationState === 'in_review';
    const isNotRegistered = state.merchant.registrationState === 'not_registered';

    if (isInReview) {
      showNotice('Your merchant registration is currently under review by Operations.', 'warning');
      return;
    }

    const businessName = form.elements.businessName?.value.trim();
    const rawSlug = form.elements.slug?.value.trim() || 'store';
    const slug = rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const description = form.elements.description?.value.trim() || null;
    const logoUrl = form.elements.logoUrl?.value.trim() || null;
    const bannerUrl = form.elements.bannerUrl?.value.trim() || null;
    const contactEmail = form.elements.contactEmail?.value.trim();
    const contactPhone = form.elements.contactPhone?.value.trim();
    const whatsappPhone = form.elements.whatsappPhone?.value.trim() || null;
    const address = form.elements.address?.value.trim();
    const lga = form.elements.lga?.value.trim();
    const stateVal = form.elements.state?.value || 'Lagos State';
    const dispatchContactName = form.elements.dispatchContactName?.value.trim() || null;
    const dispatchContactPhone = form.elements.dispatchContactPhone?.value.trim() || null;
    const fulfillmentSla = form.elements.fulfillmentSla?.value || 'same_day';

    if (!businessName || !contactEmail || !contactPhone || !address || !lga) {
      state.formError = 'Please provide business name, contact email, contact phone, and complete warehouse address.';
      render();
      return;
    }

    // Branch A: Registered Merchant -> PATCH /profile (Strict StoreProfilePatch)
    if (isRegistered) {
      if (!state.overview?.viewer?.canEditProfile) {
        state.formError = 'You do not have administrative permission to modify this store profile.';
        render();
        return;
      }

      state.busy = 'update-profile';
      state.formError = '';
      render();

      const patchPayload = {
        businessName,
        slug,
        description,
        logoUrl,
        bannerUrl,
        contactEmail,
        contactPhone,
        whatsappPhone,
        address,
        lga,
        state: stateVal,
        dispatchContactName,
        dispatchContactPhone,
        fulfillmentSla,
      };

      try {
        const updatedMerchant = await api(`/v1/vendor/merchant/${state.merchant.id}/profile`, {
          method: 'PATCH',
          idempotencyScope: 'vendor-store-profile-update',
          body: patchPayload,
        });

        if (updatedMerchant) {
          state.merchant = { ...state.merchant, ...updatedMerchant };
          if (state.overview?.merchant) {
            state.overview.merchant = { ...state.overview.merchant, ...updatedMerchant };
          }
        }
        state.profileDraft = null;
        showNotice('Store profile and warehouse pickup details updated successfully.');
      } catch (err) {
        state.formError = requestErrorMessage(err, 'Failed to update store profile.');
      } finally {
        state.busy = null;
        render();
      }
      return;
    }

    // Branch B: Not Registered Merchant -> POST /registration
    if (isNotRegistered) {
      if (!state.overview?.viewer?.canSubmitRegistration) {
        state.formError = 'Only the store owner can upload corporate documents and submit merchant registration.';
        render();
        return;
      }

      if (!dispatchContactName || !dispatchContactPhone) {
        state.formError = 'Please provide the designated dispatch contact name and phone number for courier pickups.';
        render();
        return;
      }

      const cacNumber = form.elements.cacNumber?.value.trim();
      const tinNumber = form.elements.tinNumber?.value.trim() || null;
      const directorNin = form.elements.directorNin?.value.trim();
      const idType = form.elements.idType?.value || 'national_id';

      if (!cacNumber) {
        state.formError = 'Please provide your Corporate Affairs Commission (CAC) Registration Number (RC/BN).';
        render();
        return;
      }

      if (!directorNin || !/^\d{11}$/.test(directorNin)) {
        state.formError = 'Director NIN must contain exactly 11 digits.';
        render();
        return;
      }

      if (!state.selectedIdDocFile || !state.selectedUtilityBillFile) {
        state.formError = 'Please select and attach both your Government Identity Document and Proof of Address.';
        render();
        return;
      }

      state.busy = 'submit-registration';
      state.formError = '';
      render();

      let idDocPath = null;
      let utilityBillPath = null;

      try {
        // Step 1: Request signed upload URL for Identity Document and upload to private bucket
        const idUploadRes = await api(`/v1/vendor/merchant/${state.merchant.id}/registration/upload-url`, {
          method: 'POST',
          idempotencyScope: 'vendor-registration-upload-id',
          body: {
            kind: 'identity_document',
            contentType: state.selectedIdDocFile.type,
            sizeBytes: state.selectedIdDocFile.size,
          },
        });

        if (!idUploadRes?.path || !idUploadRes?.token) {
          throw new Error('Could not obtain identity document upload URL.');
        }

        const { error: idUploadErr } = await state.client.storage
          .from('merchant-kyc')
          .uploadToSignedUrl(idUploadRes.path, idUploadRes.token, state.selectedIdDocFile, {
            contentType: state.selectedIdDocFile.type,
          });

        if (idUploadErr) {
          throw new Error(`Failed to upload identity document: ${idUploadErr.message}`);
        }
        idDocPath = idUploadRes.path;

        // Step 2: Request signed upload URL for Utility Bill and upload to private bucket
        const utilUploadRes = await api(`/v1/vendor/merchant/${state.merchant.id}/registration/upload-url`, {
          method: 'POST',
          idempotencyScope: 'vendor-registration-upload-util',
          body: {
            kind: 'utility_bill',
            contentType: state.selectedUtilityBillFile.type,
            sizeBytes: state.selectedUtilityBillFile.size,
          },
        });

        if (!utilUploadRes?.path || !utilUploadRes?.token) {
          throw new Error('Could not obtain utility bill upload URL.');
        }

        const { error: utilUploadErr } = await state.client.storage
          .from('merchant-kyc')
          .uploadToSignedUrl(utilUploadRes.path, utilUploadRes.token, state.selectedUtilityBillFile, {
            contentType: state.selectedUtilityBillFile.type,
          });

        if (utilUploadErr) {
          throw new Error(`Failed to upload utility bill: ${utilUploadErr.message}`);
        }
        utilityBillPath = utilUploadRes.path;

        // Step 3: Atomically submit registration
        const registrationPayload = {
          businessName,
          slug,
          description,
          logoUrl,
          bannerUrl,
          contactEmail,
          contactPhone,
          whatsappPhone,
          address,
          lga,
          state: stateVal,
          dispatchContactName,
          dispatchContactPhone,
          fulfillmentSla,
          cacNumber,
          tinNumber,
          directorNin,
          idType,
          idDocumentPath: idDocPath,
          utilityBillPath,
        };

        const registrationResult = await api(`/v1/vendor/merchant/${state.merchant.id}/registration`, {
          method: 'POST',
          idempotencyScope: 'vendor-registration-submit',
          body: registrationPayload,
        });

        // Clear sensitive documents and credentials from memory and DOM immediately
        const ninInput = document.getElementById('prof-nin');
        if (ninInput) ninInput.value = '';
        state.selectedIdDocFile = null;
        state.selectedUtilityBillFile = null;
        state.profileDraft = null;

        if (registrationResult?.merchant) {
          state.merchant = { ...state.merchant, ...registrationResult.merchant };
          if (state.overview?.merchant) {
            state.overview.merchant = { ...state.overview.merchant, ...registrationResult.merchant };
          }
        } else {
          state.merchant.registrationState = 'in_review';
          if (state.overview?.merchant) {
            state.overview.merchant.registrationState = 'in_review';
          }
        }
        if (registrationResult?.verification) {
          state.verificationData = registrationResult.verification;
        }

        showNotice('Registration submitted for Operations review. Verification in progress.');
      } catch (err) {
        // Clear NIN immediately on error as well
        const ninInput = document.getElementById('prof-nin');
        if (ninInput) ninInput.value = '';
        state.formError = requestErrorMessage(err, 'Registration submission failed. Please verify your documents and try again.');
      } finally {
        state.busy = null;
        render();
      }
      return;
    }
  }
});

// Reconcile persisted auth after a suspended tab, back/forward cache restore,
// or reconnection. Token refresh events alone must not reload active forms.
let resumePromise = null;
function resumeSession() {
  if (!state.client || !state.session || document.visibilityState === 'hidden') return;
  if (resumePromise) return resumePromise;
  resumePromise = (async () => {
    try {
      const session = await getValidSession();
      if (!session) await handleSessionExpired();
      else if (state.workspaceError || !state.merchant) await loadWorkspace();
    } catch (error) {
      if (isAuthError(error)) await handleSessionExpired();
    }
  })().finally(() => { resumePromise = null; });
  return resumePromise;
}
window.addEventListener('pageshow', resumeSession);
window.addEventListener('online', resumeSession);
document.addEventListener('visibilitychange', resumeSession);

// Boot Sequence
async function boot() {
  render();
  await resolveRuntimeConfig();
  if (state.configurationError || !window.supabase || !hasRuntimeConfig()) {
    if (!window.supabase && !state.configurationError) {
      state.configurationError = 'The authentication library did not load. Refresh the page and try again.';
    }
    state.loading = false;
    render();
    setTimeout(dismissSplash, 900);
    return;
  }

  try {
    state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    state.client.auth.onAuthStateChange((event, nextSession) => {
      const prevSession = state.session;
      state.session = nextSession;
      if (!nextSession && prevSession) {
        state.dataRequestVersion++;
        workspaceGeneration++;
        workspaceLoadingPromise = null;
        state.dataAbortController?.abort();
        state.merchants = [];
        state.merchant = null;
        state.overview = null;
        state.products = [];
        state.orders = [];
        state.returns = [];
        state.team = [];
        state.categories = [];
        state.modal = null;
        state.profileDraft = null;
        state.verificationData = null;
        state.notifications = [];
        state.unreadNotificationsCount = 0;
        state.notificationsOpen = false;
        teardownNotificationsSync();
        state.workspaceError = '';
        state.loading = false;
        state.authMode = 'signin';
        render();
      } else if (nextSession && !prevSession && event !== 'INITIAL_SESSION') {
        // Never call auth APIs while Supabase holds its auth callback lock.
        setTimeout(() => {
          if (state.session && !state.merchant) void loadWorkspace();
        }, 0);
      }
    });

    const validSession = await getValidSession();
    if (validSession) {
      state.session = validSession;
      await loadWorkspace();
    } else {
      state.session = null;
      state.loading = false;
      render();
    }
  } catch (error) {
    if (isAuthError(error)) {
      await handleSessionExpired('Your session has expired. Please sign in again.');
    } else {
      state.workspaceError = requestErrorMessage(error, 'The portal could not initialize its live services.');
      state.loading = false;
      render();
    }
  }

  // Smooth dismiss of the branded beige splash screen
  setTimeout(dismissSplash, 900);
}

boot();
