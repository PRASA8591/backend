const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  initialBalance: {
    type: Number,
    required: true,
    default: 0
  },
  timestamp: {
    type: Number,
    default: Date.now
  }
});

module.exports = mongoose.model('Account', AccountSchema);
