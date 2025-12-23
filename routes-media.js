// routes-media.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const { 
  getMediaById, 
  canUserAccessMedia,
  findUserByToken
} = require('./database');

const uploadDir = path.join(__dirname, 'uploads');

/* ──────────────────────────────────────────────
 *  AUTHENTICATION MIDDLEWARE
 * ────────────────────────────────────────────── */

async function requireAuth(req, res, next) {
  try {
    // Check for Bearer token in Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const user = await findUserByToken(token);

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/* ──────────────────────────────────────────────
 *  MEDIA ROUTES
 * ────────────────────────────────────────────── */

function registerMediaRoutes(app) {
  
  // Get media by ID (authenticated)
  app.get('/media/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: 'Invalid media ID format' });
      }

      const media = await getMediaById(id);
      
      if (!media) {
        return res.status(404).json({ error: 'Media not found' });
      }

      // Check authorization
      const canAccess = await canUserAccessMedia(req.user.id, media);
      
      if (!canAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Verify file exists on disk
      const filePath = path.join(uploadDir, media.storage_path);
      if (!fs.existsSync(filePath)) {
        console.error('Media file missing on disk:', filePath);
        return res.status(404).json({ error: 'Media file not found' });
      }

      // Set content type and send file
      if (media.mime_type) {
        res.type(media.mime_type);
      }
      
      res.sendFile(filePath);
      
    } catch (err) {
      console.error('Media fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch media' });
    }
  });

  // Get avatar by user ID (authenticated - anyone can view avatars)
  app.get('/media/avatar/:userId', requireAuth, async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Find user's avatar media
      const { Pool } = require('pg');
      const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'text_fasbit',
        user: process.env.DB_USER || 'text_fasbit_user',
        password: process.env.DB_PASSWORD,
      });

      const result = await pool.query(
        `SELECT * FROM media 
         WHERE owner_user_id = $1 AND kind = 'avatar' 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [parseInt(userId, 10)]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Avatar not found' });
      }

      const media = result.rows[0];
      
      // Verify file exists
      const filePath = path.join(uploadDir, media.storage_path);
      if (!fs.existsSync(filePath)) {
        console.error('Avatar file missing on disk:', filePath);
        return res.status(404).json({ error: 'Avatar file not found' });
      }

      // Set content type and send file
      if (media.mime_type) {
        res.type(media.mime_type);
      }
      
      res.sendFile(filePath);
      
    } catch (err) {
      console.error('Avatar fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch avatar' });
    }
  });
}

module.exports = { registerMediaRoutes, requireAuth };