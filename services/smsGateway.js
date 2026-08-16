const axios = require('axios');

// Helper function to pause execution (Carrier Rate-Limit Protection)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Standard Automated System Footer
const SYSTEM_FOOTER = `\n\n(No-reply. Automated message. Contact: www.prasatek.lk | info@prasatek.lk | 0719323239)`;

/**
 * Normalizes phone numbers to standard E.164 format (+94...)
 */
const formatSriLankanPhoneNumber = (phone) => {
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('0')) {
    return '+94' + cleaned.slice(1);
  }
  if (cleaned.startsWith('94') && !cleaned.startsWith('+94')) {
    return '+' + cleaned;
  }
  if (!cleaned.startsWith('+')) {
    return '+94' + cleaned;
  }
  return cleaned;
};

/**
 * Send an SMS message via official sms-gate.app Cloud API (v1)
 * @param {string} phoneNumber - Recipient phone number (e.g., 0773318853)
 * @param {string} message - Text message content
 * @param {boolean} includeFooter - Auto append automated/contact disclaimer (Default: true)
 */
const sendSms = async (phoneNumber, message, includeFooter = true) => {
  try {
    const targetUrl = process.env.SMS_GATEWAY_URL || 'https://api.sms-gate.app/v1/message';
    const username = process.env.SMS_GATEWAY_USER;
    const password = process.env.SMS_GATEWAY_PASS;

    if (!username || !password) {
      console.error('[SMS Gateway] Missing credentials in environment variables.');
      return { success: false, error: 'SMS Gateway credentials not configured.' };
    }

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      console.warn('[SMS Gateway] Skipping SMS: Invalid or missing phone number.');
      return { success: false, error: 'No phone number provided' };
    }

    if (!message || typeof message !== 'string') {
      console.warn('[SMS Gateway] Skipping SMS: Empty message body.');
      return { success: false, error: 'Message body cannot be empty' };
    }

    const formattedPhone = formatSriLankanPhoneNumber(phoneNumber);

    // Append contact details and automated note
    const finalMessage = includeFooter
      ? `${message.trim()}${SYSTEM_FOOTER}`
      : message.trim();

    const payload = {
      phoneNumbers: [formattedPhone],
      message: finalMessage
    };

    console.log(`[SMS Gateway] Dispatching SMS to ${formattedPhone}...`);

    const response = await axios.post(targetUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      auth: {
        username,
        password
      },
      timeout: 10000
    });

    if (response.status >= 200 && response.status < 300) {
      console.log(`[SMS Gateway] ✅ SMS queued for ${formattedPhone}. Status: ${response.status}`);
      return { success: true, data: response.data };
    }

    return { success: false, error: response.data };
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error(`[SMS Gateway Error] Failed sending SMS to ${phoneNumber}:`, errorDetails);
    return { success: false, error: errorDetails };
  }
};

/**
 * Send an automatic alert message to the Admin phone number
 */
const sendAdminAlert = async (message) => {
  console.log('[SMS Gateway] Waiting 2.5 seconds before triggering Admin SMS...');
  await delay(2500);

  const adminPhone = process.env.ADMIN_PHONE_NUMBER || process.env.ADMIN_HOTLINE_NUMBER;
  if (!adminPhone) {
    console.warn('[SMS Gateway] Admin phone number not found in environment variables.');
    return { success: false, error: 'Admin phone number not configured' };
  }

  // Set false so admin messages stay short without the contact footer
  return await sendSms(adminPhone, message, false);
};

module.exports = {
  sendSms,
  sendAdminAlert
};