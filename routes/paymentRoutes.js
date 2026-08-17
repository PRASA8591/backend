const express = require('express');
const router = express.Router();
const PaymentOrder = require('../models/PaymentOrder');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { upload, processUploadedFile } = require('../middleware/upload');
const { sendSms, sendAdminAlert } = require('../services/smsGateway');

const BANK_DETAILS = {
  bankName: 'Commercial Bank of Ceylon PLC',
  branch: 'Horana Branch',
  accountNo: '8018225859',
  accountName: 'NPP Indrajith',
  currency: 'LKR'
};

const PLAN_PRICES = {
  pro: {
    monthly: 199,
    yearly: 1900
  },
  enterprise: {
    monthly: 499,
    yearly: 4900
  }
};

// @route   POST /api/payments/create-order
// @desc    Generate unique Order ID, create draft order in DB & return bank details
// @access  Private
router.post('/create-order', protect, async (req, res) => {
  try {
    const { plan, billingCycle = 'monthly', termsAgreed = true } = req.body;

    if (!['pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan selected.' });
    }

    const selectedCycle = ['monthly', 'yearly'].includes(billingCycle) ? billingCycle : 'monthly';
    const amount = PLAN_PRICES[plan][selectedCycle];

    // Check if user already has an active draft order for this plan
    let existingDraft = await PaymentOrder.findOne({
      userId: req.user._id,
      status: 'draft'
    });

    if (existingDraft) {
      existingDraft.plan = plan;
      existingDraft.billingCycle = selectedCycle;
      existingDraft.amount = amount;
      existingDraft.termsAgreed = termsAgreed;
      existingDraft.termsAgreedAt = new Date();
      await existingDraft.save();

      return res.json({
        success: true,
        orderId: existingDraft.orderId,
        plan,
        billingCycle: selectedCycle,
        amount,
        currency: 'LKR',
        bankDetails: BANK_DETAILS,
        order: existingDraft
      });
    }

    const year = new Date().getFullYear();
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    const orderId = `ORD-${year}-${randomNum}`;

    const newOrder = await PaymentOrder.create({
      orderId,
      userId: req.user._id,
      plan,
      billingCycle: selectedCycle,
      amount,
      status: 'draft',
      termsAgreed: termsAgreed,
      termsAgreedAt: new Date()
    });

    res.json({
      success: true,
      orderId,
      plan,
      billingCycle: selectedCycle,
      amount,
      currency: 'LKR',
      bankDetails: BANK_DETAILS,
      order: newOrder
    });
  } catch (error) {
    console.error('Create Order Error:', error);
    res.status(500).json({ message: 'Server error generating order reference.' });
  }
});

// @route   GET /api/payments/active-draft
// @desc    Fetch active draft or pending order for authenticated user
// @access  Private
router.get('/active-draft', protect, async (req, res) => {
  try {
    const activeOrder = await PaymentOrder.findOne({
      userId: req.user._id,
      status: { $in: ['draft', 'pending'] }
    }).sort({ createdAt: -1 });

    res.json(activeOrder || null);
  } catch (error) {
    console.error('Fetch Active Draft Error:', error);
    res.status(500).json({ message: 'Server error fetching active draft order.' });
  }
});

// @route   DELETE /api/payments/cancel-order/:id
// @desc    Cancel draft payment order
// @access  Private
router.delete('/cancel-order/:id', protect, async (req, res) => {
  try {
    const order = await PaymentOrder.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!order) {
      return res.status(404).json({ message: 'Draft order not found.' });
    }

    order.status = 'cancelled';
    await order.save();

    // Reset user pendingPlan if it matches
    await User.findByIdAndUpdate(req.user._id, { pendingPlan: 'none' });

    res.json({ success: true, message: 'Draft order cancelled successfully.' });
  } catch (error) {
    console.error('Cancel Order Error:', error);
    res.status(500).json({ message: 'Server error cancelling order.' });
  }
});

// @route   POST /api/payments/upload-proof
// @desc    Upload payment slip, set order to pending, trigger optimized user & admin SMS
// @access  Private
router.post('/upload-proof', protect, upload.single('receipt'), async (req, res) => {
  try {
    const { orderId, plan, billingCycle = 'monthly', userNotes = '' } = req.body;

    if (!orderId || !plan) {
      return res.status(400).json({ message: 'Order ID and Plan are required.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Payment slip receipt file is required.' });
    }

    const receiptUrl = await processUploadedFile(req.file, req);
    const selectedCycle = ['monthly', 'yearly'].includes(billingCycle) ? billingCycle : 'monthly';
    const amount = PLAN_PRICES[plan] ? (PLAN_PRICES[plan][selectedCycle] || 0) : 0;

    let order = await PaymentOrder.findOne({ orderId });
    if (order) {
      order.receiptUrl = receiptUrl;
      order.userNotes = userNotes;
      order.status = 'pending';
      order.createdAt = new Date();
      await order.save();
    } else {
      order = await PaymentOrder.create({
        orderId,
        userId: req.user._id,
        plan,
        billingCycle: selectedCycle,
        amount,
        receiptUrl,
        userNotes,
        status: 'pending',
        termsAgreed: true
      });
    }

    // Update user pending plan status
    await User.findByIdAndUpdate(req.user._id, {
      pendingPlan: plan
    });

    // 1. User Confirmation SMS (Short & Clean)
    const userPhone = req.user.mobile || req.user.phone;
    if (userPhone) {
      const userMsg = `Hello ${req.user.name}, your payment proof for ${orderId} has been received. Thank you!`;
      await sendSms(userPhone, userMsg);
    }

    // 2. Admin Alert SMS (Shortened under 160 chars to prevent Dialog Error 72)
    const adminSmsText = `Alert: New payment ${orderId} (${plan.toUpperCase()}) LKR ${amount} received from ${req.user.name}. Check admin portal.`;
    await sendAdminAlert(adminSmsText);

    res.json({
      success: true,
      message: 'Payment proof uploaded successfully! Your order is pending admin verification.',
      order
    });
  } catch (error) {
    console.error('Upload Proof Error:', error);
    res.status(500).json({ message: error.message || 'Server error processing payment slip upload.' });
  }
});

// @route   GET /api/payments/my-orders
// @desc    Fetch payment history for authenticated user
// @access  Private
router.get('/my-orders', protect, async (req, res) => {
  try {
    const orders = await PaymentOrder.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Fetch My Orders Error:', error);
    res.status(500).json({ message: 'Server error fetching payment orders.' });
  }
});

module.exports = router;