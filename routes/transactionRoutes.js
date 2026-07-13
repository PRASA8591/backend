const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const { protect } = require('../middleware/authMiddleware');

// @route   GET /api/transactions
// @desc    Get user's transactions
router.get('/', protect, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user._id }).sort({ date: -1, timestamp: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving transactions' });
  }
});

// @route   POST /api/transactions
// @desc    Create a new transaction
router.post('/', protect, async (req, res) => {
  const { accountId, date, type, category, description, amount } = req.body;

  try {
    if (!accountId || !date || !type || !category || !description || amount === undefined) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Verify account exists and belongs to user
    const account = await Account.findOne({ _id: accountId, userId: req.user._id });
    if (!account) {
      return res.status(404).json({ message: 'Associated account not found or unauthorized' });
    }

    const month = date.slice(0, 7); // Extract YYYY-MM from YYYY-MM-DD

    const transaction = await Transaction.create({
      userId: req.user._id,
      accountId,
      date,
      month,
      type,
      category,
      description,
      amount: Number(amount)
    });

    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ message: 'Server error creating transaction' });
  }
});

// @route   DELETE /api/transactions/:id
// @desc    Delete a transaction
router.delete('/:id', protect, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user._id });
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found or unauthorized' });
    }

    await transaction.deleteOne();
    res.json({ message: 'Transaction removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting transaction' });
  }
});

module.exports = router;
