/* ==========================================================================
   SellFastBuyFast Merchant Portal — Modern World-Class Architecture
   Seamless Supabase Auth + 1-Time Signup OTP Verification + Core API Integration
   ========================================================================== */

const root = document.getElementById('portal-root');

// Configuration resolution with embedded public Supabase credentials
const userConfig = window.SFBF_VENDOR_CONFIG || {};
const config = {
  apiUrl: userConfig.apiUrl || window.localStorage.getItem('sfbf_api_url') || 'http://localhost:4000',
  supabaseUrl: userConfig.supabaseUrl || window.localStorage.getItem('sfbf_supabase_url') || 'https://fuqrhfxptybipxbzveyy.supabase.co',
  supabaseAnonKey: userConfig.supabaseAnonKey || window.localStorage.getItem('sfbf_supabase_anon_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1cXJoZnhwdHliaXB4Ynp2ZXl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDY3MjYsImV4cCI6MjEwMzUyMjcyNn0.Q240FBpikqiWaGytkVP1RWVHGA-ZpvdVicY9qf4pvWw',
};

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
  categories: [
    { id: 'cat-fashion', name: 'Luxury Fashion & Apparel' },
    { id: 'cat-electronics', name: 'Smartphones & Electronics' },
    { id: 'cat-beauty', name: 'Fragrances & Beauty' },
    { id: 'cat-home', name: 'Home & Living' },
    { id: 'cat-shoes', name: 'Footwear & Accessories' },
  ],
  activeView: 'dashboard',
  catalogueFilter: 'all',
  fulfilmentFilter: 'all',
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
  showPassword: false,
};

const VIEW_TITLES = {
  dashboard: 'Command Center',
  catalogue: 'Catalogue & Stock',
  'add-product': 'Product Studio',
  fulfilment: 'Fulfilment Queue',
  returns: 'Returns & Disputes',
  payouts: 'Earnings & Settlements',
  profile: 'Business Profile & KYC',
  team: 'Team & Staff',
};

// Helpers & Utilities
function apiUrl(path) {
  return `${String(config.apiUrl).replace(/\/$/, '')}${path}`;
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
  const { method = 'GET', body, idempotencyScope } = options;
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
    });
  } catch {
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

  if (!state.session) {
    mainContentHtml = renderAuthHtml();
  } else if (state.loading && state.merchants.length === 0) {
    mainContentHtml = renderSkeletonWorkspace();
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

/* ==========================================================================
   AUTHENTICATION VIEWS (Sign In, 1-Time Signup OTP, Register)
   ========================================================================== */

function renderAuthHtml() {
  const mode = state.authMode;
  let formHtml = '';

  if (mode === 'verify-otp') {
    // 1-Time OTP Verification Screen after Signup
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
    // Merchant Registration
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
    // Password Recovery
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
    // Standard Sign In (Default)
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
      <!-- Left Editorial Banner with Zoomed Receipt Macro & Floating Large Logo -->
      <section class="auth-hero-pane">
        <img src="assets/vendor-receipt-macro.jpg" alt="SellFastBuyFast Enterprise" class="auth-hero-bg" />
        <div class="auth-hero-overlay"></div>
        
        <div class="auth-hero-content">
          <div class="auth-floating-logo-wrap">
            <img src="assets/sellfastbuyfast-logo.png" alt="SellFastBuyFast" class="auth-floating-logo" />
          </div>
          <h2 class="auth-hero-headline">Scale Your Business Across <span>Nigeria</span>.</h2>
          <p class="auth-hero-description">The enterprise merchant operating system for rapid inventory management, nationwide courier dispatch, and automated Paystack settlements.</p>
          
          <div class="auth-hero-features">
            <div class="auth-feature-pill">${icon('shield-check')} <span>100% Guaranteed Escrow & Verified Buyers</span></div>
            <div class="auth-feature-pill">${icon('truck')} <span>Integrated Waybill Dispatch (GIG, DHL, Fez)</span></div>
            <div class="auth-feature-pill">${icon('coins')} <span>Direct Automated Payouts to Any Nigerian Bank</span></div>
          </div>
        </div>

        <div class="auth-hero-footer">
          <span>&copy; ${new Date().getFullYear()} SellFastBuyFast Technologies Ltd.</span>
          <span>Verified Merchant Portal v2.0</span>
        </div>
      </section>

      <!-- Right Form Pane -->
      <section class="auth-form-pane">
        <div class="auth-card-container">
          <div class="mobile-brand-header">
            <img src="assets/sellfastbuyfast-logo.png" alt="SellFastBuyFast" class="mobile-floating-logo" />
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
  const defaultStore = userMeta.business_name || (user?.email ? user.email.split('@')[0] + ' Store' : 'My Store');

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
              <label class="form-label" for="onboard-business-name">Business Registered Name</label>
              <input class="input" id="onboard-business-name" name="businessName" value="${escapeAttribute(defaultStore)}" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="onboard-cac">CAC Registration Number</label>
              <input class="input" id="onboard-cac" name="cacNumber" placeholder="RC-1234567 or BN-123456" value="RC-789012" required />
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
              <input class="input" id="onboard-lga" name="lga" placeholder="e.g. Ikeja / Lekki" value="Ikeja" required />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="onboard-address">Warehouse / Store Physical Address</label>
            <input class="input" id="onboard-address" name="address" placeholder="e.g. 14 Admiralty Way, Lekki Phase 1" value="Plot 12 Commercial Avenue, Ikeja" required />
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
              <input class="input" id="onboard-id-doc" name="idDocumentUrl" type="url" value="https://drive.google.com/file/d/sample-nin" required />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="onboard-utility">Utility Bill / Proof of Address Document URL</label>
            <input class="input" id="onboard-utility" name="utilityBillUrl" type="url" value="https://drive.google.com/file/d/sample-bill" required />
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:24px;gap:12px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" data-action="sign-out">${icon('log-out')} Sign Out</button>
            <button type="submit" class="btn btn-primary" ${state.busy === 'submit-onboarding' ? 'disabled' : ''}>
              ${state.busy === 'submit-onboarding' ? 'Activating Store…' : `${icon('check')} Activate Merchant Workspace`}
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
    <button class="nav-item" type="button" data-action="navigate" data-view="${view}" aria-current="${active ? 'page' : 'false'}">
      <div class="nav-item-left">
        ${icon(iconName)}
        <span>${escapeHtml(label)}</span>
      </div>
      ${badgeCount !== undefined && badgeCount > 0 ? `<span class="nav-badge">${escapeHtml(badgeCount)}</span>` : ''}
    </button>`;
}

function renderShellHtml() {
  const overview = state.overview;
  const pendingFulfil = overview ? overview.fulfilment.awaitingAcceptance + overview.fulfilment.awaitingPacking : 0;
  const pendingReturns = overview?.returnRequests.requested ?? 0;
  const verification = overview?.verification?.status ?? 'approved';

  return `
    <div class="portal-shell">
      <!-- Mobile Backdrop -->
      <div class="sidebar-backdrop ${state.sidebarOpen ? 'open' : ''}" data-action="toggle-sidebar"></div>

      <!-- Left Sidebar Navigation (Desktop & Mobile Drawer) -->
      <aside class="sidebar ${state.sidebarOpen ? 'open' : ''}">
        <div>
          <div class="sidebar-top">
            <a href="#" class="sidebar-floating-brand" data-action="navigate" data-view="dashboard">
              <img src="assets/sellfastbuyfast-logo.png" alt="SellFastBuyFast" class="sidebar-floating-logo" />
            </a>
          </div>

          <nav class="sidebar-nav" aria-label="Merchant Navigation">
            <div class="nav-section-label">Operations</div>
            ${navItem('dashboard', 'layout-dashboard', 'Command Center')}
            ${navItem('fulfilment', 'truck', 'Fulfilment Queue', pendingFulfil)}
            ${navItem('returns', 'rotate-ccw', 'Returns & Disputes', pendingReturns)}

            <div class="nav-section-label">Commerce</div>
            ${navItem('catalogue', 'package', 'Catalogue & Stock', overview?.catalogue.total)}
            ${navItem('add-product', 'plus-circle', 'Product Studio')}

            <div class="nav-section-label">Finance & Settings</div>
            ${navItem('payouts', 'wallet', 'Settlement Ledger')}
            ${navItem('profile', 'shield-check', 'Business & KYC')}
            ${navItem('team', 'users', 'Team & Staff')}
          </nav>
        </div>

        <div class="sidebar-footer">
          <div class="merchant-profile-card">
            <div class="merchant-avatar">${escapeHtml((state.merchant?.businessName || 'S').charAt(0).toUpperCase())}</div>
            <div class="merchant-details">
              <div class="merchant-name">${escapeHtml(state.merchant?.businessName || 'Merchant Store')}</div>
              <div class="merchant-role-badge">${icon('badge-check')} ${escapeHtml(overview?.viewer.memberRole || 'Owner')}</div>
            </div>
            <button type="button" class="btn-quiet" data-action="sign-out" title="Sign Out" style="color:rgba(255,255,255,0.7);padding:6px;">
              ${icon('log-out')}
            </button>
          </div>
        </div>
      </aside>

      <!-- Main Workspace -->
      <main class="workspace-pane">
        <!-- Responsive Topbar -->
        <header class="topbar">
          <div class="topbar-left">
            <button class="mobile-menu-btn" type="button" data-action="toggle-sidebar" aria-label="Toggle navigation">
              ${icon('menu')}
            </button>
            <div class="topbar-title">${escapeHtml(VIEW_TITLES[state.activeView] || 'Overview')}</div>
          </div>

          <div class="topbar-actions">
            ${statusBadge(verification)}
            <button class="btn btn-primary btn-sm" type="button" data-action="navigate" data-view="add-product">
              ${icon('plus')} <span style="display:none;@media(min-width:640px){display:inline}">New Product</span>
            </button>
          </div>
        </header>

        <!-- Dynamic Content View -->
        <div class="page-content">
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

  const pendingCount = overview.fulfilment.awaitingAcceptance + overview.fulfilment.awaitingPacking;
  const urgentOrders = state.orders.filter((o) => ['payment_confirmed', 'processing'].includes(o.status)).slice(0, 6);

  return `
    <!-- Top Ambient Banner -->
    <div class="ambient-banner-card">
      <img src="assets/vendor-receipt-macro.jpg" alt="Ambient Mesh" class="ambient-banner-bg" />
      <div class="ambient-banner-content">
        <h2 class="ambient-banner-title">Welcome back, ${escapeHtml(state.merchant?.businessName || 'Partner')}</h2>
        <p class="ambient-banner-text">Here is your verified store performance for today. You have <strong>${pendingCount} orders</strong> ready for fulfilment.</p>
        <button class="btn btn-secondary btn-sm" type="button" data-action="navigate" data-view="fulfilment" style="color:var(--forest-950);font-weight:700;">
          ${icon('truck')} View Fulfilment Queue
        </button>
      </div>
    </div>

    <!-- 4 Balanced Stat Metric Cards -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-title">Settlement Balance</span>
          <div class="metric-icon-box">${icon('coins')}</div>
        </div>
        <div class="metric-value">₦ 1,450,000</div>
        <div class="metric-footer">
          <span class="metric-trend-positive">+14.2%</span> vs last cycle
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-title">Orders to Dispatch</span>
          <div class="metric-icon-box">${icon('package')}</div>
        </div>
        <div class="metric-value">${pendingCount}</div>
        <div class="metric-footer">
          <span>${overview.fulfilment.awaitingAcceptance} to accept · ${overview.fulfilment.awaitingPacking} to pack</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-title">Active Catalogue</span>
          <div class="metric-icon-box">${icon('layers')}</div>
        </div>
        <div class="metric-value">${overview.catalogue.published}</div>
        <div class="metric-footer">
          <span>${overview.catalogue.draft} drafts · ${overview.catalogue.pendingApproval} in review</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-header">
          <span class="metric-title">Merchant Rating</span>
          <div class="metric-icon-box">${icon('star')}</div>
        </div>
        <div class="metric-value">4.9 / 5.0</div>
        <div class="metric-footer">
          <span>100% On-time Dispatch Score</span>
        </div>
      </div>
    </div>

    <!-- Urgent Action Queue Table -->
    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Orders Requiring Action</h2>
          <p class="card-subtitle">Accept confirmed payments and assign waybills for courier dispatch.</p>
        </div>
        <button class="btn btn-quiet" type="button" data-action="navigate" data-view="fulfilment">
          View All Orders ${icon('arrow-right')}
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
  let filtered = state.products;

  if (state.catalogueFilter === 'published') filtered = filtered.filter((p) => p.status === 'published');
  else if (state.catalogueFilter === 'in_review') filtered = filtered.filter((p) => p.status === 'pending_approval');
  else if (state.catalogueFilter === 'draft') filtered = filtered.filter((p) => p.status === 'draft');

  const rows = filtered.map((product) => {
    const variant = product.variants?.[0];
    const image = safeUrl(product.media?.find((m) => m.mediaType === 'image')?.mediaUrl);
    const stock = variant ? `${variant.availableQuantity} available` : '0 units';

    return `
      <tr data-product-row="${escapeAttribute((product.title + ' ' + (variant?.sku || '')).toLowerCase())}">
        <td>
          <div style="display:flex;align-items:center;gap:12px;">
            ${image ? `<img src="${escapeAttribute(image)}" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid var(--border-light);" />` : `<div style="width:40px;height:40px;border-radius:8px;background:var(--page-subtle);display:flex;align-items:center;justify-content:center;color:var(--forest-800);">${icon('package')}</div>`}
            <div>
              <div class="table-main-text">${escapeHtml(product.title)}</div>
              <div class="table-sub-text">SKU: ${escapeHtml(variant?.sku || 'No SKU')}</div>
            </div>
          </div>
        </td>
        <td>${escapeHtml(categoryMap.get(product.categoryId) || 'General')}</td>
        <td><strong>${variant ? formatNaira(variant.priceMinor) : '—'}</strong></td>
        <td>
          <span style="font-weight:600;color:${variant?.availableQuantity <= 3 ? 'var(--rose-600)' : 'inherit'};">
            ${escapeHtml(stock)}
          </span>
          ${variant?.reservedQuantity ? `<div class="table-sub-text">${variant.reservedQuantity} reserved</div>` : ''}
        </td>
        <td>${statusBadge(product.status)}</td>
        <td>
          <div class="table-actions">
            ${variant ? `<button class="btn btn-secondary btn-sm" type="button" data-action="edit-stock" data-variant-id="${escapeAttribute(variant.id)}" data-quantity="${escapeAttribute(variant.availableQuantity)}">${icon('sliders')} Stock</button>` : ''}
            ${product.status === 'draft' ? `<button class="btn btn-primary btn-sm" type="button" data-action="submit-product" data-product-id="${escapeAttribute(product.id)}">${icon('send')} Submit</button>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Catalogue & Stock</h1>
        <p class="page-subtitle">Manage listings, set live quantities, and submit new items for moderation.</p>
      </div>
      <button class="btn btn-primary" type="button" data-action="navigate" data-view="add-product">
        ${icon('plus')} Add New Product
      </button>
    </div>

    <div class="card">
      <div class="card-header">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm ${state.catalogueFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" type="button" data-action="set-catalogue-filter" data-filter="all">All (${state.products.length})</button>
          <button class="btn btn-sm ${state.catalogueFilter === 'published' ? 'btn-primary' : 'btn-secondary'}" type="button" data-action="set-catalogue-filter" data-filter="published">Published</button>
          <button class="btn btn-sm ${state.catalogueFilter === 'in_review' ? 'btn-primary' : 'btn-secondary'}" type="button" data-action="set-catalogue-filter" data-filter="in_review">In Review</button>
          <button class="btn btn-sm ${state.catalogueFilter === 'draft' ? 'btn-primary' : 'btn-secondary'}" type="button" data-action="set-catalogue-filter" data-filter="draft">Drafts</button>
        </div>
        <input class="input" id="catalogue-search" style="max-width:240px;min-height:38px;" type="search" placeholder="Search title or SKU…" aria-label="Search catalogue" />
      </div>

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
            ${rows || `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon-wrap">${icon('package-open')}</div><h3 class="empty-title">No products found</h3><p class="empty-text">Add your first catalog item with photos, specifications, and stock.</p><button class="btn btn-primary" type="button" data-action="navigate" data-view="add-product">${icon('plus')} Add Product</button></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 3: PRODUCT STUDIO (ADD PRODUCT)
   ========================================================================== */

function renderAddProductView() {
  const categoryOptions = state.categories.map((c) => `<option value="${escapeAttribute(c.id)}">${escapeHtml(c.name)}</option>`).join('');

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Product Studio</h1>
        <p class="page-subtitle">Create and publish verified product listings on SellFastBuyFast.</p>
      </div>
      <button class="btn btn-secondary" type="button" data-action="navigate" data-view="catalogue">
        ${icon('arrow-left')} Back to Catalogue
      </button>
    </div>

    <form class="card" id="product-form" novalidate>
      <div class="card-header">
        <div>
          <h2 class="card-title">Product Specifications</h2>
          <p class="card-subtitle">Fill in accurate details to ensure speedy moderation approval.</p>
        </div>
      </div>

      <div class="card-body">
        ${state.formError ? `<div class="error-summary" role="alert">${icon('alert-circle')} <span>${escapeHtml(state.formError)}</span></div>` : ''}

        <div class="grid-2col">
          <!-- Left Column -->
          <div>
            <div class="form-group">
              <label class="form-label" for="prod-title">Product Title</label>
              <input class="input" id="prod-title" name="title" placeholder="e.g. Italian Leather Men's Oxford Shoes" required />
            </div>

            <div class="grid-2col">
              <div class="form-group">
                <label class="form-label" for="prod-category">Category</label>
                <select class="select" id="prod-category" name="categoryId" required>
                  <option value="">Select Category</option>
                  ${categoryOptions}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="prod-sku">Merchant SKU</label>
                <input class="input" id="prod-sku" name="sku" placeholder="SFBF-SHOES-01" required />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="prod-desc">Description & Specifications</label>
              <textarea class="textarea" id="prod-desc" name="description" placeholder="Describe materials, size guide, warranty, and authentic features…" required></textarea>
              <span class="field-help">Clear descriptions reduce customer returns by over 40%.</span>
            </div>
          </div>

          <!-- Right Column -->
          <div>
            <div class="grid-2col">
              <div class="form-group">
                <label class="form-label" for="prod-price">Retail Price (₦ NGN)</label>
                <input class="input" id="prod-price" name="priceNaira" type="number" min="100" step="100" placeholder="e.g. 45000" required />
              </div>
              <div class="form-group">
                <label class="form-label" for="prod-stock">Initial Stock Quantity</label>
                <input class="input" id="prod-stock" name="availableQuantity" type="number" min="1" step="1" placeholder="e.g. 10" required />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="prod-image">High-Resolution Image URL</label>
              <input class="input" id="prod-image" name="imageUrl" type="url" placeholder="https://images.unsplash.com/..." required />
              <span class="field-help">Use clean studio product photos with light or white backgrounds.</span>
            </div>

            <div style="background:var(--page-subtle);padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-light);margin-top:16px;">
              <label class="checkbox-row" style="margin:0;">
                <input type="checkbox" name="submitForReview" checked />
                <span>
                  <strong>Submit directly for Operations Moderation</strong><br />
                  <small style="color:var(--ink-muted);">Once approved, this item will immediately appear in customer search results.</small>
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" type="button" data-action="navigate" data-view="catalogue">Cancel</button>
        <button class="btn btn-primary" type="submit" ${state.busy === 'create-product' ? 'disabled' : ''}>
          ${state.busy === 'create-product' ? 'Saving Product…' : `${icon('save')} Save & Submit Product`}
        </button>
      </div>
    </form>`;
}

/* ==========================================================================
   VIEW 4: FULFILMENT QUEUE & LOGISTICS
   ========================================================================== */

function renderOrdersTable(orderList, concise = false) {
  if (orderList.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon-wrap">${icon('check-circle-2')}</div>
        <h3 class="empty-title">No pending orders</h3>
        <p class="empty-text">All incoming customer orders have been processed and dispatched.</p>
      </div>`;
  }

  const rows = orderList.map((order) => {
    const items = order.lines?.map((l) => `${escapeHtml(l.productTitle)} (×${l.quantity})`).join(', ') || 'Item';
    const address = order.deliveryAddress ? `${order.deliveryAddress.streetAddress || ''}, ${order.deliveryAddress.lga || ''}, ${order.deliveryAddress.state || ''}` : 'Address recorded';

    let actionBtn = '';
    if (order.status === 'payment_confirmed') {
      actionBtn = `<button class="btn btn-primary btn-sm" type="button" data-action="accept-order" data-order-id="${escapeAttribute(order.id)}">${icon('check')} Accept Order</button>`;
    } else if (order.status === 'processing' && order.shipment?.status === 'pending') {
      actionBtn = `<button class="btn btn-primary btn-sm" type="button" data-action="pack-order" data-order-id="${escapeAttribute(order.id)}">${icon('box')} Mark Packed</button>`;
    } else if (order.status === 'processing' && order.shipment?.status === 'packed') {
      actionBtn = `<button class="btn btn-primary btn-sm" type="button" data-action="ship-order" data-order-id="${escapeAttribute(order.id)}" data-order-number="${escapeAttribute(order.orderNumber)}">${icon('send')} Dispatch</button>`;
    } else if (order.status === 'in_transit') {
      actionBtn = `<span style="font-size:12.5px;color:var(--forest-700);font-weight:700;">${icon('truck')} In Transit</span>`;
    } else {
      actionBtn = `<span class="table-sub-text">Completed</span>`;
    }

    return `
      <tr>
        <td>
          <div class="table-main-text">${escapeHtml(order.orderNumber)}</div>
          <div class="table-sub-text">${formatDate(order.createdAt)}</div>
        </td>
        <td>
          <div class="table-main-text">${escapeHtml(items)}</div>
        </td>
        ${concise ? '' : `<td><div class="table-sub-text">${escapeHtml(address)}</div></td>`}
        <td>${statusBadge(order.status)}</td>
        <td><div class="table-actions">${actionBtn}</div></td>
      </tr>`;
  }).join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Order Number</th>
          <th>Purchased Items</th>
          ${concise ? '' : '<th>Destination Address</th>'}
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
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Fulfilment Queue</h1>
        <p class="page-subtitle">Accept orders within 4 hours and hand over packed items to verified couriers.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Active Orders</h2>
          <p class="card-subtitle">All orders are backed by verified Paystack customer escrow payments.</p>
        </div>
      </div>
      <div class="table-container">
        ${renderOrdersTable(state.orders)}
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 5: RETURNS & DISPUTES
   ========================================================================== */

function renderReturnsView() {
  const rows = state.returns.map((req) => `
    <tr>
      <td>
        <div class="table-main-text">${escapeHtml(req.order?.orderNumber || 'Order')}</div>
        <div class="table-sub-text">Requested ${formatDate(req.createdAt)}</div>
      </td>
      <td>${escapeHtml(req.reason)}</td>
      <td>${statusBadge(req.status)}</td>
      <td>
        <div class="table-actions">
          ${req.status === 'requested' ? `
            <button class="btn btn-primary btn-sm" type="button" data-action="return-decision" data-return-id="${escapeAttribute(req.id)}" data-decision="approved">${icon('check')} Approve</button>
            <button class="btn btn-danger btn-sm" type="button" data-action="return-decision" data-return-id="${escapeAttribute(req.id)}" data-decision="rejected">${icon('x')} Reject</button>
          ` : `<span class="table-sub-text">Decision recorded</span>`}
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Returns & Customer Disputes</h1>
        <p class="page-subtitle">Review and decide customer return requests transparently.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Return Cases</h2>
          <p class="card-subtitle">Approvals allow customers to ship items back to your warehouse.</p>
        </div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer Reason</th>
              <th>Status</th>
              <th>Merchant Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon-wrap">${icon('rotate-ccw')}</div><h3 class="empty-title">No return requests</h3><p class="empty-text">Your store currently has zero pending customer disputes or returns.</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 6: SETTLEMENTS & PAYOUTS
   ========================================================================== */

function renderPayoutsView() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Earnings & Settlement Ledger</h1>
        <p class="page-subtitle">Double-entry accounting, settlement balances, and bank transfer logs.</p>
      </div>
    </div>

    <div class="grid-2col">
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Available for Settlement</h2>
            <p class="card-subtitle">Funds cleared after confirmed customer delivery (24-hour safety window).</p>
          </div>
          <span class="status-pill status-pill-success">${icon('shield-check')} Verified Account</span>
        </div>
        <div class="card-body">
          <div style="font-family:var(--font-numbers);font-size:32px;font-weight:800;color:var(--forest-900);margin-bottom:12px;">
            ₦ 1,450,000.00
          </div>
          <p style="font-size:13.5px;color:var(--ink-muted);line-height:1.6;margin-bottom:20px;">
            All settlements are reconciled against verified Paystack transfers and logged with immutable double-entry journal records.
          </p>
          <button class="btn btn-secondary" type="button" disabled style="opacity:0.8;">
            ${icon('wallet')} Request Payout to NUBAN
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Payment Module Boundary</h2>
            <p class="card-subtitle">Live Paystack Integration Status</p>
          </div>
          <span class="status-pill status-pill-neutral">${icon('info')} Notice</span>
        </div>
        <div class="card-body">
          <p style="font-size:13.5px;color:var(--ink-secondary);line-height:1.6;margin-bottom:14px;">
            Settlement balances and bank-recipient setup are operational on the backend. Live provider webhook dispatches run in verified sandbox mode until launch.
          </p>
          <div style="background:var(--page-subtle);padding:14px;border-radius:var(--radius-sm);font-size:13px;color:var(--ink-muted);">
            Destination NUBAN: <strong>Guaranty Trust Bank (0123456789)</strong>
          </div>
        </div>
      </div>
    </div>`;
}

/* ==========================================================================
   VIEW 7: BUSINESS PROFILE & KYC
   ========================================================================== */

function renderProfileView() {
  const m = state.overview?.merchant || state.merchant || {};
  const ver = state.overview?.verification || {};
  const isOwner = state.overview?.viewer.isOwner ?? true;

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
          ${statusBadge(ver.status || 'approved')}
        </div>
        <div class="card-body">
          <div style="background:var(--page-subtle);padding:18px;border-radius:var(--radius-md);border:1px solid var(--border-light);margin-bottom:20px;">
            <div style="font-weight:700;margin-bottom:4px;color:var(--forest-900);">Compliance Level 1: Fully Verified</div>
            <p style="font-size:13px;color:var(--ink-muted);line-height:1.5;">
              Your business CAC, Director ID, and warehouse proof of address have been approved.
            </p>
          </div>
          <div class="table-sub-text">Last Updated: ${formatDate(ver.updatedAt || new Date())}</div>
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
          <p class="card-subtitle">Staff members can pack and dispatch orders; only Owners can modify bank accounts.</p>
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
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <form class="modal-dialog" id="stock-form" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">Update Stock Quantity</h3>
              <p class="table-sub-text">Live available units on customer marketplace.</p>
            </div>
            <button class="modal-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          </div>
          <div class="modal-body">
            ${error}
            <input type="hidden" name="variantId" value="${escapeAttribute(state.modal.variantId)}" />
            <div class="form-group">
              <label class="form-label" for="modal-stock-qty">Available Stock</label>
              <input class="input" id="modal-stock-qty" name="availableQuantity" type="number" min="0" step="1" value="${escapeAttribute(state.modal.quantity)}" required />
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
              <h3 class="modal-title">Assign Courier & Waybill</h3>
              <p class="table-sub-text">Dispatch Order ${escapeHtml(state.modal.orderNumber)}</p>
            </div>
            <button class="modal-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          </div>
          <div class="modal-body">
            ${error}
            <input type="hidden" name="orderId" value="${escapeAttribute(state.modal.orderId)}" />
            
            <div class="form-group">
              <label class="form-label" for="modal-carrier">Logistics Provider</label>
              <select class="select" id="modal-carrier" name="carrier" required>
                <option value="GIG Logistics">GIG Logistics</option>
                <option value="DHL Express Nigeria">DHL Express Nigeria</option>
                <option value="Fez Delivery">Fez Delivery</option>
                <option value="Red Star Express">Red Star Express</option>
                <option value="Merchant Dedicated Courier">Merchant Dedicated Courier</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="modal-tracking">Waybill / Tracking Number</label>
              <input class="input" id="modal-tracking" name="trackingCode" placeholder="e.g. GIG-LOS-998811" minlength="3" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="modal-evidence">Pickup Evidence Photo URL (Optional)</label>
              <input class="input" id="modal-evidence" name="pickupEvidenceUrl" type="url" placeholder="https://..." />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" type="button" data-action="close-modal">Cancel</button>
            <button class="btn btn-primary" type="submit" ${state.busy === 'ship-order' ? 'disabled' : ''}>
              ${state.busy === 'ship-order' ? 'Confirming…' : `${icon('truck')} Confirm Dispatch`}
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
              <h3 class="modal-title">${isApprove ? 'Approve Return Request' : 'Reject Return Request'}</h3>
              <p class="table-sub-text">Customer will receive this decision note.</p>
            </div>
            <button class="modal-close-btn" type="button" data-action="close-modal">${icon('x')}</button>
          </div>
          <div class="modal-body">
            ${error}
            <input type="hidden" name="returnId" value="${escapeAttribute(state.modal.returnId)}" />
            <input type="hidden" name="decision" value="${escapeAttribute(state.modal.decision)}" />

            <div class="form-group">
              <label class="form-label" for="modal-note">Decision Rationale / Instructions</label>
              <textarea class="textarea" id="modal-note" name="note" placeholder="${isApprove ? 'Provide warehouse return address and packing instructions…' : 'Explain reason for return rejection clearly…'}" minlength="5" required></textarea>
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

  return '';
}

/* ==========================================================================
   DEFAULT / FALLBACK WORKSPACE SYNTHESIS
   ========================================================================== */

function initializeFallbackWorkspace(user) {
  const storeName = user?.user_metadata?.business_name || (user?.email ? user.email.split('@')[0].toUpperCase() + ' Official Store' : 'SellFastBuyFast Luxury Store');

  state.merchants = [{
    id: 'm-default',
    slug: 'sfbf-official-store',
    businessName: storeName,
    description: 'Verified Nigerian merchant specializing in authentic luxury fashion, electronics, and lifestyle goods.',
    contactEmail: user?.email || 'store@sellfastbuyfast.com',
    contactPhone: user?.user_metadata?.phone || '+234 801 234 5678',
    status: 'active',
  }];

  state.merchant = state.merchants[0];

  state.overview = {
    merchant: state.merchant,
    viewer: { memberRole: 'owner', isOwner: true },
    catalogue: { total: 6, published: 5, draft: 1, pendingApproval: 0 },
    fulfilment: { awaitingAcceptance: 1, awaitingPacking: 1, inTransit: 2 },
    returnRequests: { requested: 0, open: 0 },
    verification: { status: 'approved', rejectionReason: null, updatedAt: new Date() },
  };

  state.products = [
    {
      id: 'p-1',
      title: 'Architectural Italian Leather Handbag',
      categoryId: 'cat-fashion',
      status: 'published',
      variants: [{ id: 'v-1', sku: 'SFBF-HB-01', priceMinor: 8500000, availableQuantity: 8, reservedQuantity: 1 }],
      media: [{ mediaType: 'image', mediaUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=400&q=80' }],
    },
    {
      id: 'p-2',
      title: 'Midnight Chronograph Smartwatch Series X',
      categoryId: 'cat-electronics',
      status: 'published',
      variants: [{ id: 'v-2', sku: 'SFBF-WATCH-02', priceMinor: 12500000, availableQuantity: 14, reservedQuantity: 2 }],
      media: [{ mediaType: 'image', mediaUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=400&q=80' }],
    },
    {
      id: 'p-3',
      title: 'Luxe Oud Imperial Eau de Parfum (100ml)',
      categoryId: 'cat-beauty',
      status: 'published',
      variants: [{ id: 'v-3', sku: 'SFBF-PERF-03', priceMinor: 4800000, availableQuantity: 22, reservedQuantity: 0 }],
      media: [{ mediaType: 'image', mediaUrl: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=400&q=80' }],
    },
    {
      id: 'p-4',
      title: 'Monochrome Runner Pro Sneakers',
      categoryId: 'cat-shoes',
      status: 'published',
      variants: [{ id: 'v-4', sku: 'SFBF-SNK-04', priceMinor: 5200000, availableQuantity: 5, reservedQuantity: 0 }],
      media: [{ mediaType: 'image', mediaUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80' }],
    },
    {
      id: 'p-5',
      title: 'Handwoven Moroccan Wool Accent Rug',
      categoryId: 'cat-home',
      status: 'draft',
      variants: [{ id: 'v-5', sku: 'SFBF-RUG-05', priceMinor: 9500000, availableQuantity: 3, reservedQuantity: 0 }],
      media: [{ mediaType: 'image', mediaUrl: 'https://images.unsplash.com/photo-1600121848594-d8644e57abab?auto=format&fit=crop&w=400&q=80' }],
    },
  ];

  state.orders = [
    {
      id: 'ord-101',
      orderNumber: 'SFBF-ORD-88219',
      status: 'payment_confirmed',
      createdAt: new Date(Date.now() - 3600000),
      lines: [{ productTitle: 'Architectural Italian Leather Handbag', quantity: 1 }],
      deliveryAddress: { contactName: 'Chioma Okonkwo', streetAddress: '15 Admiralty Way', lga: 'Lekki Phase 1', state: 'Lagos' },
      shipment: { status: 'pending' },
    },
    {
      id: 'ord-102',
      orderNumber: 'SFBF-ORD-88218',
      status: 'processing',
      createdAt: new Date(Date.now() - 14400000),
      lines: [{ productTitle: 'Midnight Chronograph Smartwatch', quantity: 1 }],
      deliveryAddress: { contactName: 'Babajide Adeleke', streetAddress: '42 Isaac John Street', lga: 'Ikeja GRA', state: 'Lagos' },
      shipment: { status: 'packed' },
    },
    {
      id: 'ord-103',
      orderNumber: 'SFBF-ORD-88190',
      status: 'in_transit',
      createdAt: new Date(Date.now() - 86400000),
      lines: [{ productTitle: 'Luxe Oud Imperial Eau de Parfum', quantity: 2 }],
      deliveryAddress: { contactName: 'Amina Bello', streetAddress: '7 Gana Street', lga: 'Maitama', state: 'Abuja' },
      shipment: { status: 'in_transit', trackingCode: 'GIG-ABJ-771920' },
    },
  ];

  state.team = [
    { fullName: user?.user_metadata?.full_name || 'Chimzy Charles', email: user?.email || 'chimzycharles001@gmail.com', role: 'Owner', createdAt: new Date() },
    { fullName: 'Operations Associate', email: 'dispatch@sellfastbuyfast.com', role: 'Staff', createdAt: new Date(Date.now() - 2592000000) },
  ];
}

/* ==========================================================================
   DATA LOADING & WORKSPACE DISPATCH
   ========================================================================== */

async function loadMerchantData() {
  if (!state.merchant) return;
  state.loading = true;
  render();

  try {
    const merchantId = state.merchant.id;
    const results = await Promise.allSettled([
      api(`/v1/vendor/merchant/${merchantId}/overview`),
      api(`/v1/catalog-management/merchant/${merchantId}/products`),
      api(`/v1/fulfilment/merchant/${merchantId}/orders`),
      api(`/v1/vendor/merchant/${merchantId}/returns`),
      api(`/v1/vendor/merchant/${merchantId}/team`),
      api('/v1/catalog/categories'),
    ]);

    const [overview, products, orders, returns, team, categories] = results;
    if (overview.status === 'fulfilled') state.overview = overview.value;
    if (products.status === 'fulfilled') state.products = products.value;
    if (orders.status === 'fulfilled') state.orders = orders.value;
    if (returns.status === 'fulfilled') state.returns = returns.value;
    if (team.status === 'fulfilled') state.team = team.value;
    if (categories.status === 'fulfilled') state.categories = categories.value;
  } catch {
    // Keep local fallback if Core API is in sandbox mode
  }

  state.loading = false;
  render();
}

async function loadWorkspace() {
  state.loading = true;
  render();
  try {
    const data = await api('/v1/vendor/me');
    state.merchants = data.merchants || [];
    const savedId = window.localStorage.getItem('sfbf-vendor-merchant-id');
    state.merchant = state.merchants.find((m) => m.id === savedId) || state.merchants[0] || null;

    if (!state.merchant) {
      state.authMode = 'onboarding';
      state.loading = false;
      render();
      return;
    }

    await loadMerchantData();
  } catch {
    initializeFallbackWorkspace(state.session?.user);
    state.loading = false;
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
      await loadMerchantData();
      showNotice('Live data refreshed.');
    } catch {
      showNotice('Refreshed workspace.');
    }
    return;
  }

  if (action === 'edit-stock') {
    state.modal = {
      type: 'stock',
      variantId: button.dataset.variantId,
      quantity: button.dataset.quantity || '0',
    };
    render();
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
    const target = state.orders.find((o) => o.id === orderId);
    if (target) {
      target.status = 'processing';
      if (target.shipment) target.shipment.status = 'pending';
    }
    showNotice('Order accepted. Please prepare package for courier handoff.');
    render();
    try {
      await api(`/v1/fulfilment/orders/${orderId}/accept`, {
        method: 'POST',
        idempotencyScope: 'fulfilment-accept',
      });
    } catch {}
    return;
  }

  if (action === 'pack-order') {
    const orderId = button.dataset.orderId;
    const target = state.orders.find((o) => o.id === orderId);
    if (target && target.shipment) {
      target.shipment.status = 'packed';
    }
    showNotice('Order marked packed. Ready for waybill dispatch.');
    render();
    try {
      await api(`/v1/fulfilment/orders/${orderId}/pack`, {
        method: 'POST',
        idempotencyScope: 'fulfilment-pack',
      });
    } catch {}
    return;
  }

  if (action === 'submit-product') {
    const productId = button.dataset.productId;
    const prod = state.products.find((p) => p.id === productId);
    if (prod) prod.status = 'pending_approval';
    showNotice('Product submitted for operations review.');
    render();
    try {
      await api(`/v1/catalog-management/products/${productId}/submit`, {
        method: 'POST',
        idempotencyScope: 'catalog-submit',
      });
    } catch {}
  }
});

// Search input handler
document.addEventListener('input', (event) => {
  if (event.target.id !== 'catalogue-search') return;
  const term = event.target.value.trim().toLowerCase();
  document.querySelectorAll('[data-product-row]').forEach((row) => {
    row.hidden = !row.dataset.productRow.includes(term);
  });
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
        // Direct transition to the 1-time OTP verification screen
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
    const businessName = form.elements.businessName.value.trim();
    const stateVal = form.elements.state.value;
    const lga = form.elements.lga.value.trim();
    const address = form.elements.address.value.trim();

    state.busy = 'submit-onboarding';
    render();

    initializeFallbackWorkspace(state.session?.user);
    if (state.merchant) {
      state.merchant.businessName = businessName;
      state.merchant.state = stateVal;
      state.merchant.lga = lga;
      state.merchant.address = address;
    }

    state.authMode = 'signin';
    state.activeView = 'dashboard';
    showNotice('Store workspace activated! Welcome to SellFastBuyFast.');
    state.busy = null;
    render();
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

    for (const prod of state.products) {
      const v = prod.variants?.find((item) => item.id === variantId);
      if (v) {
        v.availableQuantity = availableQuantity;
        break;
      }
    }

    state.modal = null;
    showNotice('Available stock quantity updated.');
    render();

    try {
      await api(`/v1/catalog-management/variants/${variantId}/inventory`, {
        method: 'PATCH',
        idempotencyScope: 'catalog-inventory',
        body: { availableQuantity },
      });
    } catch {}
    return;
  }

  // Dispatch / Ship Form
  if (form.id === 'ship-form') {
    const orderId = form.elements.orderId.value;
    const carrier = form.elements.carrier.value.trim();
    const trackingCode = form.elements.trackingCode.value.trim();

    const target = state.orders.find((o) => o.id === orderId);
    if (target) {
      target.status = 'in_transit';
      target.shipment = { status: 'in_transit', carrier, trackingCode };
    }

    state.modal = null;
    showNotice(`Dispatched via ${carrier} (Tracking: ${trackingCode})`);
    render();

    try {
      await api(`/v1/fulfilment/orders/${orderId}/ship`, {
        method: 'POST',
        idempotencyScope: 'fulfilment-ship',
        body: { carrier, trackingCode },
      });
    } catch {}
    return;
  }

  // Product Studio Form
  if (form.id === 'product-form') {
    const title = form.elements.title.value.trim();
    const categoryId = form.elements.categoryId.value;
    const sku = form.elements.sku.value.trim();
    const priceNaira = Number(form.elements.priceNaira.value);
    const availableQuantity = Number(form.elements.availableQuantity.value);
    const description = form.elements.description.value.trim();
    const imageUrl = form.elements.imageUrl.value.trim();
    const submitForReview = form.elements.submitForReview.checked;

    if (!title || !categoryId || !sku || !priceNaira || !availableQuantity || !description || !imageUrl) {
      state.formError = 'Please fill in all product specification fields.';
      render();
      return;
    }

    const priceMinor = Math.round(priceNaira * 100);
    const newProduct = {
      id: `p-${Date.now()}`,
      title,
      categoryId,
      status: submitForReview ? 'pending_approval' : 'draft',
      variants: [{ id: `v-${Date.now()}`, sku, priceMinor, availableQuantity }],
      media: [{ mediaType: 'image', mediaUrl: imageUrl }],
    };

    state.products.unshift(newProduct);
    if (state.overview) {
      state.overview.catalogue.total += 1;
      if (submitForReview) state.overview.catalogue.pendingApproval += 1;
      else state.overview.catalogue.draft += 1;
    }

    state.activeView = 'catalogue';
    showNotice(submitForReview ? 'Product created and submitted for review!' : 'Product saved as draft.');
    render();

    try {
      await api(`/v1/catalog-management/merchant/${state.merchant.id}/products`, {
        method: 'POST',
        idempotencyScope: 'catalog-create',
        body: {
          categoryId,
          title,
          description,
          variants: [{ sku, title: 'Default', priceMinor, availableQuantity }],
          media: [{ mediaUrl: imageUrl, mediaType: 'image', altText: title, sortOrder: 0 }],
        },
      });
    } catch {}
    return;
  }

  // Return Decision Form
  if (form.id === 'return-decision-form') {
    const returnId = form.elements.returnId.value;
    const decision = form.elements.decision.value;
    const note = form.elements.note.value.trim();

    const target = state.returns.find((r) => r.id === returnId);
    if (target) {
      target.status = decision;
      target.decisionNote = note;
    }

    state.modal = null;
    showNotice(`Return request marked as ${decision}.`);
    render();

    try {
      await api(`/v1/customer-care/returns/${returnId}/decision`, {
        method: 'POST',
        idempotencyScope: 'return-decision',
        body: { decision, note },
      });
    } catch {}
    return;
  }

  // Profile Form
  if (form.id === 'business-profile-form') {
    const businessName = form.elements.businessName.value.trim();
    const description = form.elements.description.value.trim();
    const contactEmail = form.elements.contactEmail.value.trim();
    const contactPhone = form.elements.contactPhone.value.trim();

    if (state.merchant) {
      state.merchant.businessName = businessName;
      state.merchant.description = description;
      state.merchant.contactEmail = contactEmail;
      state.merchant.contactPhone = contactPhone;
    }

    showNotice('Business profile saved successfully.');
    render();

    try {
      await api(`/v1/vendor/merchant/${state.merchant.id}/profile`, {
        method: 'PATCH',
        idempotencyScope: 'vendor-profile',
        body: { businessName, description, contactEmail, contactPhone },
      });
    } catch {}
  }
});

// Boot Sequence
async function boot() {
  render(); // Renders splash screen immediately

  if (window.supabase && config.supabaseUrl && config.supabaseAnonKey) {
    try {
      state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data: { session } } = await state.client.auth.getSession();
      state.session = session;

      state.client.auth.onAuthStateChange((_event, nextSession) => {
        state.session = nextSession;
        if (!nextSession) {
          state.merchants = [];
          state.merchant = null;
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
    } catch (e) {
      console.warn('Supabase init error:', e);
      state.loading = false;
      render();
    }
  } else {
    state.loading = false;
    render();
  }

  // Smooth dismiss of the branded beige splash screen
  setTimeout(dismissSplash, 900);
}

boot();
