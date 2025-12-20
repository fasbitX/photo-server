// routes-auth.js
const express = require('express');
const {
  createUser,
  findUserByEmail,
  verifyPassword,
  verifyUserEmail,
  createPasswordResetToken,
  resetPassword
} = require('./database');
const {
  sendVerificationEmail,
  sendPasswordResetEmail
} = require('./email-utils');

function registerAuthRoutes(app) {
  
  /* ──────────────────────────────────────────────
   *  HOME PAGE (PUBLIC)
   * ────────────────────────────────────────────── */
  
  app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
      return res.redirect('/dashboard');
    }
    res.send(renderHomePage());
  });
  
  /* ──────────────────────────────────────────────
   *  LOGIN
   * ────────────────────────────────────────────── */
  
  app.get('/login', (req, res) => {
    if (req.session && req.session.userId) {
      return res.redirect('/dashboard');
    }
    res.send(renderLoginPage());
  });
  
  app.post('/login', express.urlencoded({ extended: true }), async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.send(renderLoginPage('Please enter email and password'));
      }
      
      const user = await findUserByEmail(email);
      
      if (!user) {
        return res.send(renderLoginPage('Invalid email or password'));
      }
      
      const isValid = await verifyPassword(password, user.password_hash);
      
      if (!isValid) {
        return res.send(renderLoginPage('Invalid email or password'));
      }
      
      if (!user.email_verified) {
        return res.send(renderLoginPage('Please verify your email before logging in'));
      }
      
      req.session.userId = user.id;
      req.session.accountNumber = user.account_number;
      req.session.save(() => {
        res.redirect('/dashboard');
      });
      
    } catch (err) {
      console.error('Login error:', err);
      res.send(renderLoginPage('An error occurred. Please try again.'));
    }
  });
  
  /* ──────────────────────────────────────────────
   *  SIGNUP
   * ────────────────────────────────────────────── */
  
  app.get('/signup', (req, res) => {
    if (req.session && req.session.userId) {
      return res.redirect('/dashboard');
    }
    res.send(renderSignupPage());
  });
  
  app.post('/signup', express.urlencoded({ extended: true }), async (req, res) => {
    try {
      const {
        firstName, lastName, streetAddress, city, state, zip,
        phone, email, password, confirmPassword
      } = req.body;
      
      // Validation
      if (!firstName || !lastName || !streetAddress || !city || !state || !zip || !phone || !email || !password) {
        return res.send(renderSignupPage('All fields are required', req.body));
      }
      
      if (password !== confirmPassword) {
        return res.send(renderSignupPage('Passwords do not match', req.body));
      }
      
      if (password.length < 8) {
        return res.send(renderSignupPage('Password must be at least 8 characters', req.body));
      }
      
      // Create user
      const result = await createUser({
        firstName, lastName, streetAddress, city, state, zip,
        phone, email, password
      });
      
      // Send verification email
      try {
        await sendVerificationEmail(email, result.verificationToken, req);
        res.send(renderVerificationPending(email, null)); // null means don't show test link
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Still show success but with test link since email failed
        const verifyUrl = `${req.protocol}://${req.get('host')}/verify-email?token=${result.verificationToken}`;
        res.send(renderVerificationPending(email, verifyUrl, 'Email sending failed. Use the link below to verify.'));
      }
      
    } catch (err) {
      console.error('Signup error:', err);
      let errorMsg = 'An error occurred. Please try again.';
      if (err.message.includes('already registered')) {
        errorMsg = err.message;
      }
      res.send(renderSignupPage(errorMsg, req.body));
    }
  });
  
  /* ──────────────────────────────────────────────
   *  EMAIL VERIFICATION
   * ────────────────────────────────────────────── */
  
  app.get('/verify-email', async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token) {
        return res.send(renderMessage('Invalid Verification Link', 'The verification link is invalid.'));
      }
      
      const verified = await verifyUserEmail(token);
      
      if (!verified) {
        return res.send(renderMessage('Verification Failed', 'Invalid or expired verification token.'));
      }
      
      res.send(renderMessage('Email Verified!', 'Your email has been verified. You can now <a href="/login">log in</a>.'));
      
    } catch (err) {
      console.error('Verification error:', err);
      res.send(renderMessage('Error', 'An error occurred during verification.'));
    }
  });
  
  /* ──────────────────────────────────────────────
   *  PASSWORD RESET
   * ────────────────────────────────────────────── */
  
  app.get('/forgot-password', (req, res) => {
    res.send(renderForgotPasswordPage());
  });
  
  app.post('/forgot-password', express.urlencoded({ extended: true }), async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.send(renderForgotPasswordPage('Please enter your email'));
      }
      
      const token = await createPasswordResetToken(email);
      
      // Send password reset email
      try {
        await sendPasswordResetEmail(email, token, req);
        res.send(renderMessage('Reset Link Sent', 'A password reset link has been sent to your email address. Please check your inbox.'));
      } catch (emailError) {
        console.error('Failed to send reset email:', emailError);
        // Still show test link since email failed
        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;
        res.send(renderMessage('Email Error', `Failed to send email. Use this link to reset: <a href="${resetUrl}">${resetUrl}</a>`));
      }
      
    } catch (err) {
      console.error('Forgot password error:', err);
      // Don't reveal if email exists or not
      res.send(renderMessage('Reset Link Sent', 'If an account exists with that email, a reset link has been sent.'));
    }
  });
  
  app.get('/reset-password', (req, res) => {
    const { token } = req.query;
    if (!token) {
      return res.redirect('/forgot-password');
    }
    res.send(renderResetPasswordPage(token));
  });
  
  app.post('/reset-password', express.urlencoded({ extended: true }), async (req, res) => {
    try {
      const { token, password, confirmPassword } = req.body;
      
      if (!password || !confirmPassword) {
        return res.send(renderResetPasswordPage(token, 'Please enter password'));
      }
      
      if (password !== confirmPassword) {
        return res.send(renderResetPasswordPage(token, 'Passwords do not match'));
      }
      
      if (password.length < 8) {
        return res.send(renderResetPasswordPage(token, 'Password must be at least 8 characters'));
      }
      
      await resetPassword(token, password);
      
      res.send(renderMessage('Password Reset', 'Your password has been reset. You can now <a href="/login">log in</a>.'));
      
    } catch (err) {
      console.error('Reset password error:', err);
      res.send(renderResetPasswordPage(req.body.token, 'Invalid or expired reset token'));
    }
  });
  
  /* ──────────────────────────────────────────────
   *  LOGOUT
   * ────────────────────────────────────────────── */
  
  app.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
}

/* ──────────────────────────────────────────────
 *  HTML TEMPLATES
 * ────────────────────────────────────────────── */

function getBaseStyles() {
  return `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #333;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .container {
        background: white;
        padding: 40px;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        width: 100%;
        max-width: 500px;
      }
      h1 { margin-bottom: 10px; font-size: 28px; color: #667eea; }
      h2 { margin-bottom: 20px; font-size: 20px; color: #666; }
      p { margin-bottom: 15px; line-height: 1.6; }
      .form-group { margin-bottom: 20px; }
      label { display: block; margin-bottom: 6px; font-weight: 500; color: #555; }
      input, select {
        width: 100%;
        padding: 12px;
        border: 2px solid #e0e0e0;
        border-radius: 6px;
        font-size: 14px;
        transition: border 0.3s;
      }
      input:focus, select:focus {
        outline: none;
        border-color: #667eea;
      }
      button {
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
      }
      button:active {
        transform: translateY(0);
      }
      .link {
        text-align: center;
        margin-top: 20px;
        color: #666;
      }
      .link a {
        color: #667eea;
        text-decoration: none;
        font-weight: 500;
      }
      .link a:hover {
        text-decoration: underline;
      }
      .error {
        background: #fee;
        color: #c33;
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 16px;
        font-size: 14px;
        border: 1px solid #fcc;
      }
      .success {
        background: #efe;
        color: #2a7;
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 16px;
        font-size: 14px;
        border: 1px solid #cfc;
      }
      .row { display: flex; gap: 12px; }
      .row .form-group { flex: 1; }
    </style>
  `;
}

function renderHomePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fasbit - Secure Photo Sharing</title>
  ${getBaseStyles()}
</head>
<body>
  <div class="container">
    <h1>Welcome to Fasbit</h1>
    <p>Secure photo sharing and account management</p>
    <div style="margin-top: 30px;">
      <a href="/login"><button>Log In</button></a>
      <div class="link">
        Don't have an account? <a href="/signup">Sign Up</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function renderLoginPage(error = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - Fasbit</title>
  ${getBaseStyles()}
</head>
<body>
  <div class="container">
    <h1>Log In</h1>
    <h2>Welcome back</h2>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/login">
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" required autofocus>
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" name="password" required>
      </div>
      <button type="submit">Log In</button>
    </form>
    <div class="link">
      <a href="/forgot-password">Forgot password?</a>
    </div>
    <div class="link">
      Don't have an account? <a href="/signup">Sign Up</a>
    </div>
  </div>
</body>
</html>`;
}

function renderSignupPage(error = '', formData = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign Up - Fasbit</title>
  ${getBaseStyles()}
</head>
<body>
  <div class="container">
    <h1>Create Account</h1>
    <h2>Join Fasbit today</h2>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/signup">
      <div class="row">
        <div class="form-group">
          <label>First Name</label>
          <input type="text" name="firstName" value="${formData.firstName || ''}" required>
        </div>
        <div class="form-group">
          <label>Last Name</label>
          <input type="text" name="lastName" value="${formData.lastName || ''}" required>
        </div>
      </div>
      
      <div class="form-group">
        <label>Street Address</label>
        <input type="text" name="streetAddress" value="${formData.streetAddress || ''}" required>
      </div>
      
      <div class="row">
        <div class="form-group">
          <label>City</label>
          <input type="text" name="city" value="${formData.city || ''}" required>
        </div>
        <div class="form-group">
          <label>State</label>
          <select name="state" required>
            <option value="">Select...</option>
            <option value="VT" ${formData.state === 'VT' ? 'selected' : ''}>Vermont</option>
            <option value="AL" ${formData.state === 'AL' ? 'selected' : ''}>Alabama</option>
            <option value="AK" ${formData.state === 'AK' ? 'selected' : ''}>Alaska</option>
            <option value="AZ" ${formData.state === 'AZ' ? 'selected' : ''}>Arizona</option>
            <option value="AR" ${formData.state === 'AR' ? 'selected' : ''}>Arkansas</option>
            <option value="CA" ${formData.state === 'CA' ? 'selected' : ''}>California</option>
            <option value="CO" ${formData.state === 'CO' ? 'selected' : ''}>Colorado</option>
            <option value="CT" ${formData.state === 'CT' ? 'selected' : ''}>Connecticut</option>
            <option value="DE" ${formData.state === 'DE' ? 'selected' : ''}>Delaware</option>
            <option value="FL" ${formData.state === 'FL' ? 'selected' : ''}>Florida</option>
            <option value="GA" ${formData.state === 'GA' ? 'selected' : ''}>Georgia</option>
            <option value="HI" ${formData.state === 'HI' ? 'selected' : ''}>Hawaii</option>
            <option value="ID" ${formData.state === 'ID' ? 'selected' : ''}>Idaho</option>
            <option value="IL" ${formData.state === 'IL' ? 'selected' : ''}>Illinois</option>
            <option value="IN" ${formData.state === 'IN' ? 'selected' : ''}>Indiana</option>
            <option value="IA" ${formData.state === 'IA' ? 'selected' : ''}>Iowa</option>
            <option value="KS" ${formData.state === 'KS' ? 'selected' : ''}>Kansas</option>
            <option value="KY" ${formData.state === 'KY' ? 'selected' : ''}>Kentucky</option>
            <option value="LA" ${formData.state === 'LA' ? 'selected' : ''}>Louisiana</option>
            <option value="ME" ${formData.state === 'ME' ? 'selected' : ''}>Maine</option>
            <option value="MD" ${formData.state === 'MD' ? 'selected' : ''}>Maryland</option>
            <option value="MA" ${formData.state === 'MA' ? 'selected' : ''}>Massachusetts</option>
            <option value="MI" ${formData.state === 'MI' ? 'selected' : ''}>Michigan</option>
            <option value="MN" ${formData.state === 'MN' ? 'selected' : ''}>Minnesota</option>
            <option value="MS" ${formData.state === 'MS' ? 'selected' : ''}>Mississippi</option>
            <option value="MO" ${formData.state === 'MO' ? 'selected' : ''}>Missouri</option>
            <option value="MT" ${formData.state === 'MT' ? 'selected' : ''}>Montana</option>
            <option value="NE" ${formData.state === 'NE' ? 'selected' : ''}>Nebraska</option>
            <option value="NV" ${formData.state === 'NV' ? 'selected' : ''}>Nevada</option>
            <option value="NH" ${formData.state === 'NH' ? 'selected' : ''}>New Hampshire</option>
            <option value="NJ" ${formData.state === 'NJ' ? 'selected' : ''}>New Jersey</option>
            <option value="NM" ${formData.state === 'NM' ? 'selected' : ''}>New Mexico</option>
            <option value="NY" ${formData.state === 'NY' ? 'selected' : ''}>New York</option>
            <option value="NC" ${formData.state === 'NC' ? 'selected' : ''}>North Carolina</option>
            <option value="ND" ${formData.state === 'ND' ? 'selected' : ''}>North Dakota</option>
            <option value="OH" ${formData.state === 'OH' ? 'selected' : ''}>Ohio</option>
            <option value="OK" ${formData.state === 'OK' ? 'selected' : ''}>Oklahoma</option>
            <option value="OR" ${formData.state === 'OR' ? 'selected' : ''}>Oregon</option>
            <option value="PA" ${formData.state === 'PA' ? 'selected' : ''}>Pennsylvania</option>
            <option value="RI" ${formData.state === 'RI' ? 'selected' : ''}>Rhode Island</option>
            <option value="SC" ${formData.state === 'SC' ? 'selected' : ''}>South Carolina</option>
            <option value="SD" ${formData.state === 'SD' ? 'selected' : ''}>South Dakota</option>
            <option value="TN" ${formData.state === 'TN' ? 'selected' : ''}>Tennessee</option>
            <option value="TX" ${formData.state === 'TX' ? 'selected' : ''}>Texas</option>
            <option value="UT" ${formData.state === 'UT' ? 'selected' : ''}>Utah</option>
            <option value="VT" ${formData.state === 'VT' ? 'selected' : ''}>Vermont</option>
            <option value="VA" ${formData.state === 'VA' ? 'selected' : ''}>Virginia</option>
            <option value="WA" ${formData.state === 'WA' ? 'selected' : ''}>Washington</option>
            <option value="WV" ${formData.state === 'WV' ? 'selected' : ''}>West Virginia</option>
            <option value="WI" ${formData.state === 'WI' ? 'selected' : ''}>Wisconsin</option>
            <option value="WY" ${formData.state === 'WY' ? 'selected' : ''}>Wyoming</option>
          </select>
        </div>
        <div class="form-group" style="max-width: 120px;">
          <label>ZIP</label>
          <input type="text" name="zip" value="${formData.zip || ''}" pattern="[0-9]{5}" required>
        </div>
      </div>
      
      <div class="form-group">
        <label>Phone Number</label>
        <input type="tel" name="phone" value="${formData.phone || ''}" placeholder="(123) 456-7890" required>
      </div>
      
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" value="${formData.email || ''}" required>
      </div>
      
      <div class="form-group">
        <label>Password (min 8 characters)</label>
        <input type="password" name="password" minlength="8" required>
      </div>
      
      <div class="form-group">
        <label>Confirm Password</label>
        <input type="password" name="confirmPassword" minlength="8" required>
      </div>
      
      <button type="submit">Create Account</button>
    </form>
    <div class="link">
      Already have an account? <a href="/login">Log In</a>
    </div>
  </div>
</body>
</html>`;
}

function renderVerificationPending(email, verifyUrl = null, errorMsg = null) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Email - Fasbit</title>
  ${getBaseStyles()}
</head>
<body>
  <div class="container">
    <h1>Verify Your Email</h1>
    <div class="success">
      Account created successfully!
    </div>
    ${errorMsg ? `<div class="error">${errorMsg}</div>` : ''}
    <p>We've sent a verification link to <strong>${email}</strong></p>
    <p>Please check your inbox and click the link to verify your account.</p>
    ${verifyUrl ? `
    <p style="margin-top: 20px; font-size: 14px; color: #999;">
      For testing: <a href="${verifyUrl}">Click here to verify</a>
    </p>
    ` : ''}
    <div class="link">
      <a href="/login">Back to Login</a>
    </div>
  </div>
</body>
</html>`;
}

function renderForgotPasswordPage(error = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forgot Password - Fasbit</title>
  ${getBaseStyles()}
</head>
<body>
  <div class="container">
    <h1>Reset Password</h1>
    <h2>Enter your email to receive a reset link</h2>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/forgot-password">
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" required autofocus>
      </div>
      <button type="submit">Send Reset Link</button>
    </form>
    <div class="link">
      <a href="/login">Back to Login</a>
    </div>
  </div>
</body>
</html>`;
}

function renderResetPasswordPage(token, error = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password - Fasbit</title>
  ${getBaseStyles()}
</head>
<body>
  <div class="container">
    <h1>Reset Password</h1>
    <h2>Enter your new password</h2>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/reset-password">
      <input type="hidden" name="token" value="${token}">
      <div class="form-group">
        <label>New Password (min 8 characters)</label>
        <input type="password" name="password" minlength="8" required autofocus>
      </div>
      <div class="form-group">
        <label>Confirm Password</label>
        <input type="password" name="confirmPassword" minlength="8" required>
      </div>
      <button type="submit">Reset Password</button>
    </form>
  </div>
</body>
</html>`;
}

function renderMessage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Fasbit</title>
  ${getBaseStyles()}
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="link">
      <a href="/">Home</a>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { registerAuthRoutes };