# 🚀 ExpenseTracker Pro — Backend Server API

Official backend RESTful API server for **ExpenseTracker Pro** by **PrasaTek System Solutions**.

---

## 📋 Overview
The ExpenseTracker Pro backend provides a scalable, secure Node.js and Express API powering multi-account financial management, real-time transaction logging, automated email OTP verification via Resend API, role-based access control (User, Manager, Admin), PayHere Sri Lanka payment gateway webhooks, and administrative telemetry.

---

## 🛠️ Technology Stack
- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: MongoDB Atlas with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens) & Bcrypt password hashing
- **OAuth**: Google OAuth 2.0 (`google-auth-library`)
- **Email Delivery**: Resend API SDK (`resend`)
- **Payment Gateway**: PayHere Sri Lanka Sandbox / Live MD5 Signature Validation
- **Deployment Target**: Render Web Services (`https://backend-xolk.onrender.com`)

---

## 🔑 Environment Variables Setup
Copy `.env.example` to `.env` in the backend root directory and configure environment parameters:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
GOOGLE_CLIENT_ID=your_google_client_id
PAYHERE_MERCHANT_ID=your_payhere_merchant_id
PAYHERE_MERCHANT_SECRET=your_payhere_merchant_secret
PAYHERE_SANDBOX=true
RESEND_API_KEY=your_resend_api_key
```

> ⚠️ **Security Notice**: Never commit `.env` files containing live credentials or API keys to Git. Use `.env.example` for public template configuration.

---

## ⚙️ Installation & Running Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode
```bash
npm run dev
# or
node server.js
```

Backend server will start listening on `http://localhost:5000`.

---

## 📡 API Endpoints Overview

| Route Category | Base Endpoint | Description |
| :--- | :--- | :--- |
| **Authentication** | `/api/auth` | User registration, login, 6-digit OTP email verification, Google OAuth, password resets |
| **Financial Accounts** | `/api/accounts` | Create, update, list, and delete user bank/wallet accounts |
| **Transactions** | `/api/transactions` | Log income/expenses, edit transactions, monthly analytics, backup import |
| **Admin Control** | `/api/admin` | User inspector, subscription tier management, system settings, backup JSON import |
| **System Status** | `/api/system` | Public status check (maintenance mode, global banner, headquarters location map) |
| **Support Tickets** | `/api/contacts` | Submit support inquiries, admin reply email dispatch |

---

## 🚀 Deployment (Render)
This backend is configured for automated deployment on **Render**:
- Build Command: `npm install`
- Start Command: `node server.js`
- Configuration File: `render.yaml`

---

## 📞 Contact & Support

For technical inquiries, custom branch deployments, or support:
- **Company**: PrasaTek System Solutions
- **Website**: [www.prasatek.lk](https://www.prasatek.lk)
- **Contact Email**: [info@prasatek.lk](mailto:info@prasatek.lk)
- **Mobile Hotline**: [+94 71 932 3239](tel:0719323239) / `0719323239`
- **Headquarters**: 73, Maputugala Poruwadanda

---

## 🛡️ License & Copyright
© PrasaTek System Solutions. All rights reserved.
