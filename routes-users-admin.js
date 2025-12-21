// routes-users-admin.js
const { Pool } = require('pg');
const { renderAdminLayout } = require('./admin-layout');

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

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateSafe(v) {
  try {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'string' && /^\d+$/.test(v)) return new Date(Number(v)).toLocaleString();
    if (typeof v === 'number') return new Date(v).toLocaleString();
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  } catch {
    return String(v || '');
  }
}

function toMoneySafe(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

/* ════════════════════════════════════════════════════════
 *  USERS LIST CONTENT
 * ════════════════════════════════════════════════════════ */

function renderUsersListContent(users = [], searchQuery = '') {
  const rows =
    users.length === 0
      ? `<tr><td colspan="8" style="text-align:center;padding:40px;color:#6B7280;">No users found</td></tr>`
      : users
          .map((u) => {
            const status = u.status || 'active';
            const statusClass = status === 'active' ? 'status-active' : 'status-suspended';
            const created = formatDateSafe(u.created_date);

            return `
              <tr class="user-row" ondblclick="openUser(${u.id})">
                <td>${escapeHtml(u.account_number)}</td>
                <td>${escapeHtml(u.first_name)} ${escapeHtml(u.last_name)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${escapeHtml(u.phone)}</td>
                <td><span class="status-badge ${statusClass}">${escapeHtml(status)}</span></td>
                <td>$${toMoneySafe(u.account_balance)}</td>
                <td>${escapeHtml(created)}</td>
                <td class="actions">
                  <button class="icon-btn" title="Open" onclick="event.stopPropagation(); openUser(${u.id})">↗</button>
                  <button class="icon-btn" title="Edit" onclick="event.stopPropagation(); openUserEdit(${u.id})">✏</button>
                  <button class="icon-btn danger" title="Delete" onclick="event.stopPropagation(); quickDelete(${u.id})">🗑</button>
                </td>
              </tr>
            `;
          })
          .join('');

  return `
<style>
  .search-bar { margin-bottom: 24px; display: flex; gap: 12px; align-items: center; }
  .search-input { padding: 10px 16px; background: #030712; border: 1px solid #374151; border-radius: 8px; color: #e5e7eb; width: 400px; font-size: 14px; }
  .search-btn { padding: 10px 20px; border-radius: 8px; border: none; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; font-size: 14px; }
  .search-btn:hover { background: #1d4ed8; }
  .hint { color: #94a3b8; font-size: 12px; margin-left: 10px; }
  
  table { width: 100%; border-collapse: collapse; background: #030712; border: 1px solid #1f2937; border-radius: 8px; overflow: hidden; }
  thead { background: #111827; }
  th { padding: 12px 16px; text-align: left; font-size: 12px; color: #9CA3AF; text-transform: uppercase; font-weight: 600; }
  td { padding: 12px 16px; border-top: 1px solid #1f2937; font-size: 14px; vertical-align: middle; }
  .user-row { cursor: pointer; transition: background 0.2s; }
  .user-row:hover { background: #111827; }
  
  .status-badge { padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; display: inline-block; }
  .status-active { background: #10B981; color: #fff; }
  .status-suspended { background: #EF4444; color: #fff; }
  
  .actions { white-space: nowrap; }
  .icon-btn { border: 1px solid #334155; background: #0b1220; color: #e5e7eb; border-radius: 10px; padding: 6px 10px; margin-right: 8px; cursor: pointer; transition: all 0.2s; font-size: 14px; }
  .icon-btn:hover { opacity: 0.95; transform: translateY(-1px); background: #111827; }
  .icon-btn.danger { border-color: #7f1d1d; background: #1a0b0b; }
  .icon-btn.danger:hover { background: #2a0f0f; }
</style>

<div class="content-header">
  <h2 class="content-title">Users</h2>
  <p class="content-subtitle">Manage user accounts and permissions</p>
</div>

<form class="search-bar" method="GET" action="/admin/users">
  <input
    type="text"
    name="search"
    class="search-input"
    placeholder="Search by name, email, phone, account #..."
    value="${escapeHtml(searchQuery)}"
  />
  <button type="submit" class="search-btn">Search</button>
  <span class="hint">Tip: double-click a user row to open details</span>
</form>

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
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<script>
  function openUser(id) {
    window.location.href = '/admin/users/' + id;
  }
  function openUserEdit(id) {
    window.location.href = '/admin/users/' + id + '?edit=1';
  }
  async function quickDelete(id) {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    const r = await fetch('/admin/users/api/' + id, { method: 'DELETE' });
    const data = await r.json().catch(() => ({}));
    if (data && data.success) return location.reload();
    alert('Delete failed: ' + (data && data.error ? data.error : 'Unknown error'));
  }
</script>
  `;
}

/* ════════════════════════════════════════════════════════
 *  USER DETAIL CONTENT
 * ════════════════════════════════════════════════════════ */

function renderUserDetailContent(user, { editMode = false } = {}) {
  const created = formatDateSafe(user.created_date);
  const modified = formatDateSafe(user.last_modified);

  return `
<style>
  .user-detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #1f2937; }
  .user-title { font-size: 24px; font-weight: 700; }
  .user-subtitle { font-size: 13px; color: #94a3b8; margin-top: 4px; }
  .toolbar { display: flex; gap: 10px; }
  .icon { border: 1px solid #334155; background: #0b1220; color: #e5e7eb; border-radius: 12px; padding: 8px 12px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
  .icon:hover { opacity: 0.95; transform: translateY(-1px); background: #111827; }
  .icon.danger { border-color: #7f1d1d; background: #1a0b0b; }
  .icon.danger:hover { background: #2a0f0f; }
  .icon.primary { border-color: #1d4ed8; background: #0b1b44; }
  .icon.primary:hover { background: #0d2357; }
  
  .card { border: 1px solid #1f2937; background: #030712; border-radius: 16px; padding: 24px; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  
  .field { display: flex; flex-direction: column; gap: 6px; }
  label { font-size: 12px; color: #9CA3AF; text-transform: uppercase; font-weight: 700; letter-spacing: 0.04em; }
  input, select { padding: 10px 12px; border-radius: 10px; border: 1px solid #374151; background: #020617; color: #e5e7eb; font-size: 14px; }
  input[readonly], select:disabled { opacity: 0.85; background: #070b14; }
  
  .note { margin-top: 16px; color: #94a3b8; font-size: 12px; }
</style>

<div class="user-detail-header">
  <div>
    <div class="user-title">${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)} <span style="color:#64748b;font-weight:600">(#${escapeHtml(user.account_number)})</span></div>
    <div class="user-subtitle">Created: ${escapeHtml(created)} • Last Modified: ${escapeHtml(modified)}</div>
  </div>
  <div class="toolbar">
    <button class="icon" title="Close" onclick="closePage()">✕</button>
    <button class="icon" id="editBtn" title="Edit" onclick="toggleEdit()">✏</button>
    <button class="icon primary" id="saveBtn" title="Save" onclick="saveUser()" style="display:none">💾</button>
    <button class="icon danger" title="Delete" onclick="deleteUser()">🗑</button>
  </div>
</div>

<div class="card">
  <div class="grid">
    <div class="field">
      <label>Account Number</label>
      <input id="account_number" value="${escapeHtml(user.account_number)}" readonly />
    </div>

    <div class="field">
      <label>Status</label>
      <select id="status">
        <option value="active" ${user.status === 'active' ? 'selected' : ''}>active</option>
        <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>suspended</option>
      </select>
    </div>

    <div class="field">
      <label>First Name</label>
      <input id="first_name" value="${escapeHtml(user.first_name)}" />
    </div>

    <div class="field">
      <label>Last Name</label>
      <input id="last_name" value="${escapeHtml(user.last_name)}" />
    </div>

    <div class="field">
      <label>Email</label>
      <input id="email" value="${escapeHtml(user.email)}" />
    </div>

    <div class="field">
      <label>Phone</label>
      <input id="phone" value="${escapeHtml(user.phone)}" />
    </div>

    <div class="field">
      <label>Street Address</label>
      <input id="street_address" value="${escapeHtml(user.street_address)}" />
    </div>

    <div class="field">
      <label>City</label>
      <input id="city" value="${escapeHtml(user.city)}" />
    </div>

    <div class="field">
      <label>State</label>
      <input id="state" value="${escapeHtml(user.state)}" />
    </div>

    <div class="field">
      <label>Zip</label>
      <input id="zip" value="${escapeHtml(user.zip)}" />
    </div>

    <div class="field">
      <label>Timezone</label>
      <input id="timezone" value="${escapeHtml(user.timezone)}" />
    </div>

    <div class="field">
      <label>Account Balance</label>
      <input id="account_balance" value="${escapeHtml(String(user.account_balance ?? '0'))}" />
    </div>

    <div class="field">
      <label>Email Verified</label>
      <select id="email_verified">
        <option value="false" ${user.email_verified ? '' : 'selected'}>false</option>
        <option value="true" ${user.email_verified ? 'selected' : ''}>true</option>
      </select>
    </div>
  </div>

  <div class="note">
    Double check before editing email/balance. Save writes directly to the database.
  </div>
</div>

<script>
  const userId = ${Number(user.id)};
  let editMode = ${editMode ? 'true' : 'false'};

  function closePage() { window.location.href = '/admin/users'; }

  function setInputsReadonly(isReadonly) {
    const ids = ['first_name','last_name','email','phone','street_address','city','state','zip','timezone','account_balance'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (isReadonly) el.setAttribute('readonly', 'readonly');
      else el.removeAttribute('readonly');
    });

    const selects = ['status','email_verified'];
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = isReadonly;
    });
  }

  function syncUi() {
    document.getElementById('saveBtn').style.display = editMode ? 'inline-block' : 'none';
    document.getElementById('editBtn').style.opacity = editMode ? '0.7' : '1';
    setInputsReadonly(!editMode);
  }

  function toggleEdit() {
    editMode = !editMode;
    syncUi();
  }

  async function saveUser() {
    if (!editMode) return;

    const payload = {
      status: document.getElementById('status').value,
      first_name: document.getElementById('first_name').value,
      last_name: document.getElementById('last_name').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      street_address: document.getElementById('street_address').value,
      city: document.getElementById('city').value,
      state: document.getElementById('state').value,
      zip: document.getElementById('zip').value,
      timezone: document.getElementById('timezone').value,
      account_balance: document.getElementById('account_balance').value,
      email_verified: document.getElementById('email_verified').value === 'true'
    };

    const r = await fetch('/admin/users/api/' + userId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));
    if (data && data.success) {
      alert('Saved.');
      location.reload();
      return;
    }
    alert('Save failed: ' + (data && data.error ? data.error : 'Unknown error'));
  }

  async function deleteUser() {
    if (!confirm('DELETE this user? This cannot be undone.')) return;
    const r = await fetch('/admin/users/api/' + userId, { method: 'DELETE' });
    const data = await r.json().catch(() => ({}));
    if (data && data.success) return closePage();
    alert('Delete failed: ' + (data && data.error ? data.error : 'Unknown error'));
  }

  syncUi();

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('edit') === '1') {
      editMode = true;
      syncUi();
    }
  } catch {}
</script>
  `;
}

/* ════════════════════════════════════════════════════════
 *  ROUTES
 * ════════════════════════════════════════════════════════ */

function registerUsersAdminRoutes(app, { requireAdmin }) {
  const pool = getPool();

  // HTML: List users
  app.get('/admin/users', requireAdmin, async (req, res) => {
    try {
      const searchQuery = (req.query.search || '').trim();

      let query = 'SELECT * FROM users WHERE 1=1';
      const params = [];

      if (searchQuery) {
        query += ` AND (
          first_name ILIKE $1 OR
          last_name ILIKE $1 OR
          email ILIKE $1 OR
          phone ILIKE $1 OR
          account_number ILIKE $1
        )`;
        params.push(`%${searchQuery}%`);
      }

      query += ' ORDER BY created_date DESC LIMIT 200';
      const result = await pool.query(query, params);
      
      const content = renderUsersListContent(result.rows, searchQuery);
      res.send(renderAdminLayout({
        title: 'Users - Admin',
        content,
        activeMenu: 'users-list'
      }));
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).send('Error loading users');
    }
  });

  // HTML: User detail page
  app.get('/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).send('Invalid user id');

      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).send('User not found');

      const editMode = String(req.query.edit || '') === '1';
      const content = renderUserDetailContent(result.rows[0], { editMode });
      
      res.send(renderAdminLayout({
        title: `User #${result.rows[0].account_number} - Admin`,
        content,
        activeMenu: 'users-list'
      }));
    } catch (error) {
      console.error('Error fetching user detail:', error);
      res.status(500).send('Error loading user');
    }
  });

  // API: Get single user details
  app.get('/admin/users/api/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'Invalid id' });

      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

      res.json({ success: true, user: result.rows[0] });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch user' });
    }
  });

  // API: Full update user (admin)
  app.put('/admin/users/api/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'Invalid id' });

      const allowed = [
        'status', 'first_name', 'last_name', 'email', 'phone',
        'street_address', 'city', 'state', 'zip', 'timezone',
        'account_balance', 'email_verified'
      ];

      const updates = [];
      const values = [];
      let idx = 1;

      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
          let val = req.body[key];

          if (key === 'status') {
            if (!['active', 'suspended'].includes(String(val))) {
              return res.status(400).json({ success: false, error: 'Invalid status' });
            }
            val = String(val);
          }

          if (key === 'account_balance') {
            const n = Number(val);
            if (!Number.isFinite(n)) {
              return res.status(400).json({ success: false, error: 'Invalid account_balance' });
            }
            val = n;
          }

          if (key === 'email_verified') {
            val = Boolean(val);
          }

          updates.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }

      if (updates.length === 0) {
        return res.json({ success: true, message: 'No changes' });
      }

      updates.push(`last_modified = $${idx++}`);
      values.push(Date.now());

      values.push(id);
      const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id`;
      const result = await pool.query(sql, values);

      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ success: false, error: 'Failed to update user' });
    }
  });

  // API: Delete user
  app.delete('/admin/users/api/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: 'Invalid id' });

      const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ success: false, error: 'Failed to delete user' });
    }
  });
}

module.exports = { registerUsersAdminRoutes };