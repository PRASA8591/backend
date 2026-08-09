const nodemailer = require('nodemailer');

const ZOHO_USER = (process.env.ZOHO_EMAIL || 'noreply@prasatek.lk').trim();
const ZOHO_PASS = (process.env.ZOHO_PASSWORD || '49GwqcXhPctJ').trim();

// 1. Zoho Standard SSL (Port 465, IPv4)
const transporter1 = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  family: 4,
  auth: { user: ZOHO_USER, pass: ZOHO_PASS },
  tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

// 2. Zoho Pro SSL (Port 465, IPv4)
const transporter2 = nodemailer.createTransport({
  host: 'smtppro.zoho.com',
  port: 465,
  secure: true,
  family: 4,
  auth: { user: ZOHO_USER, pass: ZOHO_PASS },
  tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

// 3. Zoho Standard STARTTLS (Port 587, IPv4)
const transporter3 = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 587,
  secure: false,
  requireTLS: true,
  family: 4,
  auth: { user: ZOHO_USER, pass: ZOHO_PASS },
  tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

// Helper function to send email with automatic multi-transporter fallback
const dispatchMail = async (mailOptions) => {
  mailOptions.from = `"No-Reply PrasaTek" <${ZOHO_USER}>`;

  try {
    const info = await transporter1.sendMail(mailOptions);
    console.log(`[SMTP smtp.zoho.com:465] Email sent to ${mailOptions.to}. MessageId: ${info.messageId}`);
    return info;
  } catch (err1) {
    console.warn(`[SMTP smtp.zoho.com:465 Failed: ${err1.message}]. Retrying with smtppro.zoho.com:465...`);
    try {
      const info = await transporter2.sendMail(mailOptions);
      console.log(`[SMTP smtppro.zoho.com:465] Email sent to ${mailOptions.to}. MessageId: ${info.messageId}`);
      return info;
    } catch (err2) {
      console.warn(`[SMTP smtppro.zoho.com:465 Failed: ${err2.message}]. Retrying with smtp.zoho.com:587...`);
      try {
        const info = await transporter3.sendMail(mailOptions);
        console.log(`[SMTP smtp.zoho.com:587] Email sent to ${mailOptions.to}. MessageId: ${info.messageId}`);
        return info;
      } catch (err3) {
        console.error(`[All Zoho SMTP Transporters Failed] Final Error: ${err3.message}`);
        throw err3;
      }
    }
  }
};

// Function to send generic custom HTML emails (Ticket Replies, Notifications)
const sendEmail = async (toEmail, subject, htmlContent, textContent = '') => {
  if (!ZOHO_USER || !ZOHO_PASS) {
    console.error('SMTP Config Error: ZOHO_EMAIL or ZOHO_PASSWORD environment variable is missing.');
    throw new Error('Email service configuration is missing on server.');
  }

  const mailOptions = {
    from: `"No-Reply PrasaTek" <${ZOHO_USER}>`,
    to: toEmail,
    subject: subject,
    html: htmlContent,
    text: textContent || subject
  };

  return await dispatchMail(mailOptions);
};

// Function to send 6-digit OTP verification codes
const sendVerificationCode = async (toEmail, verificationCode) => {
  if (!ZOHO_USER || !ZOHO_PASS) {
    console.error('SMTP Config Error: ZOHO_EMAIL or ZOHO_PASSWORD environment variable is missing.');
    throw new Error('Email service configuration is missing on server.');
  }

  const mailOptions = {
    from: `"No-Reply PrasaTek" <${ZOHO_USER}>`,
    to: toEmail,
    subject: 'Email Verification Code - PrasaTek',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #334155;">
        
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #0b8c5a; margin: 0; font-size: 24px; font-weight: 800;">PrasaTek System Solutions</h2>
          <p style="color: #64748b; font-size: 13px; margin-top: 4px; font-weight: 600;">ExpenseTracker Pro Security</p>
        </div>

        <div style="border-top: 1px solid #f1f5f9; padding-top: 20px;">
          <h3 style="color: #1e293b; font-size: 18px; margin-bottom: 12px; font-weight: 700;">Email Verification</h3>
          <p style="color: #475569; font-size: 14px; line-height: 1.5;">Please use the following 6-digit verification code to complete your verification:</p>
          
          <div style="text-align: center; margin: 24px 0; background-color: #f8fafc; padding: 18px; border-radius: 12px; border: 1px dashed #cbd5e1;">
            <h1 style="color: #0b8c5a; letter-spacing: 8px; font-size: 34px; margin: 0; font-family: 'Courier New', Courier, monospace; font-weight: bold;">${verificationCode}</h1>
          </div>

          <p style="color: #64748b; font-size: 13px; text-align: center;">This code will expire in <strong>10 minutes</strong>.</p>

          <div style="margin-top: 20px; padding: 12px 16px; background-color: #fffbeeb0; border: 1px solid #fef3c7; border-radius: 8px; text-align: center;">
            <p style="color: #b45309; font-size: 12px; margin: 0; font-weight: bold;">
              ⚠️ This is an automated email. Please DO NOT reply directly to this message.
            </p>
          </div>

          <p style="color: #94a3b8; font-size: 12px; margin-top: 16px; text-align: center;">If you didn't request this code, please ignore this email.</p>
        </div>

        <div style="border-top: 1px solid #f1f5f9; margin-top: 24px; padding-top: 16px; text-align: center; font-size: 12px; color: #64748b;">
          <p style="margin: 0 0 6px 0; font-weight: bold; color: #1e293b;">Need support or have questions?</p>
          <p style="margin: 4px 0;">
            📧 Contact Email: <a href="mailto:info@prasatek.lk" style="color: #0b8c5a; text-decoration: none; font-weight: bold;">info@prasatek.lk</a>
          </p>
          <p style="margin: 4px 0;">
            🌐 Official Website: <a href="https://www.prasatek.lk" target="_blank" style="color: #0b8c5a; text-decoration: none; font-weight: bold;">www.prasatek.lk</a>
          </p>
          <p style="margin-top: 12px; font-size: 11px; color: #94a3b8;">
            © ${new Date().getFullYear()} PrasaTek System Solutions. All rights reserved.
          </p>
        </div>

      </div>
    `,
  };

  return await dispatchMail(mailOptions);
};

module.exports = sendVerificationCode;
module.exports.sendEmail = sendEmail;
module.exports.sendVerificationCode = sendVerificationCode;
