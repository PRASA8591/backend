const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  date: {
    type: String, // YYYY-MM-DD format
    required: true
  },
  month: {
    type: String, // YYYY-MM format
    required: true
  },
  type: {
    type: String,
    enum: ['add', 'deduct'], // add = income, deduct = expense
    required: true
  },
  category: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Number,
    default: Date.now
  }
});

module.exports = mongoose.model('Transaction', TransactionSchema);
