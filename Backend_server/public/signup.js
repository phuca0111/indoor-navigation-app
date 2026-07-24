// signup.js — POST /api/auth/public-register → /get-app (Android End User)
(function () {
  var API = '/api';

  function showError(text) {
    var el = document.getElementById('errorMessage');
    var ok = document.getElementById('okMessage');
    if (ok) ok.style.display = 'none';
    if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
  }

  function showOk(text) {
    var el = document.getElementById('okMessage');
    var err = document.getElementById('errorMessage');
    if (err) err.style.display = 'none';
    if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('signupForm');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      showError('');
      showOk('');

      var fullName = (document.getElementById('fullName').value || '').trim();
      var email = (document.getElementById('email').value || '').trim().toLowerCase();
      var password = document.getElementById('password').value || '';
      var confirmPassword = document.getElementById('confirmPassword').value || '';

      if (!fullName || !email || !password) {
        showError('Vui lòng điền đủ họ tên, email và mật khẩu.');
        return;
      }
      if (password !== confirmPassword) {
        showError('Xác nhận mật khẩu không khớp.');
        return;
      }
      var pwdErrors = (window.PasswordPolicy && window.PasswordPolicy.validatePasswordStrength)
        ? window.PasswordPolicy.validatePasswordStrength(password)
        : [];
      if (pwdErrors.length) {
        showError(pwdErrors[0]);
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;

      try {
        var res = await fetch(API + '/auth/public-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: fullName,
            email: email,
            password: password,
            confirmPassword: confirmPassword
          })
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.token) {
          var msg = data.message || ('Đăng ký thất bại (HTTP ' + res.status + ').');
          if (data.errors && data.errors.length) msg = data.errors[0];
          showError(msg);
          return;
        }

        localStorage.setItem('token', data.token);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        if (data.user) {
          if (data.user.email) localStorage.setItem('userEmail', data.user.email);
          if (data.user.role) localStorage.setItem('userRole', data.user.role);
          if (data.user.id) localStorage.setItem('userId', data.user.id);
        }

        showOk('Đăng ký thành công — mở hướng dẫn dùng Android App…');
        window.location.replace('/get-app');
      } catch (err) {
        showError('Không kết nối được server. Kiểm tra node server.js đã chạy chưa.');
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  });
})();
