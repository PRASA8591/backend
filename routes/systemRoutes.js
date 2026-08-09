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

    const hqAddressSetting = await SystemSetting.findOne({ key: 'hq_address' });
    const hqMapUrlSetting = await SystemSetting.findOne({ key: 'hq_map_url' });

    res.json({
      maintenanceMode: maintenance ? !!maintenance.value : false,
      globalBanner: banner ? banner.value : { enabled: false, message: '', type: 'info' },
      announcements: activeAnnouncements,
      hqAddress: hqAddressSetting ? hqAddressSetting.value : 'Kottawa Road, Colombo District, Sri Lanka',
      hqMapUrl: hqMapUrlSetting ? hqMapUrlSetting.value : 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3961.385418197779!2d79.9610!3d6.8440!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ae2501a3512e02d%3A0x6b4f738e4a9e5251!2sKottawa%2C%20Pannipitiya!5e0!3m2!1sen!2slk!4v1700000000000!5m2!1sen!2slk'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving system status' });
  }
});

module.exports = router;
