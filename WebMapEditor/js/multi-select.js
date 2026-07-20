// ============================================================
// MULTI-SELECT.JS — Chọn nhiều đối tượng + Group/Ungroup (Đợt 3)
// Tập chọn `selectionSet` sống song song với selectedObject/selectedRoom (primary).
// ============================================================
(function () {
    'use strict';

    if (typeof window.selectionSet === 'undefined') window.selectionSet = [];

    // Map array-global → type dùng cho setEditorSelection / drag / delete
    var ARRAY_TYPE = {
        rooms: 'room', walls: 'wall', lines: 'line', doors: 'door',
        pois: 'poi', cadPoints: 'point', qrs: 'qr', pathNodes: 'node', blockInserts: 'blockRef'
    };

    function msList() { return window.selectionSet || (window.selectionSet = []); }
    function msClear() { window.selectionSet = []; }
    function msCount() { return msList().length; }
    function msIsMulti() { return msList().length > 1; }
    function msHas(data) {
        var L = msList();
        for (var i = 0; i < L.length; i++) if (L[i].data === data) return true;
        return false;
    }
    function msAdd(type, data) { if (data && !msHas(data)) msList().push({ type: type, data: data }); }
    function msRemove(data) { window.selectionSet = msList().filter(function (s) { return s.data !== data; }); }
    function msToggle(type, data) { if (msHas(data)) msRemove(data); else msAdd(type, data); }
    function msSet(list) { window.selectionSet = (list || []).slice(); }

    function isLocked(data) {
        return typeof legacyIsObjectLayerLocked === 'function' && legacyIsObjectLayerLocked(data);
    }

    // ---------------- GROUP / UNGROUP ----------------
    function msMaxGroupId() {
        var mx = 0;
        Object.keys(ARRAY_TYPE).forEach(function (k) {
            var arr = window[k];
            if (!Array.isArray(arr)) return;
            arr.forEach(function (o) { if (o && o.groupId && o.groupId > mx) mx = o.groupId; });
        });
        return mx;
    }

    function msObjectsInGroup(gid) {
        var out = [];
        Object.keys(ARRAY_TYPE).forEach(function (k) {
            var arr = window[k];
            if (!Array.isArray(arr)) return;
            arr.forEach(function (o) { if (o && o.groupId === gid) out.push({ type: ARRAY_TYPE[k], data: o }); });
        });
        return out;
    }

    function msGroup() {
        var L = msList();
        if (L.length < 2) {
            if (typeof showToast === 'function') showToast('Chọn ≥ 2 đối tượng để nhóm (Shift+click hoặc quét chọn)', 'error');
            return;
        }
        if (typeof saveState === 'function') saveState();
        var gid = msMaxGroupId() + 1;
        L.forEach(function (s) { if (s.data) s.data.groupId = gid; });
        if (typeof showToast === 'function') showToast('Đã nhóm ' + L.length + ' đối tượng', 'success');
        if (typeof markDirty === 'function') markDirty();
        if (typeof draw === 'function') draw();
    }

    function msUngroup() {
        var L = msList();
        var gids = {};
        L.forEach(function (s) { if (s.data && s.data.groupId) gids[s.data.groupId] = true; });
        var keys = Object.keys(gids);
        if (!keys.length) {
            if (typeof showToast === 'function') showToast('Đối tượng đang chọn không thuộc nhóm nào', 'error');
            return;
        }
        if (typeof saveState === 'function') saveState();
        keys.forEach(function (g) {
            msObjectsInGroup(+g).forEach(function (s) { if (s.data) delete s.data.groupId; });
        });
        if (typeof showToast === 'function') showToast('Đã rã ' + keys.length + ' nhóm', 'success');
        if (typeof markDirty === 'function') markDirty();
        if (typeof draw === 'function') draw();
    }

    // ---------------- DI CHUYỂN CẢ TẬP ----------------
    function msTranslate(type, data, dx, dy) {
        if (!data || (!dx && !dy)) return;
        if (Array.isArray(data.points)) {
            for (var i = 0; i < data.points.length; i++) { data.points[i].x += dx; data.points[i].y += dy; }
            if (data.x != null) data.x += dx;
            if (data.y != null) data.y += dy;
            if (type === 'room' && typeof EditorCore !== 'undefined'
                && EditorCore.ObjectTransform && EditorCore.ObjectTransform.updatePolygonBBox) {
                EditorCore.ObjectTransform.updatePolygonBBox(data);
            }
            return;
        }
        if (data.x != null) data.x += dx;
        if (data.y != null) data.y += dy;
        if (data.cx != null) data.cx += dx;
        if (data.cy != null) data.cy += dy;
    }

    function msPrimaryRef() {
        if (typeof selectedRoom !== 'undefined' && selectedRoom) return { type: 'room', data: selectedRoom };
        if (typeof selectedObject !== 'undefined' && selectedObject) return { type: selectedObject.type, data: selectedObject.data };
        return null;
    }

    // Trả về các thành viên KHÁC primary (để dịch theo delta của primary), hoặc null nếu không multi
    function msDragOthers() {
        var prim = msPrimaryRef();
        if (!prim || msCount() < 2) return null;
        return msList().filter(function (s) { return s.data !== prim.data && !isLocked(s.data); });
    }

    function msAnchor(type, data) {
        if (!data) return null;
        if ((type === 'line' || type === 'wall') && typeof getPolylineCentroid === 'function') {
            return getPolylineCentroid(data);
        }
        if (data.x != null && data.y != null) return { x: data.x, y: data.y };
        if (data.cx != null) return { x: data.cx, y: data.cy };
        if (Array.isArray(data.points) && data.points[0]) return { x: data.points[0].x, y: data.points[0].y };
        return null;
    }

    // ---------------- XÓA CẢ TẬP ----------------
    function msDeleteAll() {
        var L = msList();
        if (L.length < 2) return false;
        if (!confirm('Xóa ' + L.length + ' đối tượng đang chọn?')) return true;
        if (typeof saveState === 'function') saveState();
        L.slice().forEach(function (s) {
            var type = s.type, data = s.data;
            if (isLocked(data)) return;
            if (type === 'room') window.rooms = (window.rooms || []).filter(function (r) { return r.id !== data.id; });
            else if (type === 'door' && typeof deleteDoor === 'function') deleteDoor(data);
            else if (type === 'wall' && typeof deleteWall === 'function') deleteWall(data);
            else if (type === 'line' && typeof deleteLine === 'function') deleteLine(data);
            else if (type === 'poi' && typeof deletePoi === 'function') deletePoi(data);
            else if (type === 'point' && typeof deleteCadPoint === 'function') deleteCadPoint(data);
            else if (type === 'qr' && typeof deleteQr === 'function') deleteQr(data);
            else if (type === 'node' && typeof deleteNode === 'function') deleteNode(data);
            else if (type === 'blockRef' && typeof deleteBlockInsert === 'function') deleteBlockInsert(data);
            else if (type === 'dimension' && typeof deleteDimension === 'function') deleteDimension(data);
        });
        msClear();
        if (typeof clearEditorSelection === 'function') clearEditorSelection({ skipUi: true });
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof updateObjectList === 'function') updateObjectList();
        if (typeof draw === 'function') draw();
        return true;
    }

    // ---------------- HỘP BAO (BBOX) ----------------
    function msBBox(type, data) {
        if (!data) return null;
        if (type === 'room') {
            if (data.shape === 'circle' && data.cx != null) {
                return { x: data.cx - data.radius, y: data.cy - data.radius, w: data.radius * 2, h: data.radius * 2 };
            }
            if (data.shape === 'polygon' && Array.isArray(data.points) && data.points.length) {
                return bboxOfPoints(data.points);
            }
            return { x: data.x, y: data.y, w: data.width || 0, h: data.height || 0 };
        }
        if ((type === 'line' || type === 'wall') && Array.isArray(data.points) && data.points.length) {
            return bboxOfPoints(data.points);
        }
        if (type === 'dimension') {
            var pts = [];
            if (data.p1) pts.push(data.p1);
            if (data.p2) pts.push(data.p2);
            if (data.p3) pts.push(data.p3);
            if (pts.length) return bboxOfPoints(pts);
        }
        if (data.x != null && data.y != null) {
            var pad = 8;
            return { x: data.x - pad, y: data.y - pad, w: pad * 2, h: pad * 2 };
        }
        return null;
    }

    function bboxOfPoints(pts) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < pts.length; i++) {
            if (pts[i].x < minX) minX = pts[i].x;
            if (pts[i].y < minY) minY = pts[i].y;
            if (pts[i].x > maxX) maxX = pts[i].x;
            if (pts[i].y > maxY) maxY = pts[i].y;
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    function rectContains(r, b) {
        return b.x >= r.x && b.y >= r.y && (b.x + b.w) <= (r.x + r.w) && (b.y + b.h) <= (r.y + r.h);
    }
    function rectIntersects(r, b) {
        return !(b.x > r.x + r.w || b.x + b.w < r.x || b.y > r.y + r.h || b.y + b.h < r.y);
    }

    // ---------------- MARQUEE (quét chọn) ----------------
    function msCollectInRect(r) {
        var hits = [];
        var test = r.crossing ? rectIntersects : rectContains;
        Object.keys(ARRAY_TYPE).forEach(function (k) {
            var arr = window[k];
            if (!Array.isArray(arr)) return;
            var type = ARRAY_TYPE[k];
            arr.forEach(function (o) {
                if (!o || isLocked(o)) return;
                var b = msBBox(type, o);
                if (b && test(r, b)) hits.push({ type: type, data: o });
            });
        });
        return hits;
    }

    function msStartMarquee(world) {
        window.isMarquee = true;
        window.marqueeStart = { x: world.x, y: world.y };
        window.marqueeRect = null;
    }
    function msUpdateMarquee(world) {
        if (!window.isMarquee || !window.marqueeStart) return;
        var s = window.marqueeStart;
        window.marqueeRect = {
            x: Math.min(s.x, world.x), y: Math.min(s.y, world.y),
            w: Math.abs(world.x - s.x), h: Math.abs(world.y - s.y),
            crossing: world.x < s.x
        };
    }
    function msFinishMarquee() {
        var r = window.marqueeRect;
        var active = window.isMarquee;
        window.isMarquee = false;
        window.marqueeStart = null;
        if (!active) return false;
        // Kéo quá nhỏ → coi như click rỗng: bỏ chọn
        if (!r || (r.w < 3 / (window.zoom || 1) && r.h < 3 / (window.zoom || 1))) {
            window.marqueeRect = null;
            msClear();
            if (typeof clearEditorSelection === 'function') clearEditorSelection({ skipUi: true });
            if (typeof draw === 'function') draw();
            return true;
        }
        var hits = msCollectInRect(r);
        window.marqueeRect = null;
        if (!hits.length) {
            msClear();
            if (typeof clearEditorSelection === 'function') clearEditorSelection({ skipUi: true });
            if (typeof draw === 'function') draw();
            return true;
        }
        applySetWithPrimary(hits, hits[hits.length - 1]);
        if (typeof draw === 'function') draw();
        return true;
    }

    // Đặt primary qua setEditorSelection nhưng GIỮ nguyên selectionSet đã dựng
    function applySetWithPrimary(list, primary) {
        window._msKeepSet = true;
        try {
            if (typeof setEditorSelection === 'function') {
                setEditorSelection(primary.type, primary.data);
            }
        } finally {
            window._msKeepSet = false;
        }
        msSet(list);
    }

    // ---------------- XỬ LÝ CLICK (gọi từ events.js) ----------------
    // Trả về true nếu đã tự xử lý selection (caller không cần gọi setEditorSelection nữa).
    function msHandlePick(type, data, e) {
        // Shift+click: bật/tắt 1 đối tượng trong tập
        if (data && e && e.shiftKey) {
            window.isDragging = false;
            msToggle(type, data);
            var L = msList();
            var prim = L.length ? L[L.length - 1] : null;
            if (prim) applySetWithPrimary(L, prim);
            else { if (typeof clearEditorSelection === 'function') clearEditorSelection(); }
            return true;
        }
        // Click thường lên 1 đối tượng thuộc NHÓM → chọn cả nhóm
        if (data && data.groupId != null) {
            var members = msObjectsInGroup(data.groupId);
            if (members.length > 1) {
                applySetWithPrimary(members, { type: type, data: data });
                return true;
            }
        }
        // Click thường lên 1 phần tử đang thuộc tập multi → giữ tập (để kéo cả cụm)
        if (data && msHas(data) && msIsMulti()) {
            window._msKeepSet = true;
            try { if (typeof setEditorSelection === 'function') setEditorSelection(type, data); }
            finally { window._msKeepSet = false; }
            return true;
        }
        // Click rỗng → bắt đầu marquee (tập sẽ dựng khi thả chuột)
        if (!data && e) {
            msClear();
            return false; // để caller vẫn clear primary + ta start marquee ở events
        }
        return false; // primary đơn: caller setEditorSelection như cũ (đã tự reset tập)
    }

    // ---------------- VẼ OVERLAY (world space, gọi trong draw()) ----------------
    function drawMultiSelectOverlay() {
        var L = msList();
        if (L.length < 2 || typeof ctx === 'undefined' || !ctx) return;
        var z = window.zoom || 1;
        ctx.save();
        ctx.lineWidth = 1.5 / z;
        ctx.setLineDash([6 / z, 4 / z]);
        for (var i = 0; i < L.length; i++) {
            var b = msBBox(L[i].type, L[i].data);
            if (!b) continue;
            var grouped = L[i].data && L[i].data.groupId != null;
            ctx.strokeStyle = grouped ? '#7c3aed' : '#2563eb';
            var pad = 4 / z;
            ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
        }
        ctx.restore();
    }

    function drawMarquee() {
        var r = window.marqueeRect;
        if (!r || typeof ctx === 'undefined' || !ctx) return;
        var z = window.zoom || 1;
        ctx.save();
        ctx.lineWidth = 1 / z;
        if (r.crossing) {
            ctx.strokeStyle = '#16a34a';
            ctx.fillStyle = 'rgba(22,163,74,0.08)';
            ctx.setLineDash([5 / z, 3 / z]);
        } else {
            ctx.strokeStyle = '#2563eb';
            ctx.fillStyle = 'rgba(37,99,235,0.08)';
            ctx.setLineDash([]);
        }
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.restore();
    }

    // ---------------- EXPORT ----------------
    window.msClear = msClear;
    window.msCount = msCount;
    window.msIsMulti = msIsMulti;
    window.msHas = msHas;
    window.msToggle = msToggle;
    window.msSet = msSet;
    window.msGroup = msGroup;
    window.msUngroup = msUngroup;
    window.msObjectsInGroup = msObjectsInGroup;
    window.msTranslate = msTranslate;
    window.msDragOthers = msDragOthers;
    window.msAnchor = msAnchor;
    window.msPrimaryRef = msPrimaryRef;
    window.msDeleteAll = msDeleteAll;
    window.msHandlePick = msHandlePick;
    window.msStartMarquee = msStartMarquee;
    window.msUpdateMarquee = msUpdateMarquee;
    window.msFinishMarquee = msFinishMarquee;
    window.drawMultiSelectOverlay = drawMultiSelectOverlay;
    window.drawMarquee = drawMarquee;
})();
