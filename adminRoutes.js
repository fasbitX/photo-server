// adminRoutes.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const nodemailer = require('nodemailer');
const { renderAdminLayout } = require('./admin-layout');
const { Pool } = require('pg');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Ensure assets/icons directory exists
const assetsDir = path.join(__dirname, 'assets', 'icons');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

let _pool;
function getPool() {
  if (!_pool) {
    _pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'text_fasbit',
      user: process.env.DB_USER || 'text_fasbit_user',
      password: process.env.DB_PASSWORD,
    });
  }
  return _pool;
}

/* ════════════════════════════════════════════════════════
 *  HELPERS (FOLDERS / FILES)
 * ════════════════════════════════════════════════════════ */

function sanitizeFolderName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  if (raw.includes('..') || raw.includes('/') || raw.includes('\\')) {
    return '';
  }
  return raw;
}

function safeJoinUploadDir(subfolder) {
  const base = subfolder ? path.join(uploadDir, subfolder) : uploadDir;
  const resolved = path.resolve(base);
  const root = path.resolve(uploadDir);
  if (!resolved.startsWith(root)) {
    throw new Error('Unsafe path');
  }
  return resolved;
}

function listRootFolders() {
  const entries = fs.readdirSync(uploadDir, { withFileTypes: true });
  return entries
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

function listFilesInFolder(folder) {
  const dir = safeJoinUploadDir(folder);
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter(d => d.isFile())
    .map(d => {
      const filePath = path.join(dir, d.name);
      const stat = fs.statSync(filePath);
      const sizeKb = stat.size / 1024;
      const sizeLabel =
        sizeKb < 1024
          ? `${sizeKb.toFixed(0)} KB`
          : `${(sizeKb / 1024).toFixed(1)} MB`;
      return {
        name: d.name,
        size: stat.size,
        sizeLabel,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ════════════════════════════════════════════════════════
 *  EMAIL HELPER (NODEMAILER)
 * ════════════════════════════════════════════════════════ */

async function sendEmailWithLogs(logEntries) {
  const SMTP_HOST = process.env.SMTP_HOST || '';
  const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
  const SMTP_USER = process.env.SMTP_USER || '';
  const SMTP_PASS = process.env.SMTP_PASS || '';
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !ADMIN_EMAIL) {
    throw new Error('SMTP settings not configured in .env');
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  const timestamp = new Date().toISOString();
  const subject = `Photo Sender Error Logs - ${timestamp}`;
  
  const logJson = JSON.stringify(logEntries, null, 2);
  
  const textBody = `Error logs from Photo Sender mobile app.

Total entries: ${logEntries.length}
Timestamp: ${timestamp}

See attached JSON file for full logs.`;

  const mailOptions = {
    from: SMTP_USER,
    to: ADMIN_EMAIL,
    subject,
    text: textBody,
    attachments: [
      {
        filename: `photo-sender-logs-${Date.now()}.json`,
        content: logJson,
        contentType: 'application/json',
      },
    ],
  };

  await transporter.sendMail(mailOptions);
}

/* ════════════════════════════════════════════════════════
 *  PHOTO DASHBOARD CONTENT
 * ════════════════════════════════════════════════════════ */

function renderPhotoDashboardContent({ folderNames, currentFolder, files }) {
  const folderListHtml = [
    `<div class="folder-item${!currentFolder ? ' active' : ''}" onclick="goToFolder('')">📁 Root</div>`,
    ...folderNames.map(name => {
      const safe = escapeHtml(name);
      const isActive = currentFolder === name;
      return `<div class="folder-item${isActive ? ' active' : ''}" onclick="goToFolder('${safe}')">📁 ${safe}</div>`;
    }),
  ].join('');

  const baseFolderSegment = currentFolder
    ? '/' + encodeURIComponent(currentFolder)
    : '';

  const fileCardsHtml =
    files.length === 0
      ? `<div class="empty">No images yet in this folder.</div>`
      : files
          .map((file, idx) => {
            const safeName = escapeHtml(file.name);
            const url = `/uploads${baseFolderSegment}/${encodeURIComponent(file.name)}`;
            return `
              <div class="card"
                   draggable="true"
                   data-filename="${safeName}"
                   data-index="${idx}"
                   onclick="openViewer(${idx})"
                   ondragstart="onCardDragStart(event, '${safeName}')">
                <label class="select-box" onclick="event.stopPropagation();">
                  <input type="checkbox"
                         class="file-checkbox"
                         value="${safeName}"
                         onchange="onSelectionChange(event)" />
                  <span class="checkmark"></span>
                </label>
                <div class="thumb-wrap">
                  <img src="${url}" loading="lazy" />
                </div>
                <div class="meta">
                  <div class="name">${safeName}</div>
                  <div class="size">${file.sizeLabel}</div>
                </div>
              </div>
            `;
          })
          .join('');

  const folderLabel = currentFolder ? currentFolder : 'Root';
  const viewerFilesJson = JSON.stringify(
    files.map(file => ({
      name: file.name,
      url: `/uploads${baseFolderSegment}/${encodeURIComponent(file.name)}`,
    }))
  );

  const currentFolderEsc = escapeHtml(currentFolder || '');

  return `
<style>
  .photo-container { display: flex; gap: 24px; }
  .photo-sidebar { width: 280px; flex-shrink: 0; }
  .photo-main { flex: 1; }
  
  .folders-list { border: 1px solid #1f2937; border-radius: 8px; padding: 12px; background: #030712; }
  .folder-item { padding: 8px 10px; border-radius: 6px; font-size: 14px; cursor: pointer; margin-bottom: 4px; }
  .folder-item:hover { background: #111827; }
  .folder-item.active { background: #1f2937; font-weight: 600; }
  
  .add-folder { margin-top: 16px; }
  .add-folder input { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #374151; background: #030712; color: #e5e7eb; margin-bottom: 8px; }
  .add-folder button { width: 100%; padding: 8px; border-radius: 999px; border: none; background: #2563eb; color: white; font-weight: 600; cursor: pointer; }
  .add-folder button:hover { background: #1d4ed8; }
  
  .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #1f2937; }
  .current-folder { font-size: 18px; font-weight: 600; }
  .actions { display: flex; gap: 8px; }
  .btn { border-radius: 999px; padding: 8px 16px; border: 1px solid #374151; background: #030712; color: #e5e7eb; font-size: 13px; cursor: pointer; transition: all 0.2s; }
  .btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 600; }
  .btn.danger { background: #b91c1c; border-color: #ef4444; color: #fee2e2; font-weight: 600; }
  .btn:disabled { opacity: 0.4; cursor: default; }
  .btn:not(:disabled):hover { transform: translateY(-1px); }
  
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  .card { position: relative; background: #030712; border-radius: 10px; border: 1px solid #1f2937; padding: 10px; cursor: pointer; transition: all 0.2s; }
  .card:hover { border-color: #374151; }
  .card.dragging { opacity: 0.4; border-color: #3b82f6; }
  .thumb-wrap { height: 180px; display: flex; align-items: center; justify-content: center; background: #020617; border-radius: 8px; overflow: hidden; margin-bottom: 8px; }
  .thumb-wrap img { max-width: 100%; max-height: 100%; }
  .meta { font-size: 13px; }
  .meta .name { font-weight: 500; margin-bottom: 2px; word-break: break-all; }
  .meta .size { color: #9ca3af; }
  .empty { font-size: 14px; color: #9ca3af; text-align: center; padding: 40px; }
  
  .select-box { position: absolute; top: 8px; left: 8px; width: 20px; height: 20px; border-radius: 999px; background: rgba(15,23,42,0.8); border: 1px solid #374151; display: flex; align-items: center; justify-content: center; }
  .select-box input { display: none; }
  .select-box .checkmark { width: 12px; height: 12px; border-radius: 3px; border: 1px solid #9ca3af; }
  .select-box input:checked + .checkmark { background: #22c55e; border-color: #22c55e; }
  
  .viewer-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.92); display: none; align-items: center; justify-content: center; z-index: 50; }
  .viewer-overlay.visible { display: flex; }
  .viewer-inner { position: relative; max-width: 90vw; max-height: 90vh; }
  .viewer-img { max-width: 100%; max-height: 90vh; border-radius: 10px; }
  .viewer-arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 999px; border: none; background: rgba(15,23,42,0.9); color: #e5e7eb; font-size: 24px; cursor: pointer; }
  .viewer-arrow.left { left: -56px; }
  .viewer-arrow.right { right: -56px; }
  .viewer-close { position: absolute; top: -48px; right: 0; width: 32px; height: 32px; border-radius: 999px; border: none; background: rgba(15,23,42,0.9); color: #e5e7eb; font-size: 18px; cursor: pointer; }
  .viewer-caption { margin-top: 8px; text-align: center; font-size: 13px; color: #9ca3af; }
</style>

<div class="content-header">
  <h2 class="content-title">Photo Dashboard</h2>
  <p class="content-subtitle">Manage your photos and folders</p>
</div>

<div class="photo-container">
  <div class="photo-sidebar">
    <h3 style="font-size: 14px; margin-bottom: 12px; color: #9ca3af;">FOLDERS</h3>
    <div class="folders-list" id="folder-list">
      ${folderListHtml}
    </div>
    <form class="add-folder" method="POST" action="/admin/add-folder">
      <input type="text" name="folderName" placeholder="New folder name" required />
      <button type="submit">Add Folder</button>
    </form>
  </div>

  <div class="photo-main">
    <div class="top-bar">
      <div class="current-folder">📁 ${escapeHtml(folderLabel)}</div>
      <div class="actions">
        <button type="button" class="btn" onclick="selectAll(true)">Select All</button>
        <button type="button" class="btn" onclick="selectAll(false)">Clear</button>
        <button type="button" id="deleteBtn" class="btn danger" disabled onclick="deleteSelected()">Delete Selected</button>
        <button type="button" id="downloadBtn" class="btn primary" disabled onclick="downloadSelected()">Download ZIP</button>
      </div>
    </div>

    <form id="selectionForm" method="POST">
      <input type="hidden" name="folder" value="${currentFolderEsc}">
      <input type="hidden" name="files" id="filesField" value="">
      <div class="grid" id="file-grid">
        ${fileCardsHtml}
      </div>
    </form>
  </div>
</div>

<div id="viewerOverlay" class="viewer-overlay" onclick="closeViewer()">
  <div class="viewer-inner" onclick="event.stopPropagation();">
    <button class="viewer-close" onclick="closeViewer();">&times;</button>
    <button class="viewer-arrow left" onclick="prevImage(event);">&#10094;</button>
    <img id="viewerImage" class="viewer-img" src="" alt="Photo" />
    <button class="viewer-arrow right" onclick="nextImage(event);">&#10095;</button>
  </div>
</div>
<div id="viewerCaption" class="viewer-caption"></div>

<script>
  const viewerFiles = ${viewerFilesJson};
  let viewerIndex = 0;
  let dragFilename = null;
  let dragCardEl = null;
  const selectedFiles = new Set();

  function goToFolder(name) {
    window.location.href = name ? '/admin/dashboard?folder=' + encodeURIComponent(name) : '/admin/dashboard';
  }

  function openViewer(index) {
    if (!viewerFiles.length) return;
    viewerIndex = index;
    updateViewer();
    document.getElementById('viewerOverlay').classList.add('visible');
  }

  function closeViewer() {
    document.getElementById('viewerOverlay').classList.remove('visible');
  }

  function updateViewer() {
    const f = viewerFiles[viewerIndex];
    if (!f) return;
    document.getElementById('viewerImage').src = f.url;
    document.getElementById('viewerCaption').textContent = f.name + ' (' + (viewerIndex + 1) + '/' + viewerFiles.length + ')';
  }

  function prevImage(ev) {
    if (ev) ev.stopPropagation();
    if (!viewerFiles.length) return;
    viewerIndex = (viewerIndex - 1 + viewerFiles.length) % viewerFiles.length;
    updateViewer();
  }

  function nextImage(ev) {
    if (ev) ev.stopPropagation();
    if (!viewerFiles.length) return;
    viewerIndex = (viewerIndex + 1) % viewerFiles.length;
    updateViewer();
  }

  document.addEventListener('keydown', ev => {
    const visible = document.getElementById('viewerOverlay').classList.contains('visible');
    if (!visible) return;
    if (ev.key === 'Escape') closeViewer();
    else if (ev.key === 'ArrowLeft') prevImage();
    else if (ev.key === 'ArrowRight') nextImage();
  });

  function onCardDragStart(ev, filename) {
    dragFilename = filename;
    dragCardEl = ev.currentTarget;
    ev.dataTransfer.setData('text/plain', filename);
    ev.dataTransfer.effectAllowed = 'move';
    if (dragCardEl) dragCardEl.classList.add('dragging');
  }

  document.addEventListener('dragend', () => {
    if (dragCardEl) {
      dragCardEl.classList.remove('dragging');
      dragCardEl = null;
    }
  });

  const folderList = document.getElementById('folder-list');
  if (folderList) {
    folderList.addEventListener('dragover', ev => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
    });

    folderList.addEventListener('drop', ev => {
      ev.preventDefault();
      const item = ev.target.closest('.folder-item');
      if (!item) return;

      const label = item.textContent || '';
      const isRoot = label.includes('Root');
      const toFolder = isRoot ? '' : label.replace(/^📁\\s*/, '');
      const filename = dragFilename || ev.dataTransfer.getData('text/plain');
      if (!filename) return;

      const urlParams = new URLSearchParams(window.location.search);
      const fromFolder = urlParams.get('folder') || '';

      const params = new URLSearchParams();
      params.append('filename', filename);
      params.append('fromFolder', fromFolder);
      params.append('toFolder', toFolder);

      fetch('/admin/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
        .then(() => {
          window.location.href = toFolder ? '/admin/dashboard?folder=' + encodeURIComponent(toFolder) : '/admin/dashboard';
        })
        .catch(err => {
          console.error('Move failed', err);
          alert('Move failed');
        });
    });
  }

  function onSelectionChange(ev) {
    const cb = ev.target;
    const name = cb.value;
    if (!name) return;
    if (cb.checked) selectedFiles.add(name);
    else selectedFiles.delete(name);
    updateButtons();
  }

  function selectAll(on) {
    document.querySelectorAll('.file-checkbox').forEach(cb => {
      cb.checked = !!on;
      const name = cb.value;
      if (!name) return;
      if (on) selectedFiles.add(name);
      else selectedFiles.delete(name);
    });
    updateButtons();
  }

  function updateButtons() {
    const disabled = selectedFiles.size === 0;
    document.getElementById('downloadBtn').disabled = disabled;
    document.getElementById('deleteBtn').disabled = disabled;
  }

  function setFormFiles() {
    document.getElementById('filesField').value = Array.from(selectedFiles).join(',');
  }

  function downloadSelected() {
    if (!selectedFiles.size) return;
    setFormFiles();
    const form = document.getElementById('selectionForm');
    form.action = '/admin/download-zip';
    form.method = 'POST';
    form.submit();
  }

  function deleteSelected() {
    if (!selectedFiles.size) return;
    if (!confirm('Delete the selected photo(s)? This cannot be undone.')) return;
    setFormFiles();
    const form = document.getElementById('selectionForm');
    form.action = '/admin/delete';
    form.method = 'POST';
    form.submit();
  }
</script>
  `;
}

/* ════════════════════════════════════════════════════════
 *  ROUTE REGISTRATION
 * ════════════════════════════════════════════════════════ */

function registerAdminRoutes(app, { requireAdmin, state }) {
  // Serve static admin assets
  app.get('/admin/styles.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-styles.css'));
  });

  app.get('/admin/menu.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-menu.js'));
  });

  // Serve assets folder (icons, images, etc.)
  app.use('/assets', express.static(path.join(__dirname, 'assets')));

  // Protect /uploads
  app.use('/uploads', requireAdmin, express.static(uploadDir));

  // Redirect /admin to dashboard
  app.get('/admin', requireAdmin, (req, res) => {
    res.redirect('/admin/dashboard');
  });

  // Admin dashboard
  app.get('/admin/dashboard', requireAdmin, (req, res) => {
    const rawFolder = req.query.folder || '';
    const currentFolder = sanitizeFolderName(rawFolder);

    let baseDir;
    try {
      baseDir = currentFolder ? safeJoinUploadDir(currentFolder) : uploadDir;
    } catch {
      return res.status(400).send('Invalid folder');
    }

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const folderNames = listRootFolders();
    const files = listFilesInFolder(currentFolder);

    const content = renderPhotoDashboardContent({
      folderNames,
      currentFolder,
      files,
    });

    res.send(renderAdminLayout({
      title: 'Photo Dashboard - Admin',
      content,
      activeMenu: 'photos-dashboard'
    }));
  });

  // Add folder
  app.post('/admin/add-folder', requireAdmin, (req, res) => {
    const folderName = sanitizeFolderName(req.body.folderName || '');
    if (!folderName) {
      return res.redirect('/admin/dashboard');
    }
    try {
      const dir = safeJoinUploadDir(folderName);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create folder', err);
    }
    res.redirect('/admin/dashboard?folder=' + encodeURIComponent(folderName));
  });

  // Move file
  app.post('/admin/move', requireAdmin, (req, res) => {
    const filename = req.body.filename || '';
    const fromFolder = sanitizeFolderName(req.body.fromFolder || '');
    const toFolder = sanitizeFolderName(req.body.toFolder || '');

    if (!filename) {
      return res.status(400).send('Missing filename');
    }

    try {
      const fromDir = safeJoinUploadDir(fromFolder);
      const toDir = safeJoinUploadDir(toFolder);

      if (!fs.existsSync(toDir)) {
        fs.mkdirSync(toDir, { recursive: true });
      }

      const src = path.join(fromDir, filename);
      const dest = path.join(toDir, filename);

      if (!fs.existsSync(src)) {
        return res.status(404).send('File not found');
      }

      fs.renameSync(src, dest);
      res.redirect('back');
    } catch (err) {
      console.error('Move failed', err);
      res.status(500).send('Move failed');
    }
  });

  // Download selected as zip
  app.post('/admin/download-zip', requireAdmin, (req, res) => {
    const folder = sanitizeFolderName(req.body.folder || '');
    const filesStr = req.body.files || '';
    const names = filesStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (!names.length) {
      return res.status(400).send('No files selected');
    }

    let dir;
    try {
      dir = safeJoinUploadDir(folder);
    } catch {
      return res.status(400).send('Invalid folder');
    }

    const zipName = (folder || 'photos') + '-' + Date.now() + '.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => {
      console.error('Zip error:', err);
      try {
        res.status(500).end();
      } catch (_) {}
    });

    archive.pipe(res);

    names.forEach(name => {
      const base = path.basename(name);
      const filePath = path.join(dir, base);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: base });
      }
    });

    archive.finalize();
  });

  // Delete selected
  app.post('/admin/delete', requireAdmin, (req, res) => {
    const folder = sanitizeFolderName(req.body.folder || '');
    const filesStr = req.body.files || '';
    const names = filesStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (!names.length) {
      return res.status(400).send('No files selected');
    }

    let dir;
    try {
      dir = safeJoinUploadDir(folder);
    } catch {
      return res.status(400).send('Invalid folder');
    }

    names.forEach(name => {
      const base = path.basename(name);
      const filePath = path.join(dir, base);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('Failed to delete', filePath, err);
      }
    });

    const redirectFolder = folder
      ? '/dashboard?folder=' + encodeURIComponent(folder)
      : '/dashboard';
    res.redirect(redirectFolder);
  });

  // Send logs via email
  app.post('/admin/send-logs', express.json(), async (req, res) => {
    try {
      const { logEntries } = req.body;

      if (!logEntries || !Array.isArray(logEntries)) {
        return res.status(400).json({ error: 'Invalid log entries' });
      }

      console.log('Received log entries to email:', logEntries.length);
      await sendEmailWithLogs(logEntries);
      console.log('Logs emailed successfully');
      
      return res.json({ ok: true, message: 'Logs emailed successfully' });
    } catch (err) {
      console.error('Failed to send logs via email:', err);
      return res.status(500).json({ 
        error: 'Failed to send email', 
        details: err.message 
      });
    }
  });

  // Admin transactions page
app.get('/admin/transactions', requireAdmin, async (req, res) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `
      SELECT
        t.id,
        t.created_at,
        t.amount,
        su.user_name AS sender_user_name,
        su.email     AS sender_email,
        ru.user_name AS recipient_user_name,
        ru.email     AS recipient_email
      FROM transfers t
      JOIN users su ON su.id = t.sender_id
      JOIN users ru ON ru.id = t.recipient_id
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 500
      `
    );

    const content = `
      <style>
        .tx-card {
          background:#030712;
          border:1px solid #1f2937;
          border-radius:12px;
          padding:16px;
        }
        .tx-title { font-size:28px; font-weight:800; margin-bottom:6px; }
        .tx-sub { color:#9ca3af; font-size:14px; margin-bottom:16px; }
        table { width:100%; border-collapse: collapse; overflow:hidden; border-radius:10px; }
        th, td { padding:12px 12px; border-bottom:1px solid #1f2937; text-align:left; font-size:13px; }
        th { color:#9ca3af; font-weight:800; text-transform:uppercase; letter-spacing:0.6px; background:#020617; }
        td { color:#e5e7eb; }
        .amt { font-weight:800; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      </style>

      <div class="content-header">
        <h2 class="content-title">Transactions</h2>
        <p class="content-subtitle">Global transfer ledger (last 500)</p>
      </div>

      <div class="tx-card">
        ${rows.length === 0 ? `
          <div style="color:#9ca3af; padding:18px;">No transfers yet.</div>
        ` : `
          <table>
            <thead>
              <tr>
                <th>Transaction #</th>
                <th>Date</th>
                <th>Who sent</th>
                <th>Who received</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const when = new Date(Number(r.created_at)).toLocaleString();
                const sender = (r.sender_user_name || r.sender_email || 'Sender');
                const recip  = (r.recipient_user_name || r.recipient_email || 'Recipient');
                const amt = Number(r.amount || 0).toFixed(2);
                return `
                  <tr>
                    <td class="mono">${r.id}</td>
                    <td>${when}</td>
                    <td>${sender}</td>
                    <td>${recip}</td>
                    <td class="amt">$${amt}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;

    res.send(renderAdminLayout({
      title: 'Transactions - Admin',
      content,
      activeMenu: 'transactions-list',
    }));
  } catch (err) {
    console.error('Admin transactions error:', err);
    res.status(500).send('Error loading transactions');
  }
});

}

module.exports = { registerAdminRoutes };