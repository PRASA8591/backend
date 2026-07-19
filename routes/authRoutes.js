const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'prasatek_secret_key_123_abc', {
    expiresIn: '30d'
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', async (req, res) => {
  const { name, email, password, mobile } = req.body;

  try {
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please fill in name, email, and password' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Encrypt password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let role = 'user';


    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      mobile: mobile || '',
      role,
      plan: 'free',
      planType: 'none',
      planStatus: 'active'
    });

    const userObj = user.toObject();
    delete userObj.password;
    res.status(201).json({
      ...userObj,
      token: generateToken(user._id)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration' });
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
        planStatus: 'active'
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

    if (theme) user.theme = theme;
    if (currency) user.currency = currency;
    if (notificationsEnabled !== undefined) user.notificationsEnabled = notificationsEnabled;

    const updatedUser = await user.save();
    res.json(updatedUser);
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
    
    // Pricing details: Pro (199 / 1999), Enterprise (499 / 4999), Free (0)
    let amount = 0;
    if (plan === 'pro') {
      amount = user.planType === 'yearly' ? 1999 : 199;
    } else if (plan === 'enterprise') {
      amount = user.planType === 'yearly' ? 4999 : 499;
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

// @route   POST /api/auth/payhere-hash
// @desc    Generate secure checkout parameters and hash for PayHere
router.post('/payhere-hash', protect, async (req, res) => {
  const { plan, billingCycle } = req.body;
  const crypto = require('crypto');

  try {
    if (!['pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan selected' });
    }
    if (!['monthly', 'yearly'].includes(billingCycle)) {
      return res.status(400).json({ message: 'Invalid billing cycle selected' });
    }

    const merchantId = process.env.PAYHERE_MERCHANT_ID || '1236922';
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET || 'MTkzODQyMTk5NTM5NzYyMTA2OTgyOTYwODk0NjI4MjE1ODc0NzY4MA==';
    const isSandbox = process.env.PAYHERE_SANDBOX !== 'false';

    // Pricing details: Pro (199 / 1999), Enterprise (499 / 4999)
    let amount = 0;
    if (plan === 'pro') {
      amount = billingCycle === 'yearly' ? 1999 : 199;
    } else if (plan === 'enterprise') {
      amount = billingCycle === 'yearly' ? 4999 : 499;
    }

    const orderId = `order_USR_${req.user._id}_PLAN_${plan}_CYCLE_${billingCycle}_TIME_${Date.now()}`;
    const formattedAmount = parseFloat(amount).toFixed(2);
    const currency = 'LKR';

    // PayHere signature hash: md5(merchant_id + order_id + amount + currency + md5(merchant_secret))
    const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const dataToHash = merchantId + orderId + formattedAmount + currency + hashedSecret;
    const hash = crypto.createHash('md5').update(dataToHash).digest('hex').toUpperCase();

    const origin = req.headers.referer || req.headers.origin || 'http://localhost:3000';
    const cleanOrigin = origin.replace(/\/$/, '');
    const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    const host = req.get('host') || 'localhost:5000';
    const notifyUrl = `${protocol}://${host}/api/auth/payhere-notify`;

    res.json({
      sandbox: isSandbox,
      merchant_id: merchantId,
      return_url: `${cleanOrigin}/subscription`,
      cancel_url: `${cleanOrigin}/upgrade`,
      notify_url: notifyUrl,
      order_id: orderId,
      items: `${plan.toUpperCase()} Plan (${billingCycle})`,
      amount: formattedAmount,
      currency: currency,
      hash: hash,
      first_name: req.user.name.split(' ')[0] || req.user.name,
      last_name: req.user.name.split(' ').slice(1).join(' ') || 'User',
      email: req.user.email,
      phone: req.user.mobile || '0771234567',
      address: 'No. 1, Main Street',
      city: 'Colombo',
      country: 'Sri Lanka'
    });
  } catch (error) {
    console.error('Error generating PayHere hash:', error);
    res.status(500).json({ message: 'Server error generating checkout parameters' });
  }
});

// @route   POST /api/auth/payhere-success
// @desc    Handle PayHere payment success callback (local verification)
router.post('/payhere-success', protect, async (req, res) => {
  const { order_id } = req.body;

  try {
    if (!order_id) {
      return res.status(400).json({ message: 'Order ID is required' });
    }

    // Parse order_id
    const match = order_id.match(/order_USR_([0-9a-fA-F]{24})_PLAN_(pro|enterprise)_CYCLE_(monthly|yearly)_TIME_(\d+)/);
    if (!match) {
      return res.status(400).json({ message: 'Invalid order ID format' });
    }

    const userId = match[1];
    const plan = match[2];
    const billingCycle = match[3];

    // Ensure the order belongs to the logged-in user
    if (userId !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized transaction verification' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Only update if not already upgraded (avoid double updates from both webhook and redirect)
    if (user.plan !== plan || user.planType !== billingCycle) {
      user.plan = plan;
      user.planType = billingCycle;
      user.planStatus = 'active';
      user.planStartDate = new Date();

      if (billingCycle === 'yearly') {
        user.planExpiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      } else {
        user.planExpiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      await user.save();

      // Create notification
      const Notification = require('../models/Notification');
      await Notification.create({
        userId: user._id,
        title: 'Subscription Activated',
        message: `Your account has been upgraded to the ${plan.toUpperCase()} (${billingCycle}) plan. Thank you for subscribing!`,
        type: 'expiry'
      });

      // Create subscription log
      const Subscription = require('../models/Subscription');
      let amount = 0;
      if (plan === 'pro') {
        amount = billingCycle === 'yearly' ? 1999 : 199;
      } else if (plan === 'enterprise') {
        amount = billingCycle === 'yearly' ? 4999 : 499;
      }

      await Subscription.create({
        userId: user._id,
        plan: plan,
        amount: amount,
        currency: 'LKR',
        status: 'success'
      });
    }

    const userObj = user.toObject();
    delete userObj.password;
    res.json({
      message: 'Plan successfully updated',
      user: userObj
    });
  } catch (error) {
    console.error('PayHere Success endpoint error:', error);
    res.status(500).json({ message: 'Server error processing success callback' });
  }
});

// @route   POST /api/auth/payhere-notify
// @desc    PayHere IPN Webhook (Public/unprotected)
router.post('/payhere-notify', async (req, res) => {
  const { merchant_id, order_id, payment_id, payhere_amount, payhere_currency, status_code, md5sig } = req.body;
  const crypto = require('crypto');

  try {
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET || 'MTkzODQyMTk5NTM5NzYyMTA2OTgyOTYwODk0NjI4MjE1ODc0NzY4MA==';
    const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const dataToHash = merchant_id + order_id + payhere_amount + payhere_currency + status_code + hashedSecret;
    const localSig = crypto.createHash('md5').update(dataToHash).digest('hex').toUpperCase();

    if (localSig !== md5sig) {
      console.error('PayHere Webhook validation failed: signature mismatch');
      return res.status(400).send('Invalid signature');
    }

    if (status_code === '2') {
      // Parse order_id
      const match = order_id.match(/order_USR_([0-9a-fA-F]{24})_PLAN_(pro|enterprise)_CYCLE_(monthly|yearly)_TIME_(\d+)/);
      if (!match) {
        console.error('Invalid order_id format in PayHere Webhook:', order_id);
        return res.status(400).send('Invalid order ID format');
      }

      const userId = match[1];
      const plan = match[2];
      const billingCycle = match[3];

      const user = await User.findById(userId);
      if (!user) {
        console.error('User not found in PayHere Webhook:', userId);
        return res.status(404).send('User not found');
      }

      if (user.plan !== plan || user.planType !== billingCycle) {
        user.plan = plan;
        user.planType = billingCycle;
        user.planStatus = 'active';
        user.planStartDate = new Date();

        if (billingCycle === 'yearly') {
          user.planExpiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        } else {
          user.planExpiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }

        await user.save();

        // Create notification
        const Notification = require('../models/Notification');
        await Notification.create({
          userId: user._id,
          title: 'Subscription Activated via Webhook',
          message: `Your account has been upgraded to the ${plan.toUpperCase()} (${billingCycle}) plan via payment reference ${payment_id}. Thank you!`,
          type: 'expiry'
        });

        // Create subscription log
        const Subscription = require('../models/Subscription');
        await Subscription.create({
          userId: user._id,
          plan: plan,
          amount: parseFloat(payhere_amount),
          currency: payhere_currency,
          status: 'success'
        });

        console.log(`Successfully upgraded user ${userId} to ${plan} (${billingCycle}) via webhook.`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('PayHere Webhook error:', error);
    res.status(500).send('Server error');
  }
});

module.exports = router;

