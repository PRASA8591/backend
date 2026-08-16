const axios = require('axios');

// Helper function to pause execution (Carrier Rate-Limit Protection)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send an SMS message via official sms-gate.app Cloud API (v1)
 * @param {string} phoneNumber - Recipient phone number (e.g., +94773318853 or 0773318853)
 * @param {string} message - Text message content (keep under 160 chars)
 */
const sendSms = async (phoneNumber, message) => {
  try {
    const targetUrl = process.env.SMS_GATEWAY_URL || 'https://api.sms-gate.app/v1/message';
    const user = process.env.SMS_GATEWAY_USER || '0AWTPN';
    const pass = process.env.SMS_GATEWAY_PASS || 'afsslxw2odrobo';

    if (!phoneNumber) {
      console.warn('[SMS Gateway] Skipping SMS: No recipient phone number provided.');
      return { success: false, message: 'No phone number provided' };
    }

    // Format phone number to international E.164 format (+94773318853)
    let formattedPhone = phoneNumber.trim().replace(/[\s-]/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+94' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    // Ensure (Do Not Reply) notice is on all outgoing SMS messages
    let cleanMessage = message ? String(message).trim() : '';
    if (!cleanMessage.toLowerCase().includes('do not reply') && !cleanMessage.toLowerCase().includes('dont reply')) {
      cleanMessage += ' (Do Not Reply)';
    }

    // Payload expected by official sms-gate Cloud REST API
    const payload = {
      phoneNumbers: [formattedPhone],
      message: cleanMessage
    };

    const authHeader = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

    console.log(`[SMS Gateway] Dispatching SMS to ${formattedPhone}...`);

    const response = await axios.post(targetUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      timeout: 10000
    });

    if (response.status === 200 || response.status === 202) {
      console.log(`[SMS Gateway] ✅ SMS successfully queued for ${formattedPhone}. Status: ${response.status}`);
      return { success: true, data: response.data };
    } else {
      console.error(`[SMS Gateway Error] HTTP ${response.status}:`, response.data);
      return { success: false, error: response.data };
    }
  } catch (error) {
    const errorDetails = error.response ? error.response.data : error.message;
    console.error(`[SMS Gateway Error] Failed sending SMS to ${phoneNumber}:`, errorDetails);
    return { success: false, error: errorDetails };
  }
};

/**
 * Send an automatic alert message to the Admin phone number
 * @param {string} message - Notification text
 */
const sendAdminAlert = async (message) => {
  // Pause for 2.5 seconds to prevent SIM multi-message rejection
  console.log('[SMS Gateway] Waiting 2.5 seconds before triggering Admin SMS...');
  await delay(2500);

  const adminPhone = process.env.ADMIN_PHONE_NUMBER || process.env.ADMIN_HOTLINE_NUMBER || '+94773318853';
  return await sendSms(adminPhone, message);
};

module.exports = {
  sendSms,
  sendAdminAlert
};