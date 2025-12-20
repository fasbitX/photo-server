// routes-mobile-api.js
const express = require('express');
const {
  findUserByEmail,
  verifyPassword,
  createUser,
  findUserById,
} = require('./db-users');
const {
  sendVerificationEmail,
} = require('./email-utils');

function registerMobileApiRoutes(app) {
  
  /* ──────────────────────────────────────────────
   *  MOBILE LOGIN
   * ────────────────────────────────────────────── */
  
  app.post('/api/mobile/login', express.json(), async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }
      
      const user = await findUserByEmail(email);
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      const isValid = await verifyPassword(password, user.password_hash);
      
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      if (!user.email_verified) {
        return res.status(403).json({ error: 'Please verify your email before logging in' });
      }
      
      // Return user data (without password hash)
      const userData = {
        id: user.id,
        account_number: user.account_number,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        account_balance: user.account_balance,
        email_verified: user.email_verified,
      };
      
      res.json({ user: userData });
      
    } catch (err) {
      console.error('Mobile login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });
  
  /* ──────────────────────────────────────────────
   *  MOBILE SIGNUP
   * ────────────────────────────────────────────── */
  
  app.post('/api/mobile/signup', express.json(), async (req, res) => {
    try {
      const {
        firstName, lastName, streetAddress, city, state, zip,
        phone, email, password, confirmPassword
      } = req.body;
      
      // Validation
      if (!firstName || !lastName || !streetAddress || !city || !state || !zip || !phone || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      
      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
      }
      
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      
      // Create user
      const result = await createUser({
        firstName, lastName, streetAddress, city, state, zip,
        phone, email, password
      });
      
      // Send verification email
      try {
        await sendVerificationEmail(email, result.verificationToken, req);
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Continue anyway - user is created
      }
      
      res.json({ 
        message: 'Account created! Please check your email to verify your account.',
        accountNumber: result.accountNumber
      });
      
    } catch (err) {
      console.error('Mobile signup error:', err);
      let errorMsg = 'Signup failed';
      if (err.message.includes('already registered')) {
        errorMsg = err.message;
      }
      res.status(400).json({ error: errorMsg });
    }
  });
  
  /* ──────────────────────────────────────────────
   *  GET USER DATA (FOR REFRESH)
   * ────────────────────────────────────────────── */
  
  app.post('/api/mobile/user', express.json(), async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }
      
      const user = await findUserByEmail(email);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const userData = {
        id: user.id,
        account_number: user.account_number,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        account_balance: user.account_balance,
        email_verified: user.email_verified,
      };
      
      res.json({ user: userData });
      
    } catch (err) {
      console.error('Get user error:', err);
      res.status(500).json({ error: 'Failed to get user data' });
    }
  });
}

module.exports = { registerMobileApiRoutes };