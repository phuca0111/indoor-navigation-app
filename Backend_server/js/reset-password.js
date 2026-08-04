// reset-password.js — Phase 7 self-service (UI premium)
const API_URL = '/api';

function showMessage(text, ok) {
  const msg = document.getElementById('message');
  if (!msg) return;
  msg.textContent = text;
  msg.classList.remove('msg-error', 'msg-ok');
  msg.classList.add(ok ? 'msg-ok' : 'msg-error');
  msg.style.display = 'block';
}

function setBusy(busy) {
  const btn = document.getElementById('submitBtn');
  if (!btn) return;
  btn.disabled = !!busy;
  btn.textContent = busy ? 'Đang cập nhật…' : 'Đặt lại mật khẩu';
  btn.style.opacity = busy ? '0.7' : '';
}

(function init() {
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('token') || '').trim();
  const tokenInput = document.getElementById('token');
  const resetPanel = document.getElementById('resetPanel');
  const invalidPanel = document.getElementById('invalidPanel');
  const successPanel = document.getElementById('successPanel');

  if (tokenInput) tokenInput.value = token;

  if (!token) {
    if (resetPanel) resetPanel.style.display = 'none';
    if (successPanel) successPanel.style.display = 'none';
    if (invalidPanel) invalidPanel.style.display = '';
    return;
  }

  if (invalidPanel) invalidPanel.style.display = 'none';
})();

document.getElementById('resetForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const token = document.getElementById('token').value.trim();
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const msg = document.getElementById('message');
  if (msg) msg.style.display = 'none';

  if (!token) {
    showMessage('Thiếu token. Hãy mở link từ email quên mật khẩu.', false);
    return;
  }
  if (!newPassword || newPassword.length < 8) {
    showMessage('Mật khẩu mới cần ít nhất 8 ký tự.', false);
    return;
  }
  if (newPassword !== confirmPassword) {
    showMessage('Xác nhận mật khẩu không khớp.', false);
    return;
  }

  setBusy(true);
  try {
    const res = await fetch(API_URL + '/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword, confirmPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const resetPanel = document.getElementById('resetPanel');
      const successPanel = document.getElementById('successPanel');
      if (resetPanel) resetPanel.style.display = 'none';
      if (successPanel) successPanel.style.display = '';
      setTimeout(function () {
        window.location.replace('/login');
      }, 1800);
    } else {
      const extra = Array.isArray(data.errors) ? ' ' + data.errors.join(' ') : '';
      showMessage((data.message || 'Không đặt lại được mật khẩu.') + extra, false);
    }
  } catch (err) {
    showMessage('Không thể kết nối tới máy chủ.', false);
  } finally {
    setBusy(false);
  }
});
