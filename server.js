// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

const { initDatabase } = require('./db-users');
const { registerUploadRoutes } = require('./uploadRoutes');
const { registerAdminRoutes } = require('./adminRoutes');
const { registerAuthRoutes } = require('./routes-auth');
const { registerUserDashboardRoutes } = require('./routes-user-dashboard');

const app = express();

/* ──────────────────────────────────────────────
 *  ADMIN CREDENTIALS (FROM .ENV ONLY)
 * ────────────────────────────────────────────── */

const ADMIN_USER =
  process.env.ADMIN_USER || process.env.ADMIN_USERNAME || '';
const ADMIN_PASS =
  process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || '';

if (!ADMIN_USER || !ADMIN_PASS) {
  console.warn(
    'WARNING: ADMIN_USER / ADMIN_PASS (or ADMIN_USERNAME / ADMIN_PASSWORD) not set in .env – admin login will fail.'
  );
}

/* ──────────────────────────────────────────────
 *  BASIC MIDDLEWARE
 * ────────────────────────────────────────────── */

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(
  express.urlencoded({
    extended: true,
    limit: '20mb',
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

/* ──────────────────────────────────────────────
 *  ADMIN AUTH HELPERS
 * ────────────────────────────────────────────── */

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

/* ──────────────────────────────────────────────
 *  ADMIN LOGIN / LOGOUT
 * ────────────────────────────────────────────── */

function renderAdminLoginPage(errorMessage = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Admin Login</title>
  <style>
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: radial-gradient(circle at top, #111827, #020617);
      color: #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
    }
    .card {
      background: #020617;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      width: 320px;
      border: 1px solid #1f2937;
    }
    h1 { margin: 0 0 16px 0; font-size: 20px; }
    label { display: block; margin-top: 12px; font-size: 14px; }
    input {
      width: 100%;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid #374151;
      background: #030712;
      color: #e5e7eb;
      margin-top: 4px;
    }
    button {
      margin-top: 16px;
      width: 100%;
      padding: 10px;
      border-radius: 999px;
      border: none;
      background: #2563eb;
      color: white;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover {
      background: #1d4ed8;
    }
    .error {
      margin-top: 12px;
      color: #f97373;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <form class="card" method="POST" action="/admin/login">
    <h1>Admin Login</h1>
    <label>
      Username
      <input name="username" autocomplete="username" autofocus />
    </label>
    <label>
      Password
      <input type="password" name="password" autocomplete="current-password" />
    </label>
    <button type="submit">Log in</button>
    ${
      errorMessage
        ? `<div class="error">${errorMessage}</div>`
        : ''
    }
  </form>
</body>
</html>`;
}

app.get('/admin/login', (req, res) => {
  res.send(renderAdminLoginPage());
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body || {};

  const ok = username === ADMIN_USER && password === ADMIN_PASS;

  if (ok) {
    req.session.isAdmin = true;
    return res.redirect('/dashboard');
  }

  return res.send(renderAdminLoginPage('Invalid username or password'));
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

/* ──────────────────────────────────────────────
 *  SHARED STATE (PORT / SERVER HANDLE)
 * ────────────────────────────────────────────── */

const state = {
  currentPort: parseInt(process.env.PORT, 10) || 4000,
  server: null,
};

/* ──────────────────────────────────────────────
 *  INITIALIZE DATABASE
 * ────────────────────────────────────────────── */

async function startServer() {
  try {
    // Initialize user database
    await initDatabase();
    console.log('User database initialized');
    
    /* ──────────────────────────────────────────────
     *  REGISTER ROUTE MODULES
     * ────────────────────────────────────────────── */
    
    // User authentication routes (/, /login, /signup, etc.)
    registerAuthRoutes(app);
    
    // User dashboard routes (/dashboard, /my-photos, /transactions, /account)
    registerUserDashboardRoutes(app);
    
    // Upload routes for mobile app
    registerUploadRoutes(app);
    
    // Admin routes (/admin/*, requires admin login)
    registerAdminRoutes(app, { requireAdmin, state });
    
/* ──────────────────────────────────────────────
 *  START SERVER
 * ────────────────────────────────────────────── */

const envPort = Number.parseInt(process.env.PORT || '', 10);
const envHost = (process.env.HOST || '').trim();

const PORT = Number.isFinite(envPort) ? envPort : (state.currentPort || 4000);
const HOST = envHost || '127.0.0.1';

state.currentPort = PORT;

state.server = app.listen(PORT, HOST, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║           SERVER STARTED                      ║
╠═══════════════════════════════════════════════╣
║  Host: ${HOST}
║  Port: ${PORT}
║  User Login:  http://${HOST}:${PORT}
║  Admin Login: http://${HOST}:${PORT}/admin
╚═══════════════════════════════════════════════╝
  `);
});


startServer();

module.exports = app;