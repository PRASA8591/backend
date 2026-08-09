const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'success', 'maintenance'],
    default: 'info'
  },
  scheduledStart: {
    type: Date,
    default: Date.now
  },
  scheduledEnd: {
    type: Date
  },
  createdByName: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Announcement', announcementSchema);
