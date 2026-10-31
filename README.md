# ⚡ NetShopUg - Electronics & Tech Gadgets E-Commerce Web App

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
- **Owner Admin Portal**: [http://localhost:3000/admin](http://localhost:3000/admin) *(Local passcode: `admin123`)*

---

## ☁️ Deploy to Netlify

This project includes a Netlify Functions adapter for the Express API. Netlify Blobs stores products, orders, admin sessions, and uploaded product images persistently; the starter product catalog and existing images are included in the deployment.

1. Push the project to GitHub, then in Netlify choose **Add new site → Import an existing project** and select the repository.
2. Keep the build settings from `netlify.toml`. The site name can be set to **NetShopUg** (the public address will be `netshopug.netlify.app` if that name is available).
3. In **Site configuration → Environment variables**, set `ADMIN_PASSWORD` to a strong, private passcode. The local-only default `admin123` is rejected by the deployed API.
4. Deploy the site. Netlify Blobs is initialized automatically when the API first runs.

Use `npm run netlify:dev` to test the Netlify Functions and Blobs integration locally. Netlify CLI will ask you to log in and link the site. Normal local development still uses `npm start`.

The public storefront and owner portal are available at `/` and `/admin`. Product catalog updates are checked every 30 seconds while the storefront is open; switching tabs or returning to the page refreshes immediately.

---

## 📁 Project Architecture

```
Shopping web/
├── .vscode/
│   ├── launch.json       # 1-click F5 debugging configuration
│   └── tasks.json        # VS Code task runner
├── data/
│   └── products.json     # Starter product catalog (seeded to Netlify Blobs)
├── public/
│   ├── index.html        # Public Customer Storefront (clean, no owner controls)
│   ├── app.js            # Customer logic (search, cart, checkout)
│   ├── admin.html        # Protected Owner Management Portal (passcode required)
│   ├── admin.js          # Owner logic (add products, inventory, orders, analytics)
│   └── styles.css        # Responsive modern dark/light tech styling
├── uploads/              # Existing product images copied into the Netlify publish folder
├── netlify/
│   └── functions/api.js   # Netlify Functions adapter for the Express REST API
├── scripts/
│   └── prepare-netlify.js # Builds the publish folder and copies product images
├── netlify.toml          # Netlify build, function, and route configuration
├── package.json          # Node.js dependencies and scripts
├── server.js             # Express REST API with Netlify Blobs persistence
└── README.md             # Documentation
```
