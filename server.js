const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { getStore } = require('@netlify/blobs');

const app = express();
const PORT = process.env.PORT || 3000;
const isNetlify = process.env.NETLIFY === 'true';

// Owner password (default is 'admin123' for local development)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const adminTokens = new Set();
let catalogVersion = Date.now();

if (isNetlify && !process.env.ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD must be configured in Netlify environment variables.');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure data & upload directories exist
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
if (!isNetlify) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static frontend and uploads
app.use(express.static(path.join(__dirname, 'public')));
if (!isNetlify) {
  app.use('/uploads', express.static(uploadsDir));
}

// Route shortcut for owner admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Configure multer for file uploads
function makeUploadFilename(originalname) {
  const ext = path.extname(originalname);
  const cleanName = path.basename(originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
  return `${cleanName}_${Date.now()}${ext}`;
}

const storage = isNetlify
  ? multer.memoryStorage()
  : multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, makeUploadFilename(file.originalname));
  }
});
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const upload = multer({
  storage,
  limits: { fileSize: isNetlify ? 4 * 1024 * 1024 : 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype) && ALLOWED_IMAGE_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, WebP, and GIF images are allowed.'), false);
    }
  }
});

const dataFiles = {
  products: path.join(dataDir, 'products.json'),
  orders: path.join(dataDir, 'orders.json')
};
const seedProducts = require('./data/products.json');

function dataStore() {
  return getStore('netshopug-data');
}

async function readJSON(name, fallback = []) {
  if (isNetlify) {
    const store = dataStore();
    const stored = await store.get(name, { type: 'json' });
    if (stored !== null) {
      return stored;
    }

    const initialData = name === 'products' ? seedProducts : fallback;
    await store.setJSON(name, initialData);
    return initialData;
  }

  try {
    const data = await fs.promises.readFile(dataFiles[name], 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return name === 'products' ? seedProducts : fallback;
    }
    throw err;
  }
}

async function writeJSON(name, data) {
  if (isNetlify) {
    const store = dataStore();
    await store.setJSON(name, data);
    if (name === 'products') {
      catalogVersion = Date.now();
      await store.set('catalog-version', String(catalogVersion));
    }
    return;
  }

  await fs.promises.writeFile(dataFiles[name], JSON.stringify(data, null, 2), 'utf-8');
  if (name === 'products') {
    catalogVersion = Date.now();
  }
}

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// ==========================================
// OWNER AUTHENTICATION MIDDLEWARE
// ==========================================
async function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.headers['x-admin-token'];

  try {
    let authorized = token && adminTokens.has(token);
    if (token && isNetlify) {
      const sessions = getStore('netshopug-admin-sessions');
      const session = await sessions.get(token, { type: 'json' });
      authorized = Boolean(session && Date.now() - Date.parse(session.createdAt) < 12 * 60 * 60 * 1000);
      if (session && !authorized) {
        await sessions.delete(token);
      }
    }
    if (authorized) {
      return next();
    }
  } catch (err) {
    return next(err);
  }

  return res.status(401).json({
    success: false,
    message: 'Access denied: Owner authentication required.'
  });
}

// POST /api/admin/login - Verify owner password
app.post('/api/admin/login', async (req, res, next) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      if (isNetlify) {
        await getStore('netshopug-admin-sessions').setJSON(token, { createdAt: new Date().toISOString() });
      } else {
        adminTokens.add(token);
      }
      return res.json({ success: true, token, message: 'Owner authenticated successfully!' });
    } catch (err) {
      return next(err);
    }
  }
  return res.status(401).json({ success: false, message: 'Incorrect owner password. Access denied.' });
});

// POST /api/admin/logout - Invalidate owner token
app.post('/api/admin/logout', async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.headers['x-admin-token'];
  try {
    if (token) {
      if (isNetlify) {
        await getStore('netshopug-admin-sessions').delete(token);
      } else {
        adminTokens.delete(token);
      }
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/verify - Check if current session token is valid
app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ success: true, authorized: true });
});

// ==========================================
// PRODUCTS API
// ==========================================

// GET /api/products/version - Fast endpoint to check if catalog was updated
app.get('/api/products/version', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const products = await readJSON('products');
  if (isNetlify && !(await dataStore().get('catalog-version'))) {
    await dataStore().set('catalog-version', String(catalogVersion));
  }
  const version = isNetlify
    ? Number(await dataStore().get('catalog-version'))
    : catalogVersion;
  res.json({
    success: true,
    version,
    count: products.length,
    latestId: products.length > 0 ? products[0].id : null
  });
}));

// GET /api/products - PUBLIC: Anyone can browse products
app.get('/api/products', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  let products = await readJSON('products');
  const { category, search, sort } = req.query;

  if (category && category !== 'All') {
    products = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }

  if (search) {
    const q = search.toLowerCase().trim();
    products = products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }

  if (sort === 'price-asc') {
    products.sort((a, b) => a.price - b.price);
  } else if (sort === 'price-desc') {
    products.sort((a, b) => b.price - a.price);
  } else if (sort === 'rating') {
    products.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (sort === 'newest') {
    products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  res.json({ success: true, count: products.length, products });
}));

// GET /api/products/:id - PUBLIC: Anyone can view a product
app.get('/api/products/:id', asyncHandler(async (req, res) => {
  const products = await readJSON('products');
  const product = products.find(p => p.id === req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.json({ success: true, product });
}));

// POST /api/products - PROTECTED: Owner only
app.post('/api/products', requireAdmin, asyncHandler(async (req, res) => {
  const { name, category, price, originalPrice, stock, image, description, specs, badge } = req.body;

  if (!name || !category || price === undefined) {
    return res.status(400).json({ success: false, message: 'Name, Category, and Price are required.' });
  }

  const products = await readJSON('products');
  const newProduct = {
    id: `prod_${Date.now()}`,
    name: name.trim(),
    category: category.trim(),
    price: parseFloat(price),
    originalPrice: originalPrice ? parseFloat(originalPrice) : null,
    stock: parseInt(stock, 10) || 0,
    rating: 5.0,
    reviewCount: 0,
    badge: badge ? badge.trim() : 'New Arrival',
    image: image || 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=800&q=80',
    description: description ? description.trim() : 'No description provided.',
    specs: Array.isArray(specs) ? specs : (specs ? specs.split('\n').map(s => s.trim()).filter(Boolean) : []),
    createdAt: new Date().toISOString()
  };

  products.unshift(newProduct);
  await writeJSON('products', products);

  res.status(201).json({ success: true, message: 'Product added successfully!', product: newProduct });
}));

// PUT /api/products/:id - PROTECTED: Owner only
app.put('/api/products/:id', requireAdmin, asyncHandler(async (req, res) => {
  const products = await readJSON('products');
  const index = products.findIndex(p => p.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const existing = products[index];
  const { name, category, price, originalPrice, stock, image, description, specs, badge } = req.body;

  products[index] = {
    ...existing,
    name: name !== undefined ? name.trim() : existing.name,
    category: category !== undefined ? category.trim() : existing.category,
    price: price !== undefined ? parseFloat(price) : existing.price,
    originalPrice: originalPrice !== undefined ? (originalPrice ? parseFloat(originalPrice) : null) : existing.originalPrice,
    stock: stock !== undefined ? parseInt(stock, 10) : existing.stock,
    badge: badge !== undefined ? badge : existing.badge,
    image: image !== undefined ? image : existing.image,
    description: description !== undefined ? description.trim() : existing.description,
    specs: specs !== undefined
      ? (Array.isArray(specs) ? specs : specs.split('\n').map(s => s.trim()).filter(Boolean))
      : existing.specs,
    updatedAt: new Date().toISOString()
  };

  await writeJSON('products', products);
  res.json({ success: true, message: 'Product updated successfully!', product: products[index] });
}));

// DELETE /api/products/:id - PROTECTED: Owner only
app.delete('/api/products/:id', requireAdmin, asyncHandler(async (req, res) => {
  const products = await readJSON('products');
  const filtered = products.filter(p => p.id !== req.params.id);

  if (filtered.length === products.length) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  await writeJSON('products', filtered);
  res.json({ success: true, message: 'Product deleted successfully!' });
}));

// POST /api/upload - PROTECTED: Owner only
app.post('/api/upload', requireAdmin, (req, res, next) => {
  upload.single('image')(req, res, async err => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Please select a valid image (JPG, PNG, WebP, or GIF).' });
    }
    try {
      if (isNetlify) {
        const filename = makeUploadFilename(req.file.originalname);
        const image = new Blob([req.file.buffer], { type: req.file.mimetype });
        await getStore('netshopug-media').set(filename, image, {
          metadata: { contentType: req.file.mimetype }
        });
        return res.json({ success: true, url: `/api/media/${encodeURIComponent(filename)}` });
      }

      return res.json({ success: true, url: `/uploads/${req.file.filename}` });
    } catch (uploadError) {
      return next(uploadError);
    }
  });
});

app.get('/api/media/:filename', asyncHandler(async (req, res) => {
  if (!isNetlify) {
    return res.status(404).json({ success: false, message: 'Image not found' });
  }

  const filename = path.basename(req.params.filename);
  const store = getStore('netshopug-media');
  const [image, metadata] = await Promise.all([
    store.get(filename, { type: 'arrayBuffer' }),
    store.getMetadata(filename)
  ]);
  if (!image) {
    return res.status(404).json({ success: false, message: 'Image not found' });
  }

  res.setHeader('Content-Type', metadata?.metadata?.contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(image));
}));

// ==========================================
// ORDERS API
// ==========================================

// GET /api/orders - PROTECTED: Owner only
app.get('/api/orders', requireAdmin, asyncHandler(async (req, res) => {
  const orders = await readJSON('orders');
  orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ success: true, count: orders.length, orders });
}));

// POST /api/orders - PUBLIC: Anyone can buy items / place an order
app.post('/api/orders', asyncHandler(async (req, res) => {
  const { customer, items, paymentMethod, promoCode } = req.body;

  if (!customer || !customer.name || !customer.email || !customer.address) {
    return res.status(400).json({ success: false, message: 'Complete customer details required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Cart is empty' });
  }

  const products = await readJSON('products');
  let subtotal = 0;
  const verifiedItems = [];

  for (const item of items) {
    const prod = products.find(p => p.id === item.productId);
    if (!prod) {
      return res.status(400).json({ success: false, message: `Product ${item.name || item.productId} no longer exists` });
    }
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    if (prod.stock < qty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock for "${prod.name}". Only ${prod.stock} available.`
      });
    }

    prod.stock -= qty;
    prod.updatedAt = new Date().toISOString();

    verifiedItems.push({
      productId: prod.id,
      name: prod.name,
      price: prod.price,
      quantity: qty,
      image: prod.image
    });

    subtotal += prod.price * qty;
  }

  let discount = 0;
  if (promoCode && promoCode.toUpperCase() === 'TECH10') {
    discount = Math.round(subtotal * 0.10);
  }

  const shipping = subtotal > 100 ? 0 : 15;
  const total = Math.max(0, subtotal - discount + shipping);

  const newOrder = {
    id: `ORD-${Math.floor(10000 + Math.random() * 90000)}`,
    customer,
    items: verifiedItems,
    subtotal,
    discount,
    shipping,
    total,
    paymentMethod: paymentMethod || 'Credit / Debit Card',
    status: 'Confirmed',
    createdAt: new Date().toISOString()
  };

  const orders = await readJSON('orders');
  orders.unshift(newOrder);

  await writeJSON('products', products);
  await writeJSON('orders', orders);

  res.status(201).json({
    success: true,
    message: 'Order placed successfully!',
    order: newOrder
  });
}));

// PATCH /api/orders/:id - PROTECTED: Owner only
app.patch('/api/orders/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    });
  }

  const orders = await readJSON('orders');
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  order.status = status;
  order.updatedAt = new Date().toISOString();
  await writeJSON('orders', orders);

  res.json({ success: true, message: `Order status updated to ${status}`, order });
}));

// GET /api/stats - PROTECTED: Owner only
app.get('/api/stats', requireAdmin, asyncHandler(async (req, res) => {
  const [products, orders] = await Promise.all([
    readJSON('products'),
    readJSON('orders')
  ]);

  const totalRevenue = orders
    .filter(o => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + (o.total || 0), 0);

  const totalOrders = orders.length;
  const totalProducts = products.length;
  const lowStockProducts = products.filter(p => p.stock <= 5);

  const categoryBreakdown = {};
  products.forEach(p => {
    categoryBreakdown[p.category] = (categoryBreakdown[p.category] || 0) + 1;
  });

  res.json({
    success: true,
    stats: {
      totalRevenue,
      totalOrders,
      totalProducts,
      lowStockCount: lowStockProducts.length,
      categoryBreakdown,
      recentOrders: orders.slice(0, 5)
    }
  });
}));

app.use((err, req, res, next) => {
  console.error('Request failed:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ success: false, message: 'An unexpected server error occurred.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(` NetShopUg E-Commerce Server is LIVE!`);
    console.log(` Storefront: http://localhost:${PORT}`);
    console.log(` Owner Portal: http://localhost:${PORT}/admin`);
    console.log(` Default Owner Password: ${ADMIN_PASSWORD}`);
    console.log(`===============================================`);
  });
}

module.exports = app;
