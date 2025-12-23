// uploadRoutes.js
/* The purpose of this code is to handle file uploads, including standard uploads
 and chunked uploads, and to manage user avatars. It uses Express.js for routing
  and Multer for handling file uploads. The code also includes functions for verifying
   client signatures, converting HEIC files to JPEG, and sending log entries via email. */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const util = require('tweetnacl-util');
const sharp = require('sharp');
const nodemailer = require('nodemailer');

const { updateUserAvatarPath, findUserById } = require('./database');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const avatarBaseDir = path.join(uploadDir, 'avatars');
if (!fs.existsSync(avatarBaseDir)) {
  fs.mkdirSync(avatarBaseDir, { recursive: true });
}

// Active chunked upload sessions (in-memory)
const activeChunkUploads = new Map();

// client public keys
const CLIENTS = {
  'client-1': {
    publicKeyBase64: '6+JBvOzFVqrmEWKPoMfwcTNPG9Xg4VRLbV2qiQT5gys=',
  },
};

// decode base64 keys once
for (const id in CLIENTS) {
  CLIENTS[id].publicKey = util.decodeBase64(CLIENTS[id].publicKeyBase64);
}

/* ──────────────────────────────────────────────
 *  HELPERS
 * ────────────────────────────────────────────── */

function makeUuid() {
  if (crypto.randomUUID && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // strong fallback
  return `${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
}

function safeSegment(v) {
  const s = String(v || '').trim();
  const cleaned = s.replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || 'unknown';
}

function toPosixRelative(p) {
  return String(p || '').split(path.sep).join('/');
}

function getUploadSubdirFromBody(body) {
  const purpose = String(body?.purpose || '').trim().toLowerCase();
  const uploaderId = body?.uploaderId;

  if (purpose === 'chat') {
    return path.join('chat', safeSegment(uploaderId));
  }

  // default: store in root uploads (keeps existing behavior)
  return '';
}

function verifyClientSignature({ clientId, timestamp, signatureBase64, originalName }) {
  const client = CLIENTS[clientId];
  if (!client || !client.publicKey) {
    console.warn('Unknown clientId', clientId);
    return false;
  }

  if (!timestamp || !signatureBase64 || !originalName) return false;

  const message = `${timestamp}:${originalName}`;
  const messageBytes = util.decodeUTF8(message);
  const signatureBytes = util.decodeBase64(signatureBase64);

  return nacl.sign.detached.verify(messageBytes, signatureBytes, client.publicKey);
}

function getMimeTypeFromExtension(ext) {
  const lower = (ext || '').toLowerCase();
  if (lower === '.jpg' || lower === '.jpeg') return 'image/jpeg';
  if (lower === '.png') return 'image/png';
  if (lower === '.heic' || lower === '.heif') return 'image/heic';
  return 'application/octet-stream';
}

async function maybeConvertHeicToJpeg(file) {
  if (!file) return;

  // NOTE: this helper expects file.originalname (multer uses originalname)
  const ext = path.extname(file.originalname || '').toLowerCase();
  const isHeic =
    file.mimetype === 'image/heic' ||
    file.mimetype === 'image/heif' ||
    ext === '.heic' ||
    ext === '.heif';

  if (!isHeic) return;

  const heicPath = file.path;
  const jpegPath = heicPath.replace(/\.(heic|heif)$/i, '.jpg');

  console.log('Converting HEIC/HEIF to JPEG:', heicPath, '->', jpegPath);

  try {
    await sharp(heicPath).jpeg({ quality: 90 }).toFile(jpegPath);
    fs.unlinkSync(heicPath);

    file.filename = path.basename(jpegPath);
    file.path = jpegPath;
    file.mimetype = 'image/jpeg';
  } catch (err) {
    console.error('HEIC conversion failed:', err);
  }
}

function computeUploadResponseFromFile(file) {
  // file.path is absolute; compute relative to /uploads
  const relativePath = toPosixRelative(path.relative(uploadDir, file.path));
  return {
    relativePath,
    url: `/uploads/${relativePath}`,
  };
}

// chunk session GC to avoid memory bloat
const CHUNK_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
function pruneChunkSessions() {
  const now = Date.now();
  for (const [uploadId, s] of activeChunkUploads.entries()) {
    const t = Number(s?.lastUpdated || s?.createdAt || 0);
    if (!t || now - t > CHUNK_SESSION_TTL_MS) {
      activeChunkUploads.delete(uploadId);
    }
  }
}

/* ──────────────────────────────────────────────
 *  MULTER (DISK STORAGE)
 * ────────────────────────────────────────────── */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const subdir = getUploadSubdirFromBody(req.body);
      const finalDir = path.join(uploadDir, subdir);

      if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
      cb(null, finalDir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${makeUuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// Separate uploader for user avatars (smaller limit, fixed folder)
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const userId = req.body?.userId || req.query?.userId;
      const finalDir = path.join(avatarBaseDir, safeSegment(userId));
      if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
      cb(null, finalDir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `avatar-${makeUuid()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image uploads are allowed'));
  },
});

/* ──────────────────────────────────────────────
 *  ROUTE REGISTRATION
 * ────────────────────────────────────────────── */

function registerUploadRoutes(app) {
  // Upload / update a user's avatar (stores file on disk; DB stores relative path)
  app.post('/api/mobile/user/avatar', (req, res) => {
    avatarUpload.single('avatar')(req, res, async (err) => {
      if (err) {
        console.error('Avatar upload middleware error:', err);
        return res.status(400).json({ error: 'Avatar upload failed', details: err.message });
      }

      try {
        const userId = req.body?.userId || req.query?.userId;
        if (!userId) {
          if (req.file?.path) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
          }
          return res.status(400).json({ error: 'Missing userId' });
        }

        if (!req.file) {
          return res.status(400).json({ error: 'No avatar file uploaded' });
        }

        // optional: remove previous avatar file
        try {
          const existing = await findUserById(Number(userId));
          const oldRel = existing?.avatar_path;
          if (oldRel) {
            const oldAbs = path.join(uploadDir, oldRel);
            if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
          }
        } catch (_) {
          // ignore cleanup errors
        }

        await maybeConvertHeicToJpeg(req.file);

        const relPath = toPosixRelative(
          path.join('avatars', safeSegment(userId), req.file.filename)
        );

        const ok = await updateUserAvatarPath(Number(userId), relPath);
        if (!ok) {
          try { fs.unlinkSync(req.file.path); } catch (_) {}
          return res.status(404).json({ error: 'User not found' });
        }

        return res.json({
          ok: true,
          avatar_path: relPath,
          url: `/uploads/${relPath}`,
        });
      } catch (handlerErr) {
        console.error('Avatar upload handler error:', handlerErr);
        return res.status(500).json({ error: 'Server error' });
      }
    });
  });

  // Standard (non-chunked) upload
  app.post('/upload', (req, res) => {
    upload.single('photo')(req, res, async (err) => {
      if (err) {
        console.error('Upload middleware error:', err);
        return res.status(500).json({ error: 'Upload failed in middleware', details: err.message });
      }

      try {
        const { clientId, timestamp, signatureBase64 } = req.body || {};

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        if (!clientId || !timestamp || !signatureBase64) {
          try { fs.unlinkSync(req.file.path); } catch (_) {}
          return res.status(400).json({ error: 'Missing auth fields' });
        }

        // IMPORTANT: signature verifies timestamp:originalName, so use originalname
        const isValid = verifyClientSignature({
          clientId,
          timestamp,
          signatureBase64,
          originalName: req.file.originalname,
        });

        if (!isValid) {
          console.warn('Invalid signature for upload');
          try { fs.unlinkSync(req.file.path); } catch (_) {}
          return res.status(401).json({ error: 'Invalid signature or client' });
        }

        await maybeConvertHeicToJpeg(req.file);

        const { relativePath, url } = computeUploadResponseFromFile(req.file);

        console.log('Saved file:', relativePath, 'original:', req.file.originalname);

        return res.json({
          status: 'ok',
          verified: true,

          // ✅ New structured payload (matches chunked complete)
          file: {
            relativePath,
            mime: req.file.mimetype,
            size: fs.statSync(req.file.path).size,
            originalName: req.file.originalname,
          },

          // ✅ Backward compatible fields
          filename: req.file.filename,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          url,
        });
      } catch (handlerErr) {
        console.error('Upload handler error:', handlerErr);
        return res.status(500).json({ error: 'Server error' });
      }
    });
  });

  // Chunked upload start
  app.post('/upload-chunk-start', (req, res) => {
    try {
      pruneChunkSessions();

      const {
        clientId,
        timestamp,
        signatureBase64,
        originalName,
        totalChunks,
        fileSha256,
        purpose,
        uploaderId,
      } = req.body || {};

      if (!clientId || !timestamp || !signatureBase64 || !originalName || !totalChunks || !fileSha256) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const ok = verifyClientSignature({ clientId, timestamp, signatureBase64, originalName });
      if (!ok) {
        console.warn('Invalid signature on /upload-chunk-start');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const uploadId = makeUuid();

      activeChunkUploads.set(uploadId, {
        clientId,
        originalName,
        totalChunks: Number(totalChunks),
        fileSha256,
        base64Chunks: new Array(Number(totalChunks)).fill(null),
        createdAt: Date.now(),
        lastUpdated: Date.now(),

        purpose: String(purpose || '').trim().toLowerCase(),
        uploaderId,
      });

      console.log('Chunked upload started', { uploadId, clientId, originalName, totalChunks });
      return res.json({ ok: true, uploadId });
    } catch (err) {
      console.error('Error in /upload-chunk-start', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Chunk upload
  app.post('/upload-chunk', (req, res) => {
    try {
      const { uploadId, chunkIndex, chunkSha256, chunkDataBase64 } = req.body || {};

      if (!uploadId || typeof chunkIndex === 'undefined' || !chunkSha256 || !chunkDataBase64) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const session = activeChunkUploads.get(uploadId);
      if (!session) return res.status(400).json({ error: 'Unknown uploadId' });

      const index = Number(chunkIndex);
      if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
        return res.status(400).json({ error: 'Invalid chunkIndex' });
      }

      const computedSha = crypto.createHash('sha256').update(chunkDataBase64).digest('hex');
      if (computedSha !== chunkSha256) {
        console.warn('Chunk checksum mismatch', { uploadId, index, expected: chunkSha256, actual: computedSha });
        return res.status(400).json({ error: 'Chunk checksum mismatch' });
      }

      session.base64Chunks[index] = chunkDataBase64;
      session.lastUpdated = Date.now();

      return res.json({ ok: true, receivedIndex: index });
    } catch (err) {
      console.error('Error in /upload-chunk', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Chunk complete
  app.post('/upload-chunk-complete', async (req, res) => {
    try {
      const { uploadId } = req.body || {};
      if (!uploadId) return res.status(400).json({ error: 'Missing uploadId' });

      const session = activeChunkUploads.get(uploadId);
      if (!session) return res.status(400).json({ error: 'Unknown uploadId' });

      const missing = [];
      for (let i = 0; i < session.totalChunks; i++) {
        if (!session.base64Chunks[i]) missing.push(i);
      }
      if (missing.length) {
        return res.status(400).json({ error: 'Missing chunks', missing });
      }

      const base64Full = session.base64Chunks.join('');
      const actualSha = crypto.createHash('sha256').update(base64Full).digest('hex');

      if (actualSha !== session.fileSha256) {
        console.warn('Final SHA256 mismatch on chunked upload', {
          uploadId,
          expected: session.fileSha256,
          actual: actualSha,
        });
        activeChunkUploads.delete(uploadId);
        return res.status(400).json({ error: 'Final checksum mismatch' });
      }

      const fileBuffer = Buffer.from(base64Full, 'base64');

      const ext = path.extname(session.originalName) || '.jpg';
      const finalFilename = `${makeUuid()}${ext}`;

      // choose subdir (chat/<uploaderId> when purpose === 'chat')
      const subdir =
        session.purpose === 'chat'
          ? path.join('chat', safeSegment(session.uploaderId))
          : '';

      const finalDir = path.join(uploadDir, subdir);
      if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

      const finalPath = path.join(finalDir, finalFilename);
      fs.writeFileSync(finalPath, fileBuffer);

      // multer-style keys for HEIC helper
      const file = {
        path: finalPath,
        filename: finalFilename,
        originalname: session.originalName,
        mimetype: getMimeTypeFromExtension(ext),
      };

      await maybeConvertHeicToJpeg(file);

      const { relativePath, url } = computeUploadResponseFromFile(file);

      activeChunkUploads.delete(uploadId);

      console.log('Chunked upload completed', {
        uploadId,
        filename: file.filename,
        originalName: file.originalname,
        relativePath,
      });

      return res.json({
        status: 'ok',
        verified: true,

        // ✅ Structured payload (what the mobile chat uses)
        file: {
          relativePath,
          mime: file.mimetype,
          size: fs.statSync(file.path).size,
          originalName: file.originalname,
        },

        // ✅ Backward compatible fields
        filename: file.filename,
        originalname: file.originalname,
        mimetype: file.mimetype,
        url,
      });
    } catch (err) {
      console.error('Error in /upload-chunk-complete', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Mobile app log endpoint - emails logs to admin
  app.post('/send-logs', express.json(), async (req, res) => {
    try {
      const { logEntries } = req.body;

      if (!logEntries || !Array.isArray(logEntries)) {
        return res.status(400).json({ error: 'Invalid log entries' });
      }

      console.log('Received log entries from mobile app:', logEntries.length);

      // Email configuration from .env
      const SMTP_HOST = process.env.SMTP_HOST || '';
      const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
      const SMTP_USER = process.env.SMTP_USER || '';
      const SMTP_PASS = process.env.SMTP_PASS || '';
      const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

      if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !ADMIN_EMAIL) {
        console.error('SMTP settings not configured');
        return res.status(500).json({ error: 'Server email not configured' });
      }

      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
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

      console.log('Mobile app logs emailed successfully to:', ADMIN_EMAIL);
      return res.json({ ok: true, message: 'Logs emailed successfully' });
    } catch (err) {
      console.error('Failed to email mobile logs:', err);
      return res.status(500).json({ error: 'Failed to send email', details: err.message });
    }
  });
}

module.exports = { registerUploadRoutes };
