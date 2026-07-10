// ============================================
// FILE: register.js
// MỤC ĐÍCH: Xử lý form đăng ký công khai
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registerForm');
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirmPassword');
    const validationErrorsDiv = document.getElementById('validationErrors');
    const errorList = document.getElementById('errorList');
    const messageP = document.getElementById('message');

    // Regex password
    const hasLower = /[a-z]/;
    const hasUpper = /[A-Z]/;
    const hasNumber = /\d/;
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Hide previous messages
        validationErrorsDiv.style.display = 'none';
        errorList.innerHTML = '';
        messageP.style.display = 'none';

        const fullName = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirm = confirmInput.value;

        // Client-side validation (mirrors server)
        const errors = [];

        if (!fullName) {
            errors.push('Họ tên là bắt buộc.');
        } else if (/[0-9]/.test(fullName)) {
            errors.push('Họ tên không được chứa chữ số.');
        } else if (!/^[\p{L}\s'.-]+$/u.test(fullName.trim())) {
            errors.push('Họ tên chỉ được chứa chữ cái, khoảng trắng, dấu gạch ngang hoặc dấu nháy.');
        } else {
            const letters = fullName.trim().match(/\p{L}/gu);
            if (!letters || letters.length < 2) {
                errors.push('Họ tên phải có ít nhất 2 chữ cái.');
            }
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push('Email không hợp lệ.');
        }

        if (!password || password.length < 8) {
            errors.push('Mật khẩu phải có ít nhất 8 ký tự.');
        } else {
            if (!hasLower.test(password)) {
                errors.push('Mật khẩu phải chứa ít nhất 1 chữ thường.');
            }
            if (!hasUpper.test(password)) {
                errors.push('Mật khẩu phải chứa ít nhất 1 chữ hoa.');
            }
            if (!hasNumber.test(password)) {
                errors.push('Mật khẩu phải chứa ít nhất 1 số.');
            }
            if (!hasSpecial.test(password)) {
                errors.push('Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt.');
            }
        }

        if (password !== confirm) {
            errors.push('Xác nhận mật khẩu không khớp.');
        }

        if (errors.length > 0) {
            errorList.innerHTML = errors.map(err => `<li>${err}</li>`).join('');
            validationErrorsDiv.style.display = 'block';
            return;
        }

        // Disable button
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Đang đăng ký...';

        try {
            const response = await fetch('/api/auth/public-register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName,
                    email,
                    password,
                    confirmPassword: confirm
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Success
                messageP.innerHTML = `
                    <strong>✅ Đăng ký thành công!</strong><br>
                    Tài khoản của bạn đang chờ quản trị viên duyệt.<br>
                    Bạn có thể <a href="index.html" style="color:#007AFF;">đăng nhập</a> sau khi được kích hoạt.
                `;
                messageP.style.display = 'block';
                form.reset();
            } else {
                // Error from server
                if (data.errors && Array.isArray(data.errors)) {
                    errorList.innerHTML = data.errors.map(err => `<li>${err}</li>`).join('');
                    validationErrorsDiv.style.display = 'block';
                } else {
                    messageP.textContent = data.message || 'Đã xảy ra lỗi.';
                    messageP.style.color = '#e74c3c';
                    messageP.style.display = 'block';
                }
            }
        } catch (err) {
            messageP.textContent = 'Không thể kết nối đến máy chủ.';
            messageP.style.color = '#e74c3c';
            messageP.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Đăng Ký';
        }
    });
});
