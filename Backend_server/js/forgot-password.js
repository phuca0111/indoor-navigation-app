// forgot-password.js — Phase 7 + SMTP + premium UI (Stitch)
const API_URL = '/api';

document.getElementById('forgotForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const msg = document.getElementById('message');
  const devBox = document.getElementById('devTokenBox');
  const mailHint = document.getElementById('mailHint');
  const forgotPanel = document.getElementById('forgotPanel');
  const successPanel = document.getElementById('successPanel');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  msg.style.display = 'none';
  if (devBox) devBox.style.display = 'none';
  if (mailHint) mailHint.style.display = 'none';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';
  }

  try {
    const res = await fetch(API_URL + '/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      msg.textContent = data.message || 'Có lỗi xảy ra.';
      msg.style.display = 'block';
      msg.style.color = '#ba1a1a';
      return;
    }

    // Sandbox: vẫn hiện token trên form (dev/local)
    if (data.resetToken) {
      msg.textContent = data.message || 'Đã gửi yêu cầu.';
      msg.style.display = 'block';
      msg.style.color = '#005ac1';
      document.getElementById('devToken').textContent = data.resetToken;
      document.getElementById('devResetLink').href =
        'reset-password.html?token=' + encodeURIComponent(data.resetToken);
      if (devBox) devBox.style.display = 'block';
      if (mailHint) mailHint.style.display = 'block';
      return;
    }

    // Production / SMTP: màn hình thành công Stitch
    if (forgotPanel) forgotPanel.style.display = 'none';
    if (successPanel) successPanel.style.display = 'block';
  } catch (err) {
    msg.textContent = 'Không thể kết nối tới máy chủ!';
    msg.style.display = 'block';
    msg.style.color = '#ba1a1a';
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '';
    }
  }
});
