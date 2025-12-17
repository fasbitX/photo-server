// routes-user-dashboard.js
const path = require('path');
const fs = require('fs');
const { findUserById, getTransactions } = require('./db-users');

const uploadDir = path.join(__dirname, 'uploads');

function requireUser(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.redirect('/login');
}

function registerUserDashboardRoutes(app) {
  
  /* ──────────────────────────────────────────────
   *  USER DASHBOARD
   * ────────────────────────────────────────────── */
  
  app.get('/dashboard', requireUser, async (req, res) => {
    try {
      const user = await findUserById(req.session.userId);
      if (!user) {
        req.session.destroy();
        return res.redirect('/login');
      }
      
      const transactions = await getTransactions(user.id, 10);
      
      res.send(renderDashboard(user, transactions));
    } catch (err) {
      console.error('Dashboard error:', err);
      res.status(500).send('Error loading dashboard');
    }
  });
  
  /* ──────────────────────────────────────────────
   *  USER PHOTOS (SCOPED TO USER)
   * ────────────────────────────────────────────── */
  
  app.get('/my-photos', requireUser, async (req, res) => {
    try {
      const user = await findUserById(req.session.userId);
      if (!user) {
        req.session.destroy();
        return res.redirect('/login');
      }
      
      const userFolder = path.join(uploadDir, user.account_number);
      let photos = [];
      
      if (fs.existsSync(userFolder)) {
        const files = fs.readdirSync(userFolder);
        photos = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
      }
      
      res.send(renderPhotosPage(user, photos));
    } catch (err) {
      console.error('Photos error:', err);
      res.status(500).send('Error loading photos');
    }
  });
  
  app.get('/photo/:accountNumber/:filename', requireUser, async (req, res) => {
    try {
      const user = await findUserById(req.session.userId);
      if (!user || user.account_number !== req.params.accountNumber) {
        return res.status(403).send('Access denied');
      }
      
      const filePath = path.join(uploadDir, req.params.accountNumber, req.params.filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).send('Photo not found');
      }
      
      res.sendFile(filePath);
    } catch (err) {
      console.error('Photo fetch error:', err);
      res.status(500).send('Error loading photo');
    }
  });
  
  /* ──────────────────────────────────────────────
   *  ACCOUNT SETTINGS
   * ────────────────────────────────────────────── */
  
  app.get('/account', requireUser, async (req, res) => {
    try {
      const user = await findUserById(req.session.userId);
      if (!user) {
        req.session.destroy();
        return res.redirect('/login');
      }
      
      res.send(renderAccountPage(user));
    } catch (err) {
      console.error('Account page error:', err);
      res.status(500).send('Error loading account');
    }
  });
  
  /* ──────────────────────────────────────────────
   *  TRANSACTIONS PAGE
   * ────────────────────────────────────────────── */
  
  app.get('/transactions', requireUser, async (req, res) => {
    try {
      const user = await findUserById(req.session.userId);
      if (!user) {
        req.session.destroy();
        return res.redirect('/login');
      }
      
      const transactions = await getTransactions(user.id, 100);
      
      res.send(renderTransactionsPage(user, transactions));
    } catch (err) {
      console.error('Transactions error:', err);
      res.status(500).send('Error loading transactions');
    }
  });
}

/* ──────────────────────────────────────────────
 *  HTML TEMPLATES
 * ────────────────────────────────────────────── */

function getBaseStyles() {
  return `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #f5f5f7;
        color: #1d1d1f;
      }
      .navbar {
        background: white;
        padding: 15px 30px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .navbar h1 { font-size: 22px; color: #667eea; }
      .nav-links { display: flex; gap: 25px; align-items: center; }
      .nav-links a {
        color: #1d1d1f;
        text-decoration: none;
        font-weight: 500;
        transition: color 0.2s;
      }
      .nav-links a:hover { color: #667eea; }
      .container {
        max-width: 1200px;
        margin: 40px auto;
        padding: 0 20px;
      }
      .card {
        background: white;
        border-radius: 12px;
        padding: 30px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        margin-bottom: 30px;
      }
      h2 { margin-bottom: 20px; color: #1d1d1f; }
      .info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
      }
      .info-item label {
        display: block;
        font-size: 13px;
        color: #86868b;
        margin-bottom: 5px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .info-item .value {
        font-size: 16px;
        color: #1d1d1f;
        font-weight: 500;
      }
      .balance {
        font-size: 48px;
        font-weight: 700;
        color: #667eea;
        margin: 20px 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 15px;
        text-align: left;
        border-bottom: 1px solid #e5e5e7;
      }
      th {
        background: #f5f5f7;
        font-weight: 600;
        color: #1d1d1f;
      }
      .positive { color: #34c759; }
      .negative { color: #ff3b30; }
      button {
        padding: 12px 24px;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.3s;
      }
      button:hover { background: #5568d3; }
      .photo-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 20px;
        margin-top: 20px;
      }
      .photo-item {
        aspect-ratio: 1;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .photo-item img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .empty-state {
        text-align: center;
        padding: 60px 20px;
        color: #86868b;
      }
    </style>
  `;
}

function renderNavbar(user, activePage = 'dashboard') {
  return `
    <div class="navbar">
      <h1>Fasbit</h1>
      <div class="nav-links">
        <a href="/dashboard" style="${activePage === 'dashboard' ? 'color: #667eea;' : ''}">Dashboard</a>
        <a href="/my-photos" style="${activePage === 'photos' ? 'color: #667eea;' : ''}">My Photos</a>
        <a href="/transactions" style="${activePage === 'transactions' ? 'color: #667eea;' : ''}">Transactions</a>
        <a href="/account" style="${activePage === 'account' ? 'color: #667eea;' : ''}">Account</a>
        <form method="POST" action="/logout" style="margin: 0;">
          <button type="submit" style="background: transparent; color: #ff3b30; padding: 0;">Logout</button>
        </form>
      </div>
    </div>
  `;
}

function renderDashboard(user, transactions) {
  const formattedDate = new Date(user.created_date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - Fasbit</title>
  ${getBaseStyles()}
</head>
<body>
  ${renderNavbar(user, 'dashboard')}
  <div class="container">
    <div class="card">
      <h2>Welcome, ${user.first_name}!</h2>
      <div class="info-grid">
        <div class="info-item">
          <label>Account Number</label>
          <div class="value">${user.account_number}</div>
        </div>
        <div class="info-item">
          <label>Member Since</label>
          <div class="value">${formattedDate}</div>
        </div>
        <div class="info-item">
          <label>Status</label>
          <div class="value" style="text-transform: capitalize;">${user.status}</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>Account Balance</h2>
      <div class="balance">$${parseFloat(user.account_balance).toFixed(2)}</div>
    </div>
    
    <div class="card">
      <h2>Recent Transactions</h2>
      ${transactions.length === 0 ? `
        <div class="empty-state">
          <p>No transactions yet</p>
        </div>
      ` : `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.map(t => `
              <tr>
                <td>${new Date(t.transaction_date).toLocaleDateString()}</td>
                <td>${t.description || 'Transaction'}</td>
                <td class="${parseFloat(t.amount) >= 0 ? 'positive' : 'negative'}">
                  ${parseFloat(t.amount) >= 0 ? '+' : ''}$${parseFloat(t.amount).toFixed(2)}
                </td>
                <td>$${parseFloat(t.running_balance).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="text-align: center; margin-top: 20px;">
          <a href="/transactions"><button>View All Transactions</button></a>
        </div>
      `}
    </div>
  </div>
</body>
</html>`;
}

function renderPhotosPage(user, photos) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Photos - Fasbit</title>
  ${getBaseStyles()}
</head>
<body>
  ${renderNavbar(user, 'photos')}
  <div class="container">
    <div class="card">
      <h2>My Photos</h2>
      ${photos.length === 0 ? `
        <div class="empty-state">
          <p>No photos uploaded yet</p>
          <p style="font-size: 14px; margin-top: 10px;">Use the mobile app to upload photos</p>
        </div>
      ` : `
        <div class="photo-grid">
          ${photos.map(photo => `
            <div class="photo-item">
              <img src="/photo/${user.account_number}/${photo}" alt="${photo}">
            </div>
          `).join('')}
        </div>
      `}
    </div>
  </div>
</body>
</html>`;
}

function renderAccountPage(user) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Settings - Fasbit</title>
  ${getBaseStyles()}
</head>
<body>
  ${renderNavbar(user, 'account')}
  <div class="container">
    <div class="card">
      <h2>Account Information</h2>
      <div class="info-grid">
        <div class="info-item">
          <label>Name</label>
          <div class="value">${user.first_name} ${user.last_name}</div>
        </div>
        <div class="info-item">
          <label>Email</label>
          <div class="value">${user.email}</div>
        </div>
        <div class="info-item">
          <label>Phone</label>
          <div class="value">${user.phone}</div>
        </div>
        <div class="info-item">
          <label>Account Number</label>
          <div class="value">${user.account_number}</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>Address</h2>
      <div class="info-grid">
        <div class="info-item">
          <label>Street</label>
          <div class="value">${user.street_address}</div>
        </div>
        <div class="info-item">
          <label>City</label>
          <div class="value">${user.city}</div>
        </div>
        <div class="info-item">
          <label>State</label>
          <div class="value">${user.state}</div>
        </div>
        <div class="info-item">
          <label>ZIP</label>
          <div class="value">${user.zip}</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>Settings</h2>
      <div class="info-grid">
        <div class="info-item">
          <label>Time Zone</label>
          <div class="value">${user.timezone}</div>
        </div>
        <div class="info-item">
          <label>Status</label>
          <div class="value" style="text-transform: capitalize;">${user.status}</div>
        </div>
        <div class="info-item">
          <label>Email Verified</label>
          <div class="value">${user.email_verified ? 'Yes' : 'No'}</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function renderTransactionsPage(user, transactions) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transactions - Fasbit</title>
  ${getBaseStyles()}
</head>
<body>
  ${renderNavbar(user, 'transactions')}
  <div class="container">
    <div class="card">
      <h2>Transaction History</h2>
      ${transactions.length === 0 ? `
        <div class="empty-state">
          <p>No transactions yet</p>
        </div>
      ` : `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Running Balance</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.map(t => `
              <tr>
                <td>${new Date(t.transaction_date).toLocaleString()}</td>
                <td>${t.description || 'Transaction'}</td>
                <td class="${parseFloat(t.amount) >= 0 ? 'positive' : 'negative'}">
                  ${parseFloat(t.amount) >= 0 ? '+' : ''}$${parseFloat(t.amount).toFixed(2)}
                </td>
                <td>$${parseFloat(t.running_balance).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  </div>
</body>
</html>`;
}

module.exports = { registerUserDashboardRoutes };