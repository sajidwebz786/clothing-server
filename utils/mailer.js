let transporter = null;

try {
  const nodemailer = require('nodemailer');
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
} catch {
  transporter = null;
}

const sendMail = async ({ to, subject, text }) => {
  const from = process.env.MAIL_FROM || 'Wildzoc <support@wildzoc.com>';
  if (transporter) {
    return transporter.sendMail({ from, to, subject, text });
  }

  console.log('[MAIL:FALLBACK]', { from, to, subject, text });
  return { accepted: to ? [to] : [], fallback: true };
};

const notifyAdmin = (subject, text) => {
  const adminEmail = process.env.ADMIN_EMAIL || 'support@wildzoc.com';
  return sendMail({ to: adminEmail, subject, text });
};

module.exports = { sendMail, notifyAdmin };
