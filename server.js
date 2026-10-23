const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Owner password (default is 'admin123')
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const adminTokens = new Set();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure data & upload directories exist
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
const productsFile = path.join(dataDir, 'products.json');
const ordersFile = path.join(dataDir, 'orders.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Serve static frontend and uploads
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Route shortcut for owner admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${cleanName}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Helper functions for reading & writing JSON data
function readJSON(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8');
      return fallback;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return fallback;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
}

// ==========================================
// OWNER AUTHENTICATION MIDDLEWARE
// ==========================================
function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.headers['x-admin-token'];

  if (token && adminTokens.has(token)) {
    return next();
  }
  return res.status(401).json({
    success: false,
    message: 'Access denied: Owner authentication required.'
  });
}

// POST /api/admin/login - Verify owner password
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = 'adm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    adminTokens.add(token);
    return res.json({ success: true, token, message: 'Owner authenticated successfully!' });
  }
  return res.status(401).json({ success: false, message: 'Incorrect owner password. Access denied.' });
});

// POST /api/admin/logout - Invalidate owner token
app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.headers['x-admin-token'];
  if (token) adminTokens.delete(token);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// GET /api/admin/verify - Check if current session token is valid
app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ success: true, authorized: true });
});

// ==========================================
// PRODUCTS API
// ==========================================

// GET /api/products - PUBLIC: Anyone can browse products
app.get('/api/products', (req, res) => {
  let products = readJSON(productsFile);
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
});

// GET /api/products/:id - PUBLIC: Anyone can view a product
app.get('/api/products/:id', (req, res) => {
  const products = readJSON(productsFile);
  const product = products.find(p => p.id === req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.json({ success: true, product });
});

// POST /api/products - PROTECTED: Owner only
app.post('/api/products', requireAdmin, (req, res) => {
  const { name, category, price, originalPrice, stock, image, description, specs, badge } = req.body;

  if (!name || !category || price === undefined) {
    return res.status(400).json({ success: false, message: 'Name, Category, and Price are required.' });
  }

  const products = readJSON(productsFile);
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
  writeJSON(productsFile, products);

  res.status(201).json({ success: true, message: 'Product added successfully!', product: newProduct });
});

// PUT /api/products/:id - PROTECTED: Owner only
app.put('/api/products/:id', requireAdmin, (req, res) => {
  const products = readJSON(productsFile);
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

  writeJSON(productsFile, products);
  res.json({ success: true, message: 'Product updated successfully!', product: products[index] });
});

// DELETE /api/products/:id - PROTECTED: Owner only
app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const products = readJSON(productsFile);
  const filtered = products.filter(p => p.id !== req.params.id);

  if (filtered.length === products.length) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  writeJSON(productsFile, filtered);
  res.json({ success: true, message: 'Product deleted successfully!' });
});

// POST /api/upload - PROTECTED: Owner only
app.post('/api/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded or invalid file format' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl });
});

// ==========================================
// ORDERS API
// ==========================================

// GET /api/orders - PROTECTED: Owner only
app.get('/api/orders', requireAdmin, (req, res) => {
  const orders = readJSON(ordersFile);
  orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ success: true, count: orders.length, orders });
});

// POST /api/orders - PUBLIC: Anyone can buy items / place an order
app.post('/api/orders', (req, res) => {
  const { customer, items, paymentMethod, promoCode } = req.body;

  if (!customer || !customer.name || !customer.email || !customer.address) {
    return res.status(400).json({ success: false, message: 'Complete customer details required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Cart is empty' });
  }

  const products = readJSON(productsFile);
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

  const orders = readJSON(ordersFile);
  orders.unshift(newOrder);

  writeJSON(productsFile, products);
  writeJSON(ordersFile, orders);

  res.status(201).json({
    success: true,
    message: 'Order placed successfully!',
    order: newOrder
  });
});

// PATCH /api/orders/:id - PROTECTED: Owner only
app.patch('/api/orders/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    });
  }

  const orders = readJSON(ordersFile);
  const order = orders.find(o => o.id === req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  order.status = status;
  order.updatedAt = new Date().toISOString();
  writeJSON(ordersFile, orders);

  res.json({ success: true, message: `Order status updated to ${status}`, order });
});

// GET /api/stats - PROTECTED: Owner only
app.get('/api/stats', requireAdmin, (req, res) => {
  const products = readJSON(productsFile);
  const orders = readJSON(ordersFile);

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
});

// Start server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` ElectroHub E-Commerce Server is LIVE!`);
  console.log(` Storefront: http://localhost:${PORT}`);
  console.log(` Owner Portal: http://localhost:${PORT}/admin`);
  console.log(` Default Owner Password: ${ADMIN_PASSWORD}`);
  console.log(`===============================================`);
});
