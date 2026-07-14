// ============================================================
// MODIFY-SESSION.JS — Phase 2: Move/Copy/Rotate/Scale/Mirror/Trim/Extend/PEdit/MLine
// Session UI gắn legacy selection + ObjectTransform + GeometryEngine
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.ModifySession = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var MODE = {
        MOVE: 'move', COPY: 'copy', ROTATE: 'rotate', SCALE: 'scale',
        MIRROR: 'mirror', TRIM: 'trim', EXTEND: 'extend', PEDIT: 'pedit',
        MLINE: 'mline', ARRAY: 'array', MATCHPROP: 'matchprop'
    };

    var MODIFY_TOOL_IDS = [
        'move', 'copy', 'rotate', 'scale', 'mirror',
        'trim', 'extend', 'pedit', 'mline', 'array', 'matchprop'
    ];

    var state = {
        mode: null,
        stage: 'idle', // idle | base | dest | axis | cutting | target | pedit | mline | source | match
        base: null,
        dest: null,
        axisA: null,
        cutting: null, // { type, data, segIndex }
        peditVertex: -1,
        mlinePoints: [],
        mlineThickness: 12,
        arrayCount: 4,
        matchSource: null, // { type, props }
        preview: null,
        message: ''
    };

    function core() {
        return (typeof globalThis !== 'undefined' && globalThis.EditorCore) ||
            (typeof window !== 'undefined' && window.EditorCore) || null;
    }
    function OT() {
        var c = core();
        return (c && c.ObjectTransform) || null;
    }
    function GE() {
        var c = core();
        return (c && c.GeometryEngine) || null;
    }

    function getSelection() {
        if (typeof selectedRoom !== 'undefined' && selectedRoom) {
            return { type: 'room', data: selectedRoom };
        }
        if (typeof selectedObject !== 'undefined' && selectedObject && selectedObject.data) {
            return { type: selectedObject.type, data: selectedObject.data };
        }
        return null;
    }

    function reset() {
        state.stage = 'idle';
        state.base = null;
        state.dest = null;
        state.axisA = null;
        state.cutting = null;
        state.peditVertex = -1;
        state.mlinePoints = [];
        state.matchSource = null;
        state.preview = null;
        state.message = '';
    }

    function extractStyleProps(type, data) {
        if (!data) return {};
        var props = {};
        ['color', 'fill', 'stroke', 'thickness', 'type', 'is_outer', 'category',
            'poiType', 'label', 'name', 'rotation', 'width', 'height'].forEach(function (k) {
            if (data[k] !== undefined) props[k] = data[k];
        });
        props._sourceType = type;
        return props;
    }

    function applyStyleProps(type, data, props) {
        if (!data || !props) return;
        Object.keys(props).forEach(function (k) {
            if (k === '_sourceType') return;
            if (k === 'name' || k === 'label') return; // không đè tên
            if (data[k] !== undefined || ['color', 'fill', 'stroke', 'thickness', 'type',
                'is_outer', 'category', 'poiType', 'rotation'].indexOf(k) >= 0) {
                data[k] = props[k];
            }
        });
    }

    function activate(mode) {
        state.mode = mode;
        reset();
        if (mode === MODE.MLINE) {
            if (typeof window !== 'undefined' && window.defaultWallThickness) {
                state.mlineThickness = Math.max(2, window.defaultWallThickness);
            }
            state.stage = 'mline';
            state.message = 'Tường dày (ML): click chuỗi điểm · Enter kết thúc. Gợi ý: dùng W + ô Độ dày cho nhanh hơn.';
            return getSnapshot();
        }
        if (mode === MODE.TRIM) {
            state.stage = 'target';
            state.cutting = null;
            state.message = 'Cắt xén: click đúng phần muốn BỎ (đuôi thừa / đoạn giữa 2 tường). Biên = mọi tường & đoạn khác.';
            return getSnapshot();
        }
        if (mode === MODE.EXTEND) {
            state.stage = 'cutting';
            state.message = 'Kéo dài: B1 click biên đích → B2 click đoạn ngắn cần kéo tới biên.';
            return getSnapshot();
        }
        if (mode === MODE.MATCHPROP) {
            var sel0 = getSelection();
            if (sel0) {
                state.matchSource = { type: sel0.type, props: extractStyleProps(sel0.type, sel0.data) };
                state.stage = 'match';
                state.message = 'Matchprop: chọn đối tượng đích để dán thuộc tính';
            } else {
                state.stage = 'source';
                state.message = 'Matchprop: chọn đối tượng nguồn (style)';
            }
            return getSnapshot();
        }
        if (mode === MODE.PEDIT) {
            var sel = getSelection();
            if (!sel || (sel.type !== 'wall' && sel.type !== 'line' &&
                !(sel.type === 'room' && sel.data.shape === 'polygon'))) {
                state.message = 'PEdit: hãy chọn tường / đoạn / đa giác trước';
                state.stage = 'idle';
                return getSnapshot();
            }
            state.stage = 'pedit';
            state.message = 'PEdit: kéo đỉnh · Ctrl+click trên cạnh = thêm đỉnh · Del xóa · Esc xong';
            return getSnapshot();
        }
        // transform + array cần selection
        if (!getSelection()) {
            state.message = 'Chọn đối tượng trước (tool V), rồi dùng ' + String(mode).toUpperCase();
            state.stage = 'idle';
            return getSnapshot();
        }
        if (mode === MODE.MIRROR) {
            state.stage = 'axis';
            state.message = 'Lật trục: 2 điểm = trục. Nhanh hơn: panel «Lật ngang/dọc» khi đang chọn.';
        } else if (mode === MODE.ARRAY) {
            if (typeof prompt === 'function') {
                var raw = prompt('Sao chép hàng loạt — tổng số bản (gồm gốc)?', String(state.arrayCount));
                if (raw != null && raw !== '') {
                    var n = parseInt(raw, 10);
                    if (n >= 2 && n <= 50) state.arrayCount = n;
                }
            }
            state.stage = 'base';
            state.message = 'Hàng loạt ×' + state.arrayCount + ': click gốc → click hướng/khoảng cách (copy lặp đều).';
        } else if (mode === MODE.ROTATE) {
            state.stage = 'base';
            state.message = 'Xoay CAD: gốc → hướng. Nhanh: kéo chấm xoay trên phòng/đoạn/tường hoặc nhập ° ở panel.';
        } else if (mode === MODE.SCALE) {
            state.stage = 'base';
            state.message = 'Tỷ lệ CAD: gốc → kéo. Nhanh hơn: nhập hệ số ở panel thuộc tính (vd 1.5).';
        } else if (mode === MODE.MOVE) {
            state.stage = 'base';
            state.message = 'Di chuyển chính xác: gốc → đích (snap). Kéo thả thường ngày dùng tool V.';
        } else if (mode === MODE.COPY) {
            state.stage = 'base';
            state.message = 'Sao chép: click gốc → đích (1 bản). Nhân nhiều đều → dùng «Hàng loạt».';
        } else {
            state.stage = 'base';
            state.message = String(mode).toUpperCase() + ': click điểm gốc';
        }
        return getSnapshot();
    }

    function deactivate() {
        reset();
        state.mode = null;
        return getSnapshot();
    }

    function cancel() {
        if (state.mode === MODE.MLINE && state.mlinePoints.length) {
            state.mlinePoints = [];
            state.message = 'MLine: đã hủy chuỗi · click điểm đầu';
            return getSnapshot();
        }
        reset();
        if (state.mode) {
            return activate(state.mode);
        }
        return getSnapshot();
    }

    function nextIdFor(type) {
        if (type === 'room' && typeof nextRoomId !== 'undefined') return nextRoomId++;
        if (type === 'wall' && typeof nextWallId !== 'undefined') return nextWallId++;
        if (type === 'line' && typeof nextLineId !== 'undefined') return nextLineId++;
        if (type === 'door' && typeof nextDoorId !== 'undefined') return nextDoorId++;
        if (type === 'poi' && typeof nextPoiId !== 'undefined') return nextPoiId++;
        if (type === 'qr' && typeof nextQrId !== 'undefined') return nextQrId++;
        if (type === 'node' && typeof nextNodeId !== 'undefined') return nextNodeId++;
        return Date.now();
    }

    function pushClone(type, data) {
        if (type === 'room' && typeof rooms !== 'undefined') {
            rooms.push(data);
            if (typeof roomCountSpan !== 'undefined' && roomCountSpan) {
                roomCountSpan.textContent = 'Phòng: ' + rooms.length;
            }
        } else if (type === 'wall' && typeof walls !== 'undefined') walls.push(data);
        else if (type === 'line' && typeof lines !== 'undefined') lines.push(data);
        else if (type === 'door' && typeof doors !== 'undefined') doors.push(data);
        else if (type === 'poi' && typeof pois !== 'undefined') pois.push(data);
        else if (type === 'qr' && typeof qrs !== 'undefined') qrs.push(data);
        else if (type === 'node' && typeof pathNodes !== 'undefined') pathNodes.push(data);
    }

    function commitSave() {
        if (typeof saveState === 'function') saveState();
        if (typeof syncSpatialIndexFromLegacy === 'function') syncSpatialIndexFromLegacy();
        if (typeof updateObjectList === 'function') updateObjectList();
        if (typeof updatePropertiesPanel === 'function') updatePropertiesPanel();
        if (typeof draw === 'function') draw();
    }

    function findSegmentHit(wx, wy) {
        var threshold = 10 / (typeof zoom !== 'undefined' ? zoom : 1);
        function hitPoly(arr, type) {
            if (!arr) return null;
            for (var i = arr.length - 1; i >= 0; i--) {
                var obj = arr[i];
                if (!obj.points || obj.points.length < 2) continue;
                for (var j = 0; j < obj.points.length - 1; j++) {
                    var a = obj.points[j], b = obj.points[j + 1];
                    var d = distToSeg(wx, wy, a.x, a.y, b.x, b.y);
                    if (d <= threshold) return { type: type, data: obj, segIndex: j };
                }
            }
            return null;
        }
        return hitPoly(typeof walls !== 'undefined' ? walls : [], 'wall') ||
            hitPoly(typeof lines !== 'undefined' ? lines : [], 'line');
    }

    function distToSeg(px, py, x1, y1, x2, y2) {
        var dx = x2 - x1, dy = y2 - y1;
        if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
        var t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    /** Chiếu điểm lên cạnh gần nhất — dùng Ctrl+click thêm đỉnh trên cạnh (không lệch khỏi đoạn). */
    function findEdgeInsertPoint(pts, pt, thr) {
        if (!pts || pts.length < 2 || !pt) return null;
        var best = null;
        var bestD = thr != null ? thr : Infinity;
        for (var i = 0; i < pts.length - 1; i++) {
            var a = pts[i], b = pts[i + 1];
            var dx = b.x - a.x, dy = b.y - a.y;
            var len2 = dx * dx + dy * dy;
            var t = 0;
            if (len2 > 1e-10) {
                t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
                t = Math.max(0.05, Math.min(0.95, t));
            }
            var px = a.x + t * dx, py = a.y + t * dy;
            var d = Math.hypot(pt.x - px, pt.y - py);
            if (d < bestD) {
                bestD = d;
                best = { index: i, x: px, y: py };
            }
        }
        return best;
    }

    function applyTransform(sel, base, dest) {
        var T = OT();
        if (!T || !sel) return false;
        var dx = dest.x - base.x, dy = dest.y - base.y;
        if (state.mode === MODE.MOVE) {
            T.translateObject(sel.type, sel.data, dx, dy);
            return true;
        }
        if (state.mode === MODE.COPY) {
            var copy = T.cloneObject(sel.type, sel.data, nextIdFor);
            T.translateObject(sel.type, copy, dx, dy);
            pushClone(sel.type, copy);
            if (typeof setEditorSelection === 'function') {
                setEditorSelection(sel.type, copy, { skipUi: true });
            }
            return true;
        }
        if (state.mode === MODE.ROTATE) {
            var ang = Math.atan2(dest.y - base.y, dest.x - base.x);
            T.rotateObject(sel.type, sel.data, base.x, base.y, ang);
            return true;
        }
        if (state.mode === MODE.SCALE) {
            var d0 = 40;
            var d1 = Math.hypot(dest.x - base.x, dest.y - base.y) || d0;
            var factor = d1 / d0;
            T.scaleObject(sel.type, sel.data, base.x, base.y, factor);
            return true;
        }
        return false;
    }

    function finishMirror(sel, a, b) {
        var T = OT();
        if (!T || !sel) return false;
        T.mirrorObject(sel.type, sel.data, a, b);
        return true;
    }

    function collectCutters(excludeData, excludeSegIndex) {
        var list = [];
        function addFrom(arr) {
            if (!arr) return;
            for (var i = 0; i < arr.length; i++) {
                var obj = arr[i];
                if (!obj.points || obj.points.length < 2) continue;
                for (var j = 0; j < obj.points.length - 1; j++) {
                    if (obj === excludeData && j === excludeSegIndex) continue;
                    list.push({
                        a: obj.points[j],
                        b: obj.points[j + 1],
                        data: obj,
                        segIndex: j
                    });
                }
            }
        }
        addFrom(typeof walls !== 'undefined' ? walls : []);
        addFrom(typeof lines !== 'undefined' ? lines : []);
        return list;
    }

    function replaceSegmentPoints(targetHit, a, b) {
        if (targetHit.data.points.length === 2) {
            targetHit.data.points = [a, b];
        } else {
            var pts = targetHit.data.points.slice();
            pts[targetHit.segIndex] = a;
            pts[targetHit.segIndex + 1] = b;
            targetHit.data.points = pts;
        }
    }

    function pushBrokenOtherHalf(targetHit, otherA, otherB) {
        var type = targetHit.type;
        var T = OT();
        if (!T) return;
        var copy = T.cloneObject(type, targetHit.data, nextIdFor);
        copy.points = [otherA, otherB];
        if (type === 'wall' && copy.thickness == null) copy.thickness = 4;
        pushClone(type, copy);
    }

    function applySimpleTrim(targetHit, clickPt) {
        var ge = GE();
        if (!ge || !targetHit) return { ok: false, reason: 'no_target' };
        var ta = targetHit.data.points[targetHit.segIndex];
        var tb = targetHit.data.points[targetHit.segIndex + 1];
        var cutters = collectCutters(targetHit.data, targetHit.segIndex);
        var result = ge.trimAgainstCutters(ta, tb, cutters, clickPt);
        if (result) {
            replaceSegmentPoints(targetHit, result.a, result.b);
            if (result.otherHalf && result.otherHalf.a && result.otherHalf.b) {
                pushBrokenOtherHalf(targetHit, result.otherHalf.a, result.otherHalf.b);
            }
            return { ok: true, mode: result.otherHalf ? 'trim_split' : 'trim' };
        }
        // Không giao biên → cắt đôi tại điểm click (Break), bỏ nửa chứa click
        var br = ge.breakSegmentAt(ta, tb, clickPt);
        if (!br) return { ok: false, reason: 'no_cut' };
        var removeLeft = Math.hypot(clickPt.x - br.left.a.x, clickPt.y - br.left.a.y) +
            Math.hypot(clickPt.x - br.left.b.x, clickPt.y - br.left.b.y) <
            Math.hypot(clickPt.x - br.right.a.x, clickPt.y - br.right.a.y) +
            Math.hypot(clickPt.x - br.right.b.x, clickPt.y - br.right.b.y);
        if (removeLeft) {
            replaceSegmentPoints(targetHit, br.right.a, br.right.b);
        } else {
            replaceSegmentPoints(targetHit, br.left.a, br.left.b);
        }
        return { ok: true, mode: 'break' };
    }

    function applyTrimOrExtend(targetHit, clickPt) {
        var ge = GE();
        if (!ge || !targetHit) return false;
        if (state.mode === MODE.TRIM) {
            return applySimpleTrim(targetHit, clickPt).ok;
        }
        if (!state.cutting) return false;
        var c = state.cutting;
        var ca = c.data.points[c.segIndex];
        var cb = c.data.points[c.segIndex + 1];
        var ta = targetHit.data.points[targetHit.segIndex];
        var tb = targetHit.data.points[targetHit.segIndex + 1];
        var result = ge.extendSegment(ta, tb, ca, cb);
        if (!result) return false;
        replaceSegmentPoints(targetHit, result.a, result.b);
        return true;
    }

    function finishMline() {
        if (state.mlinePoints.length < 2) return false;
        var created = 0;
        for (var i = 0; i < state.mlinePoints.length - 1; i++) {
            var a = state.mlinePoints[i], b = state.mlinePoints[i + 1];
            if (typeof createWallSegment === 'function') {
                var w = createWallSegment(a, b, { thickness: state.mlineThickness, is_outer: false });
                if (w) {
                    w.isMline = true;
                    created++;
                }
            }
        }
        // Chỉ tạo tường dày (lineWidth = thickness) — không thêm 2 mép lines[]
        // (mép riêng lệch góc + chọn/xóa lẫn với Đoạn thẳng → nhìn lạ).
        state.mlinePoints = [];
        state.message = 'MLine: đã tạo ' + created + ' đoạn · click để vẽ tiếp';
        return created > 0;
    }

    function applyArray(sel, base, dest) {
        var T = OT();
        if (!T || !sel) return 0;
        var dx = dest.x - base.x, dy = dest.y - base.y;
        var n = Math.max(2, state.arrayCount | 0);
        var created = 0;
        for (var i = 1; i < n; i++) {
            var copy = T.cloneObject(sel.type, sel.data, nextIdFor);
            T.translateObject(sel.type, copy, dx * i, dy * i);
            pushClone(sel.type, copy);
            created++;
        }
        return created;
    }

    function pickObjectAt(wx, wy) {
        if (typeof findNodeAt === 'function') {
            var n = findNodeAt(wx, wy); if (n) return { type: 'node', data: n };
        }
        if (typeof findQrAt === 'function') {
            var q = findQrAt(wx, wy); if (q) return { type: 'qr', data: q };
        }
        if (typeof findPoiAt === 'function') {
            var p = findPoiAt(wx, wy); if (p) return { type: 'poi', data: p };
        }
        if (typeof findDoorAt === 'function') {
            var d = findDoorAt(wx, wy); if (d) return { type: 'door', data: d };
        }
        var seg = findSegmentHit(wx, wy);
        if (seg) return { type: seg.type, data: seg.data };
        if (typeof findRoomAt === 'function') {
            var r = findRoomAt(wx, wy); if (r) return { type: 'room', data: r };
        }
        return null;
    }

    function onPointerDown(world, opts) {
        opts = opts || {};
        var pt = { x: world.x, y: world.y };
        var sel = getSelection();

        if (state.mode === MODE.MATCHPROP) {
            if (state.stage === 'source') {
                var src = pickObjectAt(pt.x, pt.y) || sel;
                if (!src) {
                    state.message = 'Matchprop: click đối tượng nguồn';
                    return getSnapshot();
                }
                state.matchSource = { type: src.type, props: extractStyleProps(src.type, src.data) };
                if (typeof setEditorSelection === 'function') {
                    setEditorSelection(src.type, src.data, { skipUi: true });
                }
                state.stage = 'match';
                state.message = 'Matchprop: chọn đối tượng đích';
                return getSnapshot();
            }
            if (state.stage === 'match' && state.matchSource) {
                var tgt = pickObjectAt(pt.x, pt.y);
                if (!tgt) {
                    state.message = 'Matchprop: click đối tượng đích';
                    return getSnapshot();
                }
                if (typeof saveState === 'function') saveState();
                applyStyleProps(tgt.type, tgt.data, state.matchSource.props);
                if (typeof setEditorSelection === 'function') {
                    setEditorSelection(tgt.type, tgt.data, { skipUi: true });
                }
                commitSave();
                state.message = 'Matchprop OK · chọn đích khác hoặc Esc';
                return getSnapshot();
            }
        }

        if (state.mode === MODE.MLINE) {
            state.mlinePoints.push(pt);
            state.message = 'MLine: ' + state.mlinePoints.length + ' điểm · Enter kết thúc';
            if (opts.doubleClick && state.mlinePoints.length >= 2) {
                if (typeof saveState === 'function') saveState();
                finishMline();
                commitSave();
            }
            return getSnapshot();
        }

        if (state.mode === MODE.TRIM) {
            var tgtTrim = findSegmentHit(pt.x, pt.y);
            if (!tgtTrim) {
                state.message = 'Click lên tường hoặc đoạn thẳng cần cắt bỏ một phần';
                return getSnapshot();
            }
            if (typeof saveState === 'function') saveState();
            var tr = applySimpleTrim(tgtTrim, pt);
            if (tr.ok) {
                state.message = tr.mode === 'break'
                    ? 'Đã cắt đôi đoạn (không có biên giao) — đã bỏ nửa gần chỗ click'
                    : (tr.mode === 'trim_split'
                        ? 'Đã bỏ đoạn giữa 2 biên · còn 2 nửa · click tiếp nếu cần'
                        : 'Đã bỏ phần click theo biên giao · click phần khác để cắt tiếp');
                commitSave();
                if (typeof showToast === 'function') {
                    showToast(tr.mode === 'break' ? 'Cắt đôi OK' : 'Cắt xén OK', 'success');
                }
            } else {
                state.message = 'Không cắt được đoạn này';
                if (typeof showToast === 'function') showToast(state.message, 'error');
            }
            return getSnapshot();
        }

        if (state.mode === MODE.EXTEND) {
            if (state.stage === 'cutting') {
                var cut = findSegmentHit(pt.x, pt.y);
                if (!cut) {
                    state.message = 'Không thấy tường/đoạn — Extend cần biên đích';
                    return getSnapshot();
                }
                state.cutting = cut;
                state.stage = 'target';
                state.message = 'B2: click đoạn ngắn cần KÉO DÀI tới biên đỏ';
                return getSnapshot();
            }
            if (state.stage === 'target') {
                var tgt = findSegmentHit(pt.x, pt.y);
                if (!tgt) {
                    state.message = 'Không thấy cạnh đích (chỉ tường/đoạn)';
                    return getSnapshot();
                }
                if (typeof saveState === 'function') saveState();
                if (applyTrimOrExtend(tgt, pt)) {
                    state.message = 'Đã kéo dài · chọn biên tiếp hoặc Esc';
                    commitSave();
                    if (typeof showToast === 'function') showToast('Kéo dài OK', 'success');
                } else {
                    state.message = 'Không kéo được: đoạn phải hướng tới biên (không song song / đã đủ dài)';
                    if (typeof showToast === 'function') showToast(state.message, 'error');
                }
                state.stage = 'cutting';
                state.cutting = null;
                return getSnapshot();
            }
        }

        if (state.mode === MODE.PEDIT && state.stage === 'pedit' && sel) {
            var pts = sel.data.points;
            if (!pts) return getSnapshot();
            var thr = 10 / (typeof zoom !== 'undefined' ? zoom : 1);
            var nearest = -1, best = thr;
            for (var i = 0; i < pts.length; i++) {
                var d = Math.hypot(pts[i].x - pt.x, pts[i].y - pt.y);
                if (d < best) { best = d; nearest = i; }
            }

            // Ctrl+click trên cạnh → thêm đỉnh (chiếu lên đoạn). KHÔNG dùng Shift (dễ nhầm kéo dài).
            if (opts.ctrlKey || opts.metaKey) {
                var insertAt = findEdgeInsertPoint(pts, pt, thr * 2.5);
                if (insertAt) {
                    if (typeof saveState === 'function') saveState();
                    pts.splice(insertAt.index + 1, 0, { x: insertAt.x, y: insertAt.y });
                    if (sel.type === 'room' && OT()) OT().updatePolygonBBox(sel.data);
                    commitSave();
                    state.message = 'PEdit: đã thêm đỉnh trên cạnh #' + (insertAt.index + 1);
                    if (typeof showToast === 'function') showToast('Đã thêm đỉnh (Ctrl+click)', 'success');
                } else if (typeof showToast === 'function') {
                    showToast('Ctrl+click gần giữa cạnh để thêm đỉnh', 'error');
                }
                return getSnapshot();
            }

            // Shift+click cũ: không còn thêm đỉnh — báo rõ để tránh kéo dài nhầm
            if (opts.shiftKey && nearest >= 0) {
                if (typeof showToast === 'function') {
                    showToast('Kéo đỉnh: chỉ click+kéo (không Shift). Thêm đỉnh: Ctrl+click trên cạnh', 'error');
                }
                state.peditVertex = nearest;
                state.message = 'PEdit: đang kéo đỉnh #' + (nearest + 1);
                return getSnapshot();
            }

            if (nearest >= 0) {
                state.peditVertex = nearest;
                state.message = 'PEdit: đang kéo đỉnh #' + (nearest + 1);
            } else if (typeof showToast === 'function') {
                showToast('Click đúng ô/đỉnh để kéo. Thêm đỉnh: Ctrl+click trên cạnh', 'error');
            }
            return getSnapshot();
        }

        if (state.mode === MODE.MIRROR) {
            if (state.stage === 'axis') {
                state.axisA = pt;
                state.stage = 'dest';
                state.message = 'Mirror: click điểm 2 của trục';
                return getSnapshot();
            }
            if (state.stage === 'dest' && state.axisA && sel) {
                if (typeof saveState === 'function') saveState();
                finishMirror(sel, state.axisA, pt);
                commitSave();
                state.stage = 'axis';
                state.axisA = null;
                state.message = 'Mirror OK · chọn trục mới hoặc Esc';
                return getSnapshot();
            }
        }

        // Move / Copy / Rotate / Scale / Array
        if (state.stage === 'base') {
            state.base = pt;
            state.stage = 'dest';
            state.message = state.mode === MODE.ARRAY
                ? 'Array: click điểm khoảng cách (vector lặp)'
                : 'Click điểm đích';
            return getSnapshot();
        }
        if (state.stage === 'dest' && state.base && sel) {
            if (typeof saveState === 'function') saveState();
            if (state.mode === MODE.ARRAY) {
                var n = applyArray(sel, state.base, pt);
                commitSave();
                state.message = 'Hàng loạt: đã thêm ' + n + ' bản (tổng ' + state.arrayCount + ')';
                if (typeof showToast === 'function') showToast(state.message, 'success');
            } else {
                applyTransform(sel, state.base, pt);
                commitSave();
                state.message = (state.mode || '').toUpperCase() + ' OK · chọn điểm gốc tiếp hoặc Esc';
            }
            state.stage = 'base';
            state.base = null;
            state.preview = null;
            return getSnapshot();
        }

        return getSnapshot();
    }

    function onPointerMove(world) {
        var pt = { x: world.x, y: world.y };
        if (state.stage === 'dest' && state.base) {
            state.preview = { from: state.base, to: pt };
        } else if (state.stage === 'axis' || (state.mode === MODE.MIRROR && state.stage === 'dest' && state.axisA)) {
            state.preview = { from: state.axisA || pt, to: pt };
        } else if (state.mode === MODE.MLINE && state.mlinePoints.length) {
            state.preview = {
                mline: state.mlinePoints.concat([pt]),
                thickness: state.mlineThickness
            };
        } else if ((state.mode === MODE.TRIM || state.mode === MODE.EXTEND)
            && state.stage === 'target') {
            var hover = findSegmentHit(pt.x, pt.y);
            var trimPrev = null;
            if (hover && state.mode === MODE.TRIM) {
                var geT = GE();
                var taT = hover.data.points[hover.segIndex];
                var tbT = hover.data.points[hover.segIndex + 1];
                if (geT && taT && tbT) {
                    var cutters = collectCutters(hover.data, hover.segIndex);
                    trimPrev = geT.trimAgainstCutters(taT, tbT, cutters, pt);
                    if (!trimPrev) {
                        var br = geT.breakSegmentAt(taT, tbT, pt);
                        if (br) {
                            var remL = Math.hypot(pt.x - br.left.a.x, pt.y - br.left.a.y) +
                                Math.hypot(pt.x - br.left.b.x, pt.y - br.left.b.y) <
                                Math.hypot(pt.x - br.right.a.x, pt.y - br.right.a.y) +
                                Math.hypot(pt.x - br.right.b.x, pt.y - br.right.b.y);
                            trimPrev = remL ? br.right : br.left;
                        }
                    }
                }
            } else if (hover && state.mode === MODE.EXTEND && state.cutting) {
                var ge = GE();
                var c = state.cutting;
                var ca = c.data.points[c.segIndex];
                var cb = c.data.points[c.segIndex + 1];
                var ta = hover.data.points[hover.segIndex];
                var tb = hover.data.points[hover.segIndex + 1];
                if (ge && ta && tb && ca && cb) {
                    trimPrev = ge.extendSegment(ta, tb, ca, cb);
                }
            }
            state.preview = { trimResult: trimPrev, hoverSeg: hover };
        } else if (state.mode === MODE.PEDIT && state.peditVertex >= 0) {
            var sel = getSelection();
            if (sel && sel.data.points && sel.data.points[state.peditVertex]) {
                sel.data.points[state.peditVertex].x = pt.x;
                sel.data.points[state.peditVertex].y = pt.y;
                if (sel.type === 'room' && OT()) OT().updatePolygonBBox(sel.data);
                state.preview = { pedit: true };
            }
        } else {
            state.preview = null;
        }
        return getSnapshot();
    }

    function onPointerUp() {
        if (state.mode === MODE.PEDIT && state.peditVertex >= 0) {
            if (typeof saveState === 'function') saveState();
            commitSave();
            state.peditVertex = -1;
            state.message = 'PEdit: đã cập nhật đỉnh';
        }
        return getSnapshot();
    }

    function onKeyDown(key, opts) {
        opts = opts || {};
        if (key === 'Enter' && state.mode === MODE.MLINE) {
            if (state.mlinePoints.length >= 2) {
                if (typeof saveState === 'function') saveState();
                finishMline();
                commitSave();
            }
            return getSnapshot();
        }
        if ((key === 'Delete' || key === 'Backspace') && state.mode === MODE.PEDIT) {
            var sel = getSelection();
            if (sel && sel.data.points && sel.data.points.length > 2 && state.peditVertex < 0) {
                // xóa đỉnh gần nhất đã chọn qua click trước — nếu không, bỏ qua
            }
            if (sel && sel.data.points && sel.data.points.length > 2) {
                var idx = state.peditVertex >= 0 ? state.peditVertex : sel.data.points.length - 1;
                if (typeof saveState === 'function') saveState();
                sel.data.points.splice(idx, 1);
                if (sel.type === 'room' && OT()) OT().updatePolygonBBox(sel.data);
                state.peditVertex = -1;
                commitSave();
                state.message = 'PEdit: đã xóa đỉnh';
            }
            return getSnapshot();
        }
        return getSnapshot();
    }

    function getSnapshot() {
        return {
            mode: state.mode,
            stage: state.stage,
            base: state.base,
            dest: state.dest,
            axisA: state.axisA,
            cutting: state.cutting,
            peditVertex: state.peditVertex,
            mlinePoints: state.mlinePoints.slice(),
            mlineThickness: state.mlineThickness,
            arrayCount: state.arrayCount,
            matchSource: state.matchSource,
            preview: state.preview,
            message: state.message
        };
    }

    function setMlineThickness(px) {
        state.mlineThickness = Math.max(2, Number(px) || 12);
    }

    function setArrayCount(n) {
        state.arrayCount = Math.max(2, Math.min(50, Number(n) || 4));
    }

    function isActive() {
        return !!state.mode && state.stage !== 'idle';
    }

    function isModifyTool(id) {
        return MODIFY_TOOL_IDS.indexOf(id) >= 0;
    }

    function getMode() {
        return state.mode;
    }

    return {
        MODE: MODE,
        MODIFY_TOOL_IDS: MODIFY_TOOL_IDS.slice(),
        activate: activate,
        deactivate: deactivate,
        cancel: cancel,
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onKeyDown: onKeyDown,
        getSnapshot: getSnapshot,
        setMlineThickness: setMlineThickness,
        setArrayCount: setArrayCount,
        isActive: isActive,
        isModifyTool: isModifyTool,
        getMode: getMode
    };
});
