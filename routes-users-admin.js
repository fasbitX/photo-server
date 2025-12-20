// routes-users-admin.js
const { Pool } = require('pg');

// We'll reuse the existing pool from database.js
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'text_fasbit',
      user: process.env.DB_USER || 'text_fasbit_user',
      password: process.env.DB_PASSWORD,
    });
  }
  return pool;
}

/* ────────────────────────────────────────────────
 *  HTML RENDERER FOR USERS PAGE
 * ──────────────────────────────────────────────── */

function renderUsersPage(users = [], searchQuery = '') {
  const userRowsHtml = users.length === 0
    ? '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #6B7280;">No users found</td></tr>'
    : users.map(user => {
        const status = user.status || 'active';
        const statusClass = status === 'active' ? 'status-active' : 'status-suspended';
        const createdDate = new Date(parseInt(user.created_date)).toLocaleDateString();
        
        return `
          <tr class="user-row" onclick="viewUser(${user.id})">
            <td>${escapeHtml(user.account_number)}</td>
            <td>${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(user.phone)}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td>$${parseFloat(user.account_balance).toFixed(2)}</td>
            <td>${createdDate}</td>
          </tr>
        `;
      }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Users Management - Admin</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #020617;
      color: #e5e7eb;
      display: flex;
      height: 100vh;
    }

    .sidebar {
      width: 260px;
      background: #020617;
      border-right: 1px solid #1f2937;
      padding: 16px;
      display: flex;
      flex-direction: column;
    }

    .sidebar h1 {
      margin: 0 0 20px 0;
      font-size: 18px;
    }

    .nav-section {
      margin-bottom: 20px;
    }

    .nav-label {
      font-size: 12px;
      color: #6B7280;
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 8px;
      display: block;
    }

    .nav-item {
      display: block;
      padding: 8px 12px;
      margin-bottom: 4px;
      border-radius: 6px;
      color: #e5e7eb;
      text-decoration: none;
      font-size: 14px;
      transition: background 0.2s;
    }

    .nav-item:hover {
      background: #111827;
    }

    .nav-item.active {
      background: #1f2937;
      font-weight: 600;
    }

    .logout-btn {
      margin-top: auto;
      width: 100%;
      padding: 8px;
      border-radius: 999px;
      border: none;
      background: #2563eb;
      color: white;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    }

    .logout-btn:hover {
      background: #1d4ed8;
    }

    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .top-bar {
      padding: 16px 24px;
      background: #020617;
      border-bottom: 1px solid #1f2937;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .page-title {
      font-size: 24px;
      font-weight: 600;
    }

    .search-box {
      display: flex;
      gap: 8px;
    }

    .search-input {
      padding: 8px 16px;
      background: #030712;
      border: 1px solid #374151;
      border-radius: 8px;
      color: #e5e7eb;
      width: 300px;
      font-size: 14px;
    }

    .search-btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      background: #2563eb;
      color: white;
      font-weight: 600;
      cursor: pointer;
      font-size: 14px;
    }

    .content-area {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: #020617;
      border: 1px solid #1f2937;
      border-radius: 8px;
      overflow: hidden;
    }

    thead {
      background: #111827;
    }

    th {
      padding: 12px 16px;
      text-align: left;
      font-size: 12px;
      color: #9CA3AF;
      text-transform: uppercase;
      font-weight: 600;
    }

    td {
      padding: 12px 16px;
      border-top: 1px solid #1f2937;
      font-size: 14px;
    }

    .user-row {
      cursor: pointer;
      transition: background 0.2s;
    }

    .user-row:hover {
      background: #111827;
    }

    .status-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      display: inline-block;
    }

    .status-active {
      background: #10B981;
      color: #fff;
    }

    .status-suspended {
      background: #EF4444;
      color: #fff;
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-overlay.active {
      display: flex;
    }

    .modal-content {
      background: #020617;
      border: 1px solid #374151;
      border-radius: 16px;
      padding: 24px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .modal-title {
      font-size: 20px;
      font-weight: 600;
    }

    .close-btn {
      background: none;
      border: none;
      color: #9CA3AF;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
    }

    .detail-row {
      margin-bottom: 16px;
    }

    .detail-label {
      font-size: 12px;
      color: #9CA3AF;
      margin-bottom: 4px;
    }

    .detail-value {
      font-size: 16px;
      color: #fff;
    }

    .action-buttons {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }

    .btn {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .btn:hover {
      opacity: 0.9;
    }

    .btn-suspend {
      background: #F59E0B;
      color: #fff;
    }

    .btn-delete {
      background: #EF4444;
      color: #fff;
    }
  </style>
</head>
<body>
  <!-- Sidebar -->
  <div class="sidebar">
    <h1>Photo Admin</h1>
    
    <div class="nav-section">
      <span class="nav-label">Management</span>
      <a href="/admin/users" class="nav-item active">👥 Users</a>
      <a href="/admin/dashboard" class="nav-item">📷 Photo Admin</a>
    </div>

    <form method="POST" action="/admin/logout">
      <button type="submit" class="logout-btn">Logout</button>
    </form>
  </div>

  <!-- Main Content -->
  <div class="main">
    <div class="top-bar">
      <h1 class="page-title">Users Management</h1>
      <form class="search-box" method="GET" action="/admin/users">
        <input 
          type="text" 
          name="search"
          class="search-input" 
          placeholder="Search by name, email, phone..."
          value="${escapeHtml(searchQuery)}"
        >
        <button type="submit" class="search-btn">Search</button>
      </form>
    </div>

    <div class="content-area">
      <table>
        <thead>
          <tr>
            <th>Account #</th>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Balance</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${userRowsHtml}
        </tbody>
      </table>
    </div>
  </div>

  <!-- User Detail Modal -->
  <div class="modal-overlay" id="userModal">
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">User Details</h2>
        <button class="close-btn" onclick="closeModal()">✕</button>
      </div>

      <div id="userDetails">
        <!-- Details loaded via JavaScript -->
      </div>

      <div class="action-buttons">
        <button class="btn btn-suspend" onclick="toggleSuspend()">Suspend/Activate</button>
        <button class="btn btn-delete" onclick="deleteUser()">Delete User</button>
      </div>
    </div>
  </div>

  <script>
    let currentUser = null;

    function viewUser(userId) {
      fetch('/admin/users/api/' + userId)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            currentUser = data.user;
            displayUserDetails(data.user);
            document.getElementById('userModal').classList.add('active');
          }
        })
        .catch(err => console.error('Error loading user:', err));
    }

    function displayUserDetails(user) {
      const created = new Date(parseInt(user.created_date)).toLocaleString();
      const lastMod = new Date(parseInt(user.last_modified)).toLocaleString();
      
      document.getElementById('userDetails').innerHTML = \`
        <div class="detail-row">
          <div class="detail-label">Account Number</div>
          <div class="detail-value">\${escapeHtml(user.account_number)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Name</div>
          <div class="detail-value">\${escapeHtml(user.first_name)} \${escapeHtml(user.last_name)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Email</div>
          <div class="detail-value">\${escapeHtml(user.email)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Phone</div>
          <div class="detail-value">\${escapeHtml(user.phone)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Address</div>
          <div class="detail-value">\${escapeHtml(user.street_address)}<br>
          \${escapeHtml(user.city)}, \${escapeHtml(user.state)} \${escapeHtml(user.zip)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Account Balance</div>
          <div class="detail-value">$\${parseFloat(user.account_balance).toFixed(2)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Status</div>
          <div class="detail-value">\${escapeHtml(user.status)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Email Verified</div>
          <div class="detail-value">\${user.email_verified ? 'Yes' : 'No'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Timezone</div>
          <div class="detail-value">\${escapeHtml(user.timezone)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Created</div>
          <div class="detail-value">\${created}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Last Modified</div>
          <div class="detail-value">\${lastMod}</div>
        </div>
      \`;
    }

    function closeModal() {
      document.getElementById('userModal').classList.remove('active');
      currentUser = null;
    }

    function toggleSuspend() {
      if (!currentUser) return;
      
      const newStatus = currentUser.status === 'suspended' ? 'active' : 'suspended';
      const action = newStatus === 'suspended' ? 'suspend' : 'activate';
      
      if (confirm(\`Are you sure you want to \${action} this user?\`)) {
        fetch('/admin/users/api/' + currentUser.id + '/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus })
        })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            alert('User status updated');
            closeModal();
            location.reload();
          } else {
            alert('Error: ' + (data.error || 'Failed to update status'));
          }
        })
        .catch(err => {
          console.error('Error:', err);
          alert('Failed to update user status');
        });
      }
    }

    function deleteUser() {
      if (!currentUser) return;
      
      if (confirm('Are you sure you want to DELETE this user? This action cannot be undone.')) {
        fetch('/admin/users/api/' + currentUser.id, {
          method: 'DELETE'
        })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            alert('User deleted successfully');
            closeModal();
            location.reload();
          } else {
            alert('Error: ' + (data.error || 'Failed to delete user'));
          }
        })
        .catch(err => {
          console.error('Error:', err);
          alert('Failed to delete user');
        });
      }
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ────────────────────────────────────────────────
 *  ROUTE REGISTRATION
 * ──────────────────────────────────────────────── */

function registerUsersAdminRoutes(app, { requireAdmin }) {
  const pool = getPool();

  // Main users page (HTML)
  app.get('/admin/users', requireAdmin, async (req, res) => {
    try {
      const searchQuery = req.query.search || '';
      
      let query = 'SELECT * FROM users WHERE 1=1';
      const params = [];

      if (searchQuery.trim()) {
        query += ` AND (
          first_name ILIKE $1 OR 
          last_name ILIKE $1 OR 
          email ILIKE $1 OR 
          phone ILIKE $1 OR
          account_number ILIKE $1
        )`;
        params.push(`%${searchQuery.trim()}%`);
      }

      query += ' ORDER BY created_date DESC LIMIT 100';

      const result = await pool.query(query, params);
      
      res.send(renderUsersPage(result.rows, searchQuery));
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).send('Error loading users');
    }
  });

  // API: Get single user details (JSON)
  app.get('/admin/users/api/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      res.json({ success: true, user: result.rows[0] });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch user' });
    }
  });

  // API: Update user status
  app.post('/admin/users/api/:id/status', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'suspended'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }

      const result = await pool.query(
        'UPDATE users SET status = $1, last_modified = $2 WHERE id = $3 RETURNING id',
        [status, Date.now(), id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating user status:', error);
      res.status(500).json({ success: false, error: 'Failed to update status' });
    }
  });

  // API: Delete user
  app.delete('/admin/users/api/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ success: false, error: 'Failed to delete user' });
    }
  });
}

module.exports = { registerUsersAdminRoutes };