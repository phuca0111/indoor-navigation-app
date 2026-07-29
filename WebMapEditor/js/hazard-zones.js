/**
 * Vùng nguy hiểm (Hazard Zone) — vẽ polygon trên map, lưu qua Emergency API.
 * Không ghi vào map JSON / draft phòng.
 */
(function initHazardZones(global) {
  var HAZARD_TYPES = [
    'OTHER', 'FIRE', 'SMOKE', 'GAS', 'FLOOD', 'COLLAPSE', 'ELECTRIC', 'CROWD', 'EARTHQUAKE'
  ];

  var HAZARD_TYPE_VI = {
    OTHER: 'Vùng nguy hiểm',
    FIRE: 'Cháy',
    SMOKE: 'Khói',
    GAS: 'Rò khí',
    FLOOD: 'Ngập',
    COLLAPSE: 'Sập / đổ',
    ELECTRIC: 'Điện',
    CROWD: 'Đông người',
    EARTHQUAKE: 'Động đất'
  };

  var hazardZones = [];
  var selectedHazardZone = null;
  var hazardIncidentId = null;
  var hazardLayerVisible = true;
  var _panelBound = false;

  function qs(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (_) {
      return null;
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function floorNumber() {
    if (typeof getCurrentFloor === 'function') {
      var f = Number(getCurrentFloor());
      return Number.isFinite(f) ? f : 0;
    }
    return 0;
  }

  function apiBase() {
    if (typeof BASE_API_URL === 'string' && BASE_API_URL) return BASE_API_URL.replace(/\/$/, '');
    return '/api';
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
    else console.log('[hazard]', msg);
  }

  function setIncidentId(id) {
    hazardIncidentId = id ? String(id) : null;
    var input = document.getElementById('hazardIncidentId');
    if (input && hazardIncidentId && input.value !== hazardIncidentId) {
      input.value = hazardIncidentId;
    }
    updateHazardPanel();
  }

  function getIncidentId() {
    var input = document.getElementById('hazardIncidentId');
    if (input && input.value.trim()) return input.value.trim();
    return hazardIncidentId;
  }

  function getHazardType() {
    var sel = document.getElementById('hazardTypeSelect');
    return (sel && sel.value) || 'OTHER';
  }

  function getHazardName() {
    var input = document.getElementById('hazardNameInput');
    return (input && input.value.trim()) || '';
  }

  async function emergencyFetch(path, options) {
    if (typeof apiFetch !== 'function') throw new Error('apiFetch chưa sẵn sàng');
    var opts = Object.assign({}, options || {});
    opts.headers = Object.assign(
      { 'Content-Type': 'application/json' },
      opts.headers || {}
    );
    var res = await apiFetch(apiBase() + path, opts);
    var data = {};
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }
    if (!res.ok) {
      throw new Error(data.message || ('HTTP ' + res.status));
    }
    return data;
  }

  async function fetchZonesForIncident(incidentId) {
    if (!incidentId) return;
    try {
      var res = await emergencyFetch(
        '/emergency/incidents/' + encodeURIComponent(incidentId) + '/hazard-zones'
      );
      hazardZones = Array.isArray(res.hazard_zones) ? res.hazard_zones : [];
      updateHazardPanel();
      if (typeof draw === 'function') draw();
    } catch (err) {
      toast(err.message || 'Không tải được vùng nguy hiểm', 'error');
    }
  }

  async function finishHazardPolygon(points) {
    if (!points || points.length < 3) {
      toast('Cần ít nhất 3 điểm để khoanh vùng', 'error');
      return false;
    }
    var incidentId = getIncidentId();
    if (!incidentId) {
      toast('Thiếu mã sự cố — mở Editor từ nút «Vẽ vùng nguy hiểm» trên tab Khẩn cấp, hoặc dán incidentId vào panel bên trái', 'error');
      return false;
    }
    var bid = (typeof buildingId !== 'undefined' && buildingId) ? buildingId : qs('buildingId');
    var body = {
      hazard_type: getHazardType(),
      name: getHazardName() || 'Vùng nguy hiểm',
      building_id: bid || null,
      floor_number: floorNumber(),
      // Sự cố đang ACTIVE → yêu cầu tạo zone đã active (backend cũng tự bật)
      active: true,
      polygon: points.map(function (p) {
        return { x: Number(p.x), y: Number(p.y) };
      })
    };
    try {
      var res = await emergencyFetch(
        '/emergency/incidents/' + encodeURIComponent(incidentId) + '/hazard-zones',
        { method: 'POST', body: JSON.stringify(body) }
      );
      if (res.hazard_zone) hazardZones.unshift(res.hazard_zone);
      selectedHazardZone = res.hazard_zone || null;
      updateHazardPanel();
      if (typeof draw === 'function') draw();

      // Không cần Xuất bản map — zone lưu thẳng Emergency API.
      // Tự bật nếu sự cố đang ACTIVE (app chỉ nhận zone active).
      var zoneId = res.hazard_zone && res.hazard_zone.id;
      if (zoneId) {
        try {
          await emergencyFetch(
            '/emergency/incidents/' + encodeURIComponent(incidentId) + '/hazard-zones/activate',
            { method: 'POST', body: JSON.stringify({ zone_ids: [zoneId] }) }
          );
          if (res.hazard_zone) res.hazard_zone.active = true;
          toast('Đã lưu + bật vùng nguy hiểm lên server (không cần Xuất bản map). App sẽ thấy vùng đỏ.', 'success');
          await fetchZonesForIncident(incidentId);
        } catch (actErr) {
          toast(
            'Đã lưu zone (nháp). Chưa bật được: ' + (actErr.message || 'sự cố phải ACTIVE') +
            ' — vào tab Khẩn cấp → Điều khiển → Bật.',
            'error'
          );
        }
      } else {
        toast('Đã lưu vùng nguy hiểm lên server (không cần Xuất bản map).', 'success');
      }
      return true;
    } catch (err) {
      toast(err.message || 'Lưu vùng thất bại', 'error');
      return false;
    }
  }

  async function activateZone(zoneId) {
    var incidentId = getIncidentId();
    if (!incidentId || !zoneId) return;
    try {
      await emergencyFetch(
        '/emergency/incidents/' + encodeURIComponent(incidentId) + '/hazard-zones/activate',
        { method: 'POST', body: JSON.stringify({ zone_ids: [zoneId] }) }
      );
      toast('Đã kích hoạt vùng', 'success');
      await fetchZonesForIncident(incidentId);
    } catch (err) {
      toast(err.message || 'Kích hoạt thất bại (sự cố phải ACTIVE)', 'error');
    }
  }

  async function deactivateZone(zoneId) {
    var incidentId = getIncidentId();
    if (!incidentId || !zoneId) return;
    try {
      await emergencyFetch(
        '/emergency/incidents/' + encodeURIComponent(incidentId) + '/hazard-zones/deactivate',
        { method: 'POST', body: JSON.stringify({ zone_ids: [zoneId] }) }
      );
      toast('Đã tắt vùng', 'success');
      await fetchZonesForIncident(incidentId);
    } catch (err) {
      toast(err.message || 'Tắt vùng thất bại', 'error');
    }
  }

  async function deleteZone(zoneId) {
    if (!zoneId || !confirm('Xóa vùng nguy hiểm này?')) return;
    try {
      await emergencyFetch('/emergency/hazard-zones/' + encodeURIComponent(zoneId), {
        method: 'DELETE'
      });
      hazardZones = hazardZones.filter(function (z) { return z.id !== zoneId; });
      if (selectedHazardZone && selectedHazardZone.id === zoneId) selectedHazardZone = null;
      toast('Đã xóa vùng', 'success');
      updateHazardPanel();
      if (typeof draw === 'function') draw();
    } catch (err) {
      toast(err.message || 'Xóa thất bại', 'error');
    }
  }

  function zonesOnCurrentFloor() {
    var fl = floorNumber();
    return hazardZones.filter(function (z) {
      if (!Array.isArray(z.polygon) || z.polygon.length < 3) return false;
      if (z.floor_number == null) return true;
      return Number(z.floor_number) === fl;
    });
  }

  function drawHazardZones(ctx, zoom) {
    if (!hazardLayerVisible || !ctx) return;
    var list = zonesOnCurrentFloor();
    for (var i = 0; i < list.length; i++) {
      var z = list[i];
      var pts = z.polygon;
      var selected = selectedHazardZone && selectedHazardZone.id === z.id;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
      ctx.closePath();
      ctx.fillStyle = z.active ? 'rgba(220, 38, 38, 0.35)' : 'rgba(249, 115, 22, 0.28)';
      ctx.fill();
      ctx.strokeStyle = selected ? '#fef08a' : (z.active ? '#dc2626' : '#ea580c');
      ctx.lineWidth = (selected ? 3 : 2) / (zoom || 1);
      ctx.setLineDash(z.active ? [] : [6 / (zoom || 1), 4 / (zoom || 1)]);
      ctx.stroke();
      ctx.setLineDash([]);

      var cx = 0;
      var cy = 0;
      for (var k = 0; k < pts.length; k++) {
        cx += pts[k].x;
        cy += pts[k].y;
      }
      cx /= pts.length;
      cy /= pts.length;
      var label = (z.name || HAZARD_TYPE_VI[z.hazard_type] || z.hazard_type || 'Hazard') +
        (z.active ? ' ●' : ' ○');
      ctx.save();
      ctx.font = (11 / (zoom || 1)) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var tw = ctx.measureText(label).width + 8 / (zoom || 1);
      var th = 14 / (zoom || 1);
      ctx.fillStyle = 'rgba(127, 29, 29, 0.85)';
      ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, cx, cy);
      ctx.restore();
    }
  }

  function drawHazardPreview(ctx, zoom, polygonPoints, lastMouseWorld) {
    if (!polygonPoints || polygonPoints.length < 1 || !ctx) return;
    var previewPt = lastMouseWorld || null;
    ctx.beginPath();
    ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    for (var i = 1; i < polygonPoints.length; i++) {
      ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
    }
    if (previewPt) ctx.lineTo(previewPt.x, previewPt.y);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2 / (zoom || 1);
    ctx.setLineDash([5 / (zoom || 1), 5 / (zoom || 1)]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (polygonPoints.length >= 2 && previewPt) {
      ctx.beginPath();
      ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
      for (var j = 1; j < polygonPoints.length; j++) {
        ctx.lineTo(polygonPoints[j].x, polygonPoints[j].y);
      }
      ctx.lineTo(previewPt.x, previewPt.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.fill();
    }
    for (var k = 0; k < polygonPoints.length; k++) {
      ctx.beginPath();
      ctx.arc(polygonPoints[k].x, polygonPoints[k].y, 4 / (zoom || 1), 0, Math.PI * 2);
      ctx.fillStyle = '#fecaca';
      ctx.fill();
    }
  }

  function updateHazardPanel() {
    var listEl = document.getElementById('hazardZoneList');
    if (!listEl) return;
    var fl = floorNumber();
    if (!hazardZones.length) {
      listEl.innerHTML = '<p class="hint-text">Chưa có vùng — chọn tool «Vùng nguy hiểm», click đỉnh, dblclick để lưu.</p>';
      return;
    }
    listEl.innerHTML = hazardZones.map(function (z) {
      var floorTxt = z.floor_number == null ? 'mọi tầng' : (Number(z.floor_number) === 0 ? 'GF' : (z.floor_number + 'F'));
      var onFloor = z.floor_number == null || Number(z.floor_number) === fl;
      var activeBadge = z.active
        ? '<span style="color:#16a34a;font-weight:600;">ACTIVE</span>'
        : '<span style="color:#ea580c;">nháp</span>';
      return (
        '<div class="hazard-zone-item" data-zone-id="' + escapeHtml(z.id) + '" style="padding:8px;margin-bottom:6px;border:1px solid ' +
        (onFloor ? '#fecaca' : '#e5e7eb') + ';border-radius:6px;background:' + (onFloor ? '#fef2f2' : '#f9fafb') + ';">' +
        '<div style="font-weight:600;font-size:12px;">' + escapeHtml(z.name || z.hazard_type) +
        ' · ' + escapeHtml(HAZARD_TYPE_VI[z.hazard_type] || z.hazard_type) + '</div>' +
        '<div style="font-size:11px;color:#666;">Tầng ' + escapeHtml(floorTxt) + ' · ' + activeBadge +
        ' · ' + (Array.isArray(z.polygon) ? z.polygon.length : 0) + ' điểm</div>' +
        '<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">' +
        (z.active
          ? '<button type="button" class="tool-btn" data-hz-act="off" data-id="' + escapeHtml(z.id) + '" style="font-size:11px;padding:2px 6px;">Tắt</button>'
          : '<button type="button" class="tool-btn" data-hz-act="on" data-id="' + escapeHtml(z.id) + '" style="font-size:11px;padding:2px 6px;">Bật</button>') +
        '<button type="button" class="tool-btn" data-hz-act="del" data-id="' + escapeHtml(z.id) + '" style="font-size:11px;padding:2px 6px;">Xóa</button>' +
        '</div></div>'
      );
    }).join('');
  }

  function ensurePanel() {
    var host = document.getElementById('hazardPanelRoot');
    if (!host || host.dataset.ready) return;
    host.dataset.ready = '1';
    var opts = HAZARD_TYPES.map(function (t) {
      return '<option value="' + t + '">' + (HAZARD_TYPE_VI[t] || t) + '</option>';
    }).join('');
    host.innerHTML =
      '<div class="hazard-panel" style="padding:10px;border-top:1px solid #fecaca;">' +
      '<div style="font-weight:700;color:#991b1b;margin-bottom:8px;">⚠ Vùng nguy hiểm</div>' +
      '<label style="display:block;font-size:12px;margin-bottom:6px;">Mã sự cố (incident)' +
      '<input type="text" id="hazardIncidentId" placeholder="ObjectId sự cố" ' +
      'style="width:100%;margin-top:4px;padding:6px;border:1px solid #fca5a5;border-radius:4px;"></label>' +
      '<label style="display:block;font-size:12px;margin-bottom:6px;">Loại' +
      '<select id="hazardTypeSelect" style="width:100%;margin-top:4px;padding:6px;">' + opts + '</select></label>' +
      '<label style="display:block;font-size:12px;margin-bottom:6px;">Tên vùng' +
      '<input type="text" id="hazardNameInput" placeholder="vd: Cháy hành lang A" maxlength="120" ' +
      'style="width:100%;margin-top:4px;padding:6px;border:1px solid #ddd;border-radius:4px;"></label>' +
      '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">' +
      '<button type="button" class="tool-btn" id="btnHazardLoad" style="font-size:11px;">Tải vùng</button>' +
      '<button type="button" class="tool-btn" id="btnHazardTool" style="font-size:11px;">Vẽ vùng</button>' +
      '<button type="button" class="tool-btn" id="btnHazardToggleLayer" style="font-size:11px;">Ẩn/hiện</button>' +
      '</div>' +
      '<p class="hint-text" style="font-size:11px;margin:0 0 8px;">' +
      '<b>Không cần Xuất bản map.</b> Click đỉnh → <b>double-click</b> để lưu thẳng server. ' +
      'Sự cố phải ACTIVE thì zone tự bật; app tô đỏ vùng trên đúng tầng.</p>' +
      '<div id="hazardZoneList"></div></div>';

    if (!_panelBound) {
      _panelBound = true;
      host.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-hz-act]');
        if (btn) {
          var id = btn.getAttribute('data-id');
          var act = btn.getAttribute('data-hz-act');
          if (act === 'on') activateZone(id);
          if (act === 'off') deactivateZone(id);
          if (act === 'del') deleteZone(id);
          return;
        }
        var item = e.target.closest('.hazard-zone-item');
        if (item) {
          var zid = item.getAttribute('data-zone-id');
          selectedHazardZone = hazardZones.find(function (z) { return z.id === zid; }) || null;
          if (typeof draw === 'function') draw();
        }
      });
      document.getElementById('btnHazardLoad')?.addEventListener('click', function () {
        var id = getIncidentId();
        if (!id) {
          toast('Nhập mã sự cố trước', 'error');
          return;
        }
        setIncidentId(id);
        fetchZonesForIncident(id);
      });
      document.getElementById('btnHazardTool')?.addEventListener('click', function () {
        if (typeof selectTool === 'function') selectTool('hazard');
      });
      document.getElementById('btnHazardToggleLayer')?.addEventListener('click', function () {
        hazardLayerVisible = !hazardLayerVisible;
        if (typeof draw === 'function') draw();
      });
      document.getElementById('hazardIncidentId')?.addEventListener('change', function () {
        setIncidentId(this.value.trim());
      });
    }
    if (hazardIncidentId) {
      var input = document.getElementById('hazardIncidentId');
      if (input) input.value = hazardIncidentId;
    }
    updateHazardPanel();
  }

  function bootFromUrl() {
    var incident = qs('incidentId') || qs('incident');
    if (incident) setIncidentId(incident);
    ensurePanel();
    if (incident) fetchZonesForIncident(incident);
    var tool = qs('tool');
    if (tool === 'hazard' && typeof selectTool === 'function') {
      setTimeout(function () { selectTool('hazard'); }, 600);
    }
  }

  // Reload zones when floor changes
  var floorSelect = document.getElementById('floorSelect');
  if (floorSelect && !floorSelect.dataset.hazardBound) {
    floorSelect.dataset.hazardBound = '1';
    floorSelect.addEventListener('change', function () {
      updateHazardPanel();
      if (typeof draw === 'function') draw();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootFromUrl);
  } else {
    setTimeout(bootFromUrl, 0);
  }

  global.HazardZones = {
    HAZARD_TYPES: HAZARD_TYPES,
    get zones() { return hazardZones; },
    get selected() { return selectedHazardZone; },
    get incidentId() { return getIncidentId(); },
    setIncidentId: setIncidentId,
    finishHazardPolygon: finishHazardPolygon,
    drawHazardZones: drawHazardZones,
    drawHazardPreview: drawHazardPreview,
    fetchZonesForIncident: fetchZonesForIncident,
    ensurePanel: ensurePanel,
    updateHazardPanel: updateHazardPanel,
    isLayerVisible: function () { return hazardLayerVisible; }
  };
})(window);
