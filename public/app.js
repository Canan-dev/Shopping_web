/**
 * ElectroHub Customer Storefront Application Logic
 * (Browse, Search, Filter, Quick-View, Cart, Checkout)
 */

// Application State
const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem('electrohub_cart') || '[]'),
  currentCategory: 'All',
  searchQuery: '',
  currentSort: 'featured',
  promoCode: null
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  initTrendingSlider();
  loadProducts();
  updateCartUI();
  setupClickOutsideModals();
  checkOwnerStatus();
  setupLiveProductSync();
});

// ==========================================
// REAL-TIME PRODUCT UPDATES & CROSS-TAB SYNC
// ==========================================
let lastKnownVersion = null;
let isPollingActive = false;

function setupLiveProductSync() {
  // 1. Instant cross-tab sync (admin and storefront on same browser - 0ms delay)
  window.addEventListener('storage', (e) => {
    if (e.key === 'electrohub_catalog_sync') {
      loadProducts(true);
    }
  });

  if (window.BroadcastChannel) {
    try {
      const bc = new BroadcastChannel('electrohub_sync_channel');
      bc.onmessage = () => {
        loadProducts(true);
      };
    } catch (e) {}
  }

  // 2. Tab focus & visibility (sync immediately when switching to this tab)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadProducts(true);
    }
  });
  window.addEventListener('focus', () => {
    loadProducts(true);
  });

  // 3. Server-Sent Events (SSE) for instant server push
  connectLiveUpdates();

  // 4. Background smart poll every 2.5 seconds (foolproof for all browsers/devices)
  if (!isPollingActive) {
    isPollingActive = true;
    setInterval(checkCatalogVersionPoll, 2500);
  }
}

async function checkCatalogVersionPoll() {
  try {
    const res = await fetch(`/api/products/version?_t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        if (lastKnownVersion === null) {
          lastKnownVersion = data.version;
          return;
        }
        if (data.version !== lastKnownVersion) {
          lastKnownVersion = data.version;
          loadProducts(true);
        }
      }
    } else {
      // Fallback: poll catalog directly if version endpoint unavailable
      loadProducts(true);
    }
  } catch (err) {
    // Ignore network interruptions silently during polling
  }
}

function connectLiveUpdates() {
  if (!window.EventSource) return; // browser doesn't support SSE

  try {
    const source = new EventSource('/api/events');

    source.addEventListener('product-added', () => {
      loadProducts(true);
    });

    source.addEventListener('product-updated', () => {
      loadProducts(true);
    });

    source.addEventListener('product-deleted', () => {
      loadProducts(true);
    });

    source.onerror = () => {
      source.close();
      setTimeout(connectLiveUpdates, 4000);
    };
  } catch (e) {}
}

function checkOwnerStatus() {
  const token = localStorage.getItem('electrohub_admin_token');
  if (token) {
    const actions = document.querySelector('.header-actions');
    if (actions && !document.getElementById('ownerHeaderLink')) {
      const ownerBtn = document.createElement('a');
      ownerBtn.id = 'ownerHeaderLink';
      ownerBtn.href = '/admin';
      ownerBtn.className = 'owner-pill-btn';
      ownerBtn.title = 'Owner Portal';
      ownerBtn.innerHTML = '<i data-lucide="shield-check" style="width:15px;height:15px;"></i> <span>Owner</span>';
      actions.insertBefore(ownerBtn, actions.firstChild);
      initIcons();
    }
  }
}

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ==========================================
// PRODUCTS CATALOG & FILTERING
// ==========================================

async function loadProducts(isSilent = false) {
  const grid = document.getElementById('productGrid');
  const empty = document.getElementById('emptyState');
  
  try {
    const params = new URLSearchParams();
    if (state.currentCategory && state.currentCategory !== 'All') {
      params.append('category', state.currentCategory);
    }
    if (state.searchQuery) {
      params.append('search', state.searchQuery);
    }
    if (state.currentSort && state.currentSort !== 'featured') {
      params.append('sort', state.currentSort);
    }

    const res = await fetch(`/api/products?${params.toString()}&_t=${Date.now()}`, {
      cache: 'no-store'
    });
    const data = await res.json();

    if (data.success) {
      state.products = data.products;
      renderProductGrid(data.products);
      updateFilterStatusLabel(data.products.length);
    }
  } catch (err) {
    console.error('Failed to load products:', err);
    if (!isSilent) {
      showToast('Failed to connect to server. Ensure server is running.', 'error');
    }
  }
}

function renderProductGrid(products) {
  const grid = document.getElementById('productGrid');
  const empty = document.getElementById('emptyState');

  if (!products || products.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    state.lastRenderedSignature = 'empty';
    initIcons();
    return;
  }

  // Prevent unnecessary DOM flicker if items haven't changed
  const currentSignature = products.map(p => `${p.id}_${p.price}_${p.stock}_${p.name}_${p.image}`).join('|');
  if (state.lastRenderedSignature === currentSignature) {
    return;
  }
  state.lastRenderedSignature = currentSignature;

  empty.style.display = 'none';

  grid.innerHTML = products.map(prod => {
    let stockClass = 'in-stock';
    let stockText = `In Stock (${prod.stock})`;
    if (prod.stock <= 0) {
      stockClass = 'out-stock';
      stockText = 'Out of Stock';
    } else if (prod.stock <= 5) {
      stockClass = 'low-stock';
      stockText = `Only ${prod.stock} left!`;
    }

    const isOutOfStock = prod.stock <= 0;

    return `
      <div class="product-card" data-id="${prod.id}">
        <div class="card-img-wrap">
          <div class="card-img-bg" style="background-image: url('${escapeHtml(prod.image)}')"></div>
          <img src="${escapeHtml(prod.image)}" alt="${escapeHtml(prod.name)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=800&q=80'">
          <span class="stock-tag ${stockClass}">${stockText}</span>
        </div>

        <div class="card-body">
          <span class="card-category">${escapeHtml(prod.category)}</span>
          <h3 class="card-title" title="${escapeHtml(prod.name)}">${escapeHtml(prod.name)}</h3>
          
          <div class="card-rating">
            <i data-lucide="star" style="width:14px; height:14px; fill: currentColor;"></i>
            <strong>${prod.rating || 5.0}</strong>
            <span>(${prod.reviewCount || 0} reviews)</span>
          </div>

          <p class="card-desc">${escapeHtml(prod.description)}</p>

          <div class="card-footer">
            <div class="price-wrap">
              <span class="price-now">UGX ${formatPrice(prod.price)}</span>
              ${prod.originalPrice ? `<span class="price-was">UGX ${formatPrice(prod.originalPrice)}</span>` : ''}
            </div>

            <div class="card-actions">
              <button class="btn-icon" onclick="openQuickView('${prod.id}')" title="Quick Specs">
                <i data-lucide="eye"></i>
              </button>
              <button class="btn-add-cart" onclick="addToCart('${prod.id}')" ${isOutOfStock ? 'disabled' : ''}>
                <i data-lucide="${isOutOfStock ? 'slash' : 'shopping-bag'}"></i>
                <span>${isOutOfStock ? 'Sold Out' : 'Add'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  initIcons();
}

const categoryNames = {
  'All': 'All Gadgets',
  'Smartphones': 'Smartphones',
  'Laptops': 'Laptops',
  'Audio': 'Audio & Sound',
  'Wearables': 'Wearables',
  'Gaming': 'Gaming',
  'Accessories': 'Accessories'
};

function filterCategory(cat) {
  state.currentCategory = cat;
  
  // Sync desktop pills
  document.querySelectorAll('.category-pills .pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === cat);
  });

  // Sync custom dropdown
  const labelEl = document.getElementById('selectedCategoryText');
  if (labelEl) {
    labelEl.textContent = categoryNames[cat] || cat;
  }
  document.querySelectorAll('.custom-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.category === cat);
  });

  closeCategoryDropdown();
  loadProducts();
}

function selectCategory(cat) {
  filterCategory(cat);
}

function toggleCategoryDropdown(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const dropdown = document.getElementById('customCategoryDropdown');
  const trigger = document.getElementById('customSelectTrigger');
  if (!dropdown) return;

  const isOpen = dropdown.classList.toggle('open');
  if (trigger) {
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
}

function closeCategoryDropdown() {
  const dropdown = document.getElementById('customCategoryDropdown');
  const trigger = document.getElementById('customSelectTrigger');
  if (dropdown) {
    dropdown.classList.remove('open');
  }
  if (trigger) {
    trigger.setAttribute('aria-expanded', 'false');
  }
}

// Close dropdown when tapping/clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('customCategoryDropdown');
  if (dropdown && !dropdown.contains(e.target)) {
    closeCategoryDropdown();
  }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeCategoryDropdown();
  }
});

function handleSearch() {
  const val = document.getElementById('searchInput').value.trim();
  const clearBtn = document.getElementById('clearSearchBtn');
  state.searchQuery = val;
  clearBtn.style.display = val ? 'flex' : 'none';

  if (val) {
    // Enter search mode — hide hero, announcement bar, category toolbar
    document.body.classList.add('search-active');

    // Reset category so search covers everything
    state.currentCategory = 'All';
    document.querySelectorAll('.category-pills .pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === 'All');
    });
    const labelEl = document.getElementById('selectedCategoryText');
    if (labelEl) labelEl.textContent = 'All Gadgets';
    document.querySelectorAll('.custom-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.category === 'All');
    });

    // Show the search query tag
    const tag = document.getElementById('searchQueryTag');
    if (tag) tag.textContent = val;
  } else {
    // Exit search mode — restore everything
    document.body.classList.remove('search-active');
  }

  clearTimeout(window.searchTimer);
  window.searchTimer = setTimeout(() => {
    loadProducts();
  }, 200);
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearchBtn').style.display = 'none';
  state.searchQuery = '';
  document.body.classList.remove('search-active');
  loadProducts();
}

function resetFilters() {
  state.currentCategory = 'All';
  state.searchQuery = '';

  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearchBtn').style.display = 'none';
  document.body.classList.remove('search-active');

  document.querySelectorAll('.category-pills .pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === 'All');
  });

  const labelEl = document.getElementById('selectedCategoryText');
  if (labelEl) {
    labelEl.textContent = 'All Gadgets';
  }
  document.querySelectorAll('.custom-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.category === 'All');
  });

  closeCategoryDropdown();
  loadProducts();
}

function updateFilterStatusLabel(count) {
  const lbl = document.getElementById('productCountLabel');
  const rst = document.getElementById('resetFilterBtn');
  const countEl = document.getElementById('searchResultCount');

  // Update search result count in the search header
  if (countEl) {
    countEl.textContent = `— ${count} result${count === 1 ? '' : 's'} found`;
  }

  let text = `Showing ${count} product${count === 1 ? '' : 's'}`;
  if (state.currentCategory !== 'All') {
    text += ` in <strong>${escapeHtml(state.currentCategory)}</strong>`;
  }

  lbl.innerHTML = text;

  const isFiltered = state.currentCategory !== 'All';
  rst.style.display = isFiltered ? 'inline-flex' : 'none';
}

// ==========================================
// QUICK VIEW MODAL
// ==========================================

function openQuickView(prodId) {
  const prod = state.products.find(p => p.id === prodId);
  if (!prod) return;

  const content = document.getElementById('quickViewContent');
  const isOutOfStock = prod.stock <= 0;

  content.innerHTML = `
    <div class="quickview-grid">
      <div class="quickview-img-wrap">
        <div class="card-img-bg" style="background-image: url('${escapeHtml(prod.image)}')"></div>
        <img src="${escapeHtml(prod.image)}" alt="${escapeHtml(prod.name)}">
      </div>
      <div class="quickview-info">
        <span class="card-category">${escapeHtml(prod.category)}</span>
        <h2>${escapeHtml(prod.name)}</h2>
        
        <div class="card-rating">
          <i data-lucide="star" style="width:16px; height:16px; fill: currentColor;"></i>
          <strong>${prod.rating || 5.0}</strong>
          <span>(${prod.reviewCount || 0} customer reviews)</span>
        </div>

        <div class="banner-price my-2" style="margin: 0.75rem 0;">
          <span class="now" style="font-size: 1.8rem; color:#38bdf8;">UGX ${formatPrice(prod.price)}</span>
          ${prod.originalPrice ? `<span class="was" style="font-size: 1.1rem; text-decoration: line-through; color: var(--text-dim); margin-left: 0.5rem;">UGX ${formatPrice(prod.originalPrice)}</span>` : ''}
        </div>

        <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1.25rem;">
          ${escapeHtml(prod.description)}
        </p>

        ${prod.specs && prod.specs.length > 0 ? `
          <div class="quickview-specs">
            <h4>Technical Specifications</h4>
            <ul>
              ${prod.specs.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <div style="margin-top: 1.5rem; display: flex; gap: 1rem; align-items: center;">
          <button class="btn btn-primary btn-lg" onclick="addToCart('${prod.id}'); closeQuickView();" ${isOutOfStock ? 'disabled' : ''}>
            <i data-lucide="${isOutOfStock ? 'slash' : 'shopping-bag'}"></i>
            <span>${isOutOfStock ? 'Currently Out of Stock' : 'Add to Cart'}</span>
          </button>
          <span style="font-size: 0.85rem; color: var(--text-dim);">
            ${prod.stock > 0 ? `✓ ${prod.stock} units available for instant dispatch` : '✖ Backorder incoming'}
          </span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('quickViewModal').classList.add('active');
  initIcons();
}

function closeQuickView() {
  document.getElementById('quickViewModal').classList.remove('active');
}

// ==========================================
// SHOPPING CART SYSTEM
// ==========================================

function toggleCartModal() {
  const modal = document.getElementById('cartModal');
  modal.classList.toggle('active');
}

function addToCart(prodId) {
  const prod = state.products.find(p => p.id === prodId);
  if (!prod) return;

  if (prod.stock <= 0) {
    showToast(`Sorry, "${prod.name}" is currently out of stock.`, 'error');
    return;
  }

  const existing = state.cart.find(item => item.productId === prodId);

  if (existing) {
    if (existing.quantity >= prod.stock) {
      showToast(`Cannot add more. Only ${prod.stock} available in stock.`, 'info');
      return;
    }
    existing.quantity += 1;
  } else {
    state.cart.push({
      productId: prod.id,
      name: prod.name,
      price: prod.price,
      image: prod.image,
      stock: prod.stock,
      quantity: 1
    });
  }

  saveCart();
  updateCartUI();
  showToast(`Added "${prod.name}" to your cart!`, 'success');
}

function updateCartQty(prodId, delta) {
  const item = state.cart.find(i => i.productId === prodId);
  if (!item) return;

  const newQty = item.quantity + delta;

  if (newQty <= 0) {
    removeFromCart(prodId);
    return;
  }

  if (newQty > item.stock) {
    showToast(`Maximum available stock reached (${item.stock}).`, 'info');
    return;
  }

  item.quantity = newQty;
  saveCart();
  updateCartUI();
}

function removeFromCart(prodId) {
  state.cart = state.cart.filter(i => i.productId !== prodId);
  saveCart();
  updateCartUI();
  showToast('Item removed from cart.', 'info');
}

function saveCart() {
  localStorage.setItem('electrohub_cart', JSON.stringify(state.cart));
}

function updateCartUI() {
  const cartList = document.getElementById('cartItemsList');
  const cartBadge = document.getElementById('cartCount');
  const cartDrawerCount = document.getElementById('cartDrawerCount');
  const subtotalEl = document.getElementById('cartSubtotal');
  const shippingEl = document.getElementById('cartShipping');
  const totalEl = document.getElementById('cartTotal');
  const checkoutBtn = document.getElementById('checkoutBtn');

  const totalItemsCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  cartBadge.textContent = totalItemsCount;
  cartDrawerCount.textContent = `(${totalItemsCount} item${totalItemsCount === 1 ? '' : 's'})`;

  if (state.cart.length === 0) {
    cartList.innerHTML = `
      <div class="cart-empty-msg">
        <i data-lucide="shopping-bag"></i>
        <h4>Your cart is empty</h4>
        <p>Explore our electronics catalog to add items!</p>
      </div>
    `;
    subtotalEl.textContent = 'UGX 0';
    totalEl.textContent = 'UGX 0';
    shippingEl.textContent = 'FREE';
    checkoutBtn.disabled = true;
    initIcons();
    return;
  }

  checkoutBtn.disabled = false;

  cartList.innerHTML = state.cart.map(item => `
    <div class="cart-item">
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="cart-item-img">
      <div class="cart-item-info">
        <div class="cart-item-top">
          <h4 class="cart-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h4>
          <button type="button" class="remove-item-btn" onclick="removeFromCart('${item.productId}')" title="Remove item from cart" aria-label="Remove item">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
        <div class="cart-item-price">UGX ${formatPrice(item.price)}</div>
        <div class="cart-qty-ctrl">
          <button type="button" class="qty-btn" onclick="updateCartQty('${item.productId}', -1)" title="Decrease quantity">−</button>
          <span class="qty-val">${item.quantity}</span>
          <button type="button" class="qty-btn" onclick="updateCartQty('${item.productId}', 1)" title="Increase quantity">+</button>
          <span class="cart-line-total">UGX ${formatPrice(item.price * item.quantity)}</span>
        </div>
      </div>
    </div>
  `).join('');

  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shipping = subtotal > 100000 ? 0 : 5000;

  shippingEl.textContent = shipping === 0 ? 'FREE' : `UGX ${formatPrice(shipping)}`;
  subtotalEl.textContent = `UGX ${formatPrice(subtotal)}`;
  totalEl.textContent = `UGX ${formatPrice(subtotal + shipping)}`;

  initIcons();
}

// ==========================================
// CHECKOUT & ORDER SUBMISSION
// ==========================================

function openCheckoutModal() {
  if (state.cart.length === 0) {
    showToast('Your cart is empty!', 'info');
    return;
  }

  document.getElementById('cartModal').classList.remove('active');
  const modal = document.getElementById('checkoutModal');
  modal.classList.add('active');

  const summaryList = document.getElementById('checkoutSummaryItems');
  summaryList.innerHTML = state.cart.map(item => `
    <div class="checkout-summary-item">
      <span>${item.quantity}x ${escapeHtml(item.name)}</span>
      <strong>UGX ${formatPrice(item.price * item.quantity)}</strong>
    </div>
  `).join('');

  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discount = state.promoCode === 'TECH10' ? Math.round(subtotal * 0.10) : 0;
  const shipping = subtotal > 100000 ? 0 : 5000;
  const total = Math.max(0, subtotal - discount + shipping);

  document.getElementById('checkoutTotalAmount').textContent = `UGX ${formatPrice(total)}`;
  initIcons();
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal').classList.remove('active');
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submitOrderBtn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader"></i> Processing Order...`;
  initIcons();

  const customer = {
    name: document.getElementById('custName').value.trim(),
    email: document.getElementById('custEmail').value.trim(),
    phone: document.getElementById('custPhone').value.trim(),
    address: `${document.getElementById('custAddress').value.trim()}, ${document.getElementById('custCity').value.trim()} ${document.getElementById('custZip').value.trim()}`
  };

  const paymentMethodInput = document.querySelector('input[name="paymentMethod"]:checked');
  const paymentMethod = paymentMethodInput ? paymentMethodInput.value : 'Mobile Money / Card';

  const payload = {
    customer,
    items: state.cart.map(i => ({
      productId: i.productId,
      name: i.name,
      price: i.price,
      quantity: i.quantity
    })),
    paymentMethod,
    promoCode: state.promoCode
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success) {
      state.cart = [];
      saveCart();
      updateCartUI();

      closeCheckoutModal();
      showOrderSuccessReceipt(data.order);
      
      loadProducts();
      showToast('Order confirmed! Receipt generated.', 'success');
    } else {
      showToast(data.message || 'Failed to place order', 'error');
    }
  } catch (err) {
    console.error('Order submission error:', err);
    showToast('Failed to connect to checkout service.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i data-lucide="lock"></i> Place Order Now`;
    initIcons();
  }
}

function showOrderSuccessReceipt(order) {
  const modal = document.getElementById('orderSuccessModal');
  document.getElementById('receiptOrderId').textContent = order.id;

  const content = document.getElementById('receiptContent');
  content.innerHTML = `
    <div class="receipt-row">
      <span style="color:var(--text-dim);">Customer Name:</span>
      <strong>${escapeHtml(order.customer.name)}</strong>
    </div>
    <div class="receipt-row">
      <span style="color:var(--text-dim);">Email:</span>
      <span>${escapeHtml(order.customer.email)}</span>
    </div>
    <div class="receipt-row">
      <span style="color:var(--text-dim);">Shipping To:</span>
      <span style="max-width: 300px; text-align: right;">${escapeHtml(order.customer.address)}</span>
    </div>
    <div class="receipt-row">
      <span style="color:var(--text-dim);">Payment Method:</span>
      <span>${escapeHtml(order.paymentMethod)}</span>
    </div>
    ${order.paymentMethod.includes('Mobile Money') ? `
    <div style="margin: 0.5rem 0; padding: 0.65rem 0.85rem; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px; font-size: 0.82rem; color: var(--text-muted);">
      📱 Send payment to MTN number: <strong style="color:#38bdf8;">+256 776 439184</strong><br>
      Use your order ID <strong style="color:#fff;">${escapeHtml(order.id)}</strong> as the reference.
    </div>
    ` : ''}
    <div class="receipt-row">
      <span style="color:var(--text-dim);">Order Status:</span>
      <span style="color: var(--success); font-weight: bold;">● ${escapeHtml(order.status)}</span>
    </div>

    <div class="summary-divider" style="margin: 1rem 0;"></div>

    <h4 style="font-size: 0.85rem; text-transform: uppercase; color: var(--text-dim); margin-bottom: 0.5rem;">Purchased Items:</h4>
    ${order.items.map(it => `
      <div class="receipt-row">
        <span>${it.quantity}x ${escapeHtml(it.name)}</span>
        <span>UGX ${formatPrice(it.price * it.quantity)}</span>
      </div>
    `).join('')}

    <div class="summary-divider" style="margin: 1rem 0;"></div>

    <div class="receipt-row">
      <span>Subtotal</span>
      <span>UGX ${formatPrice(order.subtotal)}</span>
    </div>
    ${order.discount ? `
      <div class="receipt-row" style="color: var(--success);">
        <span>Discount (Promo)</span>
        <span>-UGX ${formatPrice(order.discount)}</span>
      </div>
    ` : ''}
    <div class="receipt-row">
      <span>Shipping Fee</span>
      <span>${order.shipping === 0 ? 'FREE' : `UGX ${formatPrice(order.shipping)}`}</span>
    </div>
    <div class="receipt-row" style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-top: 0.5rem;">
      <span>Total Paid</span>
      <span style="color:#38bdf8;">UGX ${formatPrice(order.total)}</span>
    </div>
  `;

  modal.classList.add('active');
  initIcons();
}

function closeReceiptModal() {
  document.getElementById('orderSuccessModal').classList.remove('active');
}

// ==========================================
// PAYMENT METHOD HANDLER
// ==========================================

function handlePaymentMethodChange(value) {
  const mtnBox = document.getElementById('mtnMoneyInstructions');
  if (!mtnBox) return;
  // Show MTN instructions only when MTN Mobile Money is selected
  mtnBox.style.display = value.includes('Mobile Money') ? 'block' : 'none';

  // Highlight selected payment card
  document.querySelectorAll('.payment-card').forEach(card => {
    const radio = card.querySelector('input[type="radio"]');
    card.classList.toggle('selected', radio && radio.value === value);
  });
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

function setupClickOutsideModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });
}

// ==========================================
// TRENDING DEALS MOVING SHOWCASE SLIDER
// ==========================================
const trendingSliderState = {
  currentIndex: 0,
  totalSlides: 4,
  duration: 4500, // 4.5 seconds per slide
  timer: null,
  isPaused: false
};

function initTrendingSlider() {
  const slides = document.querySelectorAll('.trending-slide');
  if (!slides || slides.length === 0) return;
  trendingSliderState.totalSlides = slides.length;
  trendingSliderState.currentIndex = 0;
  initIcons();
  startTrendingAutoAdvance();
}

function startTrendingAutoAdvance() {
  clearTrendingTimers();
  if (trendingSliderState.isPaused) return;

  const fill = document.getElementById('trendingProgressFill');
  if (fill) {
    fill.style.transition = 'none';
    fill.style.width = '0%';
    void fill.offsetWidth; // Force DOM reflow
    fill.style.transition = `width ${trendingSliderState.duration}ms linear`;
    fill.style.width = '100%';
  }

  trendingSliderState.timer = setTimeout(() => {
    nextTrendingSlide();
  }, trendingSliderState.duration);
}

function clearTrendingTimers() {
  if (trendingSliderState.timer) {
    clearTimeout(trendingSliderState.timer);
    trendingSliderState.timer = null;
  }
}

function pauseTrendingSlider() {
  trendingSliderState.isPaused = true;
  clearTrendingTimers();
  const fill = document.getElementById('trendingProgressFill');
  if (fill) {
    fill.style.transition = 'none';
    fill.style.width = '0%';
  }
}

function resumeTrendingSlider() {
  trendingSliderState.isPaused = false;
  startTrendingAutoAdvance();
}

function goToTrendingSlide(index) {
  const slides = document.querySelectorAll('.trending-slide');
  const dots = document.querySelectorAll('#trendingDots .dot');
  if (!slides || slides.length === 0) return;

  trendingSliderState.currentIndex = (index + slides.length) % slides.length;

  slides.forEach((slide, idx) => {
    if (idx === trendingSliderState.currentIndex) {
      slide.classList.add('active');
    } else {
      slide.classList.remove('active');
    }
  });

  dots.forEach((dot, idx) => {
    if (idx === trendingSliderState.currentIndex) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });

  startTrendingAutoAdvance();
}

function nextTrendingSlide(e) {
  if (e) e.stopPropagation();
  goToTrendingSlide(trendingSliderState.currentIndex + 1);
}

function prevTrendingSlide(e) {
  if (e) e.stopPropagation();
  goToTrendingSlide(trendingSliderState.currentIndex - 1);
}
