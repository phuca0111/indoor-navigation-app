const { getTransporter, isSmtpConfigured } = require('./mailService');

class EmailOtpProvider {
  async send({ to, code, purpose, expiresAt }) {
    const transporter = getTransporter();
    if (!transporter) throw new Error('SMTP chưa cấu hình.');
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: 'Mã xác minh tài khoản',
      text: `Mã xác minh của bạn là ${code}. Mã hết hạn lúc ${new Date(expiresAt).toISOString()}.`,
      html: `<p>Mã xác minh của bạn: <strong>${code}</strong></p><p>Mã có thời hạn ngắn và chỉ dùng một lần.</p>`
    });
    return { provider: 'smtp', sent: true };
  }
}

class SafeMockOtpProvider {
  async send({ purpose }) {
    console.info(`[Identity] Mock OTP issued purpose=${purpose}; code redacted`);
    return { provider: 'mock', sent: false };
  }
}

function getOtpProvider() {
  return isSmtpConfigured() ? new EmailOtpProvider() : new SafeMockOtpProvider();
}

module.exports = { EmailOtpProvider, SafeMockOtpProvider, getOtpProvider };
