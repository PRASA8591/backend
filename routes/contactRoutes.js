const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const { protect, isManagerOrAdmin } = require('../middleware/authMiddleware');

// @route   POST /api/contacts
// @desc    Submit a new contact message (Public)
router.post('/', async (req, res) => {
  const { name, email, category, subject, message } = req.body;

  try {
    if (!name || !email || !category || !subject || !message) {
      return res.status(400).json({ message: 'Please fill in all fields' });
    }

    const newContact = await Contact.create({
      name,
      email,
      category,
      subject,
      message
    });

    res.status(201).json({
      message: 'Contact form submitted successfully',
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

// @route   PUT /api/contacts/:id/read
// @desc    Mark a contact message as read (Admin/Manager only)
router.put('/:id/read', protect, isManagerOrAdmin, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Message not found' });
    }

    contact.status = 'read';
    await contact.save();
    res.json({ message: 'Message marked as read', contact });
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
