const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'prasatek_secret_key_123_abc');
      
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }

      if (req.user.status === 'suspended') {
        return res.status(403).json({ message: 'Your account is suspended' });
      }

      // Check Maintenance Mode safely (never throw or block on error)
      try {
        const maintenance = await SystemSetting.findOne({ key: 'maintenance_mode' });
        if (maintenance && maintenance.value === true && req.user.role !== 'admin') {
          return res.status(503).json({ 
            message: 'System is currently undergoing scheduled maintenance. Non-admin users are logged out.',
            maintenanceMode: true 
          });
        }
      } catch (settingErr) {
        console.error('Safe Maintenance Mode check error:', settingErr.message);
      }

      next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Admins only' });
  }
};

const isManagerOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'manager')) {
    next();
  } else {
    res.status(403).json({ message: 'Access denied: Managers/Admins only' });
  }
};

module.exports = { protect, isAdmin, isManagerOrAdmin };
