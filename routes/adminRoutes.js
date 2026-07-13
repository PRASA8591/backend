const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const { protect, isManagerOrAdmin } = require('../middleware/authMiddleware');

// Apply middleware to all admin routes
router.use(protect);
router.use(isManagerOrAdmin);

// @route   GET /api/admin/users
// @desc    Get all users (sorted by last login)
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password').sort({ lastLoginAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving users' });
  }
});

// @route   GET /api/admin/stats
// @desc    Get system-wide statistics
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({});
    const privilegedUsers = await User.countDocuments({ role: { $in: ['admin', 'manager'] } });
    const suspendedUsers = await User.countDocuments({ status: 'suspended' });
    
    // Aggregation for unique organizations
    const uniqueOrgs = await User.distinct('org');
    // Ensure default is counted if not present, or return distinct size
    const totalOrgs = Math.max(uniqueOrgs.length, 1);

    res.json({
      totalUsers,
      privilegedUsers,
      suspendedUsers,
      totalOrgs
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving statistics' });
  }
});

// @route   POST /api/admin/users
// @desc    Create a user manually (admin action)
router.post('/users', async (req, res) => {
  const { email, name, password, role, status, org } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ message: 'Please provide email address' });
    }

    const emailPrefix = email.split('@')[0];
    const finalName = name || (emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1));
    
    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Hash password (default: prasatek123)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password || 'prasatek123', salt);

    const newUser = await User.create({
      name: finalName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role || 'user',
      status: status || 'active',
      org: org || 'default'
    });

    res.status(201).json({
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
      org: newUser.org,
      lastLoginAt: newUser.lastLoginAt
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error creating manual user' });
  }
});


// @route   PUT /api/admin/users/:id/role
// @desc    Update a user's role
router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  try {
    if (!['user', 'manager', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.role = role;
    await user.save();
    res.json({ message: 'User role updated successfully', role: user.role });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating user role' });
  }
});

// @route   PUT /api/admin/users/:id/status
// @desc    Update user status (active/suspended)
router.put('/users/:id/status', async (req, res) => {
  const { status } = req.body;
  try {
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.status = status;
    await user.save();
    res.json({ message: 'User status updated successfully', status: user.status });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating user status' });
  }
});

// @route   PUT /api/admin/users/:id/org
// @desc    Update user organization/branch
router.put('/users/:id/org', async (req, res) => {
  const { org } = req.body;
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.org = org || 'default';
    await user.save();
    res.json({ message: 'User organization updated successfully', org: user.org });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating user organization' });
  }
});

// @route   GET /api/admin/users/:id/financials
// @desc    Get user's financial accounts and transaction log
router.get('/users/:id/financials', async (req, res) => {
  try {
    const accounts = await Account.find({ userId: req.params.id });
    const transactions = await Transaction.find({ userId: req.params.id }).sort({ date: -1, timestamp: -1 });
    res.json({ accounts, transactions });
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving user financials' });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete a user profile and cascade delete all their accounts/transactions
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Protect Master Admin from deletion
    if (user.email.toLowerCase() === 'admin@prasatek.site') {
      return res.status(400).json({ message: 'Master System Admin cannot be deleted' });
    }

    // Cascade delete associated models
    await Account.deleteMany({ userId: user._id });
    await Transaction.deleteMany({ userId: user._id });
    
    await user.deleteOne();
    res.json({ message: 'User and all associated financial records deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting user profile' });
  }
});

// @route   DELETE /api/admin/accounts/:id
// @desc    Delete an account owned by a user
router.delete('/accounts/:id', async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    await account.deleteOne();
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting user account' });
  }
});

// @route   DELETE /api/admin/transactions/:id
// @desc    Delete a transaction logged by a user
router.delete('/transactions/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    await transaction.deleteOne();
    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting user transaction' });
  }
});

// @route   POST /api/admin/users/:id/import
// @desc    Import backup JSON data for a user
router.post('/users/:id/import', async (req, res) => {
  const { accounts, transactions, settings, overwrite } = req.body;

  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (overwrite === true) {
      await Account.deleteMany({ userId: user._id });
      await Transaction.deleteMany({ userId: user._id });
    }

    if (settings && settings.monthlyBudgetLimit) {
      user.monthlyBudgetLimit = settings.monthlyBudgetLimit;
      await user.save();
    }

    const accountIdMap = {};

    if (Array.isArray(accounts)) {
      for (const acc of accounts) {
        const newAcc = await Account.create({
          name: acc.name,
          initialBalance: acc.initialBalance || 0,
          userId: user._id,
          timestamp: acc.timestamp || Date.now()
        });
        accountIdMap[acc.id] = newAcc._id;
      }
    }

    if (Array.isArray(transactions)) {
      for (const tx of transactions) {
        const newAccId = accountIdMap[tx.accountId];
        if (newAccId) {
          await Transaction.create({
            userId: user._id,
            accountId: newAccId,
            type: tx.type === 'deduct' ? 'deduct' : 'add',
            amount: tx.amount || 0,
            category: tx.category || 'Other',
            description: tx.description || '',
            date: tx.date || new Date().toISOString().split('T')[0],
            month: tx.month || new Date().toISOString().slice(0, 7),
            timestamp: tx.timestamp || Date.now()
          });
        }
      }
    }

    res.json({ message: 'Data imported successfully' });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ message: 'Server error importing user data' });
  }
});

module.exports = router;


