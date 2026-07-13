/**
 * Gửi email (SMTP) — MVP quên mật khẩu.
 * Khi thiếu SMTP_* → isSmtpConfigured() = false → caller dùng sandbox token.
 */
const nodemailer = require('nodemailer');

let _transporter = null;
/** Test hook: inject mock transporter */
let _testTransporter = null;

function getPublicBaseUrl() {
  const raw = process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || 'http://localhost:5000';
  return String(raw).replace(/\/$/, '');
}

function isSmtpConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

function buildPasswordResetLink(rawToken) {
  return getPublicBaseUrl() + '/admin/reset-password.html?token=' + encodeURIComponent(rawToken);
}

function getTransporter() {
  if (_testTransporter) return _testTransporter;
  if (_transporter) return _transporter;
  if (!isSmtpConfigured()) return null;

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  return _transporter;
}

/** Chỉ dùng trong test — inject mock có sendMail */
function setTestTransporter(mock) {
  _testTransporter = mock || null;
  _transporter = null;
}

function resetMailServiceCache() {
  _transporter = null;
  _testTransporter = null;
}

/**
 * @param {{ to: string, resetLink: string, expiresAt: Date }} opts
 */
async function sendPasswordResetEmail(opts) {
  const { to, resetLink, expiresAt } = opts || {};
  if (!to || !resetLink) {
    throw new Error('Thiếu to hoặc resetLink');
  }

  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('SMTP chưa cấu hình');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const expiresText = expiresAt
    ? new Date(expiresAt).toLocaleString('vi-VN')
    : 'trong vòng 1 giờ';

  const subject = 'Đặt lại mật khẩu — Hệ thống bản đồ trong nhà';
  const text =
    'Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu.\n\n' +
    'Mở liên kết sau (có hiệu lực đến ' + expiresText + '):\n' +
    resetLink + '\n\n' +
    'Nếu không phải bạn, hãy bỏ qua email này.\n';

  const html =
    '<p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu.</p>' +
    '<p><a href="' + resetLink + '">Đặt lại mật khẩu</a></p>' +
    '<p style="color:#666;font-size:13px;">Link có hiệu lực đến <strong>' + expiresText + '</strong>.</p>' +
    '<p style="color:#666;font-size:13px;">Nếu không phải bạn, hãy bỏ qua email này.</p>';

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html
  });

  console.log('[Mail] Password reset sent to', to, 'messageId=', info && info.messageId);
  return info;
}

module.exports = {
  isSmtpConfigured,
  getPublicBaseUrl,
  buildPasswordResetLink,
  sendPasswordResetEmail,
  setTestTransporter,
  resetMailServiceCache
};
