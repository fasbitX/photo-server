// routes-media.js
/* The purpose of this module is to provide routes for serving private media files
 * and avatars for authenticated users. It includes middleware for authentication
 * and authorization, ensuring that only authorized users can access specific files.
 */

const path = require('path');
const fs = require('fs');
const {
  findUserByToken,
  findUserById,
} = require('./database');

const uploadDir = path.join(__dirname, 'uploads');

/* ──────────────────────────────────────────────
 *  AUTHENTICATION MIDDLEWARE (Bearer token)
 * ────────────────────────────────────────────── */
async function requireAuth(req, res, next) {
  try {
    const authHeader = String(req.headers.authorization || '');
    const headerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : null;

    const queryToken =
      typeof req.query.token === 'string' ? req.query.token.trim() : null;

    const token = headerToken || queryToken;

    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    const user = await findUserByToken(token);

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    req.user = user;
    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}


/* ──────────────────────────────────────────────
 *  PATH SAFETY
 * ────────────────────────────────────────────── */
function safeUploadPath(relativePath) {
  const raw = String(relativePath || '').trim().replace(/^\/+/, '');
  if (!raw) return null;

  // normalize and block traversal
  const normalized = path.normalize(raw);
  if (normalized.includes('..')) return null;

  const abs = path.join(uploadDir, normalized);

  // ensure still inside uploads/
  if (!abs.startsWith(uploadDir)) return null;

  return { abs, rel: normalized };
}

/* ──────────────────────────────────────────────
 *  AUTHZ: allow avatars for any logged-in user,
 *         allow chat files only to participants
 * ────────────────────────────────────────────── */
async function canAccessUploadPath(userId, relPath) {
  // Avatars are visible to any authenticated user
  if (relPath.startsWith('avatars/')) return true;

  // Chat uploads: require message participation.
  // Uploads are stored as "chat/<uploaderId>/<file>" by uploadRoutes.js
  if (relPath.startsWith('chat/')) {
    // We need to confirm requester is sender or recipient of a message referencing this attachment_path.
    // Using direct SQL via pg is simplest; but your database.js doesn't export pool.
    // So: re-require pg and use same env vars (one query, cheap).
    const { Pool } = require('pg');
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'text_fasbit',
      user: process.env.DB_USER || 'text_fasbit_user',
      password: process.env.DB_PASSWORD,
    });

    try {
      const q = await pool.query(
        `
        SELECT id
        FROM messages
        WHERE attachment_path = $1
          AND (sender_id = $2 OR recipient_id = $2)
        LIMIT 1
        `,
        [relPath, Number(userId)]
      );

      return q.rows.length > 0;
    } catch (e) {
      console.error('[media] chat authz query failed', e);
      return false;
    } finally {
      // prevent hanging connections
      try { await pool.end(); } catch (_) {}
    }
  }

  // default deny
  return false;
}

/* ──────────────────────────────────────────────
 *  MEDIA ROUTES
 * ────────────────────────────────────────────── */
function registerMediaRoutes(app) {
  /**
   * Private media endpoint for the mobile app:
   * GET /api/mobile/media?path=avatars/4/avatar-xxx.png
   * GET /api/mobile/media?path=chat/4/173...jpg
   */
  app.get('/api/mobile/media', requireAuth, async (req, res) => {
    try {
      const p = safeUploadPath(req.query.path);
      if (!p) return res.status(400).json({ error: 'Invalid path' });

      const ok = await canAccessUploadPath(req.user.id, p.rel);
      if (!ok) return res.status(403).json({ error: 'Access denied' });

      if (!fs.existsSync(p.abs)) return res.status(404).end();

      return res.sendFile(p.abs);
    } catch (err) {
      console.error('Private media fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch media' });
    }
  });

  /**
   * Avatar by userId (authenticated; visible to all logged-in users)
   * Uses users.avatar_path (matches uploadRoutes.js behavior).
   */
  app.get('/media/avatar/:userId', requireAuth, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid userId' });

      const u = await findUserById(userId);
      const rel = u?.avatar_path;
      if (!rel) return res.status(404).json({ error: 'Avatar not found' });

      const p = safeUploadPath(rel);
      if (!p) return res.status(400).json({ error: 'Invalid avatar path' });

      if (!fs.existsSync(p.abs)) return res.status(404).json({ error: 'Avatar file not found' });

      return res.sendFile(p.abs);
    } catch (err) {
      console.error('Avatar fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch avatar' });
    }
  });
}

module.exports = { registerMediaRoutes, requireAuth };
