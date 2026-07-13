const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const { protect } = require('../middleware/authMiddleware');

// @route   GET /api/accounts
// @desc    Get user's accounts
router.get('/', protect, async (req, res) => {
  try {
    const accounts = await Account.find({ userId: req.user._id });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving accounts' });
  }
});

// @route   POST /api/accounts
// @desc    Create a new account
router.post('/', protect, async (req, res) => {
  const { name, initialBalance } = req.body;

  try {
    if (!name || initialBalance === undefined) {
      return res.status(400).json({ message: 'Please provide account name and initial balance' });
    }

    const account = await Account.create({
      userId: req.user._id,
      name,
      initialBalance: Number(initialBalance)
    });

    res.status(201).json(account);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating account' });
  }
});

// @route   DELETE /api/accounts/:id
// @desc    Delete an account
router.delete('/:id', protect, async (req, res) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, userId: req.user._id });
    if (!account) {
      return res.status(404).json({ message: 'Account not found or unauthorized' });
    }

    await account.deleteOne();
    res.json({ message: 'Account removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting account' });
  }
});

module.exports = router;
