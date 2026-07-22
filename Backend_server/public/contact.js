// contact.js — Landing CRM: POST /api/contact → ContactRequest trong hệ thống
(function () {
    var TYPE_SUBJECT = {
        DEMO: 'Đăng ký Demo',
        CONSULT: 'Tư vấn triển khai',
        PRICING: 'Báo giá',
        SUPPORT: 'Hỗ trợ kỹ thuật',
        BUG: 'Báo lỗi',
        OTHER: 'Khác'
    };

    function setStatus(el, text, kind) {
        if (!el) return;
        el.textContent = text || '';
        el.className = 'status' + (kind ? ' is-' + kind : '');
        el.style.color = kind === 'error' ? '#b91c1c' : (kind === 'ok' ? '#047857' : '');
    }

    function selectedType(form) {
        var checked = form.querySelector('input[name="request_type"]:checked');
        return checked ? checked.value : 'OTHER';
    }

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('contactForm');
        var statusEl = document.getElementById('contactStatus');
        var submitBtn = form ? form.querySelector('button[type="submit"]') : null;
        var subjectEl = document.getElementById('contactSubject');
        if (!form) return;

        form.querySelectorAll('input[name="request_type"]').forEach(function (radio) {
            radio.addEventListener('change', function () {
                if (subjectEl && !subjectEl.value.trim()) {
                    subjectEl.placeholder = TYPE_SUBJECT[radio.value] || 'Chủ đề';
                }
            });
        });

        form.addEventListener('submit', function (e) {
            e.preventDefault();

            var name = String((form.querySelector('[name="name"]') || {}).value || '').trim();
            var email = String((form.querySelector('[name="email"]') || {}).value || '').trim();
            var message = String((form.querySelector('[name="message"]') || {}).value || '').trim();
            var phone = String((form.querySelector('[name="phone"]') || {}).value || '').trim();
            var company = String((form.querySelector('[name="company"]') || {}).value || '').trim();
            var website = String((form.querySelector('[name="website"]') || {}).value || '').trim();
            var requestType = selectedType(form);
            var subject = String((subjectEl && subjectEl.value) || '').trim() || (TYPE_SUBJECT[requestType] || 'Liên hệ');

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
                body: JSON.stringify({
                    name: name,
                    email: email,
                    message: message,
                    phone: phone,
                    company: company,
                    website: website,
                    subject: subject,
                    request_type: requestType
                })
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
                        setStatus(statusEl, res.data.message || 'Đã gửi yêu cầu. Chúng tôi sẽ phản hồi sớm.', 'ok');
                        form.reset();
                        var demo = form.querySelector('input[name="request_type"][value="DEMO"]');
                        if (demo) demo.checked = true;
                        return;
                    }
                    var msg = (res.data && res.data.message) || ('Không gửi được (HTTP ' + res.status + ').');
                    setStatus(statusEl, msg, 'error');
                })
                .catch(function () {
                    setStatus(statusEl, 'Không kết nối máy chủ. Vui lòng thử lại.', 'error');
                })
                .finally(function () {
                    if (submitBtn) submitBtn.disabled = false;
                });
        });
    });
})();
