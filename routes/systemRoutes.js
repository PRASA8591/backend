const express = require('express');
const router = express.Router();
const SystemSetting = require('../models/SystemSetting');
const Announcement = require('../models/Announcement');

// @route   GET /api/system/status
// @desc    Public status check for maintenance mode, global banner, and active announcements
router.get('/status', async (req, res) => {
  try {
    const maintenance = await SystemSetting.findOne({ key: 'maintenance_mode' });
    const banner = await SystemSetting.findOne({ key: 'global_banner' });
    
    const now = new Date();
    const activeAnnouncements = await Announcement.find({
      $and: [
        { $or: [{ scheduledStart: { $lte: now } }, { scheduledStart: { $exists: false } }] },
        { $or: [{ scheduledEnd: { $gte: now } }, { scheduledEnd: { $exists: false } }, { scheduledEnd: null }] }
      ]
    }).sort({ createdAt: -1 });

    res.json({
      maintenanceMode: maintenance ? !!maintenance.value : false,
      globalBanner: banner ? banner.value : { enabled: false, message: '', type: 'info' },
      announcements: activeAnnouncements
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving system status' });
  }
});

module.exports = router;
