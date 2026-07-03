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

document.getElementById('organizationName').addEventListener('blur', function () {
  const slugEl = document.getElementById('slug');
  if (slugEl.dataset.manual === '1') return;
  const s = slugifyFromName(this.value.trim());
  if (s) slugEl.value = s;
});

document.getElementById('orgTrialForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const msgOk = document.getElementById('msgOk');
  const msgErr = document.getElementById('msgErr');
  msgOk.style.display = 'none';
  msgErr.style.display = 'none';

  const organizationName = document.getElementById('organizationName').value.trim();
  let slug = document.getElementById('slug').value.trim().toLowerCase();
  if (!slug) slug = slugifyFromName(organizationName);

  const body = {
    organizationName,
    slug,
    contactName: document.getElementById('contactName').value.trim(),
    contactEmail: document.getElementById('contactEmail').value.trim(),
    contactPhone: document.getElementById('contactPhone').value.trim(),
    password: document.getElementById('password').value
  };

  try {
    const res = await fetch('/api/org-registrations/self-service', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      msgOk.innerHTML = (data.message || 'Đăng ký thành công!') +
        ' <a href="' + (data.login_url || '/admin/index.html') + '">Đăng nhập ngay →</a>';
      msgOk.style.display = 'block';
      document.getElementById('orgTrialForm').reset();
      delete document.getElementById('slug').dataset.manual;
      setTimeout(function () {
        window.location.href = data.login_url || '/admin/index.html';
      }, 2500);
    } else {
      msgErr.textContent = data.message || 'Đăng ký thất bại (HTTP ' + res.status + ')';
      msgErr.style.display = 'block';
    }
  } catch (err) {
    msgErr.textContent = 'Lỗi kết nối: ' + (err.message || err);
    msgErr.style.display = 'block';
  }
});
