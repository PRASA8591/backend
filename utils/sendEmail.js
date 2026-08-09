const nodemailer = require('nodemailer');

// Configure Zoho SMTP Transporter using Port 587 (TLS/STARTTLS) for Render Cloud Compatibility
const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 587,
  secure: false, // Must be false for Port 587 STARTTLS
  requireTLS: true,
  auth: {
    user: process.env.ZOHO_EMAIL,
    pass: process.env.ZOHO_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

// Function to send verification code
const sendVerificationCode = async (toEmail, verificationCode) => {
  if (!process.env.ZOHO_EMAIL || !process.env.ZOHO_PASSWORD) {
    console.error('SMTP Config Error: ZOHO_EMAIL or ZOHO_PASSWORD environment variable is missing.');
    throw new Error('Email service configuration is missing on server.');
  }

  const mailOptions = {
    from: `"No-Reply PrasaTek" <${process.env.ZOHO_EMAIL}>`,
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
          <p style="color: #475569; font-size: 14px; line-height: 1.5;">Please use the following 6-digit verification code to complete your registration:</p>
          
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

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to ${toEmail}. MessageId: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`Failed to send verification email to ${toEmail}:`, error.message);
    throw error;
  }
};

module.exports = sendVerificationCode;
