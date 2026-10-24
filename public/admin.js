/**
 * ElectroHub Dedicated Owner / Admin Management Controller
 * Handles authentication, item listing, inventory, and order fulfillment.
 */

const adminState = {
  token: localStorage.getItem('electrohub_admin_token') || null,
  activeTab: 'add-product',
  selectedImageSource: 'url',
  uploadedImageUrl: null,
  inventoryList: [],
  allOrders: []
};

document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  verifyAdminAuth();
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ==========================================
// AUTHENTICATION CONTROLLER
// ==========================================

async function verifyAdminAuth() {
  const loginSection = document.getElementById('loginSection');
  const dashboardSection = document.getElementById('dashboardSection');

  if (!adminState.token) {
    loginSection.style.display = 'flex';
    dashboardSection.style.display = 'none';
    initIcons();
    return;
  }

  try {
    const res = await adminFetch('/api/admin/verify');
    const data = await res.json();

    if (data.success && data.authorized) {
      loginSection.style.display = 'none';
      dashboardSection.style.display = 'flex';
      refreshAdminData();
      updateLivePreview();
      initIcons();
    } else {
      logoutCleanUp();
    }
  } catch (err) {
    logoutCleanUp();
  }
}

async function handleOwnerLogin(e) {
  e.preventDefault();
  const password = document.getElementById('ownerPasswordInput').value;
  const loginBtn = document.getElementById('loginBtn');

  loginBtn.disabled = true;
  loginBtn.innerHTML = `<i data-lucide="loader"></i> Checking Passcode...`;
  initIcons();

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (data.success) {
      adminState.token = data.token;
      localStorage.setItem('electrohub_admin_token', data.token);
      showToast('Welcome back, Store Owner!', 'success');
      verifyAdminAuth();
    } else {
      showToast(data.message || 'Incorrect owner password', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to authentication server', 'error');
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = `<i data-lucide="shield-check"></i> Unlock Dashboard`;
    initIcons();
  }
}

async function handleOwnerLogout() {
  try {
    await adminFetch('/api/admin/logout', { method: 'POST' });
  } catch (e) {
    // Ignore error
  }
  logoutCleanUp();
  showToast('Owner session ended.', 'info');
}

function logoutCleanUp() {
  adminState.token = null;
  localStorage.removeItem('electrohub_admin_token');
  document.getElementById('loginSection').style.display = 'flex';
  document.getElementById('dashboardSection').style.display = 'none';
  document.getElementById('ownerPasswordInput').value = '';
  initIcons();
}

// Wrapper to attach owner auth token to protected requests
async function adminFetch(url, options = {}) {
  const headers = options.headers || {};
  if (adminState.token) {
    headers['Authorization'] = `Bearer ${adminState.token}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    logoutCleanUp();
    showToast('Session expired. Please log in again.', 'error');
    throw new Error('Unauthorized');
  }

  return response;
}

// ==========================================
// TABS & DATA REFRESH
// ==========================================

function switchAdminTab(tabName) {
  adminState.activeTab = tabName;

  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  document.querySelectorAll('.admin-tab-content').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });

  if (tabName === 'manage-inventory') {
    loadInventoryTable();
  } else if (tabName === 'customer-orders') {
    loadAdminOrders();
  } else if (tabName === 'analytics') {
    loadAnalytics();
  }

  initIcons();
}

async function refreshAdminData() {
  try {
    const [prodRes, ordersRes] = await Promise.all([
      fetch('/api/products'),
      adminFetch('/api/orders')
    ]);

    const prodData = await prodRes.json();
    const ordersData = await ordersRes.json();

    if (prodData.success) {
      document.getElementById('adminProductCount').textContent = prodData.count;
    }
    if (ordersData.success) {
      document.getElementById('adminOrdersCount').textContent = ordersData.count;
    }
  } catch (e) {
    console.error('Failed to refresh counts:', e);
  }
}

// ==========================================
// TAB 1: ADD NEW PRODUCT & LIVE PREVIEW
// ==========================================

function toggleImageInputSource() {
  const selected = document.querySelector('input[name="imageSource"]:checked').value;
  adminState.selectedImageSource = selected;

  document.getElementById('imageUrlInputWrapper').style.display = selected === 'url' ? 'block' : 'none';
  document.getElementById('imageUploadWrapper').style.display = selected === 'upload' ? 'block' : 'none';
  document.getElementById('imagePresetWrapper').style.display = selected === 'preset' ? 'grid' : 'none';

  updateLivePreview();
}

function selectPresetImage(url) {
  document.getElementById('newProdImageUrl').value = url;
  adminState.uploadedImageUrl = url;
  updateLivePreview();
  showToast('Preset photo selected!', 'info');
}

async function handleImageFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  showToast('Uploading custom photo...', 'info');

  try {
    const res = await adminFetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      adminState.uploadedImageUrl = data.url;
      updateLivePreview();
      showToast('Photo uploaded successfully!', 'success');
    } else {
      showToast(data.message || 'Upload failed', 'error');
    }
  } catch (err) {
    showToast('Failed to upload image file.', 'error');
  }
}

function getSelectedProductImage() {
  if (adminState.selectedImageSource === 'upload' && adminState.uploadedImageUrl) {
    return adminState.uploadedImageUrl;
  }
  const urlVal = document.getElementById('newProdImageUrl').value.trim();
  if (urlVal) return urlVal;
  return 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=800&q=80';
}

function updateLivePreview() {
  const name = document.getElementById('newProdName')?.value.trim() || 'Product Name Example';
  const category = document.getElementById('newProdCategory')?.value || 'Smartphones';
  const price = document.getElementById('newProdPrice')?.value || '150000';
  const origPrice = document.getElementById('newProdOrigPrice')?.value || '';
  const stock = document.getElementById('newProdStock')?.value || '10';
  const badge = document.getElementById('newProdBadge')?.value.trim() || 'New Arrival';
  const desc = document.getElementById('newProdDesc')?.value.trim() || 'Preview description will appear here as you type in the form...';
  const image = getSelectedProductImage();

  // Sync inline preview thumbnail in form (vital for mobile/phone view)
  const inlineThumb = document.getElementById('inlinePreviewThumb');
  const inlineSource = document.getElementById('inlinePreviewSource');
  const warningEl = document.getElementById('localPathWarning');
  const urlVal = document.getElementById('newProdImageUrl')?.value.trim() || '';

  if (inlineThumb) {
    inlineThumb.src = image;
  }
  if (inlineSource) {
    if (adminState.selectedImageSource === 'upload' && adminState.uploadedImageUrl) {
      inlineSource.textContent = 'Uploaded file: ' + adminState.uploadedImageUrl;
    } else if (urlVal) {
      inlineSource.textContent = urlVal;
    } else if (adminState.selectedImageSource === 'preset') {
      inlineSource.textContent = 'Preset tech photo selected';
    } else {
      inlineSource.textContent = 'Default gadget image';
    }
  }

  // Detect local computer paths and warn user
  if (warningEl) {
    const isLocalPath = /^[a-zA-Z]:\\|^file:\/\/|^\/Users\/|^\/home\//i.test(urlVal);
    warningEl.style.display = isLocalPath ? 'block' : 'none';
  }

  const previewWrap = document.getElementById('previewCardWrapper');
  if (!previewWrap) return;

  previewWrap.innerHTML = `
    <div class="product-card">
      <div class="card-img-wrap">
        <div class="card-img-bg" style="background-image: url('${escapeHtml(image)}')"></div>
        <img src="${escapeHtml(image)}" alt="Preview" onerror="this.src='https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=800&q=80'">
        <span class="stock-tag in-stock">In Stock (${stock})</span>
      </div>
      <div class="card-body">
        <span class="card-category">${escapeHtml(category)}</span>
        <h3 class="card-title">${escapeHtml(name)}</h3>
        <div class="card-rating">
          <i data-lucide="star" style="width:14px; height:14px; fill: currentColor;"></i>
          <strong>5.0</strong>
          <span>(0 reviews)</span>
        </div>
        <p class="card-desc">${escapeHtml(desc)}</p>
        <div class="card-footer">
          <div class="price-wrap">
            <span class="price-now">UGX ${formatPrice(price)}</span>
            ${origPrice ? `<span class="price-was">UGX ${formatPrice(origPrice)}</span>` : ''}
          </div>
          <div class="card-actions">
            <button class="btn-add-cart" disabled>
              <i data-lucide="shopping-bag"></i> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  initIcons();
}

function resetLivePreview() {
  setTimeout(() => {
    adminState.uploadedImageUrl = null;
    updateLivePreview();
  }, 50);
}

async function handleAddProductSubmit(e) {
  e.preventDefault();

  const publishBtn = document.getElementById('publishProductBtn');
  publishBtn.disabled = true;
  publishBtn.innerHTML = `<i data-lucide="loader"></i> Adding to Store...`;
  initIcons();

  const payload = {
    name: document.getElementById('newProdName').value.trim(),
    category: document.getElementById('newProdCategory').value,
    badge: document.getElementById('newProdBadge').value.trim(),
    price: parseFloat(document.getElementById('newProdPrice').value),
    originalPrice: document.getElementById('newProdOrigPrice').value ? parseFloat(document.getElementById('newProdOrigPrice').value) : null,
    stock: parseInt(document.getElementById('newProdStock').value, 10),
    image: getSelectedProductImage(),
    description: document.getElementById('newProdDesc').value.trim(),
    specs: document.getElementById('newProdSpecs').value.trim()
  };

  try {
    const res = await adminFetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success) {
      notifyCatalogUpdated();
      showToast(`🎉 "${payload.name}" is now live in the store!`, 'success');
      document.getElementById('addProductForm').reset();
      adminState.uploadedImageUrl = null;
      updateLivePreview();
      refreshAdminData();
      switchAdminTab('manage-inventory');
    } else {
      showToast(data.message || 'Failed to add item.', 'error');
    }
  } catch (err) {
    showToast('Server error while adding product.', 'error');
  } finally {
    publishBtn.disabled = false;
    publishBtn.innerHTML = `<i data-lucide="check-circle"></i> Add Item to Store`;
    initIcons();
  }
}

// ==========================================
// TAB 2: INVENTORY MANAGEMENT TABLE
// ==========================================

async function loadInventoryTable() {
  const tbody = document.getElementById('inventoryTableBody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">Loading inventory...</td></tr>`;

  try {
    const res = await fetch('/api/products');
    const data = await res.json();

    if (data.success) {
      adminState.inventoryList = data.products;
      renderInventoryRows(data.products);
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--danger);">Failed to load inventory</td></tr>`;
  }
}

function renderInventoryRows(products) {
  const tbody = document.getElementById('inventoryTableBody');
  
  if (!products || products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2.5rem 1rem; color: var(--text-dim);">No items found in inventory.</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(prod => {
    let stockBadge = `<span class="stock-tag in-stock">${prod.stock} in stock</span>`;
    if (prod.stock <= 0) {
      stockBadge = `<span class="stock-tag out-stock">Out of stock</span>`;
    } else if (prod.stock <= 5) {
      stockBadge = `<span class="stock-tag low-stock">Low: ${prod.stock} left</span>`;
    }

    return `
      <tr class="inventory-row" data-id="${prod.id}">
        <td data-label="Product" class="td-prod-info">
          <div class="table-prod-info">
            <img src="${escapeHtml(prod.image)}" alt="${escapeHtml(prod.name)}" class="table-prod-thumb" onerror="this.src='https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=100&q=80'">
            <div class="table-prod-meta">
              <strong class="table-prod-title">${escapeHtml(prod.name)}</strong>
              ${prod.badge ? `<span class="prod-inline-badge">${escapeHtml(prod.badge)}</span>` : ''}
            </div>
          </div>
        </td>
        <td data-label="Category" class="td-category">
          <span class="card-category">${escapeHtml(prod.category)}</span>
        </td>
        <td data-label="Price" class="td-price">
          <strong class="inventory-price-val">UGX ${formatPrice(prod.price)}</strong>
        </td>
        <td data-label="Stock" class="td-stock">
          <div class="stock-adjust-group">
            <button type="button" class="qty-btn" onclick="quickAdjustStock('${prod.id}', -1)" title="Decrease stock">−</button>
            <span class="stock-num-val">${prod.stock}</span>
            <button type="button" class="qty-btn" onclick="quickAdjustStock('${prod.id}', 1)" title="Increase stock">+</button>
          </div>
        </td>
        <td data-label="Status" class="td-status">
          ${stockBadge}
        </td>
        <td data-label="Actions" class="td-actions">
          <div class="table-actions">
            <button type="button" class="btn-action-edit" onclick="openEditModal('${prod.id}')" title="Edit Product Details">
              <i data-lucide="edit-2"></i>
              <span>Edit</span>
            </button>
            <button type="button" class="btn-action-delete" onclick="deleteProduct('${prod.id}', '${escapeHtml(prod.name)}')" title="Delete Product Permanently">
              <i data-lucide="trash-2"></i>
              <span>Delete</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  initIcons();
}

function filterInventoryTable() {
  const query = document.getElementById('inventorySearchInput').value.toLowerCase().trim();
  if (!adminState.inventoryList) return;

  const filtered = adminState.inventoryList.filter(p =>
    p.name.toLowerCase().includes(query) ||
    p.category.toLowerCase().includes(query)
  );

  renderInventoryRows(filtered);
}

async function quickAdjustStock(prodId, delta) {
  const prod = (adminState.inventoryList || []).find(p => p.id === prodId);
  if (!prod) return;

  const newStock = Math.max(0, prod.stock + delta);

  try {
    const res = await adminFetch(`/api/products/${prodId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock: newStock })
    });
    const data = await res.json();

    if (data.success) {
      notifyCatalogUpdated();
      prod.stock = newStock;
      loadInventoryTable();
      showToast(`Stock updated for ${prod.name}`, 'info');
    }
  } catch (e) {
    showToast('Failed to update stock', 'error');
  }
}

function openEditModal(prodId) {
  const prod = (adminState.inventoryList || []).find(p => p.id === prodId);
  if (!prod) return;

  document.getElementById('editProdId').value = prod.id;
  document.getElementById('editProdName').value = prod.name;
  document.getElementById('editProdCategory').value = prod.category;
  document.getElementById('editProdPrice').value = prod.price;
  document.getElementById('editProdStock').value = prod.stock;
  document.getElementById('editProdImage').value = prod.image;
  document.getElementById('editProdDesc').value = prod.description;

  document.getElementById('editProductModal').classList.add('active');
  initIcons();
}

function closeEditModal() {
  document.getElementById('editProductModal').classList.remove('active');
}

function handleEditModalDelete() {
  const prodId = document.getElementById('editProdId')?.value;
  const prodName = document.getElementById('editProdName')?.value || 'this product';
  if (!prodId) return;
  closeEditModal();
  deleteProduct(prodId, prodName);
}

async function handleEditProductSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('editProdId').value;
  const payload = {
    name: document.getElementById('editProdName').value.trim(),
    category: document.getElementById('editProdCategory').value,
    price: parseFloat(document.getElementById('editProdPrice').value),
    stock: parseInt(document.getElementById('editProdStock').value, 10),
    image: document.getElementById('editProdImage').value.trim(),
    description: document.getElementById('editProdDesc').value.trim()
  };

  try {
    const res = await adminFetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      notifyCatalogUpdated();
      showToast('Product updated successfully!', 'success');
      closeEditModal();
      loadInventoryTable();
    } else {
      showToast(data.message || 'Failed to update', 'error');
    }
  } catch (err) {
    showToast('Server error updating product.', 'error');
  }
}

async function deleteProduct(prodId, prodName) {
  if (!confirm(`Are you sure you want to permanently delete "${prodName}" from your store?`)) {
    return;
  }

  try {
    const res = await adminFetch(`/api/products/${prodId}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (data.success) {
      notifyCatalogUpdated();
      showToast(`Deleted "${prodName}" from catalog.`, 'info');
      loadInventoryTable();
      refreshAdminData();
    } else {
      showToast(data.message || 'Delete failed', 'error');
    }
  } catch (e) {
    showToast('Server error deleting product', 'error');
  }
}

// ==========================================
// TAB 3: CUSTOMER ORDERS LIST
// ==========================================

async function loadAdminOrders() {
  const container = document.getElementById('adminOrdersList');
  container.innerHTML = `<div style="text-align:center; padding: 2rem;">Loading customer orders...</div>`;

  try {
    const res = await adminFetch('/api/orders');
    const data = await res.json();

    if (data.success) {
      adminState.allOrders = data.orders;
      renderAdminOrders(data.orders);
    }
  } catch (e) {
    container.innerHTML = `<div style="text-align:center; color: var(--danger);">Failed to load orders.</div>`;
  }
}

function renderAdminOrders(orders) {
  const container = document.getElementById('adminOrdersList');

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="clipboard-x"></i>
        <h3>No Customer Orders Yet</h3>
        <p>When buyers checkout, their orders with delivery info will appear here.</p>
      </div>
    `;
    initIcons();
    return;
  }

  container.innerHTML = orders.map(order => {
    const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Just now';

    return `
      <div class="order-admin-card">
        <div class="order-admin-header">
          <div>
            <span class="order-badge-id">${order.id}</span>
            <span class="order-date"> • ${dateStr}</span>
          </div>

          <div style="display:flex; align-items: center; gap: 0.75rem;">
            <label style="font-size: 0.8rem; color: var(--text-dim);">Order Status:</label>
            <select class="order-status-select" onchange="updateOrderStatus('${order.id}', this.value)">
              <option value="Confirmed" ${order.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
              <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>Processing</option>
              <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
              <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
              <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </div>
        </div>

        <div class="order-admin-body">
          <div class="order-items-sublist">
            <h4 style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-dim);">Ordered Items (${order.items.length}):</h4>
            ${order.items.map(it => `
              <div class="order-item-row">
                <span>${it.quantity}x ${escapeHtml(it.name)}</span>
                <strong>UGX ${formatPrice(it.price * it.quantity)}</strong>
              </div>
            `).join('')}
            <div class="summary-divider"></div>
            <div class="order-item-row" style="font-weight: 700;">
              <span>Total Paid:</span>
              <span style="color:#38bdf8; font-size: 1.05rem;">UGX ${formatPrice(order.total)}</span>
            </div>
          </div>

          <div class="order-customer-box">
            <h4 style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-dim);">Buyer Details:</h4>
            <strong>${escapeHtml(order.customer.name)}</strong>
            <span>${escapeHtml(order.customer.email)}</span>
            <span>${escapeHtml(order.customer.phone || 'No phone provided')}</span>
            <span style="color: var(--text-dim); margin-top: 0.25rem;">📍 ${escapeHtml(order.customer.address)}</span>
            <span style="margin-top: 0.25rem; font-size: 0.75rem; color: var(--accent-cyan);">💳 ${escapeHtml(order.paymentMethod)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  initIcons();
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await adminFetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`Order ${orderId} marked as ${newStatus}`, 'success');
    } else {
      showToast(data.message || 'Failed to update order status', 'error');
    }
  } catch (e) {
    showToast('Server error updating order', 'error');
  }
}

// ==========================================
// TAB 4: STORE ANALYTICS
// ==========================================

async function loadAnalytics() {
  try {
    const res = await adminFetch('/api/stats');
    const data = await res.json();

    if (data.success) {
      const stats = data.stats;

      const metricsGrid = document.getElementById('analyticsMetrics');
      metricsGrid.innerHTML = `
        <div class="metric-card">
          <div class="metric-icon-wrap" style="background: rgba(16, 185, 129, 0.15); color: var(--success);">
            <i data-lucide="dollar-sign"></i>
          </div>
          <div class="metric-info">
            <h3>UGX ${formatPrice(stats.totalRevenue)}</h3>
            <span>Total Revenue</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-wrap" style="background: rgba(59, 130, 246, 0.15); color: var(--primary);">
            <i data-lucide="shopping-cart"></i>
          </div>
          <div class="metric-info">
            <h3>${stats.totalOrders}</h3>
            <span>Customer Orders</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-wrap" style="background: rgba(139, 92, 246, 0.15); color: var(--accent-purple);">
            <i data-lucide="boxes"></i>
          </div>
          <div class="metric-info">
            <h3>${stats.totalProducts}</h3>
            <span>Active Products</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon-wrap" style="background: rgba(245, 158, 11, 0.15); color: var(--warning);">
            <i data-lucide="alert-triangle"></i>
          </div>
          <div class="metric-info">
            <h3>${stats.lowStockCount}</h3>
            <span>Low Stock Alerts</span>
          </div>
        </div>
      `;

      const chartEl = document.getElementById('categoryBreakdownChart');
      const cats = Object.entries(stats.categoryBreakdown || {});
      const maxCount = Math.max(...cats.map(c => c[1]), 1);

      chartEl.innerHTML = cats.map(([cat, count]) => {
        const pct = Math.round((count / maxCount) * 100);
        return `
          <div class="breakdown-row">
            <span style="min-width: 90px;">${escapeHtml(cat)}</span>
            <div class="breakdown-bar-bg">
              <div class="breakdown-bar-fill" style="width: ${pct}%;"></div>
            </div>
            <strong style="min-width: 30px; text-align: right;">${count}</strong>
          </div>
        `;
      }).join('');

      const healthEl = document.getElementById('storeHealthMetrics');
      healthEl.innerHTML = `
        <div class="receipt-row">
          <span>Catalog Health:</span>
          <strong style="color: var(--success);">● Active & Healthy</strong>
        </div>
        <div class="receipt-row">
          <span>Orders Processed:</span>
          <span>${stats.totalOrders} total</span>
        </div>
        <div class="receipt-row">
          <span>Average Order Value:</span>
          <strong>UGX ${stats.totalOrders > 0 ? formatPrice(stats.totalRevenue / stats.totalOrders) : '0'}</strong>
        </div>
      `;

      initIcons();
    }
  } catch (e) {
    console.error('Analytics error:', e);
  }
}

// ==========================================
// TOAST NOTIFICATIONS & UTILITIES
// ==========================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-circle';

  toast.innerHTML = `
    <i data-lucide="${iconName}" style="width:18px; height:18px; flex-shrink: 0;"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  initIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatPrice(val) {
  const num = Math.round(parseFloat(val) || 0);
  return num.toLocaleString('en-US');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Broadcast catalog update across all open tabs / windows instantly
function notifyCatalogUpdated() {
  try {
    localStorage.setItem('electrohub_catalog_sync', Date.now().toString());
  } catch (e) {}

  try {
    if (window.BroadcastChannel) {
      const bc = new BroadcastChannel('electrohub_sync_channel');
      bc.postMessage({ type: 'catalog_updated', timestamp: Date.now() });
      setTimeout(() => bc.close(), 100);
    }
  } catch (e) {}
}
