// My Maps hub client — Phase 1
(function () {
  const API = '/api';
  const titles = {
    home: ['Tổng quan', 'Không gian bản đồ của bạn'],
    explore: ['Explore', 'Tìm Place và Indoor công khai'],
    maps: ['My Maps', 'Workspace · Indoor draft của bạn'],
    favorites: ['Yêu thích', 'Place đã lưu'],
    history: ['Lịch sử', 'Hoạt động gần đây'],
    proposals: ['Đề xuất', 'Place proposal của bạn'],
    notifications: ['Thông báo', 'Cập nhật hệ thống'],
    account: ['Tài khoản', 'Hồ sơ và gói dịch vụ']
  };

  const el = {
    nav: document.getElementById('hubNav'),
    content: document.getElementById('hubContent'),
    title: document.getElementById('hubTitle'),
    subtitle: document.getElementById('hubSubtitle'),
    chip: document.getElementById('hubUserChip'),
    logout: document.getElementById('hubLogout')
  };

  let me = null;
  let view = 'home';

  function token() {
    return localStorage.getItem('token') || '';
  }

  function headers(json) {
    const h = { Authorization: 'Bearer ' + token() };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function api(path, opts) {
    const res = await fetch(API + path, opts || {});
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.clear();
      window.location.replace('/login?next=/app');
      throw new Error('Unauthorized');
    }
    if (!res.ok) throw new Error(data.message || ('HTTP ' + res.status));
    return data;
  }

  function setView(name) {
    view = name;
    el.nav.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-view') === name);
    });
    const t = titles[name] || titles.home;
    el.title.textContent = t[0];
    el.subtitle.textContent = t[1];
    try {
      history.replaceState({}, '', '/app#' + name);
    } catch (_) { /* ignore */ }
    render();
  }

  function empty(msg) {
    return '<div class="hub-card"><div class="hub-empty">' + escapeHtml(msg) + '</div></div>';
  }

  async function renderHome() {
    const [ws, fav, prop] = await Promise.all([
      api('/hub/workspaces').catch(() => ({ total: 0, workspaces: [] })),
      api('/hub/favorites').catch(() => ({ total: 0 })),
      api('/hub/proposals').catch(() => ({ total: 0 }))
    ]);
    el.content.innerHTML =
      '<div class="hub-card"><div class="hub-grid">' +
      '<div class="hub-stat"><strong>' + (ws.total || 0) + '</strong><span>Workspace</span></div>' +
      '<div class="hub-stat"><strong>' + (fav.total || 0) + '</strong><span>Yêu thích</span></div>' +
      '<div class="hub-stat"><strong>' + (prop.total || 0) + '</strong><span>Đề xuất</span></div>' +
      '</div></div>' +
      '<div class="hub-card"><h2>Bắt đầu nhanh</h2>' +
      '<div class="hub-actions">' +
      '<a class="hub-btn hub-btn-primary" href="/explore" target="_blank" rel="noopener">Mở Explore</a>' +
      '<button type="button" class="hub-btn" data-go="maps">Xem My Maps</button>' +
      '<button type="button" class="hub-btn" data-go="proposals">Đề xuất Place</button>' +
      '</div></div>';
    el.content.querySelectorAll('[data-go]').forEach((b) => {
      b.addEventListener('click', () => setView(b.getAttribute('data-go')));
    });
  }

  async function renderExplore() {
    el.content.innerHTML =
      '<div class="hub-card"><h2>Explore Place</h2>' +
      '<p class="hub-muted">Tìm địa điểm, xem Indoor công khai. Guest cũng xem được trên trang ngoài trời.</p>' +
      '<div class="hub-actions" style="margin-top:12px;">' +
      '<a class="hub-btn hub-btn-primary" href="/explore" target="_blank" rel="noopener">Mở /explore</a>' +
      '</div></div>';
  }

  async function renderMaps() {
    const data = await api('/hub/workspaces');
    const rows = data.workspaces || [];
    if (!rows.length) {
      el.content.innerHTML = empty('Chưa có Workspace. Tạo Indoor từ Admin wizard hoặc sau khi đề xuất Place được duyệt.');
      return;
    }
    el.content.innerHTML =
      '<div class="hub-card"><h2>Workspace của bạn</h2>' +
      '<p class="hub-muted" style="margin-bottom:12px;">Submit Publish → Community Queue → Super Admin duyệt (không publish thẳng).</p>' +
      '<div class="hub-list">' +
      rows.map((w) => {
        const placeName = (w.place && w.place.name) || 'Place';
        const bStatus = (w.building && w.building.status) || '—';
        const wsId = w.workspace_id || w._id;
        const editor = w.building_id
          ? '<a class="hub-btn hub-btn-primary" href="/editor/?buildingId=' + encodeURIComponent(w.building_id) + '" target="_blank" rel="noopener">Mở Editor</a>'
          : '';
        const submit = wsId
          ? '<button type="button" class="hub-btn" data-submit-ws="' + escapeHtml(String(wsId)) + '">Submit Community</button>'
          : '';
        return (
          '<div class="hub-item">' +
          '<div><strong>' + escapeHtml(w.name) + '</strong>' +
          '<span>' + escapeHtml(placeName) + ' · ' + escapeHtml(w.status) +
          ' · Building ' + escapeHtml(bStatus) + '</span></div>' +
          '<div class="hub-actions"><span class="hub-badge">' + escapeHtml(w.kind || '') + '</span>' + editor + submit + '</div>' +
          '</div>'
        );
      }).join('') +
      '</div></div>';

    el.content.querySelectorAll('[data-submit-ws]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-submit-ws');
        btn.disabled = true;
        try {
          const res = await api('/hub/workspaces/' + encodeURIComponent(id) + '/submit-community', {
            method: 'POST',
            headers: headers(true),
            body: JSON.stringify({ note: 'Submit từ My Maps' })
          });
          alert(res.message || (res.auto_approved ? 'Đã tự duyệt COMMUNITY.' : 'Đã gửi Community Queue.'));
          renderMaps();
        } catch (e) {
          alert(e.message || 'Không gửi được.');
          btn.disabled = false;
        }
      });
    });
  }

  async function renderFavorites() {
    const data = await api('/hub/favorites');
    const rows = data.favorites || [];
    if (!rows.length) {
      el.content.innerHTML = empty('Chưa có Place yêu thích. Mở Explore rồi lưu sau (API đã sẵn).');
      return;
    }
    el.content.innerHTML =
      '<div class="hub-card"><div class="hub-list">' +
      rows.map((f) => {
        const p = f.place || {};
        return (
          '<div class="hub-item">' +
          '<div><strong>' + escapeHtml(p.name || 'Place') + '</strong>' +
          '<span>' + escapeHtml(p.address || p.category || '') + '</span></div>' +
          '<button type="button" class="hub-btn" data-unfav="' + escapeHtml(String(f.place_id)) + '">Bỏ lưu</button>' +
          '</div>'
        );
      }).join('') +
      '</div></div>';
    el.content.querySelectorAll('[data-unfav]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api('/hub/favorites/' + btn.getAttribute('data-unfav'), { method: 'DELETE', headers: headers() });
        renderFavorites();
      });
    });
  }

  async function renderHistory() {
    const data = await api('/hub/history');
    const rows = data.history || [];
    if (!rows.length) {
      el.content.innerHTML = empty('Chưa có lịch sử.');
      return;
    }
    el.content.innerHTML =
      '<div class="hub-card"><div class="hub-list">' +
      rows.map((h) => (
        '<div class="hub-item"><div><strong>' + escapeHtml(h.label || h.type) + '</strong>' +
        '<span>' + escapeHtml(h.type) + ' · ' + escapeHtml(new Date(h.createdAt).toLocaleString('vi-VN')) +
        '</span></div></div>'
      )).join('') +
      '</div></div>';
  }

  function proposalFormHtml() {
    return (
      '<div class="hub-card"><h2>Gửi đề xuất Place mới</h2>' +
      '<form id="hubProposalForm" class="hub-form">' +
      '<label>Tên Place<input name="name" required maxlength="200" placeholder="VD: Vincom Center"></label>' +
      '<label>Địa chỉ<input name="address" maxlength="500" placeholder="Số nhà, đường, quận…"></label>' +
      '<label>Danh mục<input name="category" maxlength="80" placeholder="mall / school / hospital…"></label>' +
      '<div class="hub-form-row">' +
      '<label>Vĩ độ (lat)<input name="latitude" type="number" step="any" required placeholder="10.7769"></label>' +
      '<label>Kinh độ (lng)<input name="longitude" type="number" step="any" required placeholder="106.7009"></label>' +
      '</div>' +
      '<label>Mô tả<textarea name="description" rows="3" maxlength="2000" placeholder="Mô tả ngắn (tuỳ chọn)"></textarea></label>' +
      '<div class="hub-actions">' +
      '<button type="button" class="hub-btn" id="hubUseGps">Dùng GPS hiện tại</button>' +
      '<button type="submit" class="hub-btn hub-btn-primary">Gửi đề xuất</button>' +
      '</div>' +
      '<p class="hub-muted" id="hubProposalMsg" style="margin-top:10px;"></p>' +
      '</form></div>'
    );
  }

  function bindProposalForm() {
    const form = document.getElementById('hubProposalForm');
    const msg = document.getElementById('hubProposalMsg');
    document.getElementById('hubUseGps')?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        if (msg) msg.textContent = 'Trình duyệt không hỗ trợ GPS.';
        return;
      }
      if (msg) msg.textContent = 'Đang lấy vị trí…';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          form.latitude.value = pos.coords.latitude.toFixed(6);
          form.longitude.value = pos.coords.longitude.toFixed(6);
          if (msg) msg.textContent = 'Đã điền GPS.';
        },
        () => { if (msg) msg.textContent = 'Không lấy được GPS.'; },
        { enableHighAccuracy: true, timeout: 12000 }
      );
    });
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (msg) msg.textContent = 'Đang gửi…';
      try {
        const body = {
          name: form.name.value.trim(),
          address: form.address.value.trim(),
          category: form.category.value.trim(),
          latitude: Number(form.latitude.value),
          longitude: Number(form.longitude.value),
          description: form.description.value.trim()
        };
        const res = await api('/place-proposals', {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify(body)
        });
        if (msg) msg.textContent = res.message || 'Đã gửi.';
        form.reset();
        renderProposals();
      } catch (err) {
        if (msg) msg.textContent = err.message || 'Gửi thất bại.';
      }
    });
  }

  async function renderProposals() {
    const data = await api('/hub/proposals');
    const rows = data.proposals || [];
    let listHtml = '';
    if (!rows.length) {
      listHtml = empty('Chưa có đề xuất nào — dùng form bên dưới.');
    } else {
      listHtml =
        '<div class="hub-card"><h2>Đề xuất của bạn</h2><div class="hub-list">' +
        rows.map((p) => {
          const badge =
            p.status === 'APPROVED' ? 'hub-badge' :
            p.status === 'REJECTED' || p.status === 'DUPLICATE' ? 'hub-badge hub-badge--warn' :
            'hub-badge hub-badge--muted';
          return (
            '<div class="hub-item"><div><strong>' + escapeHtml(p.name) + '</strong>' +
            '<span>' + escapeHtml(p.category || '') + ' · ' + escapeHtml(p.address || '') + '</span></div>' +
            '<span class="' + badge + '">' + escapeHtml(p.status) + '</span></div>'
          );
        }).join('') +
        '</div></div>';
    }
    el.content.innerHTML = proposalFormHtml() + listHtml;
    bindProposalForm();
  }

  async function renderNotifications() {
    try {
      const data = await api('/notifications?limit=30');
      const rows = data.notifications || data.items || data.data || [];
      if (!rows.length) {
        el.content.innerHTML = empty('Không có thông báo.');
        return;
      }
      el.content.innerHTML =
        '<div class="hub-card"><div class="hub-list">' +
        rows.map((n) => (
          '<div class="hub-item"><div><strong>' + escapeHtml(n.title || n.type || 'Thông báo') + '</strong>' +
          '<span>' + escapeHtml(n.body || n.message || '') + '</span></div></div>'
        )).join('') +
        '</div></div>';
    } catch (e) {
      el.content.innerHTML = '<div class="hub-card hub-error">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function renderAccount() {
    const u = me || {};
    const lim = u.limits || {};
    const usage = u.usage || {};
    const caps = u.capabilities || {};
    const limLine = (used, limit, label) => {
      const limTxt = limit == null ? '∞' : String(limit);
      return '<div class="hub-stat"><strong>' + escapeHtml(String(used ?? 0)) + '/' + escapeHtml(limTxt) +
        '</strong><span>' + escapeHtml(label) + '</span></div>';
    };
    el.content.innerHTML =
      '<div class="hub-card"><h2>Hồ sơ</h2>' +
      '<p><strong>' + escapeHtml(u.full_name || u.email || '') + '</strong></p>' +
      '<p class="hub-muted">' + escapeHtml(u.email || '') + '</p>' +
      '<p>Vai trò UI: <span class="hub-badge">' + escapeHtml(u.display_role_label || u.display_role || '') + '</span>' +
      ' <span class="hub-muted">(DB: ' + escapeHtml(u.role || '') + ')</span></p>' +
      '</div>' +
      '<div class="hub-card"><h2>Gói dịch vụ</h2>' +
      '<p><span class="hub-badge">' + escapeHtml(u.display_plan_label || u.display_plan || u.plan || 'Demo') + '</span>' +
      ' <span class="hub-muted">(DB: ' + escapeHtml(u.plan || 'FREE') + ')</span></p>' +
      '<div class="hub-grid" style="margin-top:12px;">' +
      limLine(usage.workspaces, lim.maxWorkspaces, 'Workspace') +
      limLine(usage.buildings, lim.maxBuildings, 'Building') +
      limLine(usage.floors, lim.maxFloorsPerBuilding, 'Floor (quota/tòa)') +
      limLine(usage.qr, lim.maxQr, 'QR') +
      '</div>' +
      '<ul class="hub-muted" style="margin:14px 0 0;padding-left:18px;line-height:1.6;">' +
      '<li>Submit Community: ' + (caps.canSubmitCommunity !== false ? 'Có' : 'Không') + '</li>' +
      '<li>Official: ' + (caps.canRequestOfficial ? 'Có' : 'Không (Demo)') + '</li>' +
      '<li>Team / Tổ chức: ' + (caps.canCreateOrg ? 'Có' : 'Không (Demo)') + '</li>' +
      '<li>CAD / Export: Có</li>' +
      '</ul>' +
      '<p class="hub-muted" style="margin-top:12px;">Nâng gói Creator/Professional để mở Official và Team.</p>' +
      '</div>';
  }

  async function render() {
    el.content.innerHTML = '<div class="hub-card hub-muted">Đang tải…</div>';
    try {
      if (view === 'home') await renderHome();
      else if (view === 'explore') await renderExplore();
      else if (view === 'maps') await renderMaps();
      else if (view === 'favorites') await renderFavorites();
      else if (view === 'history') await renderHistory();
      else if (view === 'proposals') await renderProposals();
      else if (view === 'notifications') await renderNotifications();
      else if (view === 'account') await renderAccount();
    } catch (e) {
      el.content.innerHTML = '<div class="hub-card hub-error">' + escapeHtml(e.message) + '</div>';
    }
  }

  async function boot() {
    if (!token()) {
      window.location.replace('/login?next=/app');
      return;
    }
    try {
      const data = await api('/hub/me', { headers: headers() });
      me = data.user;
      el.chip.textContent = (me.display_role_label || 'Người dùng') + ' · ' + (me.email || '');
    } catch (e) {
      el.chip.textContent = 'Lỗi phiên';
    }

    el.nav.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-view]');
      if (!btn) return;
      setView(btn.getAttribute('data-view'));
    });
    el.logout.addEventListener('click', () => {
      localStorage.clear();
      window.location.replace('/login');
    });

    const hash = (location.hash || '').replace(/^#/, '');
    setView(titles[hash] ? hash : 'home');
  }

  boot();
})();
