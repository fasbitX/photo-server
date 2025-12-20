// adminRoutes.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const nodemailer = require('nodemailer');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* ──────────────────────────────────────────────
 *  HTML RENDERERS
 * ────────────────────────────────────────────── */

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDashboard({ folderNames, currentFolder, files }) {
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
            const url = `/uploads${baseFolderSegment}/${encodeURIComponent(
              file.name
            )}`;
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Photo Dashboard</title>
  <style>
    body {
      margin: 0;
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
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .sidebar h1 {
      margin: 0;
      font-size: 18px;
    }
    .folders {
      flex: 1;
      overflow-y: auto;
      margin-top: 8px;
    }
    .folder-item {
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }
    .folder-item:hover {
      background: #111827;
    }
    .folder-item.active {
      background: #1f2937;
      font-weight: 600;
    }
    .add-folder {
      margin-top: 12px;
    }
    .add-folder input {
      width: 100%;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid #374151;
      background: #030712;
      color: #e5e7eb;
      box-sizing: border-box;
      margin-bottom: 4px;
    }
    .add-folder button,
    .logout button {
      width: 100%;
      padding: 8px 0;
      border-radius: 999px;
      border: none;
      background: #2563eb;
      color: white;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    }
    .add-folder button:hover,
    .logout button:hover {
      background: #1d4ed8;
    }
    .logout {
      margin-top: auto;
    }
    .main {
      flex: 1;
      padding: 16px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      gap: 16px;
    }
    .current-folder {
      font-size: 15px;
    }
    .actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .btn {
      border-radius: 999px;
      padding: 6px 12px;
      border: 1px solid #374151;
      background: #020617;
      color: #e5e7eb;
      font-size: 12px;
      cursor: pointer;
    }
    .btn.primary {
      background: #2563eb;
      border-color: #2563eb;
      color: #fff;
      font-weight: 600;
    }
    .btn.danger {
      background: #b91c1c;
      border-color: #ef4444;
      color: #fee2e2;
      font-weight: 600;
    }
    .btn:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .grid {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
      overflow-y: auto;
      padding-bottom: 8px;
    }
    .card {
      position: relative;
      background: #020617;
      border-radius: 10px;
      border: 1px solid #1f2937;
      padding: 10px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .card.dragging {
      opacity: 0.4;
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px #3b82f6;
    }
    .thumb-wrap {
      height: 180px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #030712;
      border-radius: 8px;
      overflow: hidden;
    }
    .thumb-wrap img {
      max-width: 100%;
      max-height: 100%;
      display: block;
    }
    .meta {
      font-size: 13px;
    }
    .meta .name {
      font-weight: 500;
      margin-bottom: 2px;
      word-break: break-all;
    }
    .meta .size {
      color: #9ca3af;
    }
    .empty {
      font-size: 14px;
      color: #9ca3af;
    }

    .folders-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .folders-header span {
      font-size: 13px;
      color: #9ca3af;
    }

    .select-box {
      position: absolute;
      top: 8px;
      left: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 999px;
      background: rgba(15,23,42,0.8);
      border: 1px solid #374151;
    }
    .select-box input {
      display: none;
    }
    .select-box .checkmark {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      border: 1px solid #9ca3af;
      box-sizing: border-box;
    }
    .select-box input:checked + .checkmark {
      background: #22c55e;
      border-color: #22c55e;
    }

    /* Viewer overlay */
    .viewer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15,23,42,0.92);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 50;
    }
    .viewer-overlay.visible {
      display: flex;
    }
    .viewer-inner {
      position: relative;
      max-width: 90vw;
      max-height: 90vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .viewer-img {
      max-width: 100%;
      max-height: 100%;
      border-radius: 10px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    }
    .viewer-arrow {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 40px;
      height: 40px;
      border-radius: 999px;
      border: none;
      background: rgba(15,23,42,0.9);
      color: #e5e7eb;
      font-size: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .viewer-arrow.left {
      left: -56px;
    }
    .viewer-arrow.right {
      right: -56px;
    }
    .viewer-close {
      position: absolute;
      top: -48px;
      right: 0;
      border-radius: 999px;
      border: none;
      width: 32px;
      height: 32px;
      background: rgba(15,23,42,0.9);
      color: #e5e7eb;
      font-size: 18px;
      cursor: pointer;
    }
    .viewer-caption {
      margin-top: 8px;
      text-align: center;
      font-size: 13px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <div>
    <!-- NEW: top menu -->
    <div class="admin-menu">
      <a class="admin-menu-item" href="/admin/users">Users</a>
    </div>
      <h1>Photo Admin</h1>
      <div class="folders-header">
        <span>Folders</span>
      </div>
      <div class="folders" id="folder-list">
        ${folderListHtml}
      </div>
      <form class="add-folder" method="POST" action="/admin/add-folder">
        <input
          type="text"
          name="folderName"
          placeholder="New folder name"
          required
        />
        <button type="submit">Add folder</button>
      </form>
    </div>
    <form class="logout" method="POST" action="/logout">
      <button type="submit">Log out</button>
    </form>
  </div>

  <div class="main">
    <div class="top-row">
      <div class="current-folder">Folder: ${escapeHtml(folderLabel)}</div>
      <div class="actions">
        <button type="button" class="btn" onclick="selectAll(true)">Select all</button>
        <button type="button" class="btn" onclick="selectAll(false)">Clear</button>
        <button type="button" id="deleteBtn" class="btn danger" disabled onclick="deleteSelected()">
          Delete selected
        </button>
        <button type="button" id="downloadBtn" class="btn primary" disabled onclick="downloadSelected()">
          Download selected (.zip)
        </button>
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

  <!-- Viewer overlay -->
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
      if (!name) {
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/dashboard?folder=' + encodeURIComponent(name);
      }
    }

    // Viewer
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
      const img = document.getElementById('viewerImage');
      const caption = document.getElementById('viewerCaption');
      img.src = f.url;
      caption.textContent = f.name + ' (' + (viewerIndex + 1) + '/' + viewerFiles.length + ')';
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
      const overlay = document.getElementById('viewerOverlay');
      const visible = overlay.classList.contains('visible');
      if (!visible) return;
      if (ev.key === 'Escape') {
        closeViewer();
      } else if (ev.key === 'ArrowLeft') {
        prevImage();
      } else if (ev.key === 'ArrowRight') {
        nextImage();
      }
    });

    // Drag-and-drop card movement
    function onCardDragStart(ev, filename) {
      dragFilename = filename;
      dragCardEl = ev.currentTarget;

      ev.dataTransfer.setData('text/plain', filename);
      ev.dataTransfer.effectAllowed = 'move';

      if (dragCardEl) {
        dragCardEl.classList.add('dragging');
      }
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
            if (toFolder) {
              window.location.href = '/dashboard?folder=' + encodeURIComponent(toFolder);
            } else {
              window.location.href = '/dashboard';
            }
          })
          .catch(err => {
            console.error('Move failed', err);
            alert('Move failed');
          });
      });
    }

    // Selection + buttons
    function onSelectionChange(ev) {
      const cb = ev.target;
      const name = cb.value;
      if (!name) return;
      if (cb.checked) {
        selectedFiles.add(name);
      } else {
        selectedFiles.delete(name);
      }
      updateButtons();
    }

    function selectAll(on) {
      document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.checked = !!on;
        const name = cb.value;
        if (!name) return;
        if (on) {
          selectedFiles.add(name);
        } else {
          selectedFiles.delete(name);
        }
      });
      updateButtons();
    }

    function updateButtons() {
      const disabled = selectedFiles.size === 0;
      const dlBtn = document.getElementById('downloadBtn');
      const delBtn = document.getElementById('deleteBtn');
      if (dlBtn) dlBtn.disabled = disabled;
      if (delBtn) delBtn.disabled = disabled;
    }

    function setFormFiles() {
      const filesField = document.getElementById('filesField');
      filesField.value = Array.from(selectedFiles).join(',');
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
</body>
</html>`;
}

function renderPortPage(currentPort, errorMessage = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Change Port</title>
</head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#020617;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;">
  <form style="background:#020617;padding:24px;border-radius:12px;border:1px solid #1f2937;width:320px;" method="POST" action="/admin/port">
    <h1 style="margin:0 0 16px 0;font-size:20px;">Change Server Port</h1>
    <p>Current port: <strong>${currentPort}</strong></p>
    <label>
      New port
      <input type="number" name="port" value="${currentPort}" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid #374151;background:#030712;color:#e5e7eb;margin-top:4px;" />
    </label>
    <button type="submit" style="margin-top:16px;width:100%;padding:10px;border-radius:999px;border:none;background:#2563eb;color:white;font-weight:600;cursor:pointer;">Update port</button>
    ${
      errorMessage
        ? `<div style="margin-top:12px;color:#f97373;font-size:13px;">${errorMessage}</div>`
        : ''
    }
  </form>
</body>
</html>`;
}

function renderPortUpdatedPage(oldPort, newPort) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Port Updated</title>
</head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#020617;color:#e5e7eb;display:flex;align-items:center;justify-content:center;height:100vh;">
  <div style="background:#020617;padding:24px;border-radius:12px;border:1px solid #1f2937;width:340px;">
    <h1 style="margin:0 0 16px 0;font-size:20px;">Port updated</h1>
    <p>Server restarted from port <strong>${oldPort}</strong> to <strong>${newPort}</strong>.</p>
    <p>Open: <code>http://YOUR_HOST:${newPort}/login</code></p>
  </div>
</body>
</html>`;
}

/* ──────────────────────────────────────────────
 *  HELPERS (FOLDERS / FILES)
 * ────────────────────────────────────────────── */

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

/* ──────────────────────────────────────────────
 *  EMAIL HELPER (NODEMAILER)
 * ────────────────────────────────────────────── */

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

/* ──────────────────────────────────────────────
 *  ROUTE REGISTRATION
 * ────────────────────────────────────────────── */

function registerAdminRoutes(app, { requireAdmin, state }) {
  // protect /uploads
  app.use('/uploads', requireAdmin, express.static(uploadDir));

  // Redirect /admin to admin dashboard
  app.get('/admin', requireAdmin, (req, res) => {
    res.redirect('/admin/dashboard');
  });

  // admin dashboard
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

    res.send(
      renderDashboard({
        folderNames,
        currentFolder,
        files,
      })
    );
  });

  // add folder
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

  // move file
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

  // download selected as zip
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${zipName}"`
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => {
      console.error('Zip error:', err);
      try {
        res.status(500).end();
      } catch (_) {}
    });

    archive.pipe(res);

    names.forEach(name => {
      const base = path.basename(name); // safety
      const filePath = path.join(dir, base);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: base });
      }
    });

    archive.finalize();
  });

  // delete selected
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

  // send logs via email (NEW)
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

  // change port
  app.get('/admin/port', requireAdmin, (req, res) => {
    res.send(renderPortPage(state.currentPort));
  });

  app.post('/admin/port', requireAdmin, (req, res) => {
    const rawPort = req.body.port;
    const newPort = parseInt(rawPort, 10);

    if (!newPort || newPort < 1 || newPort > 65535) {
      return res.send(renderPortPage(state.currentPort, 'Invalid port number'));
    }

    if (newPort === state.currentPort) {
      return res.send(
        renderPortPage(state.currentPort, 'Port is already set to this value')
      );
    }

    const oldPort = state.currentPort;

    if (state.server) {
      console.log('Closing existing server on port', oldPort);
      state.server.close(() => {
        console.log('Server closed on port', oldPort);
        state.currentPort = newPort;
        state.server = app.listen(state.currentPort, () => {
          console.log('Server restarted on port', state.currentPort);
        });
      });
    } else {
      state.currentPort = newPort;
      state.server = app.listen(state.currentPort, () => {
        console.log('Server started on port', state.currentPort);
      });
    }

    res.send(renderPortUpdatedPage(oldPort, newPort));
  });
}

module.exports = { registerAdminRoutes };