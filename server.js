require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const contactRoutes = require('./routes/contactRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Expense Tracker Pro API is running...' });
});

// Database connection
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('CRITICAL: MONGO_URI environment variable is missing.');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected successfully.');

    const cron = require('node-cron');
    const User = require('./models/User');
    const Transaction = require('./models/Transaction');

    // Migrate existing users who do not have a plan field set to Enterprise
    try {
      const migrateResult = await User.updateMany(
        { plan: { $exists: false } },
        { $set: { plan: 'enterprise', planType: 'yearly', planStatus: 'active' } }
      );
      if (migrateResult.modifiedCount > 0) {
        console.log(`Migration: Upgraded ${migrateResult.modifiedCount} existing users to Enterprise plan.`);
      }
    } catch (err) {
      console.error('Migration Error:', err.message);
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

    // Start Daily Cron Job for Free Plan History Retention Cleanup (older than 90 days)
    cron.schedule('0 0 * * *', async () => {
      console.log('Cron: Starting daily transaction history retention cleanup for Free users...');
      try {
        const cutoffTimestamp = Date.now() - (90 * 24 * 60 * 60 * 1000);
        const freeUsers = await User.find({ plan: 'free' }).select('_id');
        const freeUserIds = freeUsers.map(u => u._id);

        if (freeUserIds.length > 0) {
          const deleteResult = await Transaction.deleteMany({
            userId: { $in: freeUserIds },
            timestamp: { $lt: cutoffTimestamp }
          });
          console.log(`Cron: Successfully deleted ${deleteResult.deletedCount} transactions older than 90 days.`);
        } else {
          console.log('Cron: No Free plan users found.');
        }
      } catch (error) {
        console.error('Cron: Error cleaning up transactions history:', error.message);
      }
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
