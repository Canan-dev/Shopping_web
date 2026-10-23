# ⚡ ElectroHub - Electronics & Tech Gadgets E-Commerce Web App

A full-stack shopping website tailored for tech gadgets, smartphones, laptops, audio, and accessories. Designed specifically to run and develop seamlessly in **Visual Studio Code (VS Code)**.

---

## 🔒 Separation of Shoppers vs. Store Owner

To keep your store secure and clean:
- **Regular visitors / customers** only see the shop (`http://localhost:3000`). They **cannot** see the "Add Item" tab, nor can they add, edit, or delete items.
- **The Owner** accesses a dedicated protected portal at `http://localhost:3000/admin` secured with an owner passcode.

---

## 🌟 Key Features

### 🛒 1. For Shoppers & Customers (`http://localhost:3000`)
- **Browse & Search**: Filter by category (Smartphones, Laptops, Audio, Wearables, Gaming, Accessories), sort by price/rating, or search keywords.
- **Product Details & Quick View**: High-resolution gallery images, detailed technical specifications, stock availability badges.
- **Shopping Cart**: Slide-out drawer with quantity controls (`+` / `−`), automatic subtotal, and free shipping over $100.
- **Promo Discount**: Enter code `TECH10` for **10% off**!
- **Checkout & Digital Receipt**: Instant order confirmation with Order ID and itemized receipt.
- **Zero Owner Controls**: Regular visitors cannot access product management.

### 🛡️ 2. For the Store Owner (`http://localhost:3000/admin`)
- **Password Protection**:
  - Default Owner Password: `admin123`
- **Add New Item**:
  - Title, Category, Sale Price, Original Price, Stock, Description, and Bullet Specs.
  - **Live Card Preview**: See the customer card in real time as you type.
  - **Image Options**: Enter an image URL, pick from tech presets, or upload a photo directly from your computer!
- **Inventory Management**:
  - Full table of active items with quick stock adjuster (`+` / `−`).
  - Edit prices, descriptions, and stock counts.
  - Delete item with confirmation.
- **Customer Orders Tracker**:
  - Live list of orders placed by customers.
  - Buyer details (name, email, delivery address, payment method).
  - Order status switcher (`Confirmed`, `Processing`, `Shipped`, `Delivered`, `Cancelled`).
- **Store Analytics Dashboard**:
  - Total sales revenue, order volume, catalog size, and low-stock warning indicators.

---

## 🚀 How to Run in VS Code

### Step 1: Open the Project in VS Code
1. Open **Visual Studio Code**.
2. Click **File > Open Folder...** and select:
   ```
   c:\Users\DELL\Desktop\Shopping web
   ```

### Step 2: Start the Server
* **Press F5** on your keyboard (or click **Run > Start Debugging**).
* *OR* open the VS Code Terminal (<kbd>Ctrl</kbd> + <kbd>`</kbd>) and run:
  ```powershell
  npm start
  ```

### Step 3: Open in Your Browser
- **Customer Storefront**: [http://localhost:3000](http://localhost:3000)
- **Owner Admin Portal**: [http://localhost:3000/admin](http://localhost:3000/admin) *(Passcode: `admin123`)*

---

## 📁 Project Architecture

```
Shopping web/
├── .vscode/
│   ├── launch.json       # 1-click F5 debugging configuration
│   └── tasks.json        # VS Code task runner
├── data/
│   ├── products.json     # Persistent product database
│   └── orders.json       # Persistent customer orders database
├── public/
│   ├── index.html        # Public Customer Storefront (clean, no owner controls)
│   ├── app.js            # Customer logic (search, cart, checkout)
│   ├── admin.html        # Protected Owner Management Portal (passcode required)
│   ├── admin.js          # Owner logic (add products, inventory, orders, analytics)
│   └── styles.css        # Responsive modern dark/light tech styling
├── uploads/              # Custom uploaded product images
├── package.json          # Node.js dependencies (express, cors, multer)
├── server.js             # Express REST API with owner authentication
└── README.md             # Documentation
```
