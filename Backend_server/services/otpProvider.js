const {
  deliverMail,
  isMailConfigured,
  resolveMailFrom
} = require('./mailService');

class EmailOtpProvider {
  async send({ to, code, purpose, expiresAt }) {
    const from = resolveMailFrom();
    if (!from) throw new Error('Thiếu địa chỉ From (SMTP_FROM / SMTP_USER / MAIL_FROM)');
    const expiresText = expiresAt
      ? new Date(expiresAt).toLocaleString('vi-VN')
      : 'sớm';
    const info = await deliverMail({
      from,
      to,
      subject: 'Mã xác minh tài khoản — Indoor Nav',
      text:
        `Mã xác minh của bạn là ${code}.\n` +
        `Mã hết hạn lúc ${expiresText}.\n` +
        (purpose ? `Mục đích: ${purpose}.\n` : ''),
      html:
        `<p>Mã xác minh của bạn: <strong>${code}</strong></p>` +
        `<p style="color:#666;font-size:13px;">Mã hết hạn lúc <strong>${expiresText}</strong>.</p>` +
        `<p style="color:#666;font-size:13px;">Mã có thời hạn ngắn và chỉ dùng một lần.</p>`
    });
    console.log(
      '[Mail] OTP sent to', to,
      'purpose=', purpose || '-',
      'provider=', (info && info.provider) || 'smtp',
      'messageId=', info && info.messageId
    );
    return { provider: (info && info.provider) || 'mail', sent: true, messageId: info && info.messageId };
  }
}

class SafeMockOtpProvider {
  async send({ purpose }) {
    console.info(`[Identity] Mock OTP issued purpose=${purpose}; code redacted`);
    return { provider: 'mock', sent: false };
  }
}

function getOtpProvider() {
  // Resend/Brevo HTTPS cũng đủ — không chỉ SMTP (Render thường chặn SMTP).
  return isMailConfigured() ? new EmailOtpProvider() : new SafeMockOtpProvider();
}

module.exports = { EmailOtpProvider, SafeMockOtpProvider, getOtpProvider };
