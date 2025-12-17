// routes-upload-user.js
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');
const { findUserById } = require('./db-users');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Active chunked upload sessions (in-memory)
const activeChunkUploads = new Map();

// Client public keys - these map to user accounts
const CLIENTS = {
  'client-1': {
    publicKeyBase64: '6+JBvOzFVqrmEWKPoMfwcTNPG9Xg4VRLbV2qiQT5gys=',
  },
};

// Decode base64 keys once
for (const id in CLIENTS) {
  CLIENTS[id].publicKey = util.decodeBase64(CLIENTS[id].publicKeyBase64);
}

/* ──────────────────────────────────────────────
 *  MULTER (DISK STORAGE - USER SPECIFIC)
 * ────────────────────────────────────────────── */

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      // Get account number from session or use 'admin' folder
      let folder = 'admin';
      
      if (req.session && req.session.userId) {
        const user = await findUserById(req.session.userId);
        if (user) {
          folder = user.account_number;
        }
      } else if (req.session && req.session.isAdmin) {
        folder = 'admin';
      }
      
      const userUploadDir = path.join(uploadDir, folder);
      if (!fs.existsSync(userUploadDir)) {
        fs.mkdirSync(userUploadDir, { recursive: true });
      }
      
      cb(null, userUploadDir);
    } catch (err) {
      console.error('Error determining upload destination:', err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + ext);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

/* ──────────────────────────────────────────────
 *  HELPERS
 * ────────────────────────────────────────────── */

function verifyClientSignature({
  clientId,
  timestamp,
  signatureBase64,
  originalName,
}) {
  const client = CLIENTS[clientId];
  if (!client || !client.publicKey) {
    console.warn('Unknown clientId', clientId);
    return false;
  }

  if (!timestamp || !signatureBase64 || !originalName) {
    return false;
  }

  const message = `${timestamp}:${originalName}`;
  const messageBytes = util.decodeUTF8(message);
  const signatureBytes = util.decodeBase64(signatureBase64);

  return nacl.sign.detached.verify(
    messageBytes,
    signatureBytes,
    client.publicKey
  );
}

/* ──────────────────────────────────────────────
 *  UPLOAD ROUTES
 * ────────────────────────────────────────────── */

function registerUploadRoutes(app) {
  
  // Whole file upload
  app.post('/upload', upload.single('photo'), async (req, res) => {
    try {
      const { clientId, timestamp, signature, originalName } = req.body || {};
      const file = req.file;

      if (!file) {
        return res.status(400).json({ ok: false, error: 'No file uploaded' });
      }

      const valid = verifyClientSignature({
        clientId,
        timestamp,
        signatureBase64: signature,
        originalName,
      });

      if (!valid) {
        fs.unlinkSync(file.path);
        return res.status(403).json({ ok: false, error: 'Invalid signature' });
      }

      console.log('File uploaded:', file.filename);
      res.json({
        ok: true,
        message: 'Upload successful',
        filename: file.filename,
        size: file.size,
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ ok: false, error: 'Upload failed' });
    }
  });

  // Chunked upload: init
  app.post('/upload/chunk/init', async (req, res) => {
    try {
      const { clientId, timestamp, signature, originalName, totalChunks } = req.body || {};

      const valid = verifyClientSignature({
        clientId,
        timestamp,
        signatureBase64: signature,
        originalName,
      });

      if (!valid) {
        return res.status(403).json({ ok: false, error: 'Invalid signature' });
      }

      const uploadId = Date.now().toString(36) + Math.random().toString(36);
      
      // Determine user folder
      let folder = 'admin';
      if (req.session && req.session.userId) {
        const user = await findUserById(req.session.userId);
        if (user) folder = user.account_number;
      } else if (req.session && req.session.isAdmin) {
        folder = 'admin';
      }
      
      const userUploadDir = path.join(uploadDir, folder);
      if (!fs.existsSync(userUploadDir)) {
        fs.mkdirSync(userUploadDir, { recursive: true });
      }

      activeChunkUploads.set(uploadId, {
        clientId,
        originalName,
        totalChunks: parseInt(totalChunks, 10),
        receivedChunks: [],
        folder,
        createdAt: Date.now(),
      });

      console.log('Chunk upload init:', uploadId, originalName, totalChunks);
      res.json({ ok: true, uploadId });
    } catch (err) {
      console.error('Chunk init error:', err);
      res.status(500).json({ ok: false, error: 'Init failed' });
    }
  });

  // Chunked upload: upload chunk
  app.post('/upload/chunk/:uploadId/:chunkIndex', upload.single('chunk'), (req, res) => {
    try {
      const { uploadId, chunkIndex } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ ok: false, error: 'No chunk uploaded' });
      }

      const session = activeChunkUploads.get(uploadId);
      if (!session) {
        fs.unlinkSync(file.path);
        return res.status(404).json({ ok: false, error: 'Upload session not found' });
      }

      session.receivedChunks.push({
        index: parseInt(chunkIndex, 10),
        path: file.path,
        size: file.size,
      });

      console.log(`Chunk ${chunkIndex}/${session.totalChunks} received for ${uploadId}`);
      res.json({ ok: true, message: 'Chunk received' });
    } catch (err) {
      console.error('Chunk upload error:', err);
      res.status(500).json({ ok: false, error: 'Chunk upload failed' });
    }
  });

  // Chunked upload: finalize
  app.post('/upload/chunk/finalize/:uploadId', async (req, res) => {
    try {
      const { uploadId } = req.params;
      const session = activeChunkUploads.get(uploadId);

      if (!session) {
        return res.status(404).json({ ok: false, error: 'Upload session not found' });
      }

      if (session.receivedChunks.length !== session.totalChunks) {
        return res.status(400).json({
          ok: false,
          error: `Missing chunks: ${session.receivedChunks.length}/${session.totalChunks}`,
        });
      }

      // Sort chunks by index
      session.receivedChunks.sort((a, b) => a.index - b.index);

      const ext = path.extname(session.originalName).toLowerCase() || '.jpg';
      const finalFilename = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
      const userUploadDir = path.join(uploadDir, session.folder);
      const finalPath = path.join(userUploadDir, finalFilename);

      // Combine chunks
      const writeStream = fs.createWriteStream(finalPath);
      for (const chunk of session.receivedChunks) {
        const data = fs.readFileSync(chunk.path);
        writeStream.write(data);
        fs.unlinkSync(chunk.path);
      }
      writeStream.end();

      activeChunkUploads.delete(uploadId);

      console.log('Chunked upload finalized:', finalFilename);
      res.json({
        ok: true,
        message: 'Upload complete',
        filename: finalFilename,
      });
    } catch (err) {
      console.error('Finalize error:', err);
      res.status(500).json({ ok: false, error: 'Finalization failed' });
    }
  });

  // Cleanup stale chunk uploads (older than 1 hour)
  setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const [uploadId, session] of activeChunkUploads.entries()) {
      if (now - session.createdAt > oneHour) {
        console.log('Cleaning up stale upload session:', uploadId);
        for (const chunk of session.receivedChunks) {
          if (fs.existsSync(chunk.path)) {
            fs.unlinkSync(chunk.path);
          }
        }
        activeChunkUploads.delete(uploadId);
      }
    }
  }, 15 * 60 * 1000); // Run every 15 minutes
}

module.exports = { registerUploadRoutes };