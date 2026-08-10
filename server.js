require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const path = require('path');
const authRoutes = require('./routes/authRoutes');
const accountRoutes = require('./routes/accountRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const contactRoutes = require('./routes/contactRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const systemRoutes = require('./routes/systemRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { initCronScheduler } = require('./services/cronScheduler');

const app = express();

// Middlewares
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/system', systemRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    message: 'Expense Tracker Pro API is running...',
    dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'connecting'
  });
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// Start server listening immediately on 0.0.0.0 so Render host proxy routes traffic
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

// Connect to MongoDB asynchronously
if (!MONGO_URI) {
  console.error('CRITICAL: MONGO_URI environment variable is missing.');
} else {
  mongoose.connect(MONGO_URI)
    .then(async () => {
      console.log('MongoDB connected successfully.');
      initCronScheduler();

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
    });
}
