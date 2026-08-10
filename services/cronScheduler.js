const cron = require('node-cron');
const User = require('../models/User');
const { sendEmail } = require('../utils/sendEmail');
const { sendSms } = require('./smsGateway');

const initCronScheduler = () => {
  console.log('Initializing Daily Cron Scheduler for Subscription Monitoring...');

  // Run midnight daily at 00:00
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily subscription check...');
    try {
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // 1. Check 7-Day Expiry Warning
      const usersToWarn = await User.find({
        planExpiresAt: { $gt: now, $lte: sevenDaysFromNow },
        expiryWarningSent: false,
        plan: { $ne: 'free' }
      });

      for (const user of usersToWarn) {
        const formattedDate = user.planExpiresAt ? new Date(user.planExpiresAt).toLocaleDateString() : 'soon';
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <h2 style="color: #d97706; margin-top: 0;">Subscription Expiry Notice ⚠️</h2>
            <p>Dear <strong>${user.name}</strong>,</p>
            <p>Your ExpenseTracker Pro <strong>${user.plan.toUpperCase()}</strong> plan will expire in 7 days on <strong>${formattedDate}</strong>.</p>
            <p>To avoid losing premium access, please renew your subscription by making a bank deposit and submitting your payment proof in your account settings.</p>
            <p style="margin-top: 20px;"><a href="https://prasatek.lk/upgrade" style="background-color: #0b8c5a; color: white; padding: 10px 18px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Renew Plan Now</a></p>
            <p style="color: #64748b; font-size: 12px; margin-top: 24px;">© PrasaTek System Solutions</p>
          </div>
        `;
        
        try {
          await sendEmail(user.email, '⚠️ ExpenseTracker Pro Plan Expiring Soon', html);
          await sendSms(user.mobile, `ExpenseTracker Pro: Your ${user.plan.toUpperCase()} plan expires on ${formattedDate}. Renew at prasatek.lk`);
          user.expiryWarningSent = true;
          await user.save();
          console.log(`[Cron] Sent 7-day expiry warning to ${user.email}`);
        } catch (err) {
          console.error(`[Cron] Failed warning user ${user.email}:`, err.message);
        }
      }

      // 2. Check Expired Plans & Auto-downgrade to Free Tier
      const expiredUsers = await User.find({
        planExpiresAt: { $lte: now },
        plan: { $ne: 'free' }
      });

      for (const user of expiredUsers) {
        user.plan = 'free';
        user.planType = 'none';
        user.planStatus = 'expired';
        user.pendingPlan = 'none';
        user.planExpiresAt = null;
        user.expiryWarningSent = false;
        await user.save();

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <h2 style="color: #dc2626; margin-top: 0;">Subscription Expired</h2>
            <p>Dear <strong>${user.name}</strong>,</p>
            <p>Your subscription has expired. Your account has been automatically moved to the <strong>Free Tier</strong>.</p>
            <p>You can upgrade anytime to restore full Pro features.</p>
            <p style="color: #64748b; font-size: 12px; margin-top: 24px;">© PrasaTek System Solutions</p>
          </div>
        `;

        try {
          await sendEmail(user.email, 'ExpenseTracker Pro Plan Expired', html);
          await sendSms(user.mobile, 'ExpenseTracker Pro: Your plan has expired and reverted to Free tier. Upgrade at prasatek.lk');
          console.log(`[Cron] Downgraded expired user ${user.email} to free tier.`);
        } catch (err) {
          console.error(`[Cron] Failed sending downgrade notification to ${user.email}:`, err.message);
        }
      }
    } catch (error) {
      console.error('[Cron] Error in daily subscription cron:', error.message);
    }
  });
};

module.exports = { initCronScheduler };
