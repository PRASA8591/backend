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

// @route   POST /api/transactions/parse-sms
// @desc    Parse Bank SMS and automatically log transaction
router.post('/parse-sms', protect, async (req, res) => {
  try {
    const { smsText, accountId } = req.body;
    if (!smsText) {
      return res.status(400).json({ message: 'smsText is required' });
    }

    // Determine associated account (use specified accountId or first account of user)
    let targetAccount;
    if (accountId) {
      targetAccount = await Account.findOne({ _id: accountId, userId: req.user._id });
    }
    if (!targetAccount) {
      targetAccount = await Account.findOne({ userId: req.user._id });
    }
    if (!targetAccount) {
      return res.status(404).json({ message: 'No active account found to log transaction against.' });
    }

    // Smart regex parsing for amount & transaction type
    const lowerSms = smsText.toLowerCase();
    
    // Amount extraction regex (e.g. LKR 2,500.00, Rs. 1500, USD 45.00, 2500 LKR)
    const amountMatch = smsText.match(/(?:LKR|RS\.?|USD|\$)\s*([\d,]+(?:\.\d{2})?)|([\d,]+(?:\.\d{2})?)\s*(?:LKR|RS\.?)/i);
    let amount = 0;
    if (amountMatch) {
      const rawNum = (amountMatch[1] || amountMatch[2]).replace(/,/g, '');
      amount = parseFloat(rawNum);
    }

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ message: 'Could not extract valid transaction amount from SMS text.' });
    }

    // Determine type: credit/deposit/received = add, debit/paid/purchased/withdrawn = deduct
    let type = 'deduct';
    if (lowerSms.includes('credited') || lowerSms.includes('received') || lowerSms.includes('deposit') || lowerSms.includes('added')) {
      type = 'add';
    }

    // Merchant extraction
    let merchant = 'Bank Transaction';
    const atMatch = smsText.match(/(?:at|to|from|via)\s+([A-Za-z0-9\s&'-]+?)(?:\.\s|\son\s|\sfor\s|\sat\s|\sRef|$)/i);
    if (atMatch && atMatch[1]) {
      merchant = atMatch[1].trim();
    }

    // Category prediction based on merchant & text keywords
    let category = 'General';
    const combinedText = (merchant + ' ' + smsText).toLowerCase();
    if (combinedText.includes('food') || combinedText.includes('restaurant') || combinedText.includes('keells') || combinedText.includes('cargills') || combinedText.includes('kfc') || combinedText.includes('pizza')) {
      category = 'Food & Dining';
    } else if (combinedText.includes('fuel') || combinedText.includes('petrol') || combinedText.includes('uber') || combinedText.includes('pickme') || combinedText.includes('transport')) {
      category = 'Transport';
    } else if (combinedText.includes('ceb') || combinedText.includes('water') || combinedText.includes('slt') || combinedText.includes('dialog') || combinedText.includes('bill')) {
      category = 'Bills & Utilities';
    } else if (combinedText.includes('daraz') || combinedText.includes('fashion') || combinedText.includes('cloth') || combinedText.includes('store')) {
      category = 'Shopping';
    } else if (type === 'add') {
      category = 'Salary / Income';
    }

    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const monthStr = todayStr.slice(0, 7);

    const newTransaction = await Transaction.create({
      userId: req.user._id,
      accountId: targetAccount._id,
      date: todayStr,
      month: monthStr,
      type,
      category,
      description: `[SMS Auto] ${merchant}`,
      amount,
      source: 'sms_auto',
      rawSms: smsText,
      merchant
    });

    res.status(201).json({
      success: true,
      message: 'Bank SMS parsed and transaction auto-logged successfully!',
      transaction: newTransaction
    });
  } catch (error) {
    console.error('Parse SMS Error:', error);
    res.status(500).json({ message: 'Server error parsing bank SMS' });
  }
});

module.exports = router;

