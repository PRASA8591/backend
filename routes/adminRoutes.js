const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const SystemSetting = require('../models/SystemSetting');
const { protect, isManagerOrAdmin } = require('../middleware/authMiddleware');

// Helper to record audit logs
const logAuditAction = async (req, action, details, targetUser = '', severity = 'info') => {
  try {
    await AuditLog.create({
      adminId: req.user?._id,
      adminName: req.user?.name || 'System Admin',
      action,
      details,
      targetUser,
      severity,
      ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1'
    });
  } catch (err) {
    console.error('AuditLog Error:', err.message);
  }
};

// Apply middleware to all admin routes
router.use(protect);
router.use(isManagerOrAdmin);

// @route   GET /api/admin/system-health
// @desc    Get Node.js server telemetry & database metrics
router.get('/system-health', async (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const uptimeSeconds = process.uptime();

    // DB ping check
    const dbState = mongoose.connection.readyState;
    const dbStateLabels = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];

    res.json({
      uptimeSeconds: Math.floor(uptimeSeconds),
      uptimeFormatted: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${Math.floor(uptimeSeconds % 60)}s`,
      memoryRssMb: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      memoryHeapMb: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
      nodeVersion: process.version,
      platform: process.platform,
      dbStatus: dbStateLabels[dbState] || 'Unknown',
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving system health' });
  }
});

// @route   GET /api/admin/audit-logs
// @desc    Get recent security and administrative audit logs
router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await AuditLog.find({}).sort({ timestamp: -1 }).limit(100);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving audit logs' });
  }
});

// @route   GET /api/admin/system-settings
// @desc    Get system settings (maintenance mode, announcement banner, HQ location map, contact info)
router.get('/system-settings', async (req, res) => {
  try {
    const maintenance = await SystemSetting.findOne({ key: 'maintenance_mode' });
    const banner = await SystemSetting.findOne({ key: 'global_banner' });
    const hqAddress = await SystemSetting.findOne({ key: 'hq_address' });
    const hqMapUrl = await SystemSetting.findOne({ key: 'hq_map_url' });
    const companyName = await SystemSetting.findOne({ key: 'company_name' });
    const contactWebsite = await SystemSetting.findOne({ key: 'contact_website' });
    const contactEmail = await SystemSetting.findOne({ key: 'contact_email' });
    const contactPhone = await SystemSetting.findOne({ key: 'contact_phone' });

    res.json({
      maintenanceMode: maintenance ? maintenance.value : false,
      globalBanner: banner ? banner.value : { enabled: false, message: '', type: 'info' },
      hqAddress: hqAddress ? hqAddress.value : 'Kottawa Road, Colombo District, Sri Lanka',
      hqMapUrl: hqMapUrl ? hqMapUrl.value : 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3961.385418197779!2d79.9610!3d6.8440!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ae2501a3512e02d%3A0x6b4f738e4a9e5251!2sKottawa%2C%20Pannipitiya!5e0!3m2!1sen!2slk!4v1700000000000!5m2!1sen!2slk',
      companyName: companyName ? companyName.value : 'PRASATEK SYSTEM SOLUTIONS',
      contactWebsite: contactWebsite ? contactWebsite.value : 'www.prasatek.lk',
      contactEmail: contactEmail ? contactEmail.value : 'info@prasatek.lk',
      contactPhone: contactPhone ? contactPhone.value : '0719323239'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving system settings' });
  }
});

// @route   POST /api/admin/system-settings
// @desc    Update system settings (maintenance mode, global banner, HQ location map, contact info)
router.post('/system-settings', async (req, res) => {
  const { maintenanceMode, globalBanner, hqAddress, hqMapUrl, companyName, contactWebsite, contactEmail, contactPhone } = req.body;
  try {
    if (typeof maintenanceMode !== 'undefined') {
      await SystemSetting.findOneAndUpdate(
        { key: 'maintenance_mode' },
        { value: !!maintenanceMode, updatedAt: new Date() },
        { upsert: true }
      );
      await logAuditAction(req, 'MAINTENANCE_TOGGLE', `Maintenance mode set to ${maintenanceMode}`, '', 'warning');
    }

    if (globalBanner) {
      await SystemSetting.findOneAndUpdate(
        { key: 'global_banner' },
        { value: globalBanner, updatedAt: new Date() },
        { upsert: true }
      );
      await logAuditAction(req, 'GLOBAL_BANNER_UPDATE', `Updated global system banner: "${globalBanner.message}"`, '', 'info');
    }

    if (typeof hqAddress !== 'undefined') {
      await SystemSetting.findOneAndUpdate(
        { key: 'hq_address' },
        { value: hqAddress.trim(), updatedAt: new Date() },
        { upsert: true }
      );
    }

    if (typeof hqMapUrl !== 'undefined') {
      let cleanMapUrl = hqMapUrl.trim();
      // If user pasted a full <iframe src="..."> tag, extract the src URL
      if (cleanMapUrl.includes('src="')) {
        const match = cleanMapUrl.match(/src="([^"]+)"/);
        if (match && match[1]) {
          cleanMapUrl = match[1];
        }
      }
      await SystemSetting.findOneAndUpdate(
        { key: 'hq_map_url' },
        { value: cleanMapUrl, updatedAt: new Date() },
        { upsert: true }
      );
      await logAuditAction(req, 'HQ_LOCATION_UPDATE', `Updated Headquarters Location map link`, '', 'info');
    }

    if (typeof companyName !== 'undefined') {
      await SystemSetting.findOneAndUpdate(
        { key: 'company_name' },
        { value: companyName.trim(), updatedAt: new Date() },
        { upsert: true }
      );
    }

    if (typeof contactWebsite !== 'undefined') {
      await SystemSetting.findOneAndUpdate(
        { key: 'contact_website' },
        { value: contactWebsite.trim(), updatedAt: new Date() },
        { upsert: true }
      );
    }

    if (typeof contactEmail !== 'undefined') {
      await SystemSetting.findOneAndUpdate(
        { key: 'contact_email' },
        { value: contactEmail.trim(), updatedAt: new Date() },
        { upsert: true }
      );
    }

    if (typeof contactPhone !== 'undefined') {
      await SystemSetting.findOneAndUpdate(
        { key: 'contact_phone' },
        { value: contactPhone.trim(), updatedAt: new Date() },
        { upsert: true }
      );
    }

    res.json({ message: 'System settings updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating system settings' });
  }
});

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

    const uniqueOrgs = await User.distinct('org');
    const totalOrgs = Math.max(uniqueOrgs.length, 1);

    const freeUsers = await User.countDocuments({ plan: 'free' });
    const proUsers = await User.countDocuments({ plan: 'pro' });
    const enterpriseUsers = await User.countDocuments({ plan: 'enterprise' });

    const totalAccounts = await Account.countDocuments({});
    const totalTransactions = await Transaction.countDocuments({});

    res.json({
      totalUsers,
      privilegedUsers,
      suspendedUsers,
      totalOrgs,
      freeUsers,
      proUsers,
      enterpriseUsers,
      totalAccounts,
      totalTransactions
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving statistics' });
  }
});

// @route   POST /api/admin/users
// @desc    Create a user manually (admin action)
router.post('/users', async (req, res) => {
  const { email, name, password, role, status, org, isVerified } = req.body;
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

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password || 'prasatek123', salt);

    const newUser = await User.create({
      name: finalName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role || 'user',
      status: status || 'active',
      org: org || 'default',
      isVerified: isVerified !== undefined ? isVerified : true
    });

    await logAuditAction(req, 'USER_CREATE', `Created new user profile (${newUser.email}) with role ${newUser.role}`, newUser.email, 'info');

    // Dispatch Welcome Congratulations email
    if (newUser.isVerified) {
      try {
        const { sendWelcomeEmail } = require('../utils/sendEmail');
        await sendWelcomeEmail(newUser.email, newUser.name);
      } catch (e) {
        console.warn('Failed to send welcome email to new admin-created user:', e.message);
      }
    }

    res.status(201).json({
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
      org: newUser.org,
      isVerified: newUser.isVerified,
      lastLoginAt: newUser.lastLoginAt
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error creating manual user' });
  }
});

// @route   PUT /api/admin/users/:id/password
// @desc    Admin manual password reset for a user
router.put('/users/:id/password', async (req, res) => {
  const { newPassword } = req.body;
  try {
    if (!newPassword || newPassword.trim().length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    await logAuditAction(req, 'PASSWORD_RESET', `Admin manually reset password for user ${user.email}`, user.email, 'warning');

    res.json({ message: `Password for ${user.email} successfully updated.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error resetting user password' });
  }
});

// @route   PUT /api/admin/users/:id/verify
// @desc    Admin manual toggle of email verification status
router.put('/users/:id/verify', async (req, res) => {
  const { isVerified } = req.body;
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isVerified = !!isVerified;
    await user.save();

    await logAuditAction(req, 'VERIFY_TOGGLE', `Admin changed email verification status for ${user.email} to ${user.isVerified}`, user.email, 'info');

    res.json({ message: `Email verification for ${user.email} set to ${user.isVerified}`, isVerified: user.isVerified });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating verification status' });
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

    const oldRole = user.role;
    user.role = role;
    await user.save();

    await logAuditAction(req, 'ROLE_UPDATE', `Changed role of ${user.email} from ${oldRole} to ${role}`, user.email, 'warning');

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

    await logAuditAction(req, 'STATUS_UPDATE', `Updated user status for ${user.email} to ${status}`, user.email, status === 'suspended' ? 'warning' : 'info');

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

    await logAuditAction(req, 'ORG_UPDATE', `Updated branch for ${user.email} to ${user.org}`, user.email, 'info');

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

// @route   POST /api/admin/users/:id/import-backup
// @desc    Import accounts & transactions JSON backup into a specific user's account (strips old userId)
router.post('/users/:id/import-backup', async (req, res) => {
  const body = req.body || {};
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    // Extract accounts array from all possible JSON schema formats
    let accountsList = [];
    if (Array.isArray(body.accounts)) accountsList = body.accounts;
    else if (Array.isArray(body.Accounts)) accountsList = body.Accounts;
    else if (Array.isArray(body.account)) accountsList = body.account;
    else if (Array.isArray(body.Account)) accountsList = body.Account;
    else if (body.data && Array.isArray(body.data.accounts)) accountsList = body.data.accounts;

    // Extract transactions array from all possible JSON schema formats
    let transactionsList = [];
    if (Array.isArray(body.transactions)) transactionsList = body.transactions;
    else if (Array.isArray(body.Transactions)) transactionsList = body.Transactions;
    else if (Array.isArray(body.history)) transactionsList = body.history;
    else if (Array.isArray(body.History)) transactionsList = body.History;
    else if (Array.isArray(body.transaction)) transactionsList = body.transaction;
    else if (Array.isArray(body.Transaction)) transactionsList = body.Transaction;
    else if (body.data && Array.isArray(body.data.transactions)) transactionsList = body.data.transactions;
    else if (body.data && Array.isArray(body.data.history)) transactionsList = body.data.history;
    else if (Array.isArray(body)) {
      if (body.length > 0 && (body[0].initialBalance !== undefined || body[0].type === 'cash' || body[0].type === 'bank')) {
        accountsList = body;
      } else {
        transactionsList = body;
      }
    }

    if (accountsList.length === 0 && transactionsList.length === 0) {
      return res.status(400).json({ message: 'No accounts or transactions found in uploaded JSON backup file.' });
    }

    let createdAccountsCount = 0;
    let createdTransactionsCount = 0;
    const accountIdMap = {};

    // 1. Process & Import Accounts for target user (override old userId)
    if (accountsList.length > 0) {
      for (const acc of accountsList) {
        const newAcc = await Account.create({
          userId: user._id, // Assign to target user
          name: acc.name || acc.accountName || 'Imported Account',
          type: acc.type || 'cash',
          initialBalance: Number(acc.initialBalance || acc.balance || 0)
        });
        createdAccountsCount++;

        if (acc._id) accountIdMap[acc._id.toString()] = newAcc._id;
        if (acc.id) accountIdMap[acc.id.toString()] = newAcc._id;
        if (acc.name) accountIdMap[acc.name] = newAcc._id;
      }
    }

    // Ensure default account exists for target user
    let defaultUserAccount = await Account.findOne({ userId: user._id });
    if (!defaultUserAccount) {
      defaultUserAccount = await Account.create({
        userId: user._id,
        name: 'Main Account',
        type: 'cash',
        initialBalance: 0
      });
      createdAccountsCount++;
    }

    // 2. Process & Import Transactions for target user (override old userId)
    if (transactionsList.length > 0) {
      const txDocs = transactionsList.map(tx => {
        let assignedAccountId = defaultUserAccount._id;
        if (tx.accountId && accountIdMap[tx.accountId.toString()]) {
          assignedAccountId = accountIdMap[tx.accountId.toString()];
        } else if (tx.accountName && accountIdMap[tx.accountName]) {
          assignedAccountId = accountIdMap[tx.accountName];
        }

        // Map type enum: Schema requires 'add' (income) or 'deduct' (expense)
        let mappedType = 'deduct';
        const rawType = String(tx.type || '').toLowerCase();
        if (['add', 'income', 'deposit', 'credit'].includes(rawType)) {
          mappedType = 'add';
        } else if (['deduct', 'expense', 'withdrawal', 'debit'].includes(rawType)) {
          mappedType = 'deduct';
        }

        // Date formatting (YYYY-MM-DD)
        let dateVal = tx.date;
        if (!dateVal) {
          dateVal = new Date().toISOString().split('T')[0];
        } else if (typeof dateVal !== 'string') {
          dateVal = new Date(dateVal).toISOString().split('T')[0];
        }

        // Month formatting (YYYY-MM)
        let monthVal = tx.month;
        if (!monthVal || typeof monthVal !== 'string') {
          monthVal = dateVal.substring(0, 7);
        }

        return {
          userId: user._id, // Assign to target user
          accountId: assignedAccountId,
          type: mappedType, // Enum: 'add' or 'deduct'
          date: dateVal,
          month: monthVal,
          category: tx.category || 'General',
          amount: Math.abs(Number(tx.amount || 0)),
          description: tx.description || tx.note || tx.remarks || 'Imported Transaction',
          timestamp: Number(tx.timestamp) || Date.now()
        };
      });

      const insertedTxs = await Transaction.insertMany(txDocs);
      createdTransactionsCount = insertedTxs.length;
    }

    await logAuditAction(
      req,
      'BACKUP_IMPORT',
      `Imported JSON backup for user ${user.email}: ${createdAccountsCount} accounts, ${createdTransactionsCount} transactions created`,
      user.email,
      'warning'
    );

    res.json({
      message: `Backup successfully imported into ${user.name}'s account! Created ${createdAccountsCount} accounts and ${createdTransactionsCount} transactions.`,
      importedAccounts: createdAccountsCount,
      importedTransactions: createdTransactionsCount
    });
  } catch (error) {
    console.error('Import Backup Error:', error);
    res.status(500).json({ message: error.message || 'Failed to import backup JSON data.' });
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

    if (['admin@prasatek.site', 'admin@prasatek.lk'].includes(user.email.toLowerCase())) {
      return res.status(400).json({ message: 'Master System Admin cannot be deleted' });
    }

    const targetEmail = user.email;
    await Account.deleteMany({ userId: user._id });
    await Transaction.deleteMany({ userId: user._id });
    await user.deleteOne();

    await logAuditAction(req, 'USER_DELETE', `Deleted user ${targetEmail} and all associated financial records`, targetEmail, 'critical');

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
    await logAuditAction(req, 'ACCOUNT_DELETE', `Deleted account "${account.name}"`, '', 'info');

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
    await logAuditAction(req, 'TRANSACTION_DELETE', `Deleted transaction "${transaction.description}" of amount ${transaction.amount}`, '', 'info');

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

    await logAuditAction(req, 'DATA_IMPORT', `Imported ${accounts?.length || 0} accounts and ${transactions?.length || 0} transactions for ${user.email}`, user.email, 'info');

    res.json({ message: 'Data imported successfully' });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ message: 'Server error importing user data' });
  }
});

// @route   PUT /api/admin/users/:id/plan
// @desc    Update user's subscription plan & planType (Admin action)
router.put('/users/:id/plan', async (req, res) => {
  const { plan, planType } = req.body;
  try {
    if (plan && !['free', 'pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan selected' });
    }
    if (planType && !['monthly', 'yearly', 'none'].includes(planType)) {
      return res.status(400).json({ message: 'Invalid plan billing cycle selected' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const oldPlan = user.plan;
    if (plan) user.plan = plan;
    if (planType) user.planType = planType;

    if (plan && plan !== 'free') {
      user.planStatus = 'active';
      const durationDays = planType === 'yearly' ? 365 : 30;
      user.planExpiryDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    } else if (plan === 'free') {
      user.planType = 'none';
      user.planStatus = 'active';
    }

    await user.save();

    await logAuditAction(req, 'PLAN_UPDATE', `Upgraded plan for ${user.email} from ${oldPlan} to ${user.plan} (${user.planType})`, user.email, 'info');

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      planType: user.planType,
      planStatus: user.planStatus,
      planExpiryDate: user.planExpiryDate
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating user plan' });
  }
});

// @route   GET /api/admin/announcements
// @desc    Get list of all system announcements with scheduled times
router.get('/announcements', async (req, res) => {
  try {
    const Announcement = require('../models/Announcement');
    const announcements = await Announcement.find({}).sort({ createdAt: -1 });
    res.json(announcements);
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving announcements' });
  }
});

// @route   POST /api/admin/announcements
// @desc    Create & broadcast a scheduled system announcement
router.post('/announcements', async (req, res) => {
  const { title, message, type, scheduledStart, scheduledEnd } = req.body;
  try {
    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    const Announcement = require('../models/Announcement');
    const Notification = require('../models/Notification');
    const users = await User.find({});

    const newAnnouncement = await Announcement.create({
      title,
      message,
      type: type || 'info',
      scheduledStart: scheduledStart ? new Date(scheduledStart) : new Date(),
      scheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
      createdByName: req.user?.name || 'Admin'
    });

    const notifications = users.map(u => ({
      userId: u._id,
      title,
      message,
      type: type === 'warning' ? 'system' : 'feature'
    }));

    await Notification.insertMany(notifications);
    await logAuditAction(req, 'ANNOUNCEMENT_BROADCAST', `Broadcasted announcement "${title}" to ${users.length} users`, '', 'info');

    res.status(201).json({
      message: `Announcement broadcasted successfully to ${users.length} users.`,
      announcement: newAnnouncement
    });
  } catch (error) {
    console.error('Announcement Error:', error);
    res.status(500).json({ message: 'Server error broadcasting announcement' });
  }
});

// @route   DELETE /api/admin/announcements/:id
// @desc    Delete a system announcement and clean up user notification feeds
router.delete('/announcements/:id', async (req, res) => {
  try {
    const Announcement = require('../models/Announcement');
    const Notification = require('../models/Notification');

    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    // Delete matching notifications by title
    await Notification.deleteMany({ title: announcement.title });
    await announcement.deleteOne();

    await logAuditAction(req, 'ANNOUNCEMENT_DELETE', `Deleted announcement "${announcement.title}"`, '', 'warning');

    res.json({ message: 'Announcement and associated notifications deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting announcement' });
  }
});

// @route   GET /api/admin/payments/pending
// @desc    List all pending bank payment orders for Admin verification
router.get('/payments/pending', async (req, res) => {
  try {
    const PaymentOrder = require('../models/PaymentOrder');
    const orders = await PaymentOrder.find({ status: 'pending' })
      .populate('userId', 'name email mobile plan pendingPlan')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    console.error('Fetch Pending Payments Error:', error);
    res.status(500).json({ message: 'Server error fetching pending payment orders' });
  }
});

// @route   GET /api/admin/payments/all
// @desc    List all payment orders (pending, approved, rejected)
router.get('/payments/all', async (req, res) => {
  try {
    const PaymentOrder = require('../models/PaymentOrder');
    const orders = await PaymentOrder.find({})
      .populate('userId', 'name email mobile plan pendingPlan')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    console.error('Fetch All Payments Error:', error);
    res.status(500).json({ message: 'Server error fetching payment orders' });
  }
});

// @route   PUT /api/admin/payments/:id/approve
// @desc    Approve bank payment order, activate user plan, send confirmation email + SMS
router.put('/payments/:id/approve', async (req, res) => {
  try {
    const PaymentOrder = require('../models/PaymentOrder');
    const { sendEmail } = require('../utils/sendEmail');
    const { sendSms } = require('../services/smsGateway');

    const order = await PaymentOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Payment order not found' });
    }

    const targetUser = await User.findById(order.userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Associated user account not found' });
    }

    // Calculate expiry date based on billing cycle (1 month or 1 year)
    const now = new Date();
    const durationDays = order.billingCycle === 'yearly' ? 365 : 30;
    const planExpiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Update order status
    order.status = 'approved';
    order.approvedAt = now;
    order.adminNotes = req.body.adminNotes || 'Payment verified and approved by Admin.';
    await order.save();

    // Update User plan & status
    targetUser.plan = order.plan;
    targetUser.planType = order.billingCycle;
    targetUser.planStatus = 'active';
    targetUser.pendingPlan = 'none';
    targetUser.planStartDate = now;
    targetUser.planExpiresAt = planExpiresAt;
    targetUser.expiryWarningSent = false;
    await targetUser.save();

    await logAuditAction(req, 'PAYMENT_APPROVED', `Approved payment order ${order.orderId} for ${targetUser.email}. Upgraded to ${order.plan.toUpperCase()}.`, targetUser.email, 'info');

    // Dispatch confirmation email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
        <h2 style="color: #0b8c5a; margin-top: 0;">Payment Approved & Plan Activated 🎉</h2>
        <p>Dear <strong>${targetUser.name}</strong>,</p>
        <p>Your payment order <strong>${order.orderId}</strong> of <strong>LKR ${order.amount.toLocaleString()}</strong> has been verified and approved.</p>
        <p>Your account is now upgraded to <strong>${order.plan.toUpperCase()}</strong> (${order.billingCycle}) active until <strong>${planExpiresAt.toLocaleDateString()}</strong>.</p>
        <p style="margin-top: 20px;"><a href="https://cash.prasatek.lk/dashboard" style="background-color: #0b8c5a; color: white; padding: 10px 18px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Go to Dashboard</a></p>
        <p style="color: #64748b; font-size: 12px; margin-top: 24px;">© PrasaTek System Solutions</p>
      </div>
    `;

    try {
      await sendEmail(targetUser.email, '🎉 Payment Approved - ExpenseTracker Pro Activated', emailHtml);
      await sendSms(targetUser.mobile, `ExpenseTracker Pro: Your payment ${order.orderId} is approved! Your ${order.plan.toUpperCase()} plan is now active.`);
    } catch (mailErr) {
      console.warn('Failed sending approval notification email:', mailErr.message);
    }

    res.json({
      success: true,
      message: `Payment order ${order.orderId} approved successfully! User plan updated to ${order.plan}.`,
      order
    });
  } catch (error) {
    console.error('Approve Payment Error:', error);
    res.status(500).json({ message: 'Server error approving payment order' });
  }
});

// @route   PUT /api/admin/payments/:id/reject
// @desc    Reject bank payment order with reasoning note
router.put('/payments/:id/reject', async (req, res) => {
  try {
    const PaymentOrder = require('../models/PaymentOrder');
    const { sendEmail } = require('../utils/sendEmail');
    const { sendSms } = require('../services/smsGateway');

    const { adminNotes = 'Payment proof could not be verified.' } = req.body;

    const order = await PaymentOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Payment order not found' });
    }

    const targetUser = await User.findById(order.userId);

    order.status = 'rejected';
    order.adminNotes = adminNotes;
    await order.save();

    if (targetUser) {
      targetUser.pendingPlan = 'none';
      await targetUser.save();

      await logAuditAction(req, 'PAYMENT_REJECTED', `Rejected payment order ${order.orderId} for ${targetUser.email}. Reason: ${adminNotes}`, targetUser.email, 'warning');

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
          <h2 style="color: #dc2626; margin-top: 0;">Payment Slip Update ❌</h2>
          <p>Dear <strong>${targetUser.name}</strong>,</p>
          <p>Your payment order <strong>${order.orderId}</strong> could not be verified.</p>
          <p><strong>Reason:</strong> ${adminNotes}</p>
          <p>Please re-check your payment slip details or re-upload a clear receipt from your upgrade page.</p>
          <p style="margin-top: 20px;"><a href="https://prasatek.lk/upgrade" style="background-color: #0b8c5a; color: white; padding: 10px 18px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Re-upload Payment Proof</a></p>
          <p style="color: #64748b; font-size: 12px; margin-top: 24px;">© PrasaTek System Solutions</p>
        </div>
      `;

      try {
        await sendEmail(targetUser.email, 'Update on your ExpenseTracker Pro Payment', emailHtml);
        await sendSms(targetUser.mobile, `ExpenseTracker Pro: Payment ${order.orderId} rejected. Reason: ${adminNotes}. Re-upload at prasatek.lk`);
      } catch (mailErr) {
        console.warn('Failed sending rejection email:', mailErr.message);
      }
    }

    res.json({
      success: true,
      message: `Payment order ${order.orderId} rejected.`,
      order
    });
  } catch (error) {
    console.error('Reject Payment Error:', error);
    res.status(500).json({ message: 'Server error rejecting payment order' });
  }
});

module.exports = router;

