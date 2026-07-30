/**
 * Gửi email — SMTP (local) hoặc HTTPS API (Resend/Brevo) cho Render.
 * Render thường chặn outbound SMTP (ETIMEDOUT tới smtp.gmail.com:587).
 * Khi thiếu cấu hình mail → isMailConfigured() = false → caller dùng sandbox token.
 */
const dns = require('dns');
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
    String(process.env.SMTP_PASS || '').replace(/\s+/g, '')
  );
}

function isHttpsMailConfigured() {
  return !!(process.env.RESEND_API_KEY || process.env.BREVO_API_KEY);
}

/** SMTP, Resend/Brevo HTTPS, hoặc mock transporter (integration test) */
function isMailConfigured() {
  return Boolean(_testTransporter) || isHttpsMailConfigured() || isSmtpConfigured();
}

/** Test hook đang inject mock — caller có thể gửi sync để assert. */
function hasTestTransporter() {
  return Boolean(_testTransporter);
}

function buildPasswordResetLink(rawToken) {
  return getPublicBaseUrl() + '/admin/reset-password.html?token=' + encodeURIComponent(rawToken);
}

function isResendRestrictedFromEmail(email) {
  const e = String(email || '').toLowerCase().trim();
  return (
    !e ||
    e === 'onboarding@resend.dev' ||
    e.endsWith('@gmail.com') ||
    e.endsWith('@googlemail.com') ||
    /email_gmail_cua_ban|your@gmail\.com|example\.com/i.test(e)
  );
}

/** From ưu tiên domain đã verify khi gửi qua Resend (tránh chỉ gửi được tới email tài khoản Resend). */
function resolveVerifiedResendFrom() {
  const explicit = String(process.env.RESEND_FROM || '').trim();
  if (explicit && !isResendRestrictedFromEmail(parseFromAddress(explicit).email)) {
    return explicit;
  }
  try {
    const host = new URL(getPublicBaseUrl()).hostname.replace(/^www\./i, '');
    if (host && host.includes('.') && !/localhost|onrender\.com$/i.test(host)) {
      return `Indoor Nav <noreply@${host}>`;
    }
  } catch (_) { /* ignore */ }
  return '';
}

function resolveMailFrom() {
  const user = process.env.SMTP_USER || process.env.MAIL_FROM || '';
  const raw = String(
    process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.MAIL_FROM || user || ''
  ).trim();

  if (process.env.RESEND_API_KEY) {
    const parsed = parseFromAddress(raw);
    if (isResendRestrictedFromEmail(parsed.email)) {
      const fallback = resolveVerifiedResendFrom();
      if (fallback) {
        console.warn(
          '[Mail] Resend: From bị hạn chế (',
          parsed.email || raw || '(empty)',
          ') → dùng',
          fallback
        );
        return fallback;
      }
      console.warn(
        '[Mail] Resend: From vẫn là Gmail/onboarding — chỉ gửi được tới email tài khoản Resend. Đặt RESEND_FROM hoặc SMTP_FROM=noreply@navindoor.info'
      );
    }
  }

  if (!raw || /email_gmail_cua_ban|your@gmail\.com|example\.com/i.test(raw)) {
    if (process.env.SMTP_FROM) {
      console.warn('[Mail] SMTP_FROM giống placeholder — dùng SMTP_USER =', user);
    }
    return user;
  }
  return raw;
}

/** "Name <a@b.com>" → { name, email } */
function parseFromAddress(from) {
  const s = String(from || '').trim();
  const m = s.match(/^(.*)<([^>]+)>\s*$/);
  if (m) {
    return { name: m[1].trim().replace(/^"|"$/g, '') || undefined, email: m[2].trim() };
  }
  return { email: s };
}

function getTransporter() {
  if (_testTransporter) return _testTransporter;
  if (_transporter) return _transporter;
  if (!isSmtpConfigured()) return null;

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const pass = String(process.env.SMTP_PASS || '').replace(/\s+/g, '');

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass
    },
    requireTLS: !secure && port === 587,
    // Render đôi khi IPv6 tới Gmail bị treo — ưu tiên IPv4
    family: 4,
    lookup: (hostname, _opts, cb) => dns.lookup(hostname, { family: 4 }, cb),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 12000,
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 12000,
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 20000,
    tls: { minVersion: 'TLSv1.2' }
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

function warnIfResendFromLooksRestricted(fromEmail) {
  const email = String(fromEmail || '').toLowerCase();
  if (!email) return;
  // onboarding@resend.dev và Gmail From: Resend chỉ cho gửi tới email tài khoản Resend.
  if (
    email === 'onboarding@resend.dev' ||
    email.endsWith('@gmail.com') ||
    email.endsWith('@googlemail.com')
  ) {
    console.warn(
      '[Mail] Resend From=', email,
      '— chỉ gửi được tới email tài khoản Resend. Đổi SMTP_FROM sang địa chỉ domain đã verify (vd. noreply@navindoor.info).'
    );
  }
}

async function sendViaResend({ from, to, subject, text, html }) {
  const parsed = parseFromAddress(from);
  warnIfResendFromLooksRestricted(parsed.email);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: parsed.name ? `${parsed.name} <${parsed.email}>` : parsed.email,
      to: [to],
      subject,
      text,
      html
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || ('Resend HTTP ' + res.status));
    err.code = 'RESEND_HTTP_' + res.status;
    err.response = body;
    throw err;
  }
  return { messageId: body.id, provider: 'resend', response: body };
}

async function sendViaBrevo({ from, to, subject, text, html }) {
  const parsed = parseFromAddress(from);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender: {
        email: parsed.email,
        ...(parsed.name ? { name: parsed.name } : {})
      },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || body.code || ('Brevo HTTP ' + res.status));
    err.code = 'BREVO_HTTP_' + res.status;
    err.response = body;
    throw err;
  }
  return { messageId: body.messageId, provider: 'brevo', response: body };
}

/**
 * Mock test trước; rồi HTTPS (Render); rồi SMTP (local/dev).
 */
async function deliverMail({ from, to, subject, text, html }) {
  if (_testTransporter) {
    return _testTransporter.sendMail({ from, to, subject, text, html });
  }
  if (process.env.RESEND_API_KEY) {
    return sendViaResend({ from, to, subject, text, html });
  }
  if (process.env.BREVO_API_KEY) {
    return sendViaBrevo({ from, to, subject, text, html });
  }

  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('Mail chưa cấu hình (SMTP hoặc RESEND_API_KEY / BREVO_API_KEY)');
  }
  return transporter.sendMail({ from, to, subject, text, html });
}

/**
 * @param {{ to: string, resetLink: string, expiresAt: Date }} opts
 */
async function sendPasswordResetEmail(opts) {
  const { to, resetLink, expiresAt } = opts || {};
  if (!to || !resetLink) {
    throw new Error('Thiếu to hoặc resetLink');
  }

  const from = resolveMailFrom();
  if (!from) {
    throw new Error('Thiếu địa chỉ From (SMTP_FROM / SMTP_USER / MAIL_FROM)');
  }

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

  const info = await deliverMail({ from, to, subject, text, html });
  console.log(
    '[Mail] Password reset sent to', to,
    'from=', from,
    'provider=', info && info.provider || 'smtp',
    'messageId=', info && info.messageId
  );
  return info;
}

/**
 * Phase 8 — nhắc sắp hết hạn gói. Skip quietly nếu chưa cấu hình mail.
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

  if (!isMailConfigured()) {
    console.log(`[Mail:stub] would send PLAN_EXPIRY_REMINDER to ${to}: ${details}`);
    return { stub: true };
  }

  const from = resolveMailFrom();
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
    const info = await deliverMail({ from, to, subject, text, html });
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

  if (!isMailConfigured()) {
    console.log(`[Mail:stub] would send ${event} to ${to}: ${details}`);
    return { sent: false, stub: true };
  }

  const info = await deliverMail({
    from: resolveMailFrom(),
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

  if (!isMailConfigured()) {
    console.log(`[Mail:stub] would send ORG_INVITE to ${to}: ${details} url=${acceptUrl || ''}`);
    return { sent: false, stub: true };
  }

  const info = await deliverMail({
    from: resolveMailFrom(),
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
  isHttpsMailConfigured,
  isMailConfigured,
  hasTestTransporter,
  getTransporter,
  resolveMailFrom,
  deliverMail,
  getPublicBaseUrl,
  buildPasswordResetLink,
  sendPasswordResetEmail,
  sendPlanExpiryReminderEmail,
  sendBillingEventEmail,
  sendOrgInviteEmail,
  setTestTransporter,
  resetMailServiceCache
};
