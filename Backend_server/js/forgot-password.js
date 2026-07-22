// forgot-password.js — Phase 7 + SMTP
const API_URL = '/api';

document.getElementById('forgotForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const msg = document.getElementById('message');
  const devBox = document.getElementById('devTokenBox');
  const mailHint = document.getElementById('mailHint');
  msg.style.display = 'none';
  if (devBox) devBox.style.display = 'none';
  if (mailHint) mailHint.style.display = 'none';

  try {
    const res = await fetch(API_URL + '/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    msg.textContent = data.message || (res.ok ? 'Đã gửi yêu cầu.' : 'Có lỗi xảy ra.');
    msg.style.display = 'block';
    msg.style.color = res.ok ? '#27ae60' : '#e74c3c';

    if (res.ok && data.resetToken) {
      document.getElementById('devToken').textContent = data.resetToken;
      document.getElementById('devResetLink').href =
        'reset-password.html?token=' + encodeURIComponent(data.resetToken);
      if (devBox) devBox.style.display = 'block';
    } else if (res.ok && (data.emailSent || !data.resetToken)) {
      // SMTP đã gửi (hoặc production không lộ token) — nhắc kiểm tra hộp thư
      if (mailHint) mailHint.style.display = 'block';
    }
  } catch (err) {
    msg.textContent = 'Không thể kết nối tới máy chủ!';
    msg.style.display = 'block';
    msg.style.color = '#e74c3c';
  }
});
