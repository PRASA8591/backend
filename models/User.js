const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  mobile: {
    type: String,
    default: ''
  },
  picture: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['user', 'manager', 'admin'],
    default: 'user'
  },
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  },
  org: {
    type: String,
    default: 'default'
  },
  monthlyBudgetLimit: {
    type: Number,
    default: 50000
  },
  plan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free'
  },
  planType: {
    type: String,
    enum: ['monthly', 'yearly', 'none'],
    default: 'none'
  },
  planStatus: {
    type: String,
    enum: ['active', 'expired', 'canceled'],
    default: 'active'
  },
  planStartDate: {
    type: Date,
    default: Date.now
  },
  planExpiryDate: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default 30 days
  },
  profilePhoto: {
    type: String,
    default: ''
  },
  theme: {
    type: String,
    enum: ['light', 'dark', 'forest', 'nordic', 'cyberpunk'],
    default: 'light'
  },
  currency: {
    type: String,
    default: 'RS'
  },
  notificationsEnabled: {
    type: Boolean,
    default: true
  },
  lastLoginAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);
