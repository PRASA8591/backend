const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const { sendEmail } = require('../utils/sendEmail');
const { protect, isManagerOrAdmin } = require('../middleware/authMiddleware');

// @route   POST /api/contacts
// @desc    Submit a new contact message (Public)
router.post('/', async (req, res) => {
  const { name, email, mobile, category, subject, message } = req.body;

  try {
    if (!name || !email || !category || !subject || !message) {
      return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    const newContact = await Contact.create({
      name,
      email,
      mobile: mobile || '',
      category,
      subject,
      message
    });

    res.status(201).json({
      message: 'Support inquiry ticket submitted successfully',
      contact: newContact
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during contact form submission' });
  }
});

// @route   GET /api/contacts
// @desc    Get all contact messages (Admin/Manager only)
router.get('/', protect, isManagerOrAdmin, async (req, res) => {
  try {
    const contacts = await Contact.find({}).sort({ createdAt: -1 });
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving contact messages' });
  }
});

// @route   POST /api/contacts/:id/reply
// @desc    Admin reply to a client support ticket via email
router.post('/:id/reply', protect, isManagerOrAdmin, async (req, res) => {
  const { replyMessage } = req.body;
  try {
    if (!replyMessage || !replyMessage.trim()) {
      return res.status(400).json({ message: 'Reply message cannot be empty' });
    }

    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Support ticket not found' });
    }

    const subject = `Re: [Ticket #${contact._id.toString().slice(-6)}] ${contact.subject}`;
    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        <div style="background-color: #0b8c5a; padding: 24px; text-align: center; color: #ffffff;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800;">Prasatek System Support</h2>
          <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Official Ticket Resolution Notice</p>
        </div>
        <div style="padding: 28px; color: #1e293b;">
          <p style="font-size: 15px; font-weight: 700; margin-top: 0;">Dear ${contact.name},</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">Our support team has reviewed and responded to your inquiry regarding <strong>"${contact.subject}"</strong>:</p>
          
          <div style="background-color: #f8fafc; border-left: 4px solid #0b8c5a; padding: 16px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #334155; line-height: 1.6; white-space: pre-wrap;">${replyMessage}</div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px;">
            <p style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin: 0 0 8px 0;">Original Inquiry Summary:</p>
            <p style="font-size: 12px; color: #64748b; margin: 0;"><strong>Category:</strong> ${contact.category}</p>
            <p style="font-size: 12px; color: #64748b; margin: 4px 0 0 0;"><strong>Original Message:</strong> "${contact.message}"</p>
          </div>
        </div>
        <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0; font-weight: 600;">Do not reply directly to this automated email message.</p>
          <p style="margin: 4px 0 0 0;">If you have further questions, please visit <a href="https://cash.prasatek.lk/contact" style="color: #0b8c5a; text-decoration: underline;">Prasatek Support</a>.</p>
        </div>
      </div>
    `;

    await sendEmail(contact.email, subject, htmlContent);

    contact.adminReply = replyMessage;
    contact.repliedAt = new Date();
    contact.status = 'replied';
    await contact.save();

    res.json({
      message: `Reply email successfully sent to ${contact.email}`,
      contact
    });
  } catch (error) {
    console.error('Support reply email error:', error);
    res.status(500).json({ message: error.message ? `Email error: ${error.message}` : 'Failed to send reply email to client.' });
  }
});

// @route   PUT /api/contacts/:id/read
// @desc    Mark a contact message as read / resolved
router.put('/:id/read', protect, isManagerOrAdmin, async (req, res) => {
  const { status } = req.body;
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Message not found' });
    }

    contact.status = status || 'read';
    await contact.save();
    res.json({ message: 'Message status updated', contact });
  } catch (error) {
    res.status(500).json({ message: 'Server error updating message status' });
  }
});

// @route   DELETE /api/contacts/:id
// @desc    Delete a contact message (Admin/Manager only)
router.delete('/:id', protect, isManagerOrAdmin, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Message not found' });
    }

    await contact.deleteOne();
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting message' });
  }
});

module.exports = router;
