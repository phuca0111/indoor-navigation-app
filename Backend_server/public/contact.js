// contact.js — WL3: POST /api/contact, fallback mailto nếu API lỗi
(function () {
    var CONTACT_TO = 'contact@example.com';

    function setStatus(el, text, kind) {
        if (!el) return;
        el.textContent = text || '';
        el.className = 'status' + (kind ? ' is-' + kind : '');
        el.style.color = kind === 'error' ? '#b91c1c' : (kind === 'ok' ? '#047857' : '');
    }

    function openMailto(name, email, message, phone) {
        var body = 'Họ tên: ' + name +
            '\nEmail: ' + email +
            (phone ? '\nSĐT: ' + phone : '') +
            '\n\nNội dung:\n' + message;
        var mailto = 'mailto:' + CONTACT_TO +
            '?subject=' + encodeURIComponent('IndoorNav - Liên hệ: ' + name) +
            '&body=' + encodeURIComponent(body);
        window.location.href = mailto;
    }

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('contactForm');
        var statusEl = document.getElementById('contactStatus');
        var submitBtn = form ? form.querySelector('button[type="submit"]') : null;
        if (!form) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();

            var name = (form.querySelector('[name="name"]') || {}).value || '';
            var email = (form.querySelector('[name="email"]') || {}).value || '';
            var message = (form.querySelector('[name="message"]') || {}).value || '';
            var phoneEl = form.querySelector('[name="phone"]');
            var phone = phoneEl ? (phoneEl.value || '') : '';

            name = String(name).trim();
            email = String(email).trim();
            message = String(message).trim();
            phone = String(phone).trim();

            if (name.length < 2) {
                setStatus(statusEl, 'Vui lòng nhập họ tên hợp lệ.', 'error');
                return;
            }
            if (!email || email.indexOf('@') < 0) {
                setStatus(statusEl, 'Email không hợp lệ.', 'error');
                return;
            }
            if (message.length < 10) {
                setStatus(statusEl, 'Nội dung cần ít nhất 10 ký tự.', 'error');
                return;
            }

            if (submitBtn) submitBtn.disabled = true;
            setStatus(statusEl, 'Đang gửi…');

            fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, email: email, message: message, phone: phone })
            })
                .then(function (r) {
                    return r.json().then(function (data) {
                        return { ok: r.ok, status: r.status, data: data };
                    }).catch(function () {
                        return { ok: r.ok, status: r.status, data: {} };
                    });
                })
                .then(function (res) {
                    if (res.ok) {
                        setStatus(statusEl, res.data.message || 'Đã gửi liên hệ thành công.', 'ok');
                        form.reset();
                        return;
                    }
                    var msg = (res.data && res.data.message) || ('Không gửi được (HTTP ' + res.status + ').');
                    setStatus(statusEl, msg + ' Đang mở email dự phòng…', 'error');
                    openMailto(name, email, message, phone);
                })
                .catch(function () {
                    setStatus(statusEl, 'Không kết nối máy chủ. Đang mở email dự phòng…', 'error');
                    openMailto(name, email, message, phone);
                })
                .finally(function () {
                    if (submitBtn) submitBtn.disabled = false;
                });
        });
    });
})();
