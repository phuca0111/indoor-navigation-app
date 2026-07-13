// reset-password.js — Phase 7 self-service
const API_URL = '/api';

(function initTokenFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  document.getElementById('token').value = token;
})();

document.getElementById('resetForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const token = document.getElementById('token').value.trim();
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const msg = document.getElementById('message');
  msg.style.display = 'none';

  if (!token) {
    msg.textContent = 'Thiếu token. Hãy mở link từ trang quên mật khẩu.';
    msg.style.display = 'block';
    return;
  }

  try {
    const res = await fetch(API_URL + '/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword, confirmPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      msg.style.color = '#27ae60';
      msg.textContent = data.message || 'Đặt lại mật khẩu thành công.';
      msg.style.display = 'block';
      setTimeout(function () {
        window.location.replace('/admin/index.html');
      }, 1500);
    } else {
      msg.style.color = '#e74c3c';
      const extra = Array.isArray(data.errors) ? ' ' + data.errors.join(' ') : '';
      msg.textContent = (data.message || 'Không đặt lại được mật khẩu.') + extra;
      msg.style.display = 'block';
    }
  } catch (err) {
    msg.style.color = '#e74c3c';
    msg.textContent = 'Không thể kết nối tới máy chủ!';
    msg.style.display = 'block';
  }
});
