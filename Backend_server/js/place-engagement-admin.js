// ============================================================
// Place Engagement Admin — reviews + favorites
// Outdoor (Place) + Indoor (phòng/POI)
// ============================================================

(function (global) {
  const API_OUTDOOR = '/api/place-platform';
  const API_INDOOR = '/api/indoor-places';

  function token() {
    return localStorage.getItem('token') || '';
  }

  function headers(json) {
    const h = { Authorization: 'Bearer ' + token() };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(v) {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('vi-VN');
    } catch (_) {
      return String(v);
    }
  }

  function stars(n) {
    const r = Math.max(0, Math.min(5, Number(n) || 0));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }

  function scope() {
    return (document.getElementById('peFilterScope')?.value || 'OUTDOOR').toUpperCase();
  }

  function isIndoor() {
    return scope() === 'INDOOR';
  }

  function apiBase() {
    return isIndoor() ? API_INDOOR : API_OUTDOOR;
  }

  let selectedPlace = null;
  let placeSuggestions = [];

  function setPlaceLabel() {
    const el = document.getElementById('peSelectedPlace');
    if (!el) return;
    if (isIndoor()) {
      el.textContent = 'Đang xem đánh giá / yêu thích trong nhà (phòng & POI).';
      return;
    }
    if (!selectedPlace) {
      el.textContent = 'Chưa chọn địa điểm — đang xem tất cả (gần đây).';
      return;
    }
    el.innerHTML =
      '<strong>' + escapeHtml(selectedPlace.name || '') + '</strong>' +
      ' <span style="color:#667085;font-size:12px;">' +
      escapeHtml(selectedPlace.slug || selectedPlace._id || '') +
      '</span>';
  }

  function syncScopeUi() {
    const placeWrap = document.getElementById('pePlaceSearchWrap');
    if (placeWrap) placeWrap.style.display = isIndoor() ? 'none' : '';
    setPlaceLabel();
  }

  async function searchPlaces() {
    if (isIndoor()) return;
    const box = document.getElementById('pePlaceSuggest');
    const q = document.getElementById('pePlaceKeyword')?.value?.trim() || '';
    if (!box) return;
    if (q.length < 1) {
      box.innerHTML = '';
      box.hidden = true;
      return;
    }
    try {
      const params = new URLSearchParams({ q, limit: '12' });
      const res = await fetch('/api/places?' + params.toString(), { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tìm được địa điểm');
      placeSuggestions = data.places || [];
      if (!placeSuggestions.length) {
        box.innerHTML = '<div class="pe-suggest-empty">Không có kết quả</div>';
        box.hidden = false;
        return;
      }
      box.innerHTML = placeSuggestions.map((p, i) => (
        '<button type="button" class="pe-suggest-item" data-idx="' + i + '">' +
        '<strong>' + escapeHtml(p.name || '') + '</strong>' +
        '<span>' + escapeHtml(p.slug || p.category || '') + '</span>' +
        '</button>'
      )).join('');
      box.hidden = false;
      box.querySelectorAll('.pe-suggest-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-idx'));
          selectPlace(placeSuggestions[idx]);
        });
      });
    } catch (e) {
      box.innerHTML = '<div class="pe-suggest-empty">' + escapeHtml(e.message) + '</div>';
      box.hidden = false;
    }
  }

  function selectPlace(p) {
    if (!p) return;
    selectedPlace = {
      _id: p._id || p.id,
      name: p.name || '',
      slug: p.slug || '',
      category: p.category || ''
    };
    const input = document.getElementById('pePlaceKeyword');
    if (input) input.value = selectedPlace.name;
    const box = document.getElementById('pePlaceSuggest');
    if (box) {
      box.innerHTML = '';
      box.hidden = true;
    }
    setPlaceLabel();
    loadAll();
  }

  function clearPlace() {
    selectedPlace = null;
    const input = document.getElementById('pePlaceKeyword');
    if (input) input.value = '';
    const box = document.getElementById('pePlaceSuggest');
    if (box) {
      box.innerHTML = '';
      box.hidden = true;
    }
    setPlaceLabel();
    loadAll();
  }

  function placeIdParam() {
    return selectedPlace && selectedPlace._id ? String(selectedPlace._id) : '';
  }

  function onScopeChange() {
    syncScopeUi();
    loadAll();
  }

  async function loadReviews() {
    const tbody = document.getElementById('peReviewsList');
    const meta = document.getElementById('peReviewsMeta');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" class="admin-table-loading-cell">Đang tải đánh giá…</td></tr>';
    }
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (!isIndoor()) {
        const pid = placeIdParam();
        if (pid) params.set('place_id', pid);
      }
      const q = document.getElementById('peReviewKeyword')?.value?.trim() || '';
      if (q) params.set('q', q);
      if (document.getElementById('peIncludeInactive')?.checked) {
        params.set('include_inactive', '1');
      }
      const res = await fetch(apiBase() + '/admin/reviews?' + params.toString(), { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải được đánh giá');
      const rows = data.reviews || [];
      if (meta) {
        meta.textContent =
          (isIndoor() ? 'Trong nhà' : 'Ngoài trời') +
          ' · Tổng: ' + (data.total != null ? data.total : rows.length);
      }
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="analytics-muted">Chưa có đánh giá.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((r) => {
        const userLabel = r.user
          ? (r.user.full_name || r.user.email || r.user.id)
          : String(r.user_id || '—');
        const placeLabel = r.place
          ? (r.place.name || r.place.slug || r.place.id)
          : (r.place_label || String(r.place_id || '—'));
        const active = r.is_active !== false;
        const status = active
          ? '<span class="mgc-badge mgc-badge--ok">Hiện</span>'
          : '<span class="mgc-badge mgc-badge--muted">Đã ẩn</span>';
        const id = escapeHtml(String(r._id));
        const action = active
          ? '<button type="button" class="btn-logout" style="background:#b91c1c;" onclick="PlaceEngagementAdmin.deactivateReview(\'' +
            id + '\')">Ẩn</button>'
          : '<button type="button" class="btn-edit" onclick="PlaceEngagementAdmin.activateReview(\'' +
            id + '\')">Kích hoạt</button>';
        return (
          '<tr>' +
          '<td title="' + escapeHtml(placeLabel) + '">' + escapeHtml(placeLabel) + '</td>' +
          '<td>' + escapeHtml(userLabel) + '</td>' +
          '<td style="white-space:nowrap;color:#ca8a04;" title="' + (r.rating || 0) + '">' +
          escapeHtml(stars(r.rating)) + '</td>' +
          '<td style="max-width:280px;">' + escapeHtml(r.comment || '—') + '</td>' +
          '<td>' + status + '</td>' +
          '<td style="font-size:12px;">' + escapeHtml(fmtDate(r.updatedAt || r.createdAt)) + '</td>' +
          '<td style="white-space:nowrap;">' + action + '</td>' +
          '</tr>'
        );
      }).join('');
    } catch (e) {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
      }
      if (meta) meta.textContent = '';
    }
  }

  async function loadFavorites() {
    const tbody = document.getElementById('peFavoritesList');
    const meta = document.getElementById('peFavoritesMeta');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" class="admin-table-loading-cell">Đang tải yêu thích…</td></tr>';
    }
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (!isIndoor()) {
        const pid = placeIdParam();
        if (pid) params.set('place_id', pid);
      }
      const res = await fetch(apiBase() + '/admin/favorites?' + params.toString(), { headers: headers() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không tải được yêu thích');
      const rows = data.favorites || [];
      if (meta) {
        meta.textContent =
          (isIndoor() ? 'Trong nhà' : 'Ngoài trời') +
          ' · Tổng: ' + (data.total != null ? data.total : rows.length);
      }
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="analytics-muted">Chưa có yêu thích.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map((r) => {
        const userLabel = r.user
          ? (r.user.full_name || r.user.email || r.user.id)
          : String(r.user_id || '—');
        const placeLabel = r.place
          ? (r.place.name || r.place.slug || r.place.id)
          : String(r.place_id || '—');
        return (
          '<tr>' +
          '<td title="' + escapeHtml(placeLabel) + '">' + escapeHtml(placeLabel) + '</td>' +
          '<td>' + escapeHtml(userLabel) + '</td>' +
          '<td style="font-size:12px;">' + escapeHtml(r.user && r.user.email ? r.user.email : '—') + '</td>' +
          '<td style="font-size:12px;">' + escapeHtml(fmtDate(r.createdAt)) + '</td>' +
          '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn-logout" style="background:#b91c1c;" onclick="PlaceEngagementAdmin.removeFavorite(\'' +
          escapeHtml(String(r._id)) + '\')">Xóa</button>' +
          '</td>' +
          '</tr>'
        );
      }).join('');
    } catch (e) {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" class="analytics-error">' + escapeHtml(e.message) + '</td></tr>';
      }
      if (meta) meta.textContent = '';
    }
  }

  async function loadAll() {
    syncScopeUi();
    await Promise.all([loadReviews(), loadFavorites()]);
  }

  async function deactivateReview(id) {
    if (!id) return;
    if (!confirm('Ẩn đánh giá này khỏi app công khai?')) return;
    try {
      const res = await fetch(apiBase() + '/admin/reviews/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: headers()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không ẩn được đánh giá');
      await loadReviews();
    } catch (e) {
      alert(e.message || 'Lỗi');
    }
  }

  async function activateReview(id) {
    if (!id) return;
    if (!confirm('Hiện lại đánh giá này trên app?')) return;
    try {
      const res = await fetch(apiBase() + '/admin/reviews/' + encodeURIComponent(id) + '/activate', {
        method: 'POST',
        headers: headers(true),
        body: '{}'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không kích hoạt được đánh giá');
      await loadReviews();
    } catch (e) {
      alert(e.message || 'Lỗi');
    }
  }

  async function removeFavorite(id) {
    if (!id) return;
    if (!confirm('Xóa bản ghi yêu thích này?')) return;
    try {
      const res = await fetch(apiBase() + '/admin/favorites/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: headers()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Không xóa được yêu thích');
      await loadFavorites();
    } catch (e) {
      alert(e.message || 'Lỗi');
    }
  }

  let searchTimer = null;
  function onPlaceKeywordInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchPlaces, 280);
  }

  global.PlaceEngagementAdmin = {
    loadAll,
    loadReviews,
    loadFavorites,
    clearPlace,
    searchPlaces,
    onPlaceKeywordInput,
    onScopeChange,
    deactivateReview,
    activateReview,
    removeFavorite
  };
})(window);
