// routes-mobile-api.js
const express = require('express');
const {
  findUserByEmail,
  verifyPassword,
  createUser,
  findUserById,
  findUserByToken,
  setUserAuthToken,
  clearUserAuthToken,
  generateAuthToken,
  updateUser,  
  createLoginSession,
  searchUsersByIdentifier,
  searchUsersAny,
  addContact,
  removeContact,
  listContacts,
  sendMessage,
  listThreads,
  getThreadMessages,
  markThreadRead,
  createTransfer,
  } = require('./database');
const {
  sendVerificationEmail,
} = require('./email-utils');

/* ──────────────────────────────────────────────
 *  AUTHENTICATION MIDDLEWARE
 * ────────────────────────────────────────────── */

async function requireMobileAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    const token = authHeader.substring(7);
    const user = await findUserByToken(token);

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Mobile auth middleware error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

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
      
      // Generate and store auth token
      const authToken = generateAuthToken();
      await setUserAuthToken(user.id, authToken);
      
      // Track login session
      const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
      const ipAddress = req.ip || req.connection.remoteAddress;
      
      try {
        await createLoginSession(user.id, deviceInfo, ipAddress);
      } catch (sessionErr) {
        console.error('Failed to create login session:', sessionErr);
        // Continue with login even if session tracking fails
      }
      
      // Return user data with auth token
      const userData = {
        id: user.id,
        account_number: user.account_number,
        user_name: user.user_name,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        account_balance: parseFloat(user.account_balance),
        email_verified: user.email_verified,
        avatar_path: user.avatar_path || null,
        created_date: user.created_date,
        timezone: user.timezone,
        street_address: user.street_address,
        city: user.city,
        state: user.state,
        zip: user.zip,
        gender: user.gender,
        date_of_birth: user.date_of_birth,
      };
      
      res.json({ 
        user: userData,
        authToken: authToken 
      });
      
    } catch (err) {
      console.error('Mobile login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  });
  
  /* ──────────────────────────────────────────────
   *  MOBILE LOGOUT
   * ────────────────────────────────────────────── */
  
  app.post('/api/mobile/logout', requireMobileAuth, async (req, res) => {
    try {
      await clearUserAuthToken(req.user.id);
      res.json({ ok: true, message: 'Logged out successfully' });
    } catch (err) {
      console.error('Mobile logout error:', err);
      res.status(500).json({ error: 'Logout failed' });
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
      
      // Create user
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
          errorMsg = `Signup failed: ${createErr.message}`;
        }
        return res.status(400).json({ error: errorMsg });
      }
      
      // Send verification email
      try {
        await sendVerificationEmail(email, result.verificationToken, req);
        console.log('Verification email sent to:', email);
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
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
   *  GET USER DATA (FOR REFRESH) - NOW AUTHENTICATED
   * ────────────────────────────────────────────── */
  
  app.post('/api/mobile/user', requireMobileAuth, async (req, res) => {
    try {
      // User is already loaded by middleware
      const user = req.user;
      
      const userData = {
        id: user.id,
        account_number: user.account_number,
        user_name: user.user_name,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        account_balance: parseFloat(user.account_balance),
        email_verified: user.email_verified,
        avatar_path: user.avatar_path || null,
        created_date: user.created_date,
        timezone: user.timezone,
        street_address: user.street_address,
        city: user.city,
        state: user.state,
        zip: user.zip,
        gender: user.gender,
        date_of_birth: user.date_of_birth,
      };
      
      res.json({ user: userData });
      
    } catch (err) {
      console.error('Get user error:', err);
      res.status(500).json({ error: 'Failed to get user data' });
    }
  });

  /* ──────────────────────────────────────────────
   *  USER INFORMATION (MOBILE) - AUTHENTICATED
   * ────────────────────────────────────────────── */
   
  app.post('/api/mobile/user/update', requireMobileAuth, async (req, res) => {
    try {
      const {
        first_name,
        last_name,
        user_name,
        street_address,
        city,
        state,
        zip,
        phone,
        gender,
        date_of_birth,
        timezone,
      } = req.body;

      // Build update object with only provided fields
      const updates = {};
      if (first_name !== undefined) updates.first_name = first_name;
      if (last_name !== undefined) updates.last_name = last_name;
      if (user_name !== undefined) updates.user_name = user_name;
      if (street_address !== undefined) updates.street_address = street_address;
      if (city !== undefined) updates.city = city;
      if (state !== undefined) updates.state = state;
      if (zip !== undefined) updates.zip = zip;
      if (phone !== undefined) updates.phone = phone;
      if (gender !== undefined) updates.gender = gender;
      if (date_of_birth !== undefined) updates.date_of_birth = date_of_birth;
      if (timezone !== undefined) updates.timezone = timezone;

      const success = await updateUser(req.user.id, updates);

      if (!success) {
        return res.status(404).json({ error: 'Update failed' });
      }

      res.json({ ok: true, message: 'User updated successfully' });

    } catch (err) {
      console.error('User update error:', err);
      
      if (err.code === '23505') {
        if (err.constraint === 'users_phone_key') {
          return res.status(400).json({ error: 'Phone number already in use' });
        }
        if (err.constraint === 'users_user_name_key') {
          return res.status(400).json({ error: 'Username already taken' });
        }
      }
      
      res.status(500).json({ error: 'Failed to update user' });
    }
  });
  
  /* ──────────────────────────────────────────────
 *  TRANSFERS (MOBILE) - AUTHENTICATED
 * ────────────────────────────────────────────── */

  app.post('/api/mobile/transfers/send', requireMobileAuth, async (req, res) => {
    try {
      const { recipientId, amount, note } = req.body || {};

      if (!recipientId) return res.status(400).json({ error: 'Missing recipientId' });
      if (amount == null) return res.status(400).json({ error: 'Missing amount' });

      const out = await createTransfer({
        senderId: req.user.id,
        recipientId,
        amount,
        note: note ? String(note).trim() : null,
      });

      res.json(out);
    } catch (err) {
      console.error('transfers/send error:', err);
      res.status(400).json({ error: String(err.message || 'Transfer failed') });
    }
  });


  /* ──────────────────────────────────────────────
   *  CONTACTS (MOBILE) - ALL AUTHENTICATED
   * ────────────────────────────────────────────── */

  app.post('/api/mobile/contacts/search-any', requireMobileAuth, async (req, res) => {
    try {
      const { q, value } = req.body || {};
      const term = (q != null ? q : value);

      if (!term) return res.status(400).json({ error: 'Missing search term' });

      const results = await searchUsersAny({
        value: term,
        excludeUserId: req.user.id,
        limit: 25,
      });

      res.json({ results });
    } catch (err) {
      console.error('contacts/search-any error:', err);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  app.post('/api/mobile/contacts/search', requireMobileAuth, async (req, res) => {
    try {
      const { type, value } = req.body || {};
      if (!type || !value) return res.status(400).json({ error: 'Missing type/value' });

      const results = await searchUsersByIdentifier({
        type,
        value,
        excludeUserId: req.user.id,
        limit: 25,
      });

      res.json({ results });
    } catch (err) {
      console.error('contacts/search error:', err);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  app.post('/api/mobile/contacts/list', requireMobileAuth, async (req, res) => {
    try {
      const contacts = await listContacts({ userId: req.user.id, limit: 200 });
      res.json({ contacts });
    } catch (err) {
      console.error('contacts/list error:', err);
      res.status(500).json({ error: 'List failed' });
    }
  });

  app.post('/api/mobile/contacts/add', requireMobileAuth, async (req, res) => {
    try {
      const { contactUserId, nickname } = req.body || {};
      if (!contactUserId) return res.status(400).json({ error: 'Missing contactUserId' });

      const added = await addContact({
        userId: req.user.id,
        contactUserId,
        nickname: nickname ? String(nickname).trim() : null,
      });

      res.json({ ok: true, added });
    } catch (err) {
      console.error('contacts/add error:', err);
      res.status(500).json({ error: 'Add failed' });
    }
  });

  app.post('/api/mobile/contacts/remove', requireMobileAuth, async (req, res) => {
    try {
      const { contactUserId } = req.body || {};
      if (!contactUserId) return res.status(400).json({ error: 'Missing contactUserId' });

      await removeContact({ userId: req.user.id, contactUserId });
      res.json({ ok: true });
    } catch (err) {
      console.error('contacts/remove error:', err);
      res.status(500).json({ error: 'Remove failed' });
    }
  });

  /* ──────────────────────────────────────────────
   *  MESSAGES (MOBILE) - ALL AUTHENTICATED
   * ────────────────────────────────────────────── */

  app.post('/api/mobile/messages/threads', requireMobileAuth, async (req, res) => {
    try {
      const { limit } = req.body || {};

      const threads = await listThreads({ userId: req.user.id, limit: limit || 50 });

      const hydrated = [];
      for (const t of threads) {
        const otherId = Number(t.user1_id) === Number(req.user.id) ? t.user2_id : t.user1_id;
        const other = await findUserById(otherId);
        hydrated.push({
          conversation_id: t.conversation_id,
          contact: other
            ? {
                id: other.id,
                user_name: other.user_name,          
                first_name: other.first_name,
                last_name: other.last_name,
                email: other.email,
                avatar_path: other.avatar_path || null, 
              }
            : { id: otherId },
          last: {
            id: t.last_message_id,
            sender_id: t.last_sender_id,
            type: t.last_message_type,
            content: t.last_content,
            attachment_path: t.last_attachment_path,
            sent_date: t.last_sent_date,
          },
        });
      }

      res.json({ threads: hydrated });
    } catch (err) {
      console.error('messages/threads error:', err);
      res.status(500).json({ error: 'Failed to load threads' });
    }
  });

  app.post('/api/mobile/messages/thread', requireMobileAuth, async (req, res) => {
    try {
      const { contactUserId, limit, beforeId } = req.body || {};
      if (!contactUserId) return res.status(400).json({ error: 'Missing contactUserId' });

      const out = await getThreadMessages({
        requesterId: req.user.id,
        contactUserId,
        limit: limit || 50,
        beforeId: beforeId || null,
      });

      res.json(out);
    } catch (err) {
      console.error('messages/thread error:', err);
      res.status(500).json({ error: 'Failed to load thread' });
    }
  });

  app.post('/api/mobile/messages/send', requireMobileAuth, async (req, res) => {
    try {
      const {
        recipientId,
        content,
        attachmentPath,
        attachmentMime,
        attachmentSize,
        attachmentOriginalName,
      } = req.body || {};

      if (!recipientId) return res.status(400).json({ error: 'Missing recipientId' });

      if (!content && !attachmentPath) {
        return res.status(400).json({ error: 'Message must have content or attachment' });
      }

      const msg = await sendMessage({
        senderId: req.user.id,
        recipientId,
        content: content != null ? String(content) : null,
        attachmentPath: attachmentPath || null,
        attachmentMime: attachmentMime || null,
        attachmentSize: attachmentSize || null,
        attachmentOriginalName: attachmentOriginalName || null,
      });

      res.json({ message: msg });
    } catch (err) {
      console.error('messages/send error:', err);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  app.post('/api/mobile/messages/mark-read', requireMobileAuth, async (req, res) => {
    try {
      const { conversationId } = req.body || {};
      if (!conversationId) return res.status(400).json({ error: 'Missing conversationId' });

      const ok = await markThreadRead({ requesterId: req.user.id, conversationId });
      res.json(ok);
    } catch (err) {
      console.error('messages/mark-read error:', err);
      res.status(500).json({ error: 'Failed to mark read' });
    }
  });
}

module.exports = { registerMobileApiRoutes };