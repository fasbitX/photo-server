// db-users.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'users.db');
let db;

/* ──────────────────────────────────────────────
 *  DATABASE INITIALIZATION
 * ────────────────────────────────────────────── */

function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Database connection error:', err);
        return reject(err);
      }
      console.log('Connected to users database');
      
      // Create users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_number TEXT UNIQUE NOT NULL,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          street_address TEXT NOT NULL,
          city TEXT NOT NULL,
          state TEXT NOT NULL,
          zip TEXT NOT NULL,
          phone TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          email_verified INTEGER DEFAULT 0,
          verification_token TEXT,
          reset_token TEXT,
          reset_token_expires INTEGER,
          status TEXT DEFAULT 'active',
          timezone TEXT DEFAULT 'America/New_York',
          account_balance REAL DEFAULT 0.0,
          created_date INTEGER NOT NULL,
          last_modified INTEGER NOT NULL
        )
      `, (err) => {
        if (err) {
          console.error('Error creating users table:', err);
          return reject(err);
        }
        
        // Create transactions table
        db.run(`
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            running_balance REAL NOT NULL,
            transaction_date INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `, (err) => {
          if (err) {
            console.error('Error creating transactions table:', err);
            return reject(err);
          }
          console.log('Database tables initialized');
          resolve();
        });
      });
    });
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

function createUser(userData) {
  return new Promise(async (resolve, reject) => {
    try {
      const passwordHash = await hashPassword(userData.password);
      const accountNumber = generateAccountNumber();
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const now = Date.now();
      
      const sql = `
        INSERT INTO users (
          account_number, first_name, last_name, street_address, city, 
          state, zip, phone, email, password_hash, verification_token,
          created_date, last_modified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(sql, [
        accountNumber,
        userData.firstName,
        userData.lastName,
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
      ], function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            if (err.message.includes('phone')) {
              return reject(new Error('Phone number already registered'));
            }
            if (err.message.includes('email')) {
              return reject(new Error('Email already registered'));
            }
          }
          return reject(err);
        }
        resolve({ 
          userId: this.lastID, 
          accountNumber,
          verificationToken 
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function findUserById(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function verifyUserEmail(token) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    db.run(
      'UPDATE users SET email_verified = 1, verification_token = NULL, last_modified = ? WHERE verification_token = ?',
      [now, token],
      function(err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

function updateUser(userId, updates) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    const fields = [];
    const values = [];
    
    const allowedFields = ['first_name', 'last_name', 'street_address', 'city', 'state', 'zip', 'phone', 'timezone', 'status'];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    if (fields.length === 0) {
      return resolve(false);
    }
    
    fields.push('last_modified = ?');
    values.push(now, userId);
    
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    
    db.run(sql, values, function(err) {
      if (err) return reject(err);
      resolve(this.changes > 0);
    });
  });
}

/* ──────────────────────────────────────────────
 *  PASSWORD RESET
 * ────────────────────────────────────────────── */

function createPasswordResetToken(email) {
  return new Promise((resolve, reject) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 3600000; // 1 hour
    const now = Date.now();
    
    db.run(
      'UPDATE users SET reset_token = ?, reset_token_expires = ?, last_modified = ? WHERE email = ?',
      [token, expires, now, email],
      function(err) {
        if (err) return reject(err);
        if (this.changes === 0) return reject(new Error('Email not found'));
        resolve(token);
      }
    );
  });
}

function resetPassword(token, newPassword) {
  return new Promise(async (resolve, reject) => {
    try {
      const user = await new Promise((res, rej) => {
        db.get(
          'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?',
          [token, Date.now()],
          (err, row) => {
            if (err) return rej(err);
            res(row);
          }
        );
      });
      
      if (!user) {
        return reject(new Error('Invalid or expired reset token'));
      }
      
      const passwordHash = await hashPassword(newPassword);
      const now = Date.now();
      
      db.run(
        'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, last_modified = ? WHERE id = ?',
        [passwordHash, now, user.id],
        function(err) {
          if (err) return reject(err);
          resolve(true);
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

/* ──────────────────────────────────────────────
 *  TRANSACTIONS
 * ────────────────────────────────────────────── */

function addTransaction(userId, amount, description) {
  return new Promise(async (resolve, reject) => {
    try {
      // Get current balance
      const user = await findUserById(userId);
      if (!user) return reject(new Error('User not found'));
      
      const newBalance = parseFloat(user.account_balance) + parseFloat(amount);
      const now = Date.now();
      
      // Start transaction
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Insert transaction record
        db.run(
          'INSERT INTO transactions (user_id, amount, description, running_balance, transaction_date) VALUES (?, ?, ?, ?, ?)',
          [userId, amount, description, newBalance, now],
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }
            
            // Update user balance
            db.run(
              'UPDATE users SET account_balance = ?, last_modified = ? WHERE id = ?',
              [newBalance, now, userId],
              function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                
                db.run('COMMIT', (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  resolve({ transactionId: this.lastID, newBalance });
                });
              }
            );
          }
        );
      });
    } catch (err) {
      reject(err);
    }
  });
}

function getTransactions(userId, limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_date DESC LIMIT ?',
      [userId, limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

/* ──────────────────────────────────────────────
 *  EXPORTS
 * ────────────────────────────────────────────── */

module.exports = {
  initDatabase,
  createUser,
  findUserByEmail,
  findUserById,
  verifyPassword,
  verifyUserEmail,
  updateUser,
  createPasswordResetToken,
  resetPassword,
  addTransaction,
  getTransactions
};