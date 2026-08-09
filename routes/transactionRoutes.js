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

// @route   PUT /api/transactions/:id
// @desc    Update an existing transaction (Enterprise Plan feature)
router.put('/:id', protect, async (req, res) => {
  // Enforce Enterprise plan or Admin/Manager role requirement
  if (req.user.plan !== 'enterprise' && req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({
      message: 'Editing past transactions is an exclusive feature of the Enterprise plan. Please upgrade your plan to unlock this feature.'
    });
  }

  const { accountId, date, type, category, description, amount } = req.body;

  try {
    const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user._id });
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found or unauthorized' });
    }

    if (accountId) {
      const account = await Account.findOne({ _id: accountId, userId: req.user._id });
      if (!account) {
        return res.status(404).json({ message: 'Associated account not found or unauthorized' });
      }
      transaction.accountId = accountId;
    }

    if (date) {
      transaction.date = date;
      transaction.month = date.slice(0, 7);
    }
    if (type) transaction.type = type;
    if (category) transaction.category = category;
    if (description !== undefined) transaction.description = description;
    if (amount !== undefined) transaction.amount = Number(amount);

    const updatedTransaction = await transaction.save();
    res.json(updatedTransaction);
  } catch (error) {
    res.status(500).json({ message: 'Server error updating transaction' });
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
