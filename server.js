// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');

const app = express();
app.use(cors());
app.use(express.json());

// ==== CONFIG ====

// hardcoded admin login (MVP)
// in production: use env vars / proper auth
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'password123';

// hardcoded allowed clients (MVP: just one)
const CLIENTS = {
  // choose any ID you like (must match client)
  'client-1': {
    publicKeyBase64: '6+JBvOzFVqrmEWKPoMfwcTNPG9Xg4VRLbV2qiQT5gys='
  }
};

// convert base64 public keys to Uint8Array
for (const id in CLIENTS) {
  CLIENTS[id].publicKey = util.decodeBase64(CLIENTS[id].publicKeyBase64);
}

// storage for uploaded photos
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (_, file, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ==== API: upload photo ====

app.post('/upload', upload.single('photo'), (req, res) => {
  try {
    const { clientId, timestamp, signatureBase64 } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!clientId || !timestamp || !signatureBase64) {
      return res.status(400).json({ error: 'Missing auth fields' });
    }

    const client = CLIENTS[clientId];
    if (!client) {
      fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: 'Unknown client' });
    }

    // The client signs this exact message:
    const message = `${timestamp}:${req.file.originalname}`;
    const messageBytes = util.decodeUTF8(message);
    const signatureBytes = util.decodeBase64(signatureBase64);

    const ok = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      client.publicKey
    );

    if (!ok) {
      fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('Saved file:', req.file.filename);

    return res.json({
      status: 'ok',
      filename: req.file.filename
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==== Static files for viewing ====
app.use('/uploads', express.static(uploadDir));

// ==== SUPER SIMPLE ADMIN LOGIN (MVP) ====

app.get('/admin', (req, res) => {
  const { user, pass } = req.query;

  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    return res.send(`
      <html>
        <body>
          <h1>Admin Login</h1>
          <form method="GET" action="/admin">
            <label>Username: <input name="user" /></label><br/>
            <label>Password: <input type="password" name="pass" /></label><br/>
            <button type="submit">Login</button>
          </form>
        </body>
      </html>
    `);
  }

  // list files in uploads
  const files = fs.readdirSync(uploadDir);

  const listHtml = files
    .map(
      f => `
        <div style="margin-bottom:20px;">
          <p>${f}</p>
          <img src="/uploads/${f}" style="max-width:300px; max-height:300px;" />
        </div>
      `
    )
    .join('\n');

  res.send(`
    <html>
      <body>
        <h1>Uploaded Photos</h1>
        ${listHtml || '<p>No files yet.</p>'}
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});

