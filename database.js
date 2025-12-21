// database.js
const { Pool } = require('pg');
const crypto = require('crypto');

let pool;

/* ──────────────────────────────────────────────
 *  DATABASE INITIALIZATION
 * ────────────────────────────────────────────── */

function initDatabase() {
  return new Promise(async (resolve, reject) => {
    try {
      // Create PostgreSQL connection pool
      pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'text_fasbit',
        user: process.env.DB_USER || 'text_fasbit_user',
        password: process.env.DB_PASSWORD,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      const client = await pool.connect();
      console.log('Connected to PostgreSQL database');

      // Create users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          account_number VARCHAR(50) UNIQUE NOT NULL,
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100) NOT NULL,
          street_address VARCHAR(255) NOT NULL,
          city VARCHAR(100) NOT NULL,
          state VARCHAR(2) NOT NULL,
          zip VARCHAR(10) NOT NULL,
          phone VARCHAR(20) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          email_verified BOOLEAN DEFAULT FALSE,
          verification_token VARCHAR(255),
          reset_token VARCHAR(255),
          reset_token_expires BIGINT,
          status VARCHAR(20) DEFAULT 'active',
          timezone VARCHAR(50) DEFAULT 'America/New_York',
          account_balance DECIMAL(10, 2) DEFAULT 0.00,
          created_date BIGINT NOT NULL,
          last_modified BIGINT NOT NULL
        )
      `);

      // Create transactions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          amount DECIMAL(10, 2) NOT NULL,
          description TEXT,
          running_balance DECIMAL(10, 2) NOT NULL,
          transaction_date BIGINT NOT NULL
        )
      `);

      // Create photos table
      await client.query(`
        CREATE TABLE IF NOT EXISTS photos (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          filename VARCHAR(255) NOT NULL,
          original_name VARCHAR(255),
          file_path TEXT NOT NULL,
          file_size BIGINT,
          mime_type VARCHAR(100),
          upload_date BIGINT NOT NULL,
          encryption_key TEXT,
          metadata JSONB
        )
      `);

      // Create messages table
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          message_type VARCHAR(20) DEFAULT 'text',
          content TEXT,
          photo_id INTEGER REFERENCES photos(id) ON DELETE SET NULL,
          sent_date BIGINT NOT NULL,
          delivered_date BIGINT,
          read_date BIGINT,
          status VARCHAR(20) DEFAULT 'sent'
        )
      `);

      // Create contacts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS contacts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          contact_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          nickname VARCHAR(100),
          added_date BIGINT NOT NULL,
          UNIQUE(user_id, contact_user_id)
        )
      `);

      // Create login_sessions table for tracking mobile logins
      await client.query(`
        CREATE TABLE IF NOT EXISTS login_sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_info TEXT,
          ip_address VARCHAR(45),
          login_date BIGINT NOT NULL,
          last_activity BIGINT NOT NULL,
          logout_date BIGINT,
          session_token VARCHAR(255) UNIQUE
        )
      `);

      // Create indexes for performance
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_users_account_number ON users(account_number)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_login_sessions_user ON login_sessions(user_id)');

      client.release();
      console.log('Database tables and indexes initialized');
      resolve();
    } catch (err) {
      console.error('Database initialization error:', err);
      reject(err);
    }
  });
}

/* ──────────────────────────────────────────────
 *  PASSWORD HASHING
 * ────────────────────────────────────────────── */

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) return reject(err);
      resolve(salt + ':' + derivedKey.toString('hex'));
    });
  });
}

function verifyPassword(password, hash) {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) return reject(err);
      resolve(key === derivedKey.toString('hex'));
    });
  });
}

/* ──────────────────────────────────────────────
 *  ACCOUNT NUMBER GENERATION
 * ────────────────────────────────────────────── */

function generateAccountNumber() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ACC${timestamp}${random}`;
}

/* ──────────────────────────────────────────────
 *  USER OPERATIONS
 * ────────────────────────────────────────────── */

async function createUser(userData) {
  try {
    const passwordHash = await hashPassword(userData.password);
    const accountNumber = generateAccountNumber();
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    console.log('Creating user with data:', {
      accountNumber,
      firstName: userData.firstName,
      lastName: userData.lastName,
      user_name: userData.user_name,
      email: userData.email,
      phone: userData.phone
    });

    const result = await pool.query(
      `INSERT INTO users (
        account_number, first_name, last_name, user_name, street_address, city,
        state, zip, phone, email, password_hash, verification_token,
        created_date, last_modified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id`,
      [
        accountNumber,
        userData.firstName,
        userData.lastName,
        userData.user_name,       // ADDED: user_name field
        userData.streetAddress,
        userData.city,
        userData.state,
        userData.zip,
        userData.phone,
        userData.email,
        passwordHash,
        verificationToken,
        now,
        now
      ]
    );

    console.log('User created successfully with ID:', result.rows[0].id);

    return {
      userId: result.rows[0].id,
      accountNumber,
      verificationToken
    };
  } catch (err) {
    console.error('Database error in createUser:', err.message, err.code, err.constraint);
    
    if (err.code === '23505') { // Unique violation
      if (err.constraint === 'users_phone_key') {
        throw new Error('Phone number already registered');
      }
      if (err.constraint === 'users_email_key') {
        throw new Error('Email already registered');
      }
      if (err.constraint === 'users_user_name_key') {
        throw new Error('Username already taken');
      }
    }
    throw err;
  }
}

async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(userId) {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

async function verifyUserEmail(token) {
  const now = Date.now();
  const result = await pool.query(
    `UPDATE users 
     SET email_verified = TRUE, verification_token = NULL, last_modified = $1 
     WHERE verification_token = $2`,
    [now, token]
  );
  return result.rowCount > 0;
}

async function updateUser(userId, updates) {
  const now = Date.now();
  const allowedFields = [
    'first_name', 'last_name', 'street_address', 'city', 
    'state', 'zip', 'phone', 'timezone', 'status'
  ];
  
  const fields = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (fields.length === 0) {
    return false;
  }

  fields.push(`last_modified = $${paramIndex}`);
  values.push(now);
  paramIndex++;
  values.push(userId);

  const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
  const result = await pool.query(sql, values);
  return result.rowCount > 0;
}

/* ──────────────────────────────────────────────
 *  PASSWORD RESET
 * ────────────────────────────────────────────── */

async function createPasswordResetToken(email) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 3600000; // 1 hour
  const now = Date.now();

  const result = await pool.query(
    `UPDATE users 
     SET reset_token = $1, reset_token_expires = $2, last_modified = $3 
     WHERE email = $4`,
    [token, expires, now, email]
  );

  if (result.rowCount === 0) {
    throw new Error('Email not found');
  }

  return token;
}

async function resetPassword(token, newPassword) {
  const user = await pool.query(
    'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > $2',
    [token, Date.now()]
  );

  if (user.rows.length === 0) {
    throw new Error('Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(newPassword);
  const now = Date.now();

  await pool.query(
    `UPDATE users 
     SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, last_modified = $2 
     WHERE id = $3`,
    [passwordHash, now, user.rows[0].id]
  );

  return true;
}

/* ──────────────────────────────────────────────
 *  TRANSACTIONS
 * ────────────────────────────────────────────── */

async function addTransaction(userId, amount, description) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get current balance
    const userResult = await client.query(
      'SELECT account_balance FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const newBalance = parseFloat(userResult.rows[0].account_balance) + parseFloat(amount);
    const now = Date.now();

    // Insert transaction
    const transactionResult = await client.query(
      `INSERT INTO transactions (user_id, amount, description, running_balance, transaction_date) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id`,
      [userId, amount, description, newBalance, now]
    );

    // Update user balance
    await client.query(
      'UPDATE users SET account_balance = $1, last_modified = $2 WHERE id = $3',
      [newBalance, now, userId]
    );

    await client.query('COMMIT');
    
    return {
      transactionId: transactionResult.rows[0].id,
      newBalance
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getTransactions(userId, limit = 50) {
  const result = await pool.query(
    `SELECT * FROM transactions 
     WHERE user_id = $1 
     ORDER BY transaction_date DESC 
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/* ──────────────────────────────────────────────
 *  LOGIN SESSION TRACKING
 * ────────────────────────────────────────────── */

async function createLoginSession(userId, deviceInfo, ipAddress) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();

  const result = await pool.query(
    `INSERT INTO login_sessions (user_id, device_info, ip_address, login_date, last_activity, session_token) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     RETURNING id`,
    [userId, deviceInfo, ipAddress, now, now, sessionToken]
  );

  return {
    sessionId: result.rows[0].id,
    sessionToken
  };
}

async function updateLoginActivity(sessionToken) {
  const now = Date.now();
  await pool.query(
    'UPDATE login_sessions SET last_activity = $1 WHERE session_token = $2',
    [now, sessionToken]
  );
}

async function logoutSession(sessionToken) {
  const now = Date.now();
  await pool.query(
    'UPDATE login_sessions SET logout_date = $1 WHERE session_token = $2',
    [now, sessionToken]
  );
}

/* ──────────────────────────────────────────────
 *  CONTACTS OPERATIONS
 * ────────────────────────────────────────────── */

async function searchUsersByIdentifier({ type, value, excludeUserId, limit = 20 }) {
  const q = String(value || '').trim();
  if (!q) return [];

  const exId = Number.isFinite(Number(excludeUserId)) ? Number(excludeUserId) : -1;

  if (!['phone', 'email', 'username'].includes(type)) {
    throw new Error('Invalid search type');
  }

  if (type === 'phone') {
    const digits = q.replace(/\D/g, '');
    if (!digits) return [];

    const { rows } = await pool.query(
      `
      SELECT id, user_name, first_name, last_name, email, phone
      FROM users
      WHERE id <> $1
        AND regexp_replace(COALESCE(phone,''), '\\D', '', 'g') LIKE $2
      ORDER BY id DESC
      LIMIT $3
      `,
      [exId, `%${digits}%`, limit]
    );
    return rows;
  }

  if (type === 'email') {
    const { rows } = await pool.query(
      `
      SELECT id, user_name, first_name, last_name, email, phone
      FROM users
      WHERE id <> $1
        AND COALESCE(email,'') ILIKE $2
      ORDER BY id DESC
      LIMIT $3
      `,
      [exId, `%${q}%`, limit]
    );
    return rows;
  }

  // username
  const { rows } = await pool.query(
    `
    SELECT id, user_name, first_name, last_name, email, phone
    FROM users
    WHERE id <> $1
      AND COALESCE(user_name,'') ILIKE $2
    ORDER BY id DESC
    LIMIT $3
    `,
    [exId, `%${q}%`, limit]
  );
  return rows;
}

async function addContact({ userId, contactUserId, nickname = null }) {
  const uid = Number(userId);
  const cid = Number(contactUserId);
  if (!uid || !cid) throw new Error('Missing userId/contactUserId');

  const { rows } = await pool.query(
    `
    INSERT INTO contacts (user_id, contact_user_id, nickname, added_date)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, contact_user_id)
    DO UPDATE SET nickname = COALESCE(EXCLUDED.nickname, contacts.nickname)
    RETURNING user_id, contact_user_id, nickname, added_date
    `,
    [uid, cid, nickname, addedDateMs] 
  );
  return rows[0];
}

async function removeContact({ userId, contactUserId }) {
  const uid = Number(userId);
  const cid = Number(contactUserId);
  if (!uid || !cid) throw new Error('Missing userId/contactUserId');

  await pool.query(
    `DELETE FROM contacts WHERE user_id = $1 AND contact_user_id = $2`,
    [uid, cid]
  );
  return true;
}

async function listContacts({ userId, limit = 200 }) {
  const uid = Number(userId);
  if (!uid) throw new Error('Missing userId');

  const { rows } = await pool.query(
    `
    SELECT
      c.contact_user_id AS id,
      u.user_name,
      u.first_name,
      u.last_name,
      u.email,
      u.phone,
      c.nickname,
      c.added_date
    FROM contacts c
    JOIN users u ON u.id = c.contact_user_id
    WHERE c.user_id = $1
    ORDER BY c.added_date DESC
    LIMIT $2
    `,
    [uid, limit]
  );

  return rows;
}

/* ──────────────────────────────────────────────
 *  PHOTO OPERATIONS
 * ────────────────────────────────────────────── */

async function savePhoto(userId, photoData) {
  const now = Date.now();
  const result = await pool.query(
    `INSERT INTO photos (user_id, filename, original_name, file_path, file_size, mime_type, upload_date, encryption_key, metadata) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
     RETURNING id`,
    [
      userId,
      photoData.filename,
      photoData.originalName,
      photoData.filePath,
      photoData.fileSize,
      photoData.mimeType,
      now,
      photoData.encryptionKey || null,
      photoData.metadata || null
    ]
  );
  return result.rows[0].id;
}

async function getUserPhotos(userId, limit = 50) {
  const result = await pool.query(
    `SELECT * FROM photos 
     WHERE user_id = $1 
     ORDER BY upload_date DESC 
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/* ──────────────────────────────────────────────
 *  CLEANUP
 * ────────────────────────────────────────────── */

async function closeDatabase() {
  if (pool) {
    await pool.end();
    console.log('Database connection pool closed');
  }
}

/* ──────────────────────────────────────────────
 *  EXPORTS
 * ────────────────────────────────────────────── */

module.exports = {
  initDatabase,
  closeDatabase,
  createUser,
  findUserByEmail,
  findUserById,
  verifyPassword,
  verifyUserEmail,
  updateUser,
  createPasswordResetToken,
  resetPassword,
  addTransaction,
  getTransactions,
  createLoginSession,
  updateLoginActivity,
  logoutSession,
  savePhoto,
  getUserPhotos,
  searchUsersByIdentifier,
  addContact,
  removeContact,
  listContacts,
};