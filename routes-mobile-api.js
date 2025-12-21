// routes-mobile-api.js
const express = require('express');
const {
  findUserByEmail,
  verifyPassword,
  createUser,
  findUserById,
  createLoginSession,
} = require('./database');
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
      
      // Track login session
      const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
      const ipAddress = req.ip || req.connection.remoteAddress;
      
      try {
        await createLoginSession(user.id, deviceInfo, ipAddress);
      } catch (sessionErr) {
        console.error('Failed to create login session:', sessionErr);
        // Continue with login even if session tracking fails
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
        account_balance: parseFloat(user.account_balance),
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
      console.log('Signup endpoint hit - req.body:', req.body);
      
      const {
        firstName, lastName, user_name, streetAddress, city, state, zip,
        phone, email, password, confirmPassword, gender, dateOfBirth
      } = req.body;
      
      // Validation
      if (!firstName || !lastName || !user_name || !streetAddress || !city || !state || !zip || !phone || !email || !password) {
        console.log('Missing required fields:', {
          firstName: !!firstName,
          lastName: !!lastName,
          user_name: !!user_name,
          streetAddress: !!streetAddress,
          city: !!city,
          state: !!state,
          zip: !!zip,
          phone: !!phone,
          email: !!email,
          password: !!password
        });
        return res.status(400).json({ error: 'All fields are required' });
      }
      
      // Validate username format
      if (!/^@[a-zA-Z0-9_#$%^&*()\-+=.]{1,20}$/.test(user_name)) {
        console.log('Invalid username format:', user_name);
        return res.status(400).json({ 
          error: 'Username must start with @ and can contain letters, numbers, and special characters (#$%^&*()-+=_.)' 
        });
      }
      
      if (password !== confirmPassword) {
        console.log('Passwords do not match');
        return res.status(400).json({ error: 'Passwords do not match' });
      }
      
      if (password.length < 8) {
        console.log('Password too short');
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      
      console.log('Attempting to create user with user_name:', user_name);
      
      // Create user - this will throw error if phone/email/username already exists
      let result;
      try {
        result = await createUser({
          firstName, 
          lastName, 
          user_name,
          streetAddress, 
          city, 
          state, 
          zip,
          phone, 
          email, 
          password,
          gender,
          dateOfBirth
        });
        
        console.log('User created successfully:', result.accountNumber);
      } catch (createErr) {
        console.error('createUser error:', createErr.message);
        
        // Handle specific database errors
        let errorMsg = 'Signup failed';
        if (createErr.message.includes('Phone number already registered')) {
          errorMsg = 'This phone number is already registered. Please use a different phone number or log in.';
        } else if (createErr.message.includes('Email already registered')) {
          errorMsg = 'This email is already registered. Please use a different email or log in.';
        } else if (createErr.message.includes('user_name') && createErr.message.includes('already exists')) {
          errorMsg = 'This username is already taken. Please choose a different username.';
        } else if (createErr.message.includes('already registered')) {
          errorMsg = createErr.message;
        } else {
          // Return the actual error for debugging
          errorMsg = `Signup failed: ${createErr.message}`;
        }
        return res.status(400).json({ error: errorMsg });
      }
      
      // User created successfully - now send verification email
      try {
        await sendVerificationEmail(email, result.verificationToken, req);
        console.log('Verification email sent to:', email);
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Continue anyway - user is created, just email failed
      }
      
      res.json({ 
        message: 'Account created! Please check your email to verify your account.',
        accountNumber: result.accountNumber
      });
      
    } catch (err) {
      console.error('Mobile signup error:', err);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
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
        account_balance: parseFloat(user.account_balance),
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