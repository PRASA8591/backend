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
      role
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      picture: user.picture,
      role: user.role,
      status: user.status,
      org: user.org,
      monthlyBudgetLimit: user.monthlyBudgetLimit,
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

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      picture: user.picture,
      role: user.role,
      status: user.status,
      org: user.org,
      monthlyBudgetLimit: user.monthlyBudgetLimit,
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
      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        mobile: updatedUser.mobile,
        role: updatedUser.role,
        status: updatedUser.status,
        org: updatedUser.org,
        monthlyBudgetLimit: updatedUser.monthlyBudgetLimit
      });
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
      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        mobile: updatedUser.mobile,
        role: updatedUser.role,
        status: updatedUser.status,
        org: updatedUser.org,
        monthlyBudgetLimit: updatedUser.monthlyBudgetLimit
      });
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
        org: 'default'
      });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      picture: user.picture,
      role: user.role,
      status: user.status,
      org: user.org,
      monthlyBudgetLimit: user.monthlyBudgetLimit,
      token: generateToken(user._id)
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(401).json({ message: 'Google authentication failed' });
  }
});

module.exports = router;

