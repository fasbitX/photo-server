// email-utils.js
const nodemailer = require('nodemailer');

/* ──────────────────────────────────────────────
 *  EMAIL TRANSPORTER SETUP
 * ────────────────────────────────────────────── */

function createTransporter() {
  const SMTP_HOST = process.env.SMTP_HOST || '';
  const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
  const SMTP_USER = process.env.SMTP_USER || '';
  const SMTP_PASS = process.env.SMTP_PASS || '';

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP settings not configured in .env file. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

/* ──────────────────────────────────────────────
 *  SEND EMAIL VERIFICATION
 * ────────────────────────────────────────────── */

async function sendVerificationEmail(email, verificationToken, req) {
  try {
    const transporter = createTransporter();
    const verifyUrl = `${req.protocol}://${req.get('host')}/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
      from: `"Fasbit Support" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Verify Your Email - Fasbit',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Fasbit!</h1>
            </div>
            <div class="content">
              <h2>Verify Your Email Address</h2>
              <p>Thank you for signing up! Please click the button below to verify your email address and activate your account.</p>
              <div style="text-align: center;">
                <a href="${verifyUrl}" class="button">Verify Email Address</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${verifyUrl}</p>
              <p><strong>This link will expire in 24 hours.</strong></p>
            </div>
            <div class="footer">
              <p>If you didn't create an account with Fasbit, please ignore this email.</p>
              <p>&copy; ${new Date().getFullYear()} Fasbit. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Welcome to Fasbit!

Please verify your email address by clicking the link below:

${verifyUrl}

This link will expire in 24 hours.

If you didn't create an account with Fasbit, please ignore this email.

© ${new Date().getFullYear()} Fasbit. All rights reserved.
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
}

/* ──────────────────────────────────────────────
 *  SEND PASSWORD RESET EMAIL
 * ────────────────────────────────────────────── */

async function sendPasswordResetEmail(email, resetToken, req) {
  try {
    const transporter = createTransporter();
    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: `"Fasbit Support" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Password Reset Request - Fasbit',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <h2>Reset Your Password</h2>
              <p>We received a request to reset your password. Click the button below to create a new password.</p>
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
              <div class="warning">
                <strong>⚠️ Security Notice:</strong>
                <p>This link will expire in 1 hour. If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
              </div>
            </div>
            <div class="footer">
              <p>For security reasons, never share this link with anyone.</p>
              <p>&copy; ${new Date().getFullYear()} Fasbit. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Password Reset Request

We received a request to reset your password. Click the link below to create a new password:

${resetUrl}

This link will expire in 1 hour.

If you didn't request this password reset, please ignore this email and your password will remain unchanged.

For security reasons, never share this link with anyone.

© ${new Date().getFullYear()} Fasbit. All rights reserved.
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}

/* ──────────────────────────────────────────────
 *  EXPORTS
 * ────────────────────────────────────────────── */

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};