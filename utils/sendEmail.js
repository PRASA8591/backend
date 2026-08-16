const { Resend } = require('resend');

const RESEND_KEY = (process.env.RESEND_API_KEY || '').trim();
const resend = new Resend(RESEND_KEY);

// Helper function to dispatch emails via Resend API with domain fallback
const dispatchResendEmail = async ({ to, subject, html, text }) => {
  const customSender = process.env.RESEND_FROM_EMAIL || 'No-Reply PrasaTek <noreply@prasatek.lk>';
  const fallbackSender = 'PrasaTek <onboarding@resend.dev>';

  try {
    const { data, error } = await resend.emails.send({
      from: customSender,
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      html: html,
      text: text || subject
    });

    if (error) {
      console.warn(`[Resend Custom Domain Warning: ${error.message}]. Retrying with onboarding sender...`);
      const fallbackResult = await resend.emails.send({
        from: fallbackSender,
        to: Array.isArray(to) ? to : [to],
        subject: subject,
        html: html,
        text: text || subject
      });

      if (fallbackResult.error) {
        throw new Error(fallbackResult.error.message || 'Failed to send email via Resend API.');
      }

      console.log(`[Resend API Success - Onboarding Sender] Email sent to ${to}. Message ID: ${fallbackResult.data.id}`);
      return fallbackResult.data;
    }

    console.log(`[Resend API Success - Custom Sender] Email sent to ${to}. Message ID: ${data.id}`);
    return data;
  } catch (err) {
    console.error(`[Resend API Error] Failed to send email to ${to}:`, err.message);
    throw err;
  }
};

// Helper function to ensure all outgoing emails include the standardized DO NOT REPLY notice & support footer
const ensureEmailFooter = (htmlContent) => {
  if (!htmlContent) return '';
  if (htmlContent.includes('DO NOT reply') || htmlContent.includes('do not reply') || htmlContent.includes('Do not reply')) {
    return htmlContent;
  }
  const footerNote = `
    <div style="margin-top: 24px; padding: 12px 16px; background-color: #fffbeeb0; border: 1px solid #fef3c7; border-radius: 8px; text-align: center; font-family: Arial, sans-serif;">
      <p style="color: #b45309; font-size: 12px; margin: 0; font-weight: bold;">
        ⚠️ This is an automated notification. Please DO NOT reply directly to this email.
      </p>
    </div>
    <div style="border-top: 1px solid #f1f5f9; margin-top: 20px; padding-top: 16px; text-align: center; font-size: 12px; color: #64748b; font-family: Arial, sans-serif;">
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
  `;
  return htmlContent + footerNote;
};

// Function to send generic custom HTML emails (Ticket Replies, Notifications, Expiry Warnings)
const sendEmail = async (toEmail, subject, htmlContent, textContent = '') => {
  const finalHtml = ensureEmailFooter(htmlContent);
  const finalText = textContent ? `${textContent}\n\n(Please do not reply directly to this email.)` : `${subject}\n\n(Please do not reply directly to this email.)`;

  return await dispatchResendEmail({
    to: toEmail,
    subject: subject,
    html: finalHtml,
    text: finalText
  });
};

// Function to send 6-digit OTP verification codes
const sendVerificationCode = async (toEmail, verificationCode) => {
  const htmlContent = `
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
  `;

  return await dispatchResendEmail({
    to: toEmail,
    subject: 'Email Verification Code - PrasaTek',
    html: htmlContent,
    text: `Your PrasaTek verification code is: ${verificationCode}\n\n(Please do not reply directly to this email.)`
  });
};

// Function to send matched-style Welcome & Registration Congratulations email
const sendWelcomeEmail = async (toEmail, userName = '') => {
  const displayName = userName ? String(userName).trim() : 'Valued Member';
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 28px 24px; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; color: #334155;">
      
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background-color: #ecfdf5; padding: 8px 16px; border-radius: 9999px; margin-bottom: 12px; border: 1px solid #a7f3d0;">
          <span style="color: #0b8c5a; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Official Registration</span>
        </div>
        <h2 style="color: #0b8c5a; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">PrasaTek System Solutions</h2>
        <p style="color: #64748b; font-size: 13px; margin-top: 4px; font-weight: 600;">ExpenseTracker Pro — Smart Financial Platform</p>
      </div>

      <div style="border-top: 1px solid #f1f5f9; padding-top: 24px;">
        <h3 style="color: #0f172a; font-size: 20px; margin-bottom: 8px; font-weight: 800;">
          🎉 Congratulations, ${displayName}!
        </h3>
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-top: 0;">
          You have successfully registered for <strong>ExpenseTracker Pro</strong>! Your personal financial management portal is ready to help you track expenses, analyze cash flow, and achieve financial clarity.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; margin: 20px 0;">
          <h4 style="color: #1e293b; margin: 0 0 12px 0; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
            ✨ What you can do right now:
          </h4>
          <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 13px; line-height: 1.8;">
            <li><strong>Multi-Account Wallets:</strong> Link Cash, Bank Accounts, Cards & Digital Wallets.</li>
            <li><strong>Automated Bank SMS:</strong> Auto-record transactional SMS messages in seconds.</li>
            <li><strong>Visual Analytics:</strong> View monthly income vs. expense cash flow breakdowns.</li>
            <li><strong>Export Reports:</strong> Generate audit-ready CSV and Excel financial statements.</li>
          </ul>
        </div>

        <div style="text-align: center; margin: 28px 0 20px 0;">
          <a href="https://cash.prasatek.lk/dashboard" style="background-color: #0b8c5a; color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; padding: 14px 28px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 12px rgba(11, 140, 90, 0.25);">
            Access My Dashboard →
          </a>
        </div>

        <div style="margin-top: 24px; padding: 12px 16px; background-color: #fffbeeb0; border: 1px solid #fef3c7; border-radius: 8px; text-align: center;">
          <p style="color: #b45309; font-size: 12px; margin: 0; font-weight: bold;">
            ⚠️ This is an automated email. Please DO NOT reply directly to this message.
          </p>
        </div>
      </div>

      <div style="border-top: 1px solid #f1f5f9; margin-top: 24px; padding-top: 16px; text-align: center; font-size: 12px; color: #64748b;">
        <p style="margin: 0 0 6px 0; font-weight: bold; color: #1e293b;">Need help getting started?</p>
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
  `;

  return await dispatchResendEmail({
    to: toEmail,
    subject: "🎉 Congratulations! You're successfully registered to ExpenseTracker Pro",
    html: htmlContent,
    text: `Congratulations ${displayName}! You are successfully registered to ExpenseTracker Pro.\nAccess your dashboard at: https://cash.prasatek.lk/dashboard\n\n(Please do not reply directly to this email.)`
  });
};

module.exports = sendVerificationCode;
module.exports.sendEmail = sendEmail;
module.exports.sendVerificationCode = sendVerificationCode;
module.exports.sendWelcomeEmail = sendWelcomeEmail;
