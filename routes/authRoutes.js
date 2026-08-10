const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const sendVerificationCode = require('../utils/sendEmail');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'prasatek_secret_key_123_abc', {
    expiresIn: '30d'
  });
};

// @route   GET /api/auth/test-email-status
// @desc    Diagnostic test route to verify live Resend API email sending on Render server
router.get('/test-email-status', async (req, res) => {
  try {
    const testRecipient = req.query.email || 'info@prasatek.lk';
    const result = await sendVerificationCode(testRecipient, '999888');
    return res.status(200).json({
      success: true,
      message: 'Resend API test email sent successfully from server!',
      result: result,
      envCheck: {
        hasResendApiKey: !!process.env.RESEND_API_KEY
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Resend API Email Error on Server',
      error: error.message,
      stack: error.stack,
      envCheck: {
        hasResendApiKey: !!process.env.RESEND_API_KEY
      }
    });
  }
});

// @route   POST /api/auth/register
// @desc    Register a new user and send verification OTP
router.post('/register', async (req, res) => {
  const { name, email, password, mobile } = req.body;

  try {
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please fill in name, email, and password' });
    }

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Encrypt password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    let role = 'user';

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      mobile: mobile || '',
      role,
      plan: 'free',
      planType: 'none',
      planStatus: 'active',
      isVerified: false,
      verificationCode: otp,
      codeExpiresAt: otpExpires,
      authProvider: 'local'
    });

    // Dispatch email via Zoho SMTP
    try {
      await sendVerificationCode(user.email, otp);
    } catch (emailError) {
      console.error('Failed to send verification email on register:', emailError);
    }

    res.status(201).json({
      message: 'Registration successful! Verification code sent to your email.',
      email: user.email,
      requiresVerification: true,
      isVerified: false
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// @route   POST /api/auth/verify
// @desc    Verify user email with OTP code
router.post('/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and verification code are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.isVerified) {
      const userObj = user.toObject();
      delete userObj.password;
      return res.status(200).json({
        message: 'Email verified successfully!',
        ...userObj,
        token: generateToken(user._id)
      });
    }

    // Validate OTP correctness and expiration time
    const expiresAt = user.codeExpiresAt || user.verificationCodeExpires;
    const isNotExpired = expiresAt && new Date(expiresAt).getTime() > Date.now();

    if (user.verificationCode && user.verificationCode.toString().trim() === code.toString().trim() && isNotExpired) {
      user.isVerified = true;
      user.verificationCode = undefined;
      user.codeExpiresAt = undefined;
      user.verificationCodeExpires = undefined;
      await user.save();

      const userObj = user.toObject();
      delete userObj.password;

      return res.status(200).json({
        message: 'Email verified successfully!',
        ...userObj,
        token: generateToken(user._id)
      });
    } else {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }
  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({ message: 'Internal server error.', error: error.message });
  }
});

// @route   POST /api/auth/resend-verification
// @desc    Resend OTP verification code
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Email is already verified.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = otp;
    user.codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendVerificationCode(user.email, otp);

    return res.status(200).json({ message: 'A new verification code has been sent to your email.' });
  } catch (error) {
    console.error('Resend verification code error:', error);
    return res.status(500).json({ message: 'Failed to send verification code.', error: error.message });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'Your account is suspended' });
    }

    // Check Maintenance Mode safely
    try {
      const SystemSetting = require('../models/SystemSetting');
      const maintenance = await SystemSetting.findOne({ key: 'maintenance_mode' });
      if (maintenance && maintenance.value === true && user.role !== 'admin') {
        return res.status(503).json({ 
          message: 'System is currently undergoing scheduled maintenance. Non-admin logins are disabled.',
          maintenanceMode: true 
        });
      }
    } catch (settingErr) {
      console.error('Safe maintenance check error in login:', settingErr.message);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Update last login
    user.lastLoginAt = Date.now();
    await user.save();

    const userObj = user.toObject();
    delete userObj.password;
    res.json({
      ...userObj,
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login' });
  }
});

// @route   GET /api/auth/me
// @desc    Get user profile
router.get('/me', protect, async (req, res) => {
  res.json(req.user);
});

// @route   PUT /api/auth/mobile
// @desc    Update mobile number
router.put('/mobile', protect, async (req, res) => {
  const { mobile } = req.body;
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.mobile = mobile;
      const updatedUser = await user.save();
      const userObj = updatedUser.toObject();
      delete userObj.password;
      res.json(userObj);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/auth/budget
// @desc    Update monthly budget limit
router.put('/budget', protect, async (req, res) => {
  const { monthlyBudgetLimit } = req.body;
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.monthlyBudgetLimit = Number(monthlyBudgetLimit);
      const updatedUser = await user.save();
      const userObj = updatedUser.toObject();
      delete userObj.password;
      res.json(userObj);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/google
// @desc    Authenticate with Google
router.post('/google', async (req, res) => {
  const { credential, accessToken } = req.body;

  try {
    let email, name, picture;

    if (credential) {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
    } else if (accessToken) {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) {
        return res.status(401).json({ message: 'Failed to verify Google access token' });
      }
      const data = await response.json();
      email = data.email;
      name = data.name;
      picture = data.picture;
    } else {
      return res.status(400).json({ message: 'Missing Google verification token' });
    }

    let user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      if (user.status === 'suspended') {
        return res.status(403).json({ message: 'Your account is suspended' });
      }
      user.lastLoginAt = Date.now();
      if (picture) user.picture = picture;
      await user.save();
    } else {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(Math.random().toString(36), salt);
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

      const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      user = await User.create({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        mobile: '', // Forces mobile entry on UI
        picture: picture || '',
        role: 'user',
        status: 'active',
        org: 'default',
        plan: 'free',
        planType: 'none',
        planStatus: 'active',
        isVerified: false,
        verificationCode,
        codeExpiresAt: otpExpires,
        verificationCodeExpires: otpExpires,
        authProvider: 'google'
      });
    }

    if (!user.isVerified) {
      const expiresAt = user.codeExpiresAt || user.verificationCodeExpires;
      if (!user.verificationCode || !expiresAt || new Date(expiresAt).getTime() < Date.now()) {
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        user.verificationCode = verificationCode;
        user.codeExpiresAt = otpExpires;
        user.verificationCodeExpires = otpExpires;
        await user.save();
      }

      try {
        await sendVerificationCode(user.email, user.verificationCode);
      } catch (eErr) {
        console.error('Failed to send Google verification code email:', eErr.message);
      }

      return res.json({
        requiresVerification: true,
        email: user.email,
        message: 'Verification code sent to your Gmail address. Please check your inbox.'
      });
    }

    const userObj = user.toObject();
    delete userObj.password;
    res.json({
      ...userObj,
      token: generateToken(user._id)
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(401).json({ message: 'Google authentication failed' });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update profile info (name, photo)
router.put('/profile', protect, async (req, res) => {
  const { name, profilePhoto } = req.body;
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// @route   PUT /api/auth/password
// @desc    Update password
router.put('/password', protect, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  try {
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Please provide old and new passwords' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect old password' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating password' });
  }
});

// @route   PUT /api/auth/settings
// @desc    Update settings (theme, currency, notifications)
router.put('/settings', protect, async (req, res) => {
  const { theme, currency, notificationsEnabled } = req.body;
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (theme) {
      if (theme === 'forest' && !['pro', 'enterprise'].includes(user.plan)) {
        return res.status(403).json({ message: 'Forest Emerald theme is a Pro / Enterprise feature. Please upgrade.' });
      }
      if (['nordic', 'cyberpunk'].includes(theme) && user.plan !== 'enterprise') {
        return res.status(403).json({ message: 'Nordic Frost and Cyberpunk themes are Enterprise features. Please upgrade.' });
      }
      user.theme = theme;
    }
    if (currency) user.currency = currency;
    if (notificationsEnabled !== undefined) user.notificationsEnabled = notificationsEnabled;

    const updatedUser = await user.save();
    const userObj = updatedUser.toObject();
    delete userObj.password;
    res.json(userObj);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating settings' });
  }
});

// @route   PUT /api/auth/plan
// @desc    Upgrade / change plan
router.put('/plan', protect, async (req, res) => {
  const { plan, billingCycle } = req.body;
  try {
    if (!['free', 'pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan selected' });
    }
    if (billingCycle && !['monthly', 'yearly', 'none'].includes(billingCycle)) {
      return res.status(400).json({ message: 'Invalid billing cycle selected' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.plan = plan;
    user.planType = billingCycle || (plan === 'free' ? 'none' : 'monthly');
    user.planStatus = 'active';
    user.planStartDate = new Date();
    
    // Set plan expiry date
    if (user.planType === 'yearly') {
      user.planExpiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    } else if (user.planType === 'monthly') {
      user.planExpiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else {
      user.planExpiryDate = new Date(Date.now() + 36500 * 24 * 60 * 60 * 1000); // 100 years for free plan
    }

    const updatedUser = await user.save();

    // Create a notification for subscription changes
    const Notification = require('../models/Notification');
    await Notification.create({
      userId: user._id,
      title: 'Subscription Activated',
      message: `Your account has been upgraded to the ${plan.toUpperCase()} (${user.planType}) plan. Thank you for subscribing!`,
      type: 'expiry'
    });

    // Create a subscription log
    const Subscription = require('../models/Subscription');
    
    // Pricing details: Pro (199 / 1900), Enterprise (499 / 4900), Free (0)
    let amount = 0;
    if (plan === 'pro') {
      amount = user.planType === 'yearly' ? 1900 : 199;
    } else if (plan === 'enterprise') {
      amount = user.planType === 'yearly' ? 4900 : 499;
    }

    await Subscription.create({
      userId: user._id,
      plan,
      amount
    });

    const userObj = updatedUser.toObject();
    delete userObj.password;
    res.json(userObj);
  } catch (error) {
    res.status(500).json({ message: 'Server error upgrading subscription' });
  }
});

// @route   POST /api/auth/2fa/setup
// @desc    Generate TOTP 2FA secret & QR Code URL
router.post('/2fa/setup', protect, async (req, res) => {
  const speakeasy = require('speakeasy');
  const QRCode = require('qrcode');

  try {
    const secret = speakeasy.generateSecret({
      name: `ExpenseTracker Pro (${req.user.email})`
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qrCodeUrl
    });
  } catch (error) {
    console.error('2FA Setup Error:', error);
    res.status(500).json({ message: 'Server error generating 2FA QR code' });
  }
});

// @route   POST /api/auth/2fa/verify
// @desc    Verify TOTP 2FA token and enable 2FA
router.post('/2fa/verify', protect, async (req, res) => {
  const speakeasy = require('speakeasy');

  try {
    const { token, secret } = req.body;
    const targetSecret = secret || req.user.twoFactorSecret;

    if (!token || !targetSecret) {
      return res.status(400).json({ message: 'Token and secret are required for 2FA verification.' });
    }

    const verified = speakeasy.totp.verify({
      secret: targetSecret,
      encoding: 'base32',
      token: token.trim()
    });

    if (!verified) {
      return res.status(400).json({ message: 'Invalid 2FA code. Please check your authenticator app and try again.' });
    }

    const user = await User.findById(req.user._id);
    user.twoFactorEnabled = true;
    user.twoFactorSecret = targetSecret;
    await user.save();

    res.json({
      success: true,
      message: 'Two-Factor Authentication successfully enabled!',
      twoFactorEnabled: true
    });
  } catch (error) {
    console.error('2FA Verify Error:', error);
    res.status(500).json({ message: 'Server error verifying 2FA code' });
  }
});

// @route   POST /api/auth/2fa/disable
// @desc    Disable 2FA
router.post('/2fa/disable', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.twoFactorEnabled = false;
    user.twoFactorSecret = '';
    await user.save();

    res.json({
      success: true,
      message: 'Two-Factor Authentication disabled.',
      twoFactorEnabled: false
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error disabling 2FA' });
  }
});

// @route   GET /api/auth/sessions
// @desc    List active login sessions
router.get('/sessions', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const sessions = user.sessions || [];
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching active sessions' });
  }
});

// @route   DELETE /api/auth/sessions/:id
// @desc    Revoke specific login session
router.delete('/sessions/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.sessions = (user.sessions || []).filter(
      s => s.sessionId !== req.params.id && (!s._id || s._id.toString() !== req.params.id)
    );
    await user.save();
    res.json({ message: 'Session revoked successfully', sessions: user.sessions });
  } catch (error) {
    res.status(500).json({ message: 'Server error revoking session' });
  }
});

// @route   PUT /api/auth/sms-sync
// @desc    Toggle SMS Sync & manage linked bank senders
router.put('/sms-sync', protect, async (req, res) => {
  try {
    const { smsSyncEnabled, linkedBankSenders } = req.body;
    const user = await User.findById(req.user._id);
    if (smsSyncEnabled !== undefined) user.smsSyncEnabled = smsSyncEnabled;
    if (Array.isArray(linkedBankSenders)) user.linkedBankSenders = linkedBankSenders;
    await user.save();

    res.json({
      success: true,
      message: 'Bank SMS Sync settings updated',
      smsSyncEnabled: user.smsSyncEnabled,
      linkedBankSenders: user.linkedBankSenders
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating SMS Sync settings' });
  }
});

// @route   PUT /api/auth/savings-goal
// @desc    Update financial savings goal (Enterprise feature)
router.put('/savings-goal', protect, async (req, res) => {
  const { name, target, deadline } = req.body;
  try {
    if (req.user.plan !== 'enterprise') {
      return res.status(403).json({ message: 'Savings Goal tracking is an Enterprise feature. Please upgrade.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.savingsGoalName = name || '';
    user.savingsGoalTarget = target !== undefined ? Number(target) : 0;
    user.savingsGoalDeadline = deadline || null;

    const updatedUser = await user.save();

    const userObj = updatedUser.toObject();
    delete userObj.password;
    res.json(userObj);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating savings goal' });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Initiate password reset by sending 6-digit OTP to user email
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ message: 'Please provide registered email address' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'No account registered with this email address.' });
    }

    // Google-only account check (manually registered users have hashed password)
    if (!user.password) {
      return res.status(400).json({
        message: 'Password reset is only available for manually registered email accounts. Accounts registered via Google OAuth do not use passwords.'
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = otp;
    user.codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    await user.save();

    await sendVerificationCode(user.email, otp);

    res.json({
      message: `A 6-digit verification code has been sent to ${user.email}.`,
      email: user.email
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error processing password reset request' });
  }
});

// @route   POST /api/auth/verify-reset-code
// @desc    Verify 6-digit OTP for password reset
router.post('/verify-reset-code', async (req, res) => {
  const { email, code } = req.body;
  try {
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and verification code are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.verificationCode || user.verificationCode !== code.trim()) {
      return res.status(400).json({ message: 'Invalid 6-digit verification code.' });
    }

    if (user.codeExpiresAt && user.codeExpiresAt < new Date()) {
      return res.status(400).json({ message: 'Verification code has expired. Please request a new code.' });
    }

    res.json({ message: 'Verification code confirmed. You may now set a new password.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error verifying reset code' });
  }
});

// @route   POST /api/auth/reset-password-with-code
// @desc    Reset user password using verified OTP code
router.post('/reset-password-with-code', async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (newPassword.trim().length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.verificationCode || user.verificationCode !== code.trim()) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    if (user.codeExpiresAt && user.codeExpiresAt < new Date()) {
      return res.status(400).json({ message: 'Verification code has expired.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.verificationCode = undefined;
    user.codeExpiresAt = undefined;
    user.isVerified = true;
    await user.save();

    res.json({ message: 'Password updated successfully! Redirecting to login page...' });
  } catch (error) {
    res.status(500).json({ message: 'Server error resetting password' });
  }
});

// @route   POST /api/auth/reset-account
// @desc    Reset all financial data, accounts, transactions, and histories for current user
router.post('/reset-account', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const Account = require('../models/Account');
    const Transaction = require('../models/Transaction');
    const ActivityLog = require('../models/ActivityLog');
    const AuditLog = require('../models/AuditLog');
    const Notification = require('../models/Notification');

    // Wipe all user data records
    await Account.deleteMany({ userId });
    await Transaction.deleteMany({ userId });
    await ActivityLog.deleteMany({ $or: [{ userId }, { user: userId }] });
    await AuditLog.deleteMany({ userId });
    await Notification.deleteMany({ userId });

    // Create a fresh starting default account
    const defaultAccount = await Account.create({
      userId,
      name: 'Main Wallet',
      initialBalance: 0
    });

    res.status(200).json({
      message: 'Account reset successful! All accounts and transaction histories have been wiped.',
      defaultAccount
    });
  } catch (error) {
    console.error('Reset Account Error:', error);
    res.status(500).json({ message: 'Failed to reset account data.' });
  }
});

// @route   DELETE /api/auth/delete-account
// @desc    Permanently delete current user account and all associated data
router.delete('/delete-account', protect, async (req, res) => {
  const { password } = req.body;
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Require password confirmation for non-Google users
    if (user.authProvider !== 'google') {
      if (!password) {
        return res.status(400).json({ message: 'Password confirmation is required to delete account.' });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Incorrect password. Account deletion canceled.' });
      }
    }

    const userId = user._id;
    const Account = require('../models/Account');
    const Transaction = require('../models/Transaction');
    const ActivityLog = require('../models/ActivityLog');
    const AuditLog = require('../models/AuditLog');
    const Notification = require('../models/Notification');

    // Wipe all user data
    await Account.deleteMany({ userId });
    await Transaction.deleteMany({ userId });
    await ActivityLog.deleteMany({ $or: [{ userId }, { user: userId }] });
    await AuditLog.deleteMany({ userId });
    await Notification.deleteMany({ userId });

    // Permanently remove user record
    await User.findByIdAndDelete(userId);

    res.status(200).json({ message: 'Your account and all associated data have been permanently deleted.' });
  } catch (error) {
    console.error('Delete Account Error:', error);
    res.status(500).json({ message: 'Failed to delete user account.' });
  }
});

module.exports = router;

