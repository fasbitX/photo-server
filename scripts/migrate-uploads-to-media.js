// migrate-uploads-to-media.js
// Run this script once to migrate existing uploads to the media table
// Usage: node migrate-uploads-to-media.js

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'text_fasbit',
  user: process.env.DB_USER || 'text_fasbit_user',
  password: process.env.DB_PASSWORD,
});

const uploadDir = path.join(__dirname, 'uploads');

async function migrateUploads() {
  console.log('Starting migration of existing uploads to media table...');
  
  try {
    // 1. Migrate avatars from users table
    console.log('\n1. Migrating user avatars...');
    const users = await pool.query(
      'SELECT id, avatar_path FROM users WHERE avatar_path IS NOT NULL'
    );
    
    let avatarCount = 0;
    for (const user of users.rows) {
      if (!user.avatar_path) continue;
      
      const fullPath = path.join(uploadDir, user.avatar_path);
      if (!fs.existsSync(fullPath)) {
        console.log(`  ⚠️  Avatar file not found: ${user.avatar_path}`);
        continue;
      }
      
      const stats = fs.statSync(fullPath);
      const ext = path.extname(user.avatar_path).toLowerCase();
      let mimeType = 'image/jpeg';
      if (ext === '.png') mimeType = 'image/png';
      if (ext === '.gif') mimeType = 'image/gif';
      
      // Check if already migrated
      const existing = await pool.query(
        'SELECT id FROM media WHERE owner_user_id = $1 AND kind = $2 AND storage_path = $3',
        [user.id, 'avatar', user.avatar_path]
      );
      
      if (existing.rows.length > 0) {
        console.log(`  ↷ Avatar already migrated for user ${user.id}`);
        continue;
      }
      
      await pool.query(
        `INSERT INTO media (
          storage_path, owner_user_id, kind, mime_type, 
          file_size, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          user.avatar_path,
          user.id,
          'avatar',
          mimeType,
          stats.size,
          Date.now(),
        ]
      );
      
      avatarCount++;
      console.log(`  ✓ Migrated avatar for user ${user.id}`);
    }
    console.log(`✓ Migrated ${avatarCount} avatars`);
    
    // 2. Migrate chat uploads
    console.log('\n2. Migrating chat uploads...');
    const chatDir = path.join(uploadDir, 'chat');
    
    if (!fs.existsSync(chatDir)) {
      console.log('  No chat directory found, skipping...');
    } else {
      const userDirs = fs.readdirSync(chatDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      
      let chatCount = 0;
      for (const userDirName of userDirs) {
        const userDir = path.join(chatDir, userDirName);
        const files = fs.readdirSync(userDir, { withFileTypes: true })
          .filter(f => f.isFile())
          .map(f => f.name);
        
        // Try to find user by directory name (might be user ID or account number)
        let userId = null;
        if (/^\d+$/.test(userDirName)) {
          // Looks like a user ID
          const userCheck = await pool.query(
            'SELECT id FROM users WHERE id = $1',
            [parseInt(userDirName, 10)]
          );
          if (userCheck.rows.length > 0) {
            userId = userCheck.rows[0].id;
          }
        }
        
        if (!userId) {
          console.log(`  ⚠️  Could not determine user for directory: ${userDirName}`);
          continue;
        }
        
        for (const filename of files) {
          const fullPath = path.join(userDir, filename);
          const relativePath = path.join('chat', userDirName, filename).split(path.sep).join('/');
          
          // Check if already migrated
          const existing = await pool.query(
            'SELECT id FROM media WHERE storage_path = $1',
            [relativePath]
          );
          
          if (existing.rows.length > 0) {
            continue;
          }
          
          const stats = fs.statSync(fullPath);
          const ext = path.extname(filename).toLowerCase();
          let mimeType = 'image/jpeg';
          if (ext === '.png') mimeType = 'image/png';
          if (ext === '.gif') mimeType = 'image/gif';
          if (ext === '.webp') mimeType = 'image/webp';
          
          await pool.query(
            `INSERT INTO media (
              storage_path, owner_user_id, kind, mime_type, 
              file_size, original_name, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              relativePath,
              userId,
              'chat',
              mimeType,
              stats.size,
              filename,
              Date.now(),
            ]
          );
          
          chatCount++;
        }
      }
      console.log(`✓ Migrated ${chatCount} chat uploads`);
    }
    
    // 3. Migrate root-level uploads (generic photos)
    console.log('\n3. Migrating root-level uploads...');
    const rootFiles = fs.readdirSync(uploadDir, { withFileTypes: true })
      .filter(f => f.isFile() && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
      .map(f => f.name);
    
    let rootCount = 0;
    for (const filename of rootFiles) {
      const relativePath = filename;
      
      // Check if already migrated
      const existing = await pool.query(
        'SELECT id FROM media WHERE storage_path = $1',
        [relativePath]
      );
      
      if (existing.rows.length > 0) {
        continue;
      }
      
      const fullPath = path.join(uploadDir, filename);
      const stats = fs.statSync(fullPath);
      const ext = path.extname(filename).toLowerCase();
      let mimeType = 'image/jpeg';
      if (ext === '.png') mimeType = 'image/png';
      if (ext === '.gif') mimeType = 'image/gif';
      if (ext === '.webp') mimeType = 'image/webp';
      
      // These are orphaned - assign to admin or first user
      const firstUser = await pool.query('SELECT id FROM users ORDER BY id LIMIT 1');
      if (firstUser.rows.length === 0) {
        console.log(`  ⚠️  No users found, skipping: ${filename}`);
        continue;
      }
      
      await pool.query(
        `INSERT INTO media (
          storage_path, owner_user_id, kind, mime_type, 
          file_size, original_name, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          relativePath,
          firstUser.rows[0].id,
          'photo',
          mimeType,
          stats.size,
          filename,
          Date.now(),
        ]
      );
      
      rootCount++;
    }
    console.log(`✓ Migrated ${rootCount} root-level uploads`);
    
    console.log('\n✅ Migration complete!');
    console.log('\nSummary:');
    console.log(`  - Avatars: ${avatarCount}`);
    console.log(`  - Chat uploads: ${chatCount || 0}`);
    console.log(`  - Root uploads: ${rootCount}`);
    
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await pool.end();
  }
}

// Run migration
migrateUploads().catch(console.error);