// register.js (Landing WL4) — POST /api/org-registrations/public
(function () {
    function slugifyFromName(name) {
        return String(name || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48);
    }

    function show(el, text, kind) {
        if (!el) return;
        el.textContent = text || '';
        el.style.display = text ? 'block' : 'none';
        if (kind === 'ok') {
            el.className = 'ok-msg';
        } else if (kind === 'err') {
            el.className = 'error-msg';
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('orgRegForm');
        if (!form) return;

        var nameEl = document.getElementById('organizationName');
        var slugEl = document.getElementById('slug');
        var msgOk = document.getElementById('msgOk');
        var msgErr = document.getElementById('msgErr');

        if (nameEl && slugEl) {
            nameEl.addEventListener('blur', function () {
                if (slugEl.dataset.manual === '1') return;
                var s = slugifyFromName(nameEl.value.trim());
                if (s) slugEl.value = s;
            });
            slugEl.addEventListener('input', function () {
                slugEl.dataset.manual = '1';
            });
        }

        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            show(msgOk, '');
            show(msgErr, '');

            var organizationName = (nameEl && nameEl.value || '').trim();
            var slug = (slugEl && slugEl.value || '').trim().toLowerCase();
            if (!slug) slug = slugifyFromName(organizationName);

            var body = {
                organizationName: organizationName,
                slug: slug,
                contactName: (document.getElementById('contactName').value || '').trim(),
                contactEmail: (document.getElementById('contactEmail').value || '').trim(),
                contactPhone: (document.getElementById('contactPhone').value || '').trim(),
                password: document.getElementById('password').value || ''
            };

            if (!body.organizationName || !body.contactName || !body.contactEmail) {
                show(msgErr, 'Vui lòng điền đủ thông tin bắt buộc.', 'err');
                return;
            }
            var pwdErrors = (window.PasswordPolicy && window.PasswordPolicy.validatePasswordStrength)
                ? window.PasswordPolicy.validatePasswordStrength(body.password)
                : [];
            if (pwdErrors.length) {
                show(msgErr, pwdErrors[0], 'err');
                return;
            }

            var btn = form.querySelector('button[type="submit"]');
            if (btn) btn.disabled = true;

            try {
                var res = await fetch('/api/org-registrations/public', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                var data = await res.json().catch(function () { return {}; });
                if (res.ok) {
                    show(msgOk, data.message || 'Gửi hồ sơ thành công! Vui lòng chờ duyệt rồi đăng nhập.', 'ok');
                    form.reset();
                    if (slugEl) delete slugEl.dataset.manual;
                } else {
                    show(msgErr, data.message || ('Gửi hồ sơ thất bại (HTTP ' + res.status + ').'), 'err');
                }
            } catch (err) {
                show(msgErr, 'Lỗi kết nối: ' + (err.message || err), 'err');
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    });
})();
