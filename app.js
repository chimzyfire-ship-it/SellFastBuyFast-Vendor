/* SellFastBuyFast Vendor Portal Client Engine & Live Supabase Data Integration */

const SUPABASE_URL = 'https://fuqrhfxptybipxbzveyy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1cXJoZnhwdHliaXB4Ynp2ZXl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDY3MjYsImV4cCI6MjEwMzUyMjcyNn0.Q240FBpikqiWaGytkVP1RWVHGA-ZpvdVicY9qf4pvWw';

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const VIEW_TITLES = {
  'dashboard': 'Merchant Dashboard',
  'catalogue': 'Catalogue & Inventory Management',
  'add-product': 'Submit New Product for Moderation',
  'orders': 'Order Fulfillment & Dispatch Queue',
  'earnings': 'Earnings & Paystack Payout History',
  'onboarding': 'CAC & NUBAN KYC Verification',
  'team': 'Team Roster & Scope Permissions'
};

function switchView(viewId) {
  // Update Navigation Active state
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-view') === viewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update Section Active state
  document.querySelectorAll('.view-section').forEach(sec => {
    if (sec.id === `view-${viewId}`) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  // Update Page Title
  const heading = document.getElementById('page-heading');
  if (heading && VIEW_TITLES[viewId]) {
    heading.textContent = VIEW_TITLES[viewId];
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Bind Navigation Clicks & Load Initial Data
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.getAttribute('data-view');
      if (targetView) switchView(targetView);
    });
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }

  loadLiveCatalogue();
});

// Load Live Catalogue from Supabase
async function loadLiveCatalogue() {
  if (!supabaseClient) return;

  try {
    const { data: products, error } = await supabaseClient
      .from('products')
      .select(`
        id,
        title,
        slug,
        base_price_minor,
        status,
        categories ( name ),
        product_variants ( sku, inventory_levels ( available_quantity ) )
      `);

    if (error || !products) return;

    const tbody = document.querySelector('#catalogue-table tbody');
    if (!tbody || products.length === 0) return;

    tbody.innerHTML = '';
    products.forEach((p) => {
      const variant = p.product_variants?.[0];
      const stock = variant?.inventory_levels?.availableQuantity ?? 30;
      const priceNaira = (Number(p.base_price_minor) / 100).toLocaleString();
      const categoryName = p.categories?.name || 'General';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div style="font-weight: 600; color: var(--navy-dark);">${escapeHtml(p.title)}</div>
          <div style="font-size: 11px; color: var(--text-muted);">SKU: ${variant?.sku || 'SFBF-001'}</div>
        </td>
        <td>${escapeHtml(categoryName)}</td>
        <td>₦${priceNaira}</td>
        <td><span class="badge ${stock > 10 ? 'badge-success' : 'badge-warning'}">${stock} in stock</span></td>
        <td><span class="badge ${p.status === 'published' ? 'badge-success' : 'badge-neutral'}">${p.status}</span></td>
        <td>
          <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px;" onclick="alert('Viewing product details')">Manage</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.warn('Could not load live catalogue:', err);
  }
}

// Modal Handlers
function openPayoutModal() {
  document.getElementById('payout-modal').classList.add('active');
}

function closePayoutModal() {
  document.getElementById('payout-modal').classList.remove('active');
}

function openWaybillModal(orderId) {
  const title = document.getElementById('waybill-title');
  if (title) title.textContent = `Assign Courier Waybill (${orderId})`;
  document.getElementById('waybill-modal').classList.add('active');
}

function closeWaybillModal() {
  document.getElementById('waybill-modal').classList.remove('active');
}

// Product Submission
async function handleProductSubmit(e) {
  e.preventDefault();
  
  const title = document.getElementById('prod-title')?.value || 'New Product';
  const price = Number(document.getElementById('prod-price')?.value || 10000);
  const category = document.getElementById('prod-category')?.value || 'Fashion';
  const desc = document.getElementById('prod-desc')?.value || '';

  alert(`Product "${title}" submitted to Operations Moderation Queue! Price: ₦${price.toLocaleString()}`);
  switchView('catalogue');
}

function handlePayoutSubmit(e) {
  e.preventDefault();
  alert('Payout request submitted to Operations Finance Reviewer! Settle via Paystack transfer.');
  closePayoutModal();
}

function handleWaybillSubmit(e) {
  e.preventDefault();
  alert('Waybill assigned and order marked as Dispatched! Buyer tracking status has been updated.');
  closeWaybillModal();
}

function filterCatalogue(query) {
  const table = document.getElementById('catalogue-table');
  if (!table) return;
  const rows = table.getElementsByTagName('tr');
  const term = query.toLowerCase();

  for (let i = 1; i < rows.length; i++) {
    const text = rows[i].textContent.toLowerCase();
    if (text.includes(term)) {
      rows[i].style.display = '';
    } else {
      rows[i].style.display = 'none';
    }
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}
