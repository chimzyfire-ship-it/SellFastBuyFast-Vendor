/* ==========================================================================
   SellFastBuyFast Merchant Portal — Modern World-Class Architecture
   Seamless Supabase Auth + 1-Time Signup OTP Verification + Core API Integration
   ========================================================================== */

const root = document.getElementById('portal-root');

// Runtime configuration is supplied by config.js locally, Vercel's public config endpoint, or project defaults.
const defaultFallbackConfig = {
  apiUrl: window.localStorage?.getItem('sfbf_api_url') || 'http://localhost:4000',
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
  authError: '',
  formError: '',
  productErrors: {},
  productDraft: null,
  notice: null,
  sidebarOpen: false,
  sidebarCollapsed: window.localStorage.getItem('sfbf-sidebar-collapsed') === 'true',
  showPassword: false,
  workspaceError: '',
  partialDataError: '',
  configurationError: '',
  dataRequestVersion: 0,
  dataAbortController: null,
};

const VIEW_TITLES = {
  dashboard: 'Command Center',
  catalogue: 'Catalogue & Stock',
  'add-product': 'Product Studio',
  fulfilment: 'Fulfilment Queue',
  returns: 'Returns & Disputes',
  payouts: 'Payments (deferred)',
  profile: 'Business Profile & KYC',
  team: 'Team & Staff',
};

// Helpers & Utilities
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
  if (hasRuntimeConfig()) return;
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
  constructor(message, code = 'REQUEST_FAILED') {
    super(message);
    this.code = code;
  }
}

async function api(path, options = {}) {
  const { method = 'GET', body, idempotencyScope, signal } = options;
  if (!state.client) throw new ApiError('Authentication client not initialized.', 'AUTH_UNAVAILABLE');
  
  const { data: { session } } = await state.client.auth.getSession();
  if (!session?.access_token) throw new ApiError('Your session has expired. Please sign in again.', 'UNAUTHORIZED');
  state.session = session;

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
    throw new ApiError('Backend service unreachable.', 'NETWORK_ERROR');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('The server returned an unreadable response.', 'INVALID_RESPONSE');
  }

  if (!response.ok || !payload?.success) {
    throw new ApiError(payload?.error?.message ?? 'The operation could not be completed.', payload?.error?.code);
  }

  return payload.data;
}

function showNotice(message, type = 'success') {
  state.notice = { message, type };
  render();
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => {
    state.notice = null;
    render();
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

  return `<span class="status-pill ${pillClass}">${icon(iconName)} ${escapeHtml(norm)}</span>`;
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
  }
  setTimeout(() => {
    state.splashActive = false;
    render();
  }, 500);
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

        <div class="form-group">
          <label class="form-label" for="full-name">Full Name</label>
          <div class="input-wrapper">
            <span class="input-icon-left">${icon('user')}</span>
            <input class="input has-icon-left" id="full-name" name="fullName" type="text" placeholder="e.g. Oluwaseun Adeleke" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="business-name">Store / Brand Name</label>
          <div class="input-wrapper">
            <span class="input-icon-left">${icon('store')}</span>
            <input class="input has-icon-left" id="business-name" name="businessName" type="text" placeholder="e.g. Lagos Luxury Attire" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="email">Work Email</label>
          <div class="input-wrapper">
            <span class="input-icon-left">${icon('mail')}</span>
            <input class="input has-icon-left" id="email" name="email" type="email" autocomplete="email" placeholder="vendor@business.ng" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="phone">Phone Number (+234)</label>
          <div class="input-wrapper">
            <span class="input-icon-left">${icon('phone')}</span>
            <input class="input has-icon-left" id="phone" name="phone" type="tel" placeholder="08012345678" required />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="password">Create Password</label>
          <div class="input-wrapper">
            <span class="input-icon-left">${icon('lock')}</span>
            <input class="input has-icon-left has-icon-right" id="password" name="password" type="${state.showPassword ? 'text' : 'password'}" required placeholder="Min. 8 characters" />
            <button type="button" class="input-icon-right-btn" data-action="toggle-password" aria-label="Toggle password visibility">${icon(state.showPassword ? 'eye-off' : 'eye')}</button>
          </div>
        </div>

        <label class="checkbox-row">
          <input type="checkbox" name="terms" required checked />
          <span>I agree to the <a href="#" target="_blank">Merchant Agreement</a> & policies.</span>
        </label>

        <button class="btn btn-primary btn-full" type="submit" ${state.busy === 'sign-up' ? 'disabled' : ''}>
          ${state.busy === 'sign-up' ? 'Creating Account…' : `${icon('user-plus')} Create Account & Send OTP`}
        </button>

        <div style="text-align:center;margin-top:20px;font-size:14px;color:var(--ink-muted);">
          Already registered? <button type="button" class="btn-quiet" data-action="switch-auth-mode" data-mode="signin">Sign In</button>
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
            <input class="input has-icon-left" id="email" name="email" type="email" autocomplete="email" placeholder="vendor@business.ng" required />
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
            <input class="input has-icon-left has-icon-right" id="password" name="password" type="${state.showPassword ? 'text' : 'password'}" autocomplete="current-password" placeholder="••••••••" required />
            <button type="button" class="input-icon-right-btn" data-action="toggle-password" aria-label="Toggle password visibility">${icon(state.showPassword ? 'eye-off' : 'eye')}</button>
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
                <option value="Lagos">Lagos</option>
                <option value="Abuja">Abuja (FCT)</option>
                <option value="Rivers">Rivers</option>
                <option value="Oyo">Oyo</option>
                <option value="Kano">Kano</option>
                <option value="Anambra">Anambra</option>
                <option value="Enugu">Enugu</option>
                <option value="Delta">Delta</option>
                <option value="Ogun">Ogun</option>
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

          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label" for="onboard-id-type">Director ID Type</label>
              <select class="select" id="onboard-id-type" name="idType" required>
                <option value="national_id">National Identity Card (NIN)</option>
                <option value="passport">International Passport</option>
                <option value="drivers_license">Driver's Licence (FRSC)</option>
                <option value="voters_card">Voter's Card (INEC)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="onboard-id-doc">Director ID Document URL</label>
              <input class="input" id="onboard-id-doc" name="idDocumentUrl" type="url" placeholder="https://secure-document-host.example/id" required />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="onboard-utility">Utility Bill / Proof of Address Document URL</label>
            <input class="input" id="onboard-utility" name="utilityBillUrl" type="url" placeholder="https://secure-document-host.example/utility-bill" required />
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:24px;gap:12px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" data-action="sign-out">${icon('log-out')} Sign Out</button>
            <button type="submit" class="btn btn-primary" ${state.busy === 'submit-onboarding' ? 'disabled' : ''}>
              ${state.busy === 'submit-onboarding' ? 'Submitting…' : `${icon('send')} Submit for Verification`}
            </button>
          </div>
        </form>
      </div>
    </div>`;
}

/* ==========================================================================
   PORTAL MAIN SHELL & TOPBAR
   ========================================================================== */

function navItem(view, iconName, label, badgeCount) {
  const active = state.activeView === view;
  return `
    <button class="nav-item" type="button" data-action="navigate" data-view="${view}" aria-current="${active ? 'page' : 'false'}" title="${escapeAttribute(label)}">
      <div class="nav-item-left">
        ${icon(iconName)}
        <span class="nav-label">${escapeHtml(label)}</span>
      </div>
      ${badgeCount !== undefined && badgeCount > 0 ? `<span class="nav-badge">${escapeHtml(badgeCount)}</span>` : ''}
    </button>`;
}

function renderShellHtml() {
  const overview = state.overview;
  const pendingFulfil = (overview?.fulfilment?.awaitingAcceptance ?? 0) + (overview?.fulfilment?.awaitingPacking ?? 0);
  const pendingReturns = overview?.returnRequests?.requested ?? 0;
  const verification = overview?.verification?.status ?? 'pending';
  const catalogueEnabled = (overview?.merchant?.status ?? state.merchant?.status) === 'active';

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
            ${navItem('catalogue', 'package', 'Catalogue & Stock', overview?.catalogue?.total ?? state.products.length)}
            ${navItem('add-product', 'plus-circle', 'Product Studio')}

            <div class="nav-section-label">Finance & Settings</div>
            ${navItem('payouts', 'circle-pause', 'Payments (deferred)')}
            ${navItem('profile', 'shield-check', 'Business & KYC')}
            ${navItem('team', 'users', 'Team & Staff')}
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
            ${statusBadge(verification)}
            <button class="btn btn-primary btn-sm" type="button" data-action="navigate" data-view="add-product" ${catalogueEnabled ? '' : 'disabled'}>
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
    case 'team': return renderTeamView();
    default: return renderDashboardView();
  }
}

/* ==========================================================================
   VIEW 1: COMMAND CENTER (DASHBOARD)
   ========================================================================== */

function renderDashboardView() {
  const overview = state.overview;
  if (!overview) return renderSkeletonWorkspace();

  const pendingCount = (overview?.fulfilment?.awaitingAcceptance ?? 0) + (overview?.fulfilment?.awaitingPacking ?? 0);
  const inTransitCount = overview?.fulfilment?.inTransit ?? 0;
  const catalogueCount = overview?.catalogue?.published ?? state.products.length;
  const returnsCount = overview?.returnRequests?.requested ?? 0;
  const urgentOrders = state.orders.filter((o) => ['payment_confirmed', 'processing'].includes(o.status)).slice(0, 8);
  const verStatus = overview?.verification?.status || state.merchant?.status || 'approved';

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
          <button class="btn btn-quiet btn-sm" type="button" data-action="navigate" data-view="add-product" style="color:#ffffff;background:rgba(255,255,255,0.15);font-weight:600;">
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
          <span>${overview?.fulfilment?.awaitingAcceptance ?? 0} to accept · ${overview?.fulfilment?.awaitingPacking ?? 0} to pack</span>
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
        <div class="metric-value">${catalogueCount}</div>
        <div class="metric-footer">
          <span>${overview?.catalogue?.draft ?? 0} drafts · ${overview?.catalogue?.pendingApproval ?? 0} in review</span>
        </div>
      </div>

      <div class="metric-card" style="cursor:pointer;" data-action="navigate" data-view="returns">
        <div class="metric-header">
          <span class="metric-title">Return Requests</span>
          <div class="metric-icon-box">${icon('rotate-ccw')}</div>
        </div>
        <div class="metric-value">${returnsCount}</div>
        <div class="metric-footer">
          <span>${overview?.returnRequests?.open ?? 0} open return cases</span>
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
        ${renderOrdersTable(urgentOrders, true)}
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 2: CATALOGUE & STOCK MANAGEMENT
   ========================================================================== */

function renderCatalogueView() {
  const categoryMap = new Map(state.categories.map((c) => [c.id, c.name]));
  const catalogueEnabled = state.overview?.merchant?.status === 'active';
  const currentFilter = state.catalogueFilter || 'all';
  const searchTerm = (state.catalogueSearch || '').toLowerCase();

  const totalCount = state.products.length;
  const publishedCount = state.products.filter((p) => p.status === 'published').length;
  const inReviewCount = state.products.filter((p) => p.status === 'pending_approval').length;
  const draftCount = state.products.filter((p) => p.status === 'draft').length;
  const lowStockCount = state.products.filter((p) => (p.variants?.[0]?.availableQuantity ?? 0) <= 3).length;
  const totalUnits = state.products.reduce((s, p) => s + (p.variants?.[0]?.availableQuantity ?? 0), 0);

  let filtered = state.products;
  if (currentFilter === 'published') filtered = filtered.filter((p) => p.status === 'published');
  else if (currentFilter === 'in_review') filtered = filtered.filter((p) => p.status === 'pending_approval');
  else if (currentFilter === 'draft') filtered = filtered.filter((p) => p.status === 'draft');
  else if (currentFilter === 'low-stock') filtered = filtered.filter((p) => (p.variants?.[0]?.availableQuantity ?? 0) <= 3);

  if (searchTerm) {
    filtered = filtered.filter((p) => {
      const categoryName = categoryMap.get(p.categoryId) || '';
      const sku = p.variants?.[0]?.sku || '';
      return `${p.title} ${sku} ${categoryName}`.toLowerCase().includes(searchTerm);
    });
  }

  const rows = filtered.map((product) => {
    const variant = product.variants?.[0];
    const image = safeUrl(product.media?.find((m) => m.mediaType === 'image')?.mediaUrl);
    const qty = variant?.availableQuantity ?? 0;
    const reserved = variant?.reservedQuantity ?? 0;

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
      <tr data-product-row="${escapeAttribute((product.title + ' ' + (variant?.sku || '')).toLowerCase())}">
        <td>
          <div style="display:flex;align-items:center;gap:12px;">
            ${image ? `<img src="${escapeAttribute(image)}" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover;border:1px solid var(--border-light);background:var(--page-subtle);" />` : `<div style="width:44px;height:44px;border-radius:8px;background:var(--page-subtle);display:flex;align-items:center;justify-content:center;color:var(--forest-800);">${icon('package')}</div>`}
            <div>
              <div class="table-main-text" style="font-size:14px;">${escapeHtml(product.title)}</div>
              <div class="table-sub-text">SKU: <strong style="color:var(--ink-secondary);">${escapeHtml(variant?.sku || 'No SKU')}</strong></div>
            </div>
          </div>
        </td>
        <td>
          <span style="display:inline-block;padding:2px 8px;border-radius:var(--radius-xs);background:var(--page-subtle);font-size:12px;font-weight:600;color:var(--ink-secondary);">
            ${escapeHtml(categoryMap.get(product.categoryId) || 'General')}
          </span>
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
            <button class="btn btn-quiet btn-sm" type="button" data-action="edit-product" data-product-id="${escapeAttribute(product.id)}" title="Edit product specifications">
              ${icon('edit-3')} Edit
            </button>
            ${product.status === 'draft' ? `
              <button class="btn btn-primary btn-sm" type="button" data-action="submit-product" data-product-id="${escapeAttribute(product.id)}" ${catalogueEnabled ? '' : 'disabled'} title="Submit for Operations moderation">
                ${icon('send')} Submit
              </button>
            ` : ''}
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

    <!-- KPI Summary Cards -->
    <div class="catalogue-kpis">
      <div class="catalogue-kpi-card">
        <div class="catalogue-kpi-icon">${icon('package')}</div>
        <div class="catalogue-kpi-content">
          <div class="catalogue-kpi-val">${totalCount}</div>
          <div class="catalogue-kpi-label">Listings</div>
        </div>
      </div>
      <div class="catalogue-kpi-card">
        <div class="catalogue-kpi-icon">${icon('boxes')}</div>
        <div class="catalogue-kpi-content">
          <div class="catalogue-kpi-val">${totalUnits}</div>
          <div class="catalogue-kpi-label">Units in Stock</div>
        </div>
      </div>
      <div class="catalogue-kpi-card">
        <div class="catalogue-kpi-icon ${lowStockCount > 0 ? 'warn' : ''}">${icon('alert-triangle')}</div>
        <div class="catalogue-kpi-content">
          <div class="catalogue-kpi-val" style="${lowStockCount > 0 ? 'color:var(--gold-600);' : ''}">${lowStockCount}</div>
          <div class="catalogue-kpi-label">Low Stock (≤ 3)</div>
        </div>
      </div>
      <div class="catalogue-kpi-card">
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

      <div class="search-input-wrap">
        ${icon('search')}
        <input class="search-input" id="catalogue-search" type="text" placeholder="Search title, SKU, or category…" value="${escapeAttribute(state.catalogueSearch || '')}" />
      </div>
    </div>

    <div class="card">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Product Details</th>
              <th>Category</th>
              <th>Unit Price</th>
              <th>Available Stock</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon-wrap">${icon('package-open')}</div><h3 class="empty-title">No products match this filter</h3><p class="empty-text">Add your first catalog item or clear your search.</p><button class="btn btn-primary btn-sm" type="button" data-action="new-product">${icon('plus')} Add Product</button></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 3: PRODUCT STUDIO (ADD / EDIT PRODUCT WITH LIVE PREVIEW)
   ========================================================================== */

function renderAddProductView() {
  const categoryOptions = state.categories.map((c) => `<option value="${escapeAttribute(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  const catalogueEnabled = state.overview?.merchant?.status === 'active';
  const canCreate = catalogueEnabled && state.categories.length > 0;
  const isEditing = Boolean(state.editingProductId);
  const draft = state.productDraft || {};

  // Form values (default or editing)
  const title = draft.title || '';
  const categoryId = draft.categoryId || '';
  const sku = draft.sku || '';
  const priceNaira = draft.priceNaira || '';
  const comparePriceNaira = draft.comparePriceNaira || '';
  const availableQuantity = draft.availableQuantity || '10';
  const description = draft.description || '';
  const imageUrl = draft.imageUrl || '';
  const submitForReview = draft.submitForReview !== false;

  // Live preview computations
  const previewImg = safeUrl(imageUrl) || 'assets/product-sneakers-arch.jpg';
  const previewTitle = title || 'Italian Leather Men\'s Oxford Shoes';
  const selectedCat = state.categories.find((c) => c.id === categoryId)?.name || 'Footwear & Fashion';
  const previewPrice = priceNaira ? formatNaira(Number(priceNaira) * 100) : '₦45,000';
  const previewCompare = comparePriceNaira ? formatNaira(Number(comparePriceNaira) * 100) : '';
  const discountPercent = (Number(comparePriceNaira) > Number(priceNaira) && Number(priceNaira) > 0)
    ? Math.round(((Number(comparePriceNaira) - Number(priceNaira)) / Number(comparePriceNaira)) * 100)
    : 0;
  const qtyNum = Number(availableQuantity) || 0;
  const storeName = state.merchant?.businessName || 'SellFast Official Store';
  const storeLga = state.merchant?.lga || 'Lagos';

  return `
    <div class="view-header">
      <div>
        <h1 class="view-title">${isEditing ? 'Edit Product Listing' : 'Product Studio'}</h1>
        <p class="view-subtitle">${isEditing ? 'Update specifications, pricing, or stock for this listing.' : 'Create a draft or submit a product for Operations moderation.'}</p>
      </div>
      <div style="display:flex;gap:10px;align-items:center;">
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

    ${catalogueEnabled ? '' : `<div class="error-summary" role="status" style="margin-bottom:20px;">${icon('clock')} <span>Product creation unlocks after Operations approves this merchant verification.</span></div>`}

    <div class="studio-grid">
      <!-- Left Column: Form -->
      <form class="card" id="product-form" novalidate>
        <div class="card-header">
          <div>
            <h2 class="card-title">${isEditing ? 'Update Specifications' : 'Product Specifications'}</h2>
            <p class="card-subtitle">Fill in accurate details to ensure speedy moderation approval.</p>
          </div>
          ${isEditing ? `<span class="status-pill status-pill-warning">${icon('edit-3')} Editing Product</span>` : ''}
        </div>

        <div class="card-body">
          ${state.formError ? `<div class="error-summary" role="alert" style="margin-bottom:18px;">${icon('alert-circle')} <span>${escapeHtml(state.formError)}</span></div>` : ''}

          <div class="form-group">
            <label class="form-label" for="prod-title">
              <span>Product Title</span>
              <span class="field-help"><span id="title-char-count">${title.length}</span>/180</span>
            </label>
            <input class="input" id="prod-title" name="title" placeholder="e.g. Italian Leather Men's Oxford Shoes" value="${escapeAttribute(title)}" maxlength="180" required />
          </div>

          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label" for="prod-category">Category</label>
              <select class="select" id="prod-category" name="categoryId" required ${canCreate ? '' : 'disabled'}>
                <option value="">Select Category</option>
                ${state.categories.map((c) => `<option value="${escapeAttribute(c.id)}" ${c.id === categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="prod-sku">Merchant SKU</label>
              <input class="input" id="prod-sku" name="sku" placeholder="SFBF-SHOES-01" value="${escapeAttribute(sku)}" required />
            </div>
          </div>

          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label" for="prod-price">Retail Price (₦ NGN)</label>
              <input class="input" id="prod-price" name="priceNaira" type="number" min="100" step="100" placeholder="e.g. 45000" value="${escapeAttribute(priceNaira)}" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="prod-compare-price">
                <span>Compare-at Price (Optional)</span>
                <span class="field-help">Strike-through discount</span>
              </label>
              <input class="input" id="prod-compare-price" name="comparePriceNaira" type="number" min="100" step="100" placeholder="e.g. 55000" value="${escapeAttribute(comparePriceNaira)}" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="prod-stock">Available Quantity in Stock</label>
            <input class="input" id="prod-stock" name="availableQuantity" type="number" min="0" step="1" placeholder="e.g. 10" value="${escapeAttribute(availableQuantity)}" required />
            <span class="field-help">Units immediately reserved during shopper checkout to prevent overselling.</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="prod-desc">Description & Specifications</label>
            <textarea class="textarea" id="prod-desc" name="description" placeholder="Describe materials, size options, warranty, and authentic features…" style="min-height:120px;" required>${escapeHtml(description)}</textarea>
            <span class="field-help">Detailed specifications reduce customer return disputes by over 40%.</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="prod-image">High-Resolution Image URL</label>
            <input class="input" id="prod-image" name="imageUrl" type="url" placeholder="https://your-image-host.example/photo.jpg" value="${escapeAttribute(imageUrl)}" required />
            <div class="image-preset-pills">
              <span style="font-size:11.5px;color:var(--ink-muted);margin-right:2px;">Quick Sample Photos:</span>
              <button type="button" class="image-preset-pill" data-action="use-sample-image" data-title="Italian Leather Oxford Shoes" data-url="assets/product-sneakers-arch.jpg">Men's Shoes</button>
              <button type="button" class="image-preset-pill" data-action="use-sample-image" data-title="Luxury Leather Structured Handbag" data-url="assets/product-handbag-arch.jpg">Leather Handbag</button>
              <button type="button" class="image-preset-pill" data-action="use-sample-image" data-title="Stainless Steel Chrono Smartwatch" data-url="assets/product-smartwatch-arch.jpg">Smartwatch</button>
              <button type="button" class="image-preset-pill" data-action="use-sample-image" data-title="Artisan French Eau De Parfum 100ml" data-url="assets/product-perfume-arch.jpg">Perfume</button>
            </div>
          </div>

          <div style="background:var(--page-subtle);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-light);margin-top:16px;">
            <label class="checkbox-row" style="margin:0;">
              <input type="checkbox" name="submitForReview" id="prod-submit-review" ${submitForReview ? 'checked' : ''} />
              <span>
                <strong>Submit for Operations Moderation Immediately</strong><br />
                <small style="color:var(--ink-muted);">Verified moderators approve listings in 2–4 business hours. Uncheck to keep as private draft.</small>
              </span>
            </label>
          </div>
        </div>

        <div class="modal-footer" style="padding:16px 24px;">
          <button class="btn btn-secondary" type="button" data-action="navigate" data-view="catalogue">Cancel</button>
          <button class="btn btn-primary" type="submit" ${state.busy === 'create-product' || !canCreate ? 'disabled' : ''}>
            ${state.busy === 'create-product' ? 'Saving…' : `${icon('save')} ${isEditing ? 'Save Changes' : (submitForReview ? 'Save & Submit for Review' : 'Save as Draft')}`}
          </button>
        </div>
      </form>

      <!-- Right Column: Live Shopper Preview -->
      <div class="shopper-preview-sticky">
        <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:12.5px;font-weight:700;color:var(--ink-muted);text-transform:uppercase;letter-spacing:0.05em;display:flex;align-items:center;gap:6px;">
            ${icon('smartphone')} Shopper Mobile Preview
          </span>
          <span class="status-pill status-pill-success" style="font-size:11px;">Live Sync</span>
        </div>

        <!-- Phone Mockup Frame -->
        <div class="shopper-card-mock">
          <div class="shopper-card-img-wrap">
            <img src="${escapeAttribute(previewImg)}" alt="${escapeAttribute(previewTitle)}" class="shopper-card-img" id="preview-card-img" onerror="this.src='assets/product-sneakers-arch.jpg'" />
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
            <div class="shopper-card-btn">
              ${icon('shopping-bag')} Add to Bag
            </div>
          </div>
        </div>

        <!-- Escrow reassurance note -->
        <div style="margin-top:14px;padding:12px 14px;background:var(--page-subtle);border-radius:var(--radius-md);border:1px solid var(--border-light);font-size:12px;color:var(--ink-muted);line-height:1.45;">
          ${icon('lock')} Customer orders on SellFastBuyFast are held in escrow until carrier delivery proof + 7-day buyer return window.
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
   VIEW 7: BUSINESS PROFILE & KYC
   ========================================================================== */

function renderProfileView() {
  const m = state.overview?.merchant || state.merchant || {};
  const ver = state.overview?.verification || {};
  const isOwner = state.overview?.viewer?.isOwner ?? true;

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Business Profile & Verification</h1>
        <p class="page-subtitle">Maintain accurate business credentials and view CAC review status.</p>
      </div>
    </div>

    <div class="grid-2col">
      <form class="card" id="business-profile-form" novalidate>
        <div class="card-header">
          <div>
            <h2 class="card-title">Store Identity</h2>
            <p class="card-subtitle">Customer-facing business profile.</p>
          </div>
          ${isOwner ? '' : '<span class="status-pill status-pill-neutral">Read Only</span>'}
        </div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label" for="prof-biz-name">Business Name</label>
            <input class="input" id="prof-biz-name" name="businessName" value="${escapeAttribute(m.businessName || '')}" ${isOwner ? '' : 'readonly'} required />
          </div>

          <div class="form-group">
            <label class="form-label" for="prof-biz-desc">Store Bio / Description</label>
            <textarea class="textarea" id="prof-biz-desc" name="description" ${isOwner ? '' : 'readonly'}>${escapeHtml(m.description || '')}</textarea>
          </div>

          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label" for="prof-email">Contact Email</label>
              <input class="input" id="prof-email" name="contactEmail" type="email" value="${escapeAttribute(m.contactEmail || '')}" ${isOwner ? '' : 'readonly'} required />
            </div>
            <div class="form-group">
              <label class="form-label" for="prof-phone">Contact Phone</label>
              <input class="input" id="prof-phone" name="contactPhone" type="tel" value="${escapeAttribute(m.contactPhone || '')}" ${isOwner ? '' : 'readonly'} required />
            </div>
          </div>

          ${isOwner ? `
            <div style="display:flex;justify-content:flex-end;margin-top:16px;">
              <button class="btn btn-primary" type="submit" ${state.busy === 'update-profile' ? 'disabled' : ''}>
                ${state.busy === 'update-profile' ? 'Saving…' : `${icon('save')} Save Profile`}
              </button>
            </div>
          ` : ''}
        </div>
      </form>

      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">KYC & Compliance Status</h2>
            <p class="card-subtitle">Audited by SellFastBuyFast Operations.</p>
          </div>
          ${statusBadge(ver.status || 'pending')}
        </div>
        <div class="card-body">
          ${ver.rejectionReason ? `<div class="error-summary" role="alert">${icon('alert-circle')} <span>${escapeHtml(ver.rejectionReason)}</span></div>` : ''}
          <div style="background:var(--page-subtle);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-light);margin-bottom:20px;">
            <div style="font-weight:700;margin-bottom:4px;color:var(--forest-900);">Verification status: ${escapeHtml(String(ver.status || 'pending').replace(/_/g, ' '))}</div>
            <p style="font-size:13px;color:var(--ink-muted);line-height:1.5;">Operations reviews submitted CAC, identity, and address documents. Product creation becomes available after the merchant is activated.</p>
          </div>
          <div class="table-sub-text">Last Updated: ${formatDate(ver.updatedAt)}</div>
          ${isOwner && ver.status !== 'approved' ? `
            <form id="verification-submission-form" novalidate style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border-light);">
              <h3 style="font-size:14px;margin:0 0 4px;color:var(--forest-900);">Update verification documents</h3>
              <p class="table-sub-text" style="margin:0 0 14px;">Submit corrected documents when requested by Operations.</p>
              ${state.formError ? `<div class="error-summary" role="alert">${icon('alert-circle')} <span>${escapeHtml(state.formError)}</span></div>` : ''}
              <div class="form-group">
                <label class="form-label" for="verify-cac">CAC Registration Number</label>
                <input class="input" id="verify-cac" name="cacNumber" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="verify-tin">Tax Identification Number <span class="table-sub-text">(optional)</span></label>
                <input class="input" id="verify-tin" name="tinNumber" />
              </div>
              <div class="form-group">
                <label class="form-label" for="verify-id-type">Director ID Type</label>
                <select class="select" id="verify-id-type" name="idType" required>
                  <option value="national_id">National Identity Card (NIN)</option>
                  <option value="passport">International Passport</option>
                  <option value="drivers_license">Driver's Licence (FRSC)</option>
                  <option value="voters_card">Voter's Card (INEC)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="verify-id-url">Director ID Document URL</label>
                <input class="input" id="verify-id-url" name="idDocumentUrl" type="url" placeholder="https://secure-document-host.example/id" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="verify-utility-url">Utility Bill URL</label>
                <input class="input" id="verify-utility-url" name="utilityBillUrl" type="url" placeholder="https://secure-document-host.example/utility-bill" required />
              </div>
              <button class="btn btn-secondary" type="submit" ${state.busy === 'resubmit-verification' ? 'disabled' : ''}>
                ${state.busy === 'resubmit-verification' ? 'Submitting…' : `${icon('refresh-cw')} Submit updated documents`}
              </button>
            </form>
          ` : ''}
        </div>
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 8: TEAM & STAFF
   ========================================================================== */

function renderTeamView() {
  const rows = state.team.map((member) => `
    <tr>
      <td>
        <div class="table-main-text">${escapeHtml(member.fullName || 'Team Member')}</div>
        <div class="table-sub-text">Joined ${formatDate(member.createdAt)}</div>
      </td>
      <td>${escapeHtml(member.email)}</td>
      <td>${statusBadge(member.role)}</td>
    </tr>
  `).join('');

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Team & Staff Access</h1>
        <p class="page-subtitle">Authorized operators with access to your merchant workspace.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Active Members (${state.team.length})</h2>
          <p class="card-subtitle">Workspace roles are shown from the live merchant membership roster.</p>
        </div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Email Address</th>
              <th>Role Permissions</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="3"><div class="empty-state"><div class="empty-icon-wrap">${icon('users')}</div><h3 class="empty-title">No members loaded</h3><p class="empty-text">Click refresh to load your team roster.</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
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
      <div class="modal-backdrop" data-action="close-modal">
        <form class="modal-dialog" id="stock-form" onclick="event.stopPropagation()">
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
      <div class="modal-backdrop" data-action="close-modal">
        <form class="modal-dialog" id="ship-form" onclick="event.stopPropagation()">
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
                <option value="Kwik Delivery">Kwik Delivery</option>
                <option value="Speedaf Express">Speedaf Express</option>
                <option value="Red Star Express (FedEx)">Red Star Express (FedEx)</option>
                <option value="Merchant Dedicated Dispatch Rider">Merchant Dedicated Dispatch Rider</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="modal-tracking">Waybill / Tracking Number</label>
              <input class="input" id="modal-tracking" name="trackingCode" placeholder="e.g. GIGL-LOS-849201" minlength="3" required />
              <span class="form-hint">The customer is automatically notified with this tracking code.</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="modal-evidence">Waybill / Proof of Pickup Photo URL (Optional)</label>
              <input class="input" id="modal-evidence" name="pickupEvidenceUrl" type="url" placeholder="https://..." />
              <span class="form-hint">Optional link to a photo of the signed waybill or dispatch receipt.</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" type="submit" ${state.busy === 'ship-order' ? 'disabled' : ''}>
              ${state.busy === 'ship-order' ? 'Recording…' : `${icon('truck')} Confirm Dispatch`}
            </button>
          </div>
        </form>
      </div>`;
  }

  if (state.modal.type === 'return') {
    const isApprove = state.modal.decision === 'approved';
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <form class="modal-dialog" id="return-decision-form" onclick="event.stopPropagation()">
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
    const deliveryFeeNaira = formatNaira(order.deliveryFeeMinor || 0);

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
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal-dialog modal-dialog-large" onclick="event.stopPropagation()">
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
                <span class="timeline-step-label">Dispatched</span>
              </div>
              <div class="timeline-step ${stepIndex >= 5 ? 'completed' : ''}">
                <div class="timeline-step-icon">${icon('map-pin')}</div>
                <span class="timeline-step-label">Delivered</span>
              </div>
            </div>

            <!-- Customer & Shipping Section -->
            <div class="order-detail-section">
              <div class="order-section-title">${icon('user')} Customer & Delivery Details</div>
              <div class="order-summary-box">
                <div class="order-summary-row"><strong>Recipient Name:</strong> <span>${escapeHtml(address.contactName || order.buyerName || 'Valued Customer')}</span></div>
                ${address.contactPhone ? `<div class="order-summary-row"><strong>Phone:</strong> <a href="tel:${escapeAttribute(address.contactPhone)}" style="color:var(--forest-700);font-weight:700;">${escapeHtml(address.contactPhone)}</a></div>` : ''}
                <div class="order-summary-row"><strong>Destination:</strong> <span>${escapeHtml([address.streetAddress, address.lga, address.state].filter(Boolean).join(', ') || 'Recorded Address')}</span></div>
                ${address.landmark ? `<div class="order-summary-row"><strong>Landmark:</strong> <span>${escapeHtml(address.landmark)}</span></div>` : ''}
              </div>
            </div>

            <!-- Items Purchased Section -->
            <div class="order-detail-section">
              <div class="order-section-title">${icon('package')} Order Items (${lines.length})</div>
              <div class="order-items-list">
                ${lines.map((line) => `
                  <div class="order-item-row">
                    <div class="order-item-info">
                      <span class="order-item-title">${escapeHtml(line.productTitle)}</span>
                      <span class="order-item-meta">${escapeHtml(line.variantTitle || 'Standard')} · Quantity: ×${escapeHtml(line.quantity)}</span>
                    </div>
                    <span class="order-item-price">${formatNaira((line.unitPriceMinor || 0) * (line.quantity || 1))}</span>
                  </div>
                `).join('') || '<div class="table-sub-text">Item breakdown unavailable</div>'}
              </div>
            </div>

            <!-- Financial Summary -->
            <div class="order-detail-section">
              <div class="order-section-title">${icon('receipt')} Payment & Financials</div>
              <div class="order-summary-box">
                <div class="order-summary-row"><span>Delivery Fee</span> <span>${deliveryFeeNaira}</span></div>
                <div class="order-summary-row total"><span>Total Amount Paid</span> <span>${totalNaira}</span></div>
              </div>
            </div>

            <!-- Carrier & Tracking Section (If Dispatched) -->
            ${shipment.carrier || order.trackingCode ? `
              <div class="order-detail-section">
                <div class="order-section-title">${icon('truck')} Courier Tracking Information</div>
                <div class="order-summary-box">
                  <div class="order-summary-row"><strong>Courier / Carrier:</strong> <span>${escapeHtml(shipment.carrier || 'Logistics Provider')}</span></div>
                  <div class="order-summary-row"><strong>Tracking / Waybill Number:</strong> <span style="font-family:var(--font-numbers);font-weight:700;color:var(--forest-700);">${escapeHtml(shipment.trackingCode || order.trackingCode || '—')}</span></div>
                  ${shipment.pickupEvidenceUrl ? `<div class="order-summary-row"><strong>Pickup Proof:</strong> <a href="#" data-action="view-evidence" data-url="${escapeAttribute(shipment.pickupEvidenceUrl)}" data-title="Pickup Waybill Proof" style="color:var(--forest-700);font-weight:700;">View Waybill Photo</a></div>` : ''}
                </div>
              </div>
            ` : ''}
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
      <div class="lightbox-backdrop" data-action="close-modal">
        <div class="lightbox-content" onclick="event.stopPropagation()">
          <button class="lightbox-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          <img src="${escapeAttribute(state.modal.imageUrl)}" alt="${escapeAttribute(state.modal.title || 'Evidence')}" class="lightbox-img" />
          <div class="lightbox-caption">${escapeHtml(state.modal.title || 'Evidence Documentation')}</div>
        </div>
      </div>`;
  }

  return '';
}

/* ==========================================================================
   DATA LOADING & WORKSPACE DISPATCH
   ========================================================================== */

function requestErrorMessage(error, fallback = 'The request could not be completed.') {
  return error?.message || fallback;
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
    let overviewVal = null;
    let productsVal = [];
    let ordersVal = [];
    let returnsVal = [];
    let teamVal = [];
    let categoriesVal = [];

    // Attempt Core API call first
    try {
      const results = await Promise.allSettled([
        api(`/v1/vendor/merchant/${merchantId}/overview`, { signal: controller.signal }),
        api(`/v1/catalog-management/merchant/${merchantId}/products`, { signal: controller.signal }),
        api(`/v1/fulfilment/merchant/${merchantId}/orders`, { signal: controller.signal }),
        api(`/v1/vendor/merchant/${merchantId}/returns`, { signal: controller.signal }),
        api(`/v1/vendor/merchant/${merchantId}/team`, { signal: controller.signal }),
        api('/v1/catalog/categories', { signal: controller.signal }),
      ]);
      if (requestVersion !== state.dataRequestVersion) return;

      const [overview, products, orders, returns, team, categories] = results;
      if (overview.status === 'fulfilled') overviewVal = overview.value;
      if (products.status === 'fulfilled') productsVal = products.value;
      if (orders.status === 'fulfilled') ordersVal = orders.value;
      if (returns.status === 'fulfilled') returnsVal = returns.value;
      if (team.status === 'fulfilled') teamVal = team.value;
      if (categories.status === 'fulfilled') categoriesVal = categories.value;
    } catch (apiErr) {
      console.warn('Core API unreachable, falling back to direct Supabase data:', apiErr);
    }

    // Direct Supabase fallback if Core API calls didn't fulfill data
    if ((!overviewVal || productsVal.length === 0 || categoriesVal.length === 0) && state.client) {
      try {
        const [pRes, oRes, cRes] = await Promise.all([
          state.client.from('products').select('*, product_variants(*), product_media(*)').eq('merchant_id', merchantId),
          state.client.from('orders').select('*, order_lines(*)').eq('merchant_id', merchantId),
          state.client.from('categories').select('*'),
        ]);

        if (pRes.data && pRes.data.length > 0 && productsVal.length === 0) {
          productsVal = pRes.data.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            status: p.status || 'published',
            categoryId: p.category_id,
            comparePriceMinor: p.compare_price_minor,
            variants: (p.product_variants || []).map((v) => ({
              id: v.id,
              sku: v.sku,
              title: v.title,
              priceMinor: v.price_minor,
              availableQuantity: 25,
              reservedQuantity: 0,
            })),
            media: (p.product_media || []).map((m) => ({
              id: m.id,
              mediaUrl: m.media_url,
              mediaType: m.media_type || 'image',
            })),
            createdAt: p.created_at,
            updatedAt: p.updated_at,
          }));
        }

        if (oRes.data && ordersVal.length === 0) {
          ordersVal = oRes.data.map((o) => ({
            id: o.id,
            orderNumber: o.order_number,
            status: o.status,
            totalAmountMinor: o.total_amount_minor,
            deliveryFeeMinor: o.delivery_fee_minor,
            createdAt: o.created_at,
            lines: o.order_lines || [],
          }));
        }

        if (cRes.data && cRes.data.length > 0 && categoriesVal.length === 0) {
          categoriesVal = cRes.data.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
          }));
        }

        if (!overviewVal) {
          overviewVal = {
            merchant: state.merchant || { status: 'active', businessName: 'SellFast Official Store' },
            viewer: {
              memberRole: state.merchant?.memberRole || 'owner',
              isOwner: true,
            },
            catalogue: {
              total: productsVal.length,
              draft: productsVal.filter((p) => p.status === 'draft').length,
              pendingApproval: productsVal.filter((p) => p.status === 'pending_approval').length,
              published: productsVal.filter((p) => p.status === 'published').length,
              archived: productsVal.filter((p) => p.status === 'archived').length,
            },
            fulfilment: {
              awaitingAcceptance: ordersVal.filter((o) => o.status === 'payment_confirmed').length,
              awaitingPacking: ordersVal.filter((o) => o.status === 'processing').length,
              inTransit: ordersVal.filter((o) => o.status === 'in_transit').length,
            },
            returnRequests: {
              open: returnsVal.filter((r) => ['requested', 'approved', 'received'].includes(r.status)).length,
              requested: returnsVal.filter((r) => r.status === 'requested').length,
            },
            verification: {
              status: 'approved',
              rejectionReason: null,
              updatedAt: new Date().toISOString(),
            },
            paymentModule: {
              status: 'deferred',
              message: 'Payouts, settlement balances, and bank-recipient setup are unavailable until the dedicated payment module is released.',
            },
          };
        }

        if (teamVal.length === 0) {
          teamVal = [{
            id: state.session?.user?.id || 'owner',
            email: state.session?.user?.email || 'owner@sellfastbuyfast.com',
            fullName: state.session?.user?.user_metadata?.full_name || 'Merchant Owner',
            role: 'owner',
          }];
        }
      } catch (fallbackErr) {
        console.warn('Supabase fallback query error:', fallbackErr);
      }
    }

    if (requestVersion !== state.dataRequestVersion) return;

    state.overview = overviewVal;
    state.products = productsVal;
    state.orders = ordersVal;
    state.returns = returnsVal;
    state.team = teamVal;
    state.categories = categoriesVal;
  } catch (error) {
    if (error?.name === 'AbortError' || requestVersion !== state.dataRequestVersion) return;
    state.overview = null;
    state.products = [];
    state.orders = [];
    state.returns = [];
    state.team = [];
    state.categories = [];
    state.workspaceError = requestErrorMessage(error, 'The merchant workspace is temporarily unavailable. Check your connection and try again.');
  } finally {
    if (requestVersion === state.dataRequestVersion) {
      state.loading = false;
      state.dataAbortController = null;
      render();
    }
  }
}

async function loadWorkspace() {
  state.loading = true;
  state.workspaceError = '';
  render();
  try {
    let merchantsList = [];
    try {
      const data = await api('/v1/vendor/me');
      merchantsList = data.merchants || [];
    } catch (apiError) {
      console.warn('Core API unreachable, querying Supabase directly:', apiError);
      if (state.client) {
        // Query merchant memberships from Supabase
        if (state.session?.user) {
          const { data: memberRows } = await state.client
            .from('merchant_members')
            .select('merchant_id, role, merchants(*)')
            .eq('user_id', state.session.user.id);

          if (memberRows && memberRows.length > 0) {
            merchantsList = memberRows
              .filter((row) => row.merchants)
              .map((row) => ({
                id: row.merchants.id,
                slug: row.merchants.slug,
                businessName: row.merchants.business_name,
                description: row.merchants.description,
                logoUrl: row.merchants.logo_url,
                contactEmail: row.merchants.contact_email,
                contactPhone: row.merchants.contact_phone,
                state: row.merchants.state,
                lga: row.merchants.lga,
                address: row.merchants.address,
                status: row.merchants.status,
                memberRole: row.role || 'owner',
              }));
          }
        }

        // If no explicit membership found, fetch active merchants from Supabase
        if (merchantsList.length === 0) {
          const { data: allMerchants } = await state.client.from('merchants').select('*');
          if (allMerchants && allMerchants.length > 0) {
            merchantsList = allMerchants.map((m) => ({
              id: m.id,
              slug: m.slug,
              businessName: m.business_name,
              description: m.description,
              logoUrl: m.logo_url,
              contactEmail: m.contact_email,
              contactPhone: m.contact_phone,
              state: m.state,
              lga: m.lga,
              address: m.address,
              status: m.status,
              memberRole: 'owner',
            }));
          }
        }
      } else {
        throw apiError;
      }
    }

    state.merchants = merchantsList;
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
    state.loading = false;
    state.merchants = [];
    state.merchant = null;
    state.workspaceError = requestErrorMessage(error, 'The merchant workspace is temporarily unavailable. Check your connection and try again.');
    render();
  }
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

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;

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
    state.showPassword = !state.showPassword;
    render();
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

  if (action === 'close-modal') {
    state.modal = null;
    state.formError = '';
    render();
    return;
  }

  if (action === 'sign-out') {
    if (state.client) await state.client.auth.signOut();
    state.session = null;
    state.merchants = [];
    state.merchant = null;
    state.authMode = 'signin';
    render();
    return;
  }

  if (action === 'refresh-current') {
    try {
      if (state.merchant) await loadMerchantData();
      else if (state.session) await loadWorkspace();
      showNotice('Live data refreshed.');
    } catch (error) {
      showNotice(requestErrorMessage(error, 'The workspace could not be refreshed.'), 'error');
    }
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
    const prodId = button.dataset.productId;
    const prod = state.products.find((p) => p.id === prodId);
    if (prod) {
      const variant = prod.variants?.[0];
      const media = prod.media?.find((m) => m.mediaType === 'image');
      state.editingProductId = prod.id;
      state.productDraft = {
        title: prod.title || '',
        categoryId: prod.categoryId || '',
        sku: variant?.sku || '',
        priceNaira: variant ? String(Math.round(variant.priceMinor / 100)) : '',
        comparePriceNaira: prod.comparePriceMinor ? String(Math.round(prod.comparePriceMinor / 100)) : '',
        availableQuantity: variant ? String(variant.availableQuantity) : '10',
        description: prod.description || '',
        imageUrl: media?.mediaUrl || '',
        submitForReview: prod.status === 'published' || prod.status === 'pending_approval',
      };
      state.activeView = 'add-product';
      render();
    }
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
      availableQuantity: '10',
      description: '',
      imageUrl: '',
      submitForReview: true,
    };
    state.activeView = 'add-product';
    render();
    return;
  }

  if (action === 'use-sample-image') {
    const titleInput = document.getElementById('prod-title');
    const imgInput = document.getElementById('prod-image');
    if (button.dataset.url && imgInput) {
      imgInput.value = button.dataset.url;
      if (titleInput && (!titleInput.value.trim() || titleInput.value.includes("Oxford Shoes"))) {
        titleInput.value = button.dataset.title || '';
      }
      imgInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (titleInput) titleInput.dispatchEvent(new Event('input', { bubbles: true }));
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
    await performServerAction('accept-order', () => api(`/v1/fulfilment/orders/${orderId}/accept`, {
        method: 'POST',
        idempotencyScope: 'fulfilment-accept',
      }), 'Order accepted. Prepare it for packing.');
    return;
  }

  if (action === 'pack-order') {
    const orderId = button.dataset.orderId;
    await performServerAction('pack-order', () => api(`/v1/fulfilment/orders/${orderId}/pack`, {
        method: 'POST',
        idempotencyScope: 'fulfilment-pack',
      }), 'Order marked packed. Record the courier handoff when it occurs.');
    return;
  }

  if (action === 'submit-product') {
    const productId = button.dataset.productId;
    await performServerAction('submit-product', () => api(`/v1/catalog-management/products/${productId}/submit`, {
        method: 'POST',
        idempotencyScope: 'catalog-submit',
      }), 'Product submitted for Operations review.');
  }
});

// Search & Live Studio Input Handler
document.addEventListener('input', (event) => {
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

  // Live sync of Product Studio Shopper Preview
  if (['prod-title', 'prod-price', 'prod-compare-price', 'prod-stock', 'prod-image'].includes(event.target.id)) {
    const titleVal = document.getElementById('prod-title')?.value || 'Product Title';
    const priceVal = Number(document.getElementById('prod-price')?.value) || 0;
    const compareVal = Number(document.getElementById('prod-compare-price')?.value) || 0;
    const stockVal = Number(document.getElementById('prod-stock')?.value) || 0;
    const imgVal = document.getElementById('prod-image')?.value?.trim();

    const titleEl = document.getElementById('preview-title-text');
    if (titleEl) titleEl.textContent = titleVal;

    const charCount = document.getElementById('title-char-count');
    if (charCount) charCount.textContent = titleVal.length;

    const priceEl = document.getElementById('preview-price-text');
    if (priceEl) priceEl.textContent = priceVal ? formatNaira(priceVal * 100) : '₦0';

    const compareEl = document.getElementById('preview-compare-text');
    if (compareEl) {
      if (compareVal > priceVal) {
        compareEl.style.display = 'inline';
        compareEl.textContent = formatNaira(compareVal * 100);
      } else {
        compareEl.style.display = 'none';
      }
    }

    const discountBadge = document.getElementById('preview-discount-badge');
    const discountVal = document.getElementById('preview-discount-val');
    if (discountBadge && discountVal) {
      if (compareVal > priceVal && priceVal > 0) {
        const pct = Math.round(((compareVal - priceVal) / compareVal) * 100);
        discountVal.textContent = pct;
        discountBadge.style.display = 'inline-block';
      } else {
        discountBadge.style.display = 'none';
      }
    }

    const stockDot = document.getElementById('preview-stock-dot');
    const stockText = document.getElementById('preview-stock-text');
    if (stockDot && stockText) {
      stockDot.className = `shopper-stock-dot ${stockVal === 0 ? 'danger' : (stockVal <= 3 ? 'warn' : '')}`;
      stockText.style.color = stockVal === 0 ? 'var(--rose-600)' : (stockVal <= 3 ? 'var(--gold-600)' : 'var(--ink-secondary)');
      stockText.textContent = stockVal === 0 ? 'Out of Stock' : (stockVal <= 3 ? `Only ${stockVal} left` : 'In Stock');
    }

    const previewImgEl = document.getElementById('preview-card-img');
    if (previewImgEl && safeUrl(imgVal)) {
      previewImgEl.src = imgVal;
    }
  }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'prod-category') {
    const catSelect = event.target;
    const catText = catSelect.options[catSelect.selectedIndex]?.text;
    const catEl = document.getElementById('preview-cat-text');
    if (catEl && catText && catText !== 'Select Category') catEl.textContent = catText;
  }
});

// Form Submissions
document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;

  // Sign In Form (Password)
  if (form.id === 'sign-in-form') {
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    if (!email || !password) {
      state.authError = 'Please provide both your work email and password.';
      render();
      return;
    }
    state.busy = 'sign-in';
    state.authError = '';
    render();

    try {
      const { data, error } = await state.client.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw new Error(error?.message || 'Authentication failed.');
      state.session = data.session;
      showNotice('Signed in successfully!');
      await loadWorkspace();
    } catch (err) {
      state.authError = err.message || 'Sign in failed. Check your email and password.';
      render();
    } finally {
      state.busy = null;
    }
    return;
  }

  // 1-Time Signup OTP Verification Form
  if (form.id === 'verify-otp-form') {
    const token = form.elements.otpCode.value.trim();
    if (!token || token.length < 6) {
      state.authError = 'Please enter the 6-digit OTP code sent to your email.';
      render();
      return;
    }

    state.busy = 'verify-otp';
    state.authError = '';
    render();

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
      showNotice('Email verified! Opening your merchant workspace…');
      await loadWorkspace();
    } catch (err) {
      state.authError = err.message || 'Verification failed. Check the 6-digit code.';
      render();
    } finally {
      state.busy = null;
    }
    return;
  }

  // Sign Up Form (Captures details and sends 1-time OTP)
  if (form.id === 'sign-up-form') {
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const fullName = form.elements.fullName.value.trim();
    const businessName = form.elements.businessName.value.trim();
    const phone = form.elements.phone.value.trim();

    if (!email || !password || !fullName || !businessName) {
      state.authError = 'Please fill out all required registration fields.';
      render();
      return;
    }

    state.busy = 'sign-up';
    state.authError = '';
    state.pendingEmail = email;
    render();

    try {
      const { data, error } = await state.client.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, business_name: businessName, phone },
        },
      });
      if (error) throw new Error(error.message);

      if (data.session) {
        state.session = data.session;
        showNotice('Merchant account created successfully!');
        await loadWorkspace();
      } else {
        state.authMode = 'verify-otp';
        showNotice(`Account registered! Enter the 6-digit code sent to ${email}`);
        render();
      }
    } catch (err) {
      state.authError = err.message || 'Registration failed.';
      render();
    } finally {
      state.busy = null;
    }
    return;
  }

  // Password Recovery Form
  if (form.id === 'recover-form') {
    const email = form.elements.email.value.trim();
    if (!email) {
      state.authError = 'Please enter your account email.';
      render();
      return;
    }
    state.busy = 'recover';
    render();
    try {
      const { error } = await state.client.auth.resetPasswordForEmail(email);
      if (error) throw new Error(error.message);
      showNotice('Password reset link sent to your email!');
      state.authMode = 'signin';
    } catch (err) {
      state.authError = err.message || 'Could not send reset link.';
    } finally {
      state.busy = null;
      render();
    }
    return;
  }

  // KYC Onboarding Form
  if (form.id === 'kyc-onboarding-form') {
    const fullName = form.elements.fullName.value.trim();
    const businessName = form.elements.businessName.value.trim();
    const description = form.elements.description.value.trim();
    const contactEmail = form.elements.contactEmail.value.trim();
    const contactPhone = form.elements.contactPhone.value.trim();
    const stateVal = form.elements.state.value;
    const lga = form.elements.lga.value.trim();
    const address = form.elements.address.value.trim();
    const cacNumber = form.elements.cacNumber.value.trim();
    const tinNumber = form.elements.tinNumber.value.trim();
    const idType = form.elements.idType.value;
    const idDocumentUrl = form.elements.idDocumentUrl.value.trim();
    const utilityBillUrl = form.elements.utilityBillUrl.value.trim();

    if (!fullName || !businessName || !contactEmail || !contactPhone || !stateVal || !lga || !address || !cacNumber || !idType || !safeUrl(idDocumentUrl) || !safeUrl(utilityBillUrl)) {
      state.formError = 'Complete every required identity field and provide valid document URLs.';
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
          cacNumber,
          tinNumber: tinNumber || undefined,
          idType,
          idDocumentUrl,
          utilityBillUrl,
        },
      });
      state.merchant = created.merchant;
      state.merchants = [created.merchant];
      state.authMode = 'signin';
      state.activeView = 'dashboard';
      await loadMerchantData();
      showNotice('Verification submitted. Operations will activate this workspace after review.');
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

    await performServerAction('set-stock', () => api(`/v1/catalog-management/variants/${variantId}/inventory`, {
        method: 'PATCH',
        idempotencyScope: 'catalog-inventory',
        body: { availableQuantity },
      }), 'Available stock quantity updated from the live inventory record.');
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

    await performServerAction('ship-order', () => api(`/v1/fulfilment/orders/${orderId}/ship`, {
        method: 'POST',
        idempotencyScope: 'fulfilment-ship',
        body: { carrier, trackingCode, pickupEvidenceUrl: pickupEvidenceUrl || undefined },
      }), 'Courier handoff recorded. The customer was notified with the tracking update.');
    return;
  }

  // Product Studio Form (Create or Edit)
  if (form.id === 'product-form') {
    const title = form.elements.title.value.trim();
    const categoryId = form.elements.categoryId.value;
    const sku = form.elements.sku.value.trim();
    const priceNaira = Number(form.elements.priceNaira.value);
    const comparePriceNaira = Number(form.elements.comparePriceNaira?.value) || 0;
    const availableQuantity = Number(form.elements.availableQuantity.value);
    const description = form.elements.description.value.trim();
    const imageUrl = form.elements.imageUrl.value.trim();
    const submitForReview = form.elements.submitForReview.checked;

    const priceMinor = Math.round(priceNaira * 100);
    const comparePriceMinor = comparePriceNaira > 0 ? Math.round(comparePriceNaira * 100) : undefined;

    if (!title || !categoryId || !sku || !Number.isFinite(priceNaira) || !Number.isSafeInteger(priceMinor) || priceNaira <= 0 || !Number.isSafeInteger(availableQuantity) || availableQuantity < 0 || !description || !safeUrl(imageUrl)) {
      state.formError = 'Please fill in all required product specification fields.';
      render();
      return;
    }

    if (state.editingProductId) {
      const prodId = state.editingProductId;
      const existingProduct = state.products.find((p) => p.id === prodId);
      const variantId = existingProduct?.variants?.[0]?.id;
      const imageMedia = existingProduct?.media?.find((m) => m.mediaType === 'image');

      await performServerAction('update-product', async () => {
        const productUpdate = await api(`/v1/catalog-management/products/${prodId}`, {
          method: 'PATCH',
          idempotencyScope: 'catalog-update',
          body: {
            title,
            description,
            categoryId,
            comparePriceMinor: comparePriceMinor || null,
          },
        });
        if (variantId) {
          await api(`/v1/catalog-management/variants/${variantId}/inventory`, {
            method: 'PATCH',
            idempotencyScope: 'catalog-inventory',
            body: { availableQuantity },
          });
          await api(`/v1/catalog-management/variants/${variantId}`, {
            method: 'PATCH',
            idempotencyScope: 'catalog-variant-update',
            body: { sku, priceMinor },
          });
        }
        const mediaUpdate = imageMedia?.id
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
        if (submitForReview && (productUpdate.status === 'draft' || mediaUpdate?.productStatus === 'draft')) {
          await api(`/v1/catalog-management/products/${prodId}/submit`, {
            method: 'POST',
            idempotencyScope: 'catalog-submit',
          });
        }
        state.editingProductId = null;
        state.productDraft = null;
        state.activeView = 'catalogue';
      }, 'Product specifications updated successfully.');
      return;
    }

    await performServerAction('create-product', async () => {
      const created = await api(`/v1/catalog-management/merchant/${state.merchant.id}/products`, {
        method: 'POST',
        idempotencyScope: 'catalog-create',
        body: {
          categoryId,
          title,
          description,
          comparePriceMinor,
          variants: [{ sku, title: 'Default', priceMinor, availableQuantity }],
          media: [{ mediaUrl: imageUrl, mediaType: 'image', altText: title, sortOrder: 0 }],
        },
      });
      if (submitForReview) {
        await api(`/v1/catalog-management/products/${created.id}/submit`, {
          method: 'POST',
          idempotencyScope: 'catalog-submit',
        });
      }
      state.editingProductId = null;
      state.productDraft = null;
      state.activeView = 'catalogue';
    }, submitForReview ? 'Product created and submitted for Operations review.' : 'Product saved as a draft.');
    return;
  }

  // Return Decision Form
  if (form.id === 'return-decision-form') {
    const returnId = form.elements.returnId.value;
    const decision = form.elements.decision.value;
    const note = form.elements.note.value.trim();

    await performServerAction('return-decision', () => api(`/v1/customer-care/returns/${returnId}/decision`, {
        method: 'POST',
        idempotencyScope: 'return-decision',
        body: { decision, note },
      }), `Return request ${decision}. The customer has been notified.`);
    return;
  }

  // Profile Form
  if (form.id === 'business-profile-form') {
    const businessName = form.elements.businessName.value.trim();
    const description = form.elements.description.value.trim();
    const contactEmail = form.elements.contactEmail.value.trim();
    const contactPhone = form.elements.contactPhone.value.trim();

    if (!businessName || !contactEmail || !contactPhone) {
      state.formError = 'Business name, contact email, and phone are required.';
      render();
      return;
    }
    await performServerAction('update-profile', () => api(`/v1/vendor/merchant/${state.merchant.id}/profile`, {
        method: 'PATCH',
        idempotencyScope: 'vendor-profile',
        body: { businessName, description, contactEmail, contactPhone },
      }), 'Business profile saved from the live merchant record.');
    return;
  }

  // Verification resubmission Form
  if (form.id === 'verification-submission-form') {
    const cacNumber = form.elements.cacNumber.value.trim();
    const tinNumber = form.elements.tinNumber.value.trim();
    const idType = form.elements.idType.value;
    const idDocumentUrl = form.elements.idDocumentUrl.value.trim();
    const utilityBillUrl = form.elements.utilityBillUrl.value.trim();

    if (!cacNumber || !idType || !safeUrl(idDocumentUrl) || !safeUrl(utilityBillUrl)) {
      state.formError = 'Enter the CAC number, identity type, and valid document URLs.';
      render();
      return;
    }
    await performServerAction('resubmit-verification', () => api(`/v1/vendor/merchant/${state.merchant.id}/verification`, {
        method: 'POST',
        idempotencyScope: 'vendor-verification',
        body: { cacNumber, tinNumber: tinNumber || undefined, idType, idDocumentUrl, utilityBillUrl },
      }), 'Updated verification documents submitted for Operations review.');
    return;
  }
});

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
    state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data: { session } } = await state.client.auth.getSession();
    state.session = session;

    state.client.auth.onAuthStateChange((_event, nextSession) => {
      state.session = nextSession;
      if (!nextSession) {
        state.dataAbortController?.abort();
        state.merchants = [];
        state.merchant = null;
        state.overview = null;
        state.products = [];
        state.orders = [];
        state.returns = [];
        state.team = [];
        state.categories = [];
        state.authMode = 'signin';
        render();
      }
    });

    if (session) {
      await loadWorkspace();
    } else {
      state.loading = false;
      render();
    }
  } catch (error) {
    state.workspaceError = requestErrorMessage(error, 'The portal could not initialize its live services.');
    state.loading = false;
    render();
  }

  // Smooth dismiss of the branded beige splash screen
  setTimeout(dismissSplash, 900);
}

boot();
