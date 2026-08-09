require('dotenv').config();
const { sendEmail, sendVerificationCode } = require('./utils/sendEmail');

async function testEmail() {
  console.log('Testing Email sending with credentials:');
  console.log('ZOHO_EMAIL:', process.env.ZOHO_EMAIL);
  console.log('ZOHO_PASSWORD:', process.env.ZOHO_PASSWORD ? '****** (Set)' : 'MISSING!');

  try {
    console.log('\nAttempting sendVerificationCode to test@example.com...');
    await sendVerificationCode('test@example.com', '123456');
    console.log('Verification email test SUCCESSFUL!');
  } catch (err) {
    console.error('Verification email test FAILED:', err);
  }

  try {
    console.log('\nAttempting sendEmail custom ticket reply...');
    await sendEmail('test@example.com', 'Test Subject', '<p>Test Email Body</p>');
    console.log('Custom email test SUCCESSFUL!');
  } catch (err) {
    console.error('Custom email test FAILED:', err);
  }
}

testEmail();
