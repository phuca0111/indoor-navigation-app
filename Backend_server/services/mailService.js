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

/**
 * Phase 8 — nhắc sắp hết hạn gói. Skip quietly nếu chưa cấu hình SMTP.
 * @param {{ to: string, orgName: string, expiresAt: Date, daysLeft: number }} opts
 */
async function sendPlanExpiryReminderEmail(opts) {
  const { to, orgName, expiresAt, daysLeft } = opts || {};
  if (!to) return null;

  const expiresText = expiresAt
    ? new Date(expiresAt).toLocaleString('vi-VN')
    : 'sắp tới';
  const days = Number(daysLeft);
  const daysText = Number.isFinite(days) ? String(days) : '?';
  const name = orgName || 'Tổ chức của bạn';
  const details =
    `Gói của "${name}" hết hạn ${expiresText} (còn khoảng ${daysText} ngày).`;

  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Mail:stub] would send PLAN_EXPIRY_REMINDER to ${to}: ${details}`);
    return { stub: true };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = `Nhắc hạn gói — ${name} còn khoảng ${daysText} ngày`;
  const text =
    `Xin chào,\n\n` +
    `Gói dịch vụ của tổ chức "${name}" sẽ hết hạn vào ${expiresText} ` +
    `(còn khoảng ${daysText} ngày).\n\n` +
    `Vui lòng gia hạn trên trang Billing để tránh gián đoạn.\n`;

  const html =
    `<p>Xin chào,</p>` +
    `<p>Gói dịch vụ của tổ chức <strong>${name}</strong> sẽ hết hạn vào ` +
    `<strong>${expiresText}</strong> (còn khoảng ${daysText} ngày).</p>` +
    `<p>Vui lòng gia hạn trên trang Billing để tránh gián đoạn.</p>`;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html
    });
    console.log('[Mail] Plan expiry reminder sent to', to, 'messageId=', info && info.messageId);
    return info;
  } catch (e) {
    console.warn('[Mail] Plan expiry reminder failed:', e.message || e);
    return null;
  }
}

async function sendBillingEventEmail(opts = {}) {
  const { to, orgName, event, plan, amount, expiresAt } = opts;
  if (!to) return { sent: false, skipped: true };

  const eventLabel = event === 'PAYMENT_SUCCEEDED'
    ? 'Thanh toán thành công'
    : 'Gói dịch vụ đã hết hạn';
  const subject = `${eventLabel} — ${orgName || 'Indoor Nav SaaS'}`;
  const details = event === 'PAYMENT_SUCCEEDED'
    ? `Gói ${plan || ''} đã được thanh toán thành công${amount != null ? ` (${Number(amount).toLocaleString('vi-VN')} VND)` : ''}.`
    : `Gói ${plan || ''} đã hết hạn${expiresAt ? ` vào ${new Date(expiresAt).toLocaleString('vi-VN')}` : ''}.`;

  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Mail:stub] would send ${event} to ${to}: ${details}`);
    return { sent: false, stub: true };
  }

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: `${eventLabel}\n\nTổ chức: ${orgName || '—'}\n${details}\n`,
    html: `<h3>${eventLabel}</h3><p>Tổ chức: <strong>${orgName || '—'}</strong></p><p>${details}</p>`
  });
  console.log('[Mail] Billing event sent to', to, 'event=', event);
  return { sent: true, info };
}

/**
 * B5 — email lời mời thành viên tổ chức.
 */
async function sendOrgInviteEmail(opts = {}) {
  const { to, orgName, role, acceptUrl, expiresAt } = opts;
  if (!to) return { sent: false, skipped: true };

  const roleLabel = role === 'ORG_ADMIN' ? 'Quản trị tổ chức' : 'Quản trị tòa nhà';
  const expiresText = expiresAt
    ? new Date(expiresAt).toLocaleString('vi-VN')
    : '7 ngày tới';
  const details =
    `Bạn được mời vào tổ chức "${orgName || '—'}" với vai trò ${roleLabel}. ` +
    `Hạn nhận lời mời: ${expiresText}.`;

  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[Mail:stub] would send ORG_INVITE to ${to}: ${details} url=${acceptUrl || ''}`);
    return { sent: false, stub: true };
  }

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Lời mời tham gia tổ chức — ${orgName || 'Indoor Nav SaaS'}`,
    text:
      `${details}\n\n` +
      `Mở liên kết sau khi đăng nhập bằng đúng email này:\n${acceptUrl || ''}\n`,
    html:
      `<p>${details}</p>` +
      `<p><a href="${acceptUrl || '#'}">Nhận lời mời</a></p>` +
      `<p>Đăng nhập bằng đúng email <strong>${to}</strong> trước khi nhận lời mời.</p>`
  });
  console.log('[Mail] Org invite sent to', to);
  return { sent: true, info };
}

module.exports = {
  isSmtpConfigured,
  getTransporter,
  getPublicBaseUrl,
  buildPasswordResetLink,
  sendPasswordResetEmail,
  sendPlanExpiryReminderEmail,
  sendBillingEventEmail,
  sendOrgInviteEmail,
  setTestTransporter,
  resetMailServiceCache
};
