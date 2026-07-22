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
        MLINE: 'mline', ARRAY: 'array', MATCHPROP: 'matchprop',
        FILLET: 'fillet', CHAMFER: 'chamfer', BREAK: 'break', DIVIDE: 'divide'
    };

    var MODIFY_TOOL_IDS = [
        'move', 'copy', 'rotate', 'scale', 'mirror',
        'trim', 'extend', 'pedit', 'mline', 'array', 'matchprop',
        'fillet', 'chamfer', 'break', 'divide'
    ];

    var state = {
        mode: null,
        stage: 'idle', // idle | base | dest | axis | cutting | target | pedit | mline | source | match | first | second
        base: null,
        dest: null,
        axisA: null,
        cutting: null, // { type, data, segIndex }
        peditVertex: -1,
        peditUndo: [],
        peditDragCaptured: false,
        mlinePoints: [],
        mlineThickness: 12,
        arrayCount: 4,
        arrayMode: 'linear', // linear | rect | polar
        arrayCols: 3,
        arrayRows: 2,
        arrayPolarAngle: 360,
        arrayRotateItems: true,
        matchSource: null, // { type, props }
        firstPick: null, // Fillet/Chamfer: cạnh đầu tiên { type, data, segIndex }
        filletRadius: 20,
        chamferDist: 20,
        divideCount: 4,
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
        state.peditUndo = [];
        state.peditDragCaptured = false;
        state.mlinePoints = [];
        state.matchSource = null;
        state.firstPick = null;
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

    function activate(mode, options) {
        options = options || {};
        state.mode = mode;
        reset();
        if (options.array) setArrayOptions(options.array);
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
        if (mode === MODE.BREAK) {
            state.stage = 'target';
            state.message = 'Cắt tại điểm (Break): click lên tường/đoạn tại vị trí muốn tách đôi.';
            return getSnapshot();
        }
        if (mode === MODE.DIVIDE) {
            if (typeof prompt === 'function') {
                var rawN = prompt('Chia đều — số phần (2..100):', String(state.divideCount));
                if (rawN != null && rawN !== '') {
                    var nn = parseInt(rawN, 10);
                    if (nn >= 2 && nn <= 100) state.divideCount = nn;
                }
            }
            state.stage = 'target';
            state.message = 'Chia đều ×' + state.divideCount + ': click lên tường/đoạn để đặt điểm mốc đều nhau.';
            return getSnapshot();
        }
        if (mode === MODE.FILLET) {
            if (typeof prompt === 'function') {
                var rawR = prompt('Bo góc (Fillet) — bán kính (px, 0 = góc nhọn):', String(state.filletRadius));
                if (rawR != null && rawR !== '') {
                    var rr = parseFloat(rawR);
                    if (!isNaN(rr) && rr >= 0) state.filletRadius = rr;
                }
            }
            state.stage = 'first';
            state.firstPick = null;
            state.message = 'Bo góc R=' + state.filletRadius + ': click cạnh thứ NHẤT (tường/đoạn).';
            return getSnapshot();
        }
        if (mode === MODE.CHAMFER) {
            if (typeof prompt === 'function') {
                var rawD = prompt('Vát góc (Chamfer) — khoảng vát mỗi cạnh (px):', String(state.chamferDist));
                if (rawD != null && rawD !== '') {
                    var dd = parseFloat(rawD);
                    if (!isNaN(dd) && dd >= 0) state.chamferDist = dd;
                }
            }
            state.stage = 'first';
            state.firstPick = null;
            state.message = 'Vát góc D=' + state.chamferDist + ': click cạnh thứ NHẤT (tường/đoạn).';
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
            state.peditUndo = [];
            state.message = 'PEdit: kéo đỉnh · C đóng · J nối · W rộng · F fit · S spline · U undo';
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
            if (!(options && options.skipPrompt)) {
                promptArrayOptions();
            }
            if (state.arrayMode === 'polar') {
                state.stage = 'center';
                state.message = 'Array Polar ×' + state.arrayCount + ' / ' + state.arrayPolarAngle +
                    '°: click tâm quay' + (state.arrayRotateItems ? ' (xoay theo)' : '');
            } else if (state.arrayMode === 'rect') {
                state.stage = 'base';
                state.message = 'Array Rect ' + state.arrayCols + '×' + state.arrayRows +
                    ': click gốc → click góc ô (ΔX=cột, ΔY=hàng)';
            } else {
                state.stage = 'base';
                state.message = 'Array Linear ×' + state.arrayCount +
                    ': click gốc → click hướng/khoảng cách (copy lặp đều)';
            }
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
        if (type === 'point' && typeof nextCadPointId !== 'undefined') return nextCadPointId++;
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
        else if (type === 'point' && typeof cadPoints !== 'undefined') cadPoints.push(data);
        else if (type === 'qr' && typeof qrs !== 'undefined') qrs.push(data);
        else if (type === 'node' && typeof pathNodes !== 'undefined') pathNodes.push(data);
    }

    function commitSave() {
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

    // ============================================================
    // BREAK / FILLET / CHAMFER
    // ============================================================

    /** Cắt đôi một đối tượng tại điểm click (giữ CẢ HAI nửa thành 2 đối tượng). */
    function applyBreakAt(targetHit, clickPt) {
        var ge = GE();
        if (!ge || !targetHit || !targetHit.data.points) return { ok: false };
        var pts = targetHit.data.points;
        var j = targetHit.segIndex;
        var ta = pts[j], tb = pts[j + 1];
        var br = ge.breakSegmentAt(ta, tb, clickPt);
        if (!br) return { ok: false };
        var mid = br.mid;

        if (pts.length === 2) {
            replaceSegmentPoints(targetHit, br.left.a, br.left.b);
            pushBrokenOtherHalf(targetHit, br.right.a, br.right.b);
            return { ok: true, mid: mid };
        }

        // Polyline: tách tại điểm cắt → 2 polyline
        var leftPts = pts.slice(0, j + 1).concat([{ x: mid.x, y: mid.y }]);
        var rightPts = [{ x: mid.x, y: mid.y }].concat(pts.slice(j + 1));
        var T = OT();
        if (T) {
            var copy = T.cloneObject(targetHit.type, targetHit.data, nextIdFor);
            copy.points = rightPts;
            if (targetHit.type === 'wall' && copy.thickness == null) copy.thickness = 4;
            pushClone(targetHit.type, copy);
        }
        targetHit.data.points = leftPts;
        if (targetHit.type === 'room' && T) T.updatePolygonBBox(targetHit.data);
        return { ok: true, mid: mid };
    }

    /** Chia đều một polyline/đoạn thành N phần → đặt (N-1) điểm mốc (pathNode). */
    function applyDivide(obj, count) {
        if (!obj || !obj.points || obj.points.length < 2) return 0;
        var n = Math.max(2, count | 0);
        var pts = obj.points;
        var segs = [], total = 0;
        for (var i = 0; i < pts.length - 1; i++) {
            var L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
            segs.push({ a: pts[i], b: pts[i + 1], L: L, acc: total });
            total += L;
        }
        if (total < 1e-6) return 0;
        var created = 0;
        for (var k = 1; k < n; k++) {
            var target = total * k / n;
            var seg = segs[segs.length - 1];
            for (var s = 0; s < segs.length; s++) {
                if (target <= segs[s].acc + segs[s].L || s === segs.length - 1) { seg = segs[s]; break; }
            }
            var t = seg.L > 1e-6 ? (target - seg.acc) / seg.L : 0;
            var x = seg.a.x + t * (seg.b.x - seg.a.x);
            var y = seg.a.y + t * (seg.b.y - seg.a.y);
            if (typeof pathNodes !== 'undefined') {
                pathNodes.push({
                    id: nextIdFor('node'),
                    x: x, y: y,
                    layerId: (typeof legacyGetActiveLayerId === 'function') ? legacyGetActiveLayerId() : 'default',
                    nodeType: 'normal',
                    neighbors: []
                });
                created++;
            }
        }
        return created;
    }

    function vlen(x, y) { return Math.hypot(x, y); }

    /**
     * Tính kết quả bo/vát góc giữa 2 cạnh — thuần túy (không đột biến dữ liệu).
     * @returns {{move1:{pt,to}, move2:{pt,to}, connector:[{a,b}], far1, far2}|null}
     */
    function computeCorner(hit1, hit2, mode) {
        var ge = GE();
        if (!ge || !hit1 || !hit2) return null;
        if (hit1.data === hit2.data && hit1.segIndex === hit2.segIndex) return null;
        var p1a = hit1.data.points[hit1.segIndex], p1b = hit1.data.points[hit1.segIndex + 1];
        var p2a = hit2.data.points[hit2.segIndex], p2b = hit2.data.points[hit2.segIndex + 1];
        if (!p1a || !p1b || !p2a || !p2b) return null;

        var I = ge.lineIntersection(p1a, p1b, p2a, p2b);
        if (!I) return null; // song song

        // Đầu mút gần giao (sẽ bị dời), đầu mút xa (giữ nguyên)
        var near1 = (Math.hypot(p1a.x - I.x, p1a.y - I.y) <= Math.hypot(p1b.x - I.x, p1b.y - I.y)) ? p1a : p1b;
        var far1 = (near1 === p1a) ? p1b : p1a;
        var near2 = (Math.hypot(p2a.x - I.x, p2a.y - I.y) <= Math.hypot(p2b.x - I.x, p2b.y - I.y)) ? p2a : p2b;
        var far2 = (near2 === p2a) ? p2b : p2a;

        // Hướng đơn vị từ giao HƯỚNG RA đầu xa (dọc mỗi cạnh)
        var d1x = far1.x - I.x, d1y = far1.y - I.y;
        var d2x = far2.x - I.x, d2y = far2.y - I.y;
        var l1 = vlen(d1x, d1y), l2 = vlen(d2x, d2y);
        if (l1 < 1e-6 || l2 < 1e-6) return null;
        var u1x = d1x / l1, u1y = d1y / l1;
        var u2x = d2x / l2, u2y = d2y / l2;

        if (mode === MODE.CHAMFER) {
            var D = Math.min(state.chamferDist, l1, l2);
            var c1 = { x: I.x + u1x * D, y: I.y + u1y * D };
            var c2 = { x: I.x + u2x * D, y: I.y + u2y * D };
            return {
                move1: { pt: near1, to: c1 }, move2: { pt: near2, to: c2 },
                connector: [{ a: c1, b: c2 }], far1: far1, far2: far2
            };
        }

        // FILLET
        var R = state.filletRadius;
        var cosT = u1x * u2x + u1y * u2y;
        cosT = Math.max(-1, Math.min(1, cosT));
        var theta = Math.acos(cosT);
        // R=0 hoặc gần thẳng hàng/trùng phương → nối thành góc nhọn tại giao
        if (R <= 0 || theta < 1e-3 || Math.abs(theta - Math.PI) < 1e-3) {
            return {
                move1: { pt: near1, to: { x: I.x, y: I.y } },
                move2: { pt: near2, to: { x: I.x, y: I.y } },
                connector: [], far1: far1, far2: far2
            };
        }
        var tanHalf = Math.tan(theta / 2);
        var trimLen = R / tanHalf;
        if (trimLen > l1 || trimLen > l2) {
            // Bán kính quá lớn so với cạnh → kẹp lại
            trimLen = Math.min(trimLen, l1, l2);
        }
        var t1 = { x: I.x + u1x * trimLen, y: I.y + u1y * trimLen };
        var t2 = { x: I.x + u2x * trimLen, y: I.y + u2y * trimLen };

        // Tâm cung: dọc phân giác, cách giao R/sin(θ/2)
        var bx = u1x + u2x, by = u1y + u2y;
        var bl = vlen(bx, by) || 1;
        var sinHalf = Math.sin(theta / 2) || 1e-6;
        var centerDist = R / sinHalf;
        var C = { x: I.x + (bx / bl) * centerDist, y: I.y + (by / bl) * centerDist };

        var a0 = Math.atan2(t1.y - C.y, t1.x - C.x);
        var a1 = Math.atan2(t2.y - C.y, t2.x - C.x);
        var da = a1 - a0;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        var N = Math.max(4, Math.ceil(Math.abs(da) / (Math.PI / 12)));
        var arc = [];
        var prev = t1;
        for (var i = 1; i <= N; i++) {
            var ang = a0 + da * (i / N);
            var pt = { x: C.x + R * Math.cos(ang), y: C.y + R * Math.sin(ang) };
            arc.push({ a: prev, b: pt });
            prev = pt;
        }
        return {
            move1: { pt: near1, to: t1 }, move2: { pt: near2, to: t2 },
            connector: arc, far1: far1, far2: far2
        };
    }

    /** Tạo đoạn nối (cung/chamfer) cùng kiểu với cạnh nguồn. */
    function createConnector(refType, refData, a, b) {
        if (refType === 'wall' && typeof createWallSegment === 'function') {
            return createWallSegment(a, b, {
                thickness: refData.thickness || (typeof defaultWallThickness !== 'undefined' ? defaultWallThickness : 12),
                is_outer: !!refData.is_outer
            });
        }
        if (typeof createLineSegment === 'function') {
            return createLineSegment(a, b, {
                color: refData.color,
                lineWeight: refData.lineWeight || refData.thickness
            });
        }
        // Fallback: đẩy trực tiếp vào lines[]
        if (typeof lines !== 'undefined') {
            var obj = { id: nextIdFor('line'), points: [a, b], color: refData.color || '#3b82f6' };
            lines.push(obj);
            return obj;
        }
        return null;
    }

    /** Áp dụng bo/vát góc: dời 2 đầu mút + tạo đoạn nối. */
    function applyCorner(hit1, hit2, mode) {
        var res = computeCorner(hit1, hit2, mode);
        if (!res) return { ok: false };

        var sharedVertex = (res.move1.pt === res.move2.pt);
        // Trường hợp bo/vát góc TRÊN CÙNG một polyline (2 cạnh kề chung đỉnh) → chèn đỉnh
        if (sharedVertex && hit1.data === hit2.data && hit1.data.points) {
            var pts = hit1.data.points;
            var idx1 = [hit1.segIndex, hit1.segIndex + 1];
            var idx2 = [hit2.segIndex, hit2.segIndex + 1];
            var shared = null;
            for (var s = 0; s < idx1.length; s++) {
                if (idx2.indexOf(idx1[s]) >= 0) { shared = idx1[s]; break; }
            }
            if (shared != null) {
                var beforeIsHit1 = (hit1.segIndex + 1 === shared);
                var seq = [res.move1.to];
                for (var c = 0; c < res.connector.length; c++) seq.push(res.connector[c].b);
                if (!beforeIsHit1) seq.reverse();
                // Dedupe điểm trùng nhau (fillet R=0)
                var clean = [];
                for (var q = 0; q < seq.length; q++) {
                    var last = clean[clean.length - 1];
                    if (!last || Math.hypot(last.x - seq[q].x, last.y - seq[q].y) > 0.5) clean.push(seq[q]);
                }
                Array.prototype.splice.apply(pts, [shared, 1].concat(clean));
                return { ok: true };
            }
        }

        // Trường hợp 2 đối tượng riêng → dời đầu mút + tạo đoạn nối rời
        res.move1.pt.x = res.move1.to.x; res.move1.pt.y = res.move1.to.y;
        res.move2.pt.x = res.move2.to.x; res.move2.pt.y = res.move2.to.y;
        for (var i = 0; i < res.connector.length; i++) {
            createConnector(hit1.type, hit1.data, res.connector[i].a, res.connector[i].b);
        }
        return { ok: true };
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

    /** Array chữ nhật: ô đơn vị (ΔX=cột, ΔY=hàng), bỏ ô (0,0). */
    function applyRectArray(sel, base, dest) {
        var T = OT();
        if (!T || !sel || !base || !dest) return 0;
        var colDx = dest.x - base.x;
        var rowDy = dest.y - base.y;
        var cols = Math.max(1, Math.min(30, state.arrayCols | 0));
        var rows = Math.max(1, Math.min(30, state.arrayRows | 0));
        var created = 0;
        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                if (r === 0 && c === 0) continue;
                var copy = T.cloneObject(sel.type, sel.data, nextIdFor);
                T.translateObject(sel.type, copy, colDx * c, rowDy * r);
                pushClone(sel.type, copy);
                created++;
            }
        }
        return created;
    }

    /** Array tròn quanh tâm — góc đều trên cung fillAngle°. */
    function applyPolarArray(sel, center) {
        var T = OT();
        if (!T || !sel || !center) return 0;
        var n = Math.max(2, Math.min(50, state.arrayCount | 0));
        var fillRad = (Math.max(1, Math.min(360, Number(state.arrayPolarAngle) || 360)) * Math.PI) / 180;
        var created = 0;
        for (var i = 1; i < n; i++) {
            var ang = (fillRad * i) / n;
            var copy = T.cloneObject(sel.type, sel.data, nextIdFor);
            var keepRot = (copy && copy.rotation != null) ? copy.rotation : null;
            T.rotateObject(sel.type, copy, center.x, center.y, ang);
            if (!state.arrayRotateItems && keepRot != null && copy.rotation != null) {
                copy.rotation = keepRot;
            }
            pushClone(sel.type, copy);
            created++;
        }
        return created;
    }

    function setArrayOptions(opts) {
        opts = opts || {};
        if (opts.mode === 'linear' || opts.mode === 'rect' || opts.mode === 'polar') {
            state.arrayMode = opts.mode;
        }
        if (opts.count != null) setArrayCount(opts.count);
        if (opts.cols != null) {
            state.arrayCols = Math.max(1, Math.min(30, parseInt(opts.cols, 10) || 1));
        }
        if (opts.rows != null) {
            state.arrayRows = Math.max(1, Math.min(30, parseInt(opts.rows, 10) || 1));
        }
        if (opts.polarAngle != null) {
            var a = parseFloat(opts.polarAngle);
            if (Number.isFinite(a)) state.arrayPolarAngle = Math.max(1, Math.min(360, a));
        }
        if (opts.rotateItems != null) state.arrayRotateItems = !!opts.rotateItems;
    }

    function promptArrayOptions() {
        if (typeof prompt !== 'function') return;
        var defM = state.arrayMode === 'rect' ? 'R' : (state.arrayMode === 'polar' ? 'P' : 'L');
        var rawM = prompt('Array: L=Thẳng / R=Chữ nhật / P=Tròn [' + defM + ']', defM);
        if (rawM != null && String(rawM).trim() !== '') {
            var m = String(rawM).trim().toUpperCase().charAt(0);
            if (m === 'R') state.arrayMode = 'rect';
            else if (m === 'P') state.arrayMode = 'polar';
            else state.arrayMode = 'linear';
        }
        if (state.arrayMode === 'rect') {
            var rawC = prompt('Array chữ nhật — số cột (1–30):', String(state.arrayCols));
            if (rawC != null && rawC !== '') {
                var cols = parseInt(rawC, 10);
                if (cols >= 1 && cols <= 30) state.arrayCols = cols;
            }
            var rawR = prompt('Array chữ nhật — số hàng (1–30):', String(state.arrayRows));
            if (rawR != null && rawR !== '') {
                var rows = parseInt(rawR, 10);
                if (rows >= 1 && rows <= 30) state.arrayRows = rows;
            }
        } else if (state.arrayMode === 'polar') {
            var rawN = prompt('Array tròn — tổng số bản (gồm gốc, 2–50):', String(state.arrayCount));
            if (rawN != null && rawN !== '') {
                var pn = parseInt(rawN, 10);
                if (pn >= 2 && pn <= 50) state.arrayCount = pn;
            }
            var rawA = prompt('Array tròn — góc phủ (° , 1–360):', String(state.arrayPolarAngle));
            if (rawA != null && rawA !== '') {
                var ang = parseFloat(rawA);
                if (Number.isFinite(ang) && ang >= 1 && ang <= 360) state.arrayPolarAngle = ang;
            }
            var rawRot = prompt('Xoay từng bản theo góc? (Y/N) [Y]', state.arrayRotateItems ? 'Y' : 'N');
            if (rawRot != null && String(rawRot).trim() !== '') {
                var ch = String(rawRot).trim().toUpperCase().charAt(0);
                state.arrayRotateItems = (ch !== 'N' && ch !== '0');
            }
        } else {
            var raw = prompt('Array thẳng — tổng số bản (gồm gốc, 2–50):', String(state.arrayCount));
            if (raw != null && raw !== '') {
                var n = parseInt(raw, 10);
                if (n >= 2 && n <= 50) state.arrayCount = n;
            }
        }
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
        if (typeof findCadPointAt === 'function') {
            var cp = findCadPointAt(wx, wy); if (cp) return { type: 'point', data: cp };
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

        if (state.mode === MODE.BREAK) {
            var tgtBr = findSegmentHit(pt.x, pt.y);
            if (!tgtBr) {
                state.message = 'Click lên tường hoặc đoạn thẳng để cắt tại điểm';
                return getSnapshot();
            }
            if (typeof saveState === 'function') saveState();
            var brRes = applyBreakAt(tgtBr, pt);
            if (brRes.ok) {
                commitSave();
                state.message = 'Đã cắt đôi tại điểm · click chỗ khác để cắt tiếp hoặc Esc';
                if (typeof showToast === 'function') showToast('Cắt tại điểm OK', 'success');
            } else {
                state.message = 'Không cắt được (điểm quá sát đầu mút)';
                if (typeof showToast === 'function') showToast(state.message, 'error');
            }
            return getSnapshot();
        }

        if (state.mode === MODE.DIVIDE) {
            var tgtDiv = findSegmentHit(pt.x, pt.y);
            if (!tgtDiv) {
                state.message = 'Click lên tường hoặc đoạn thẳng cần chia đều';
                return getSnapshot();
            }
            if (typeof saveState === 'function') saveState();
            var made = applyDivide(tgtDiv.data, state.divideCount);
            if (made > 0) {
                commitSave();
                state.message = 'Đã đặt ' + made + ' điểm mốc đều · click đối tượng khác hoặc Esc';
                if (typeof showToast === 'function') showToast('Chia đều: +' + made + ' điểm mốc', 'success');
            } else {
                state.message = 'Không chia được đối tượng này';
                if (typeof showToast === 'function') showToast(state.message, 'error');
            }
            return getSnapshot();
        }

        if (state.mode === MODE.FILLET || state.mode === MODE.CHAMFER) {
            var hit = findSegmentHit(pt.x, pt.y);
            var label = state.mode === MODE.FILLET ? 'Bo góc' : 'Vát góc';
            if (state.stage === 'first') {
                if (!hit) {
                    state.message = label + ': click đúng cạnh thứ nhất (tường/đoạn)';
                    return getSnapshot();
                }
                state.firstPick = hit;
                state.stage = 'second';
                state.message = label + ': click cạnh thứ HAI để nối góc';
                return getSnapshot();
            }
            if (state.stage === 'second' && state.firstPick) {
                if (!hit) {
                    state.message = label + ': click đúng cạnh thứ hai';
                    return getSnapshot();
                }
                if (typeof saveState === 'function') saveState();
                var cornerRes = applyCorner(state.firstPick, hit, state.mode);
                if (cornerRes.ok) {
                    commitSave();
                    state.message = label + ' OK · chọn cặp cạnh mới hoặc Esc';
                    if (typeof showToast === 'function') showToast(label + ' OK', 'success');
                } else {
                    state.message = label + ' không được: 2 cạnh song song hoặc quá ngắn';
                    if (typeof showToast === 'function') showToast(state.message, 'error');
                }
                state.stage = 'first';
                state.firstPick = null;
                state.preview = null;
                return getSnapshot();
            }
        }

        if (state.mode === MODE.PEDIT && state.stage === 'pedit-join') {
            var selJoin = getSelection();
            if (!selJoin || (selJoin.type !== 'wall' && selJoin.type !== 'line')) {
                state.stage = 'pedit';
                state.message = 'PEdit Join: cần chọn tường/đoạn';
                return getSnapshot();
            }
            var hit = pickObjectAt(pt.x, pt.y);
            if (!hit || hit.data === selJoin.data) {
                state.message = 'PEdit Join: click đối tượng thứ 2 (cùng loại)';
                return getSnapshot();
            }
            if (hit.type !== selJoin.type) {
                state.message = 'PEdit Join: chỉ nối cùng loại';
                if (typeof showToast === 'function') showToast(state.message, 'error');
                return getSnapshot();
            }
            if (selJoin.data.type === 'arc' || hit.data.type === 'arc') {
                if (typeof showToast === 'function') showToast('Cung tròn không hỗ trợ nối trong PEdit', 'error');
                return getSnapshot();
            }
            var geJ = GE();
            if (!geJ || !geJ.joinPolylines) return getSnapshot();
            var tolJ = 8 / (typeof zoom !== 'undefined' ? zoom : 1);
            var joined = geJ.joinPolylines(selJoin.data.points, hit.data.points, tolJ);
            if (!joined || joined.points.length < 2) {
                if (typeof showToast === 'function') showToast('Không nối được 2 đối tượng này', 'error');
                return getSnapshot();
            }
            if (typeof saveState === 'function') saveState();
            pushPeditUndo(selJoin, hit);
            clearPeditCurveData(selJoin);
            selJoin.data.points = joined.points;
            if (selJoin.data.type === 'arc') selJoin.data.type = 'segment';
            // Xóa đối tượng 2
            if (hit.type === 'wall' && typeof walls !== 'undefined') {
                walls = walls.filter(function (w) { return w.id !== hit.data.id; });
            } else if (hit.type === 'line' && typeof lines !== 'undefined') {
                lines = lines.filter(function (ln) { return ln.id !== hit.data.id; });
            }
            commitSave();
            state.stage = 'pedit';
            state.message = 'PEdit Join OK · C/J/W tiếp hoặc Esc';
            if (typeof showToast === 'function') showToast('PEdit: đã nối', 'success');
            return getSnapshot();
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
                    pushPeditUndo(sel);
                    clearPeditCurveData(sel);
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
                if (typeof saveState === 'function') saveState();
                pushPeditUndo(sel);
                clearPeditCurveData(sel);
                state.peditDragCaptured = true;
                state.peditVertex = nearest;
                state.message = 'PEdit: đang kéo đỉnh #' + (nearest + 1);
                return getSnapshot();
            }

            if (nearest >= 0) {
                if (typeof saveState === 'function') saveState();
                pushPeditUndo(sel);
                clearPeditCurveData(sel);
                state.peditDragCaptured = true;
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
        if (state.mode === MODE.ARRAY && state.arrayMode === 'polar' && state.stage === 'center' && sel) {
            if (typeof saveState === 'function') saveState();
            var pn = applyPolarArray(sel, pt);
            commitSave();
            state.message = 'Array Polar: đã thêm ' + pn + ' bản (tổng ' + state.arrayCount + ')';
            if (typeof showToast === 'function') showToast(state.message, 'success');
            state.stage = 'center';
            state.preview = null;
            return getSnapshot();
        }
        if (state.stage === 'base') {
            state.base = pt;
            state.stage = 'dest';
            state.message = state.mode === MODE.ARRAY
                ? (state.arrayMode === 'rect'
                    ? 'Array Rect: click góc ô đơn vị (ΔX=cột, ΔY=hàng)'
                    : 'Array: click điểm khoảng cách (vector lặp)')
                : 'Click điểm đích';
            return getSnapshot();
        }
        if (state.stage === 'dest' && state.base && sel) {
            if (typeof saveState === 'function') saveState();
            if (state.mode === MODE.ARRAY) {
                var nAdded = state.arrayMode === 'rect'
                    ? applyRectArray(sel, state.base, pt)
                    : applyArray(sel, state.base, pt);
                commitSave();
                state.message = state.arrayMode === 'rect'
                    ? ('Array Rect: đã thêm ' + nAdded + ' bản (' + state.arrayCols + '×' + state.arrayRows + ')')
                    : ('Array Linear: đã thêm ' + nAdded + ' bản (tổng ' + state.arrayCount + ')');
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
        } else if (state.mode === MODE.BREAK) {
            var hb = findSegmentHit(pt.x, pt.y);
            var geB = GE();
            var bp = null;
            if (hb && geB) {
                var ba = hb.data.points[hb.segIndex], bb = hb.data.points[hb.segIndex + 1];
                var brk = geB.breakSegmentAt(ba, bb, pt);
                if (brk) bp = brk.mid;
            }
            state.preview = { breakSeg: hb, breakPoint: bp };
        } else if (state.mode === MODE.FILLET || state.mode === MODE.CHAMFER) {
            var hc = findSegmentHit(pt.x, pt.y);
            var hi = [];
            function segAB(h) {
                return { a: h.data.points[h.segIndex], b: h.data.points[h.segIndex + 1] };
            }
            if (state.firstPick) hi.push(segAB(state.firstPick));
            if (hc) hi.push(segAB(hc));
            var cornerPrev = null;
            if (state.stage === 'second' && state.firstPick && hc) {
                cornerPrev = computeCorner(state.firstPick, hc, state.mode);
            }
            state.preview = { pickHighlight: hi, cornerResult: cornerPrev };
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
            commitSave();
            state.peditVertex = -1;
            state.peditDragCaptured = false;
            state.message = 'PEdit: đã cập nhật đỉnh';
        }
        return getSnapshot();
    }

    function cloneData(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function clearPeditCurveData(sel) {
        if (!sel || !sel.data) return;
        delete sel.data.peditControlPoints;
        delete sel.data.peditCurve;
    }

    function pushPeditUndo(sel, extra) {
        if (!sel || !sel.data) return;
        state.peditUndo.push({
            type: sel.type,
            data: cloneData(sel.data),
            extra: extra ? { type: extra.type, data: cloneData(extra.data) } : null
        });
        if (state.peditUndo.length > 30) state.peditUndo.shift();
    }

    function peditUndoLast(sel) {
        var snapshot = state.peditUndo.pop();
        if (!snapshot || !sel || !sel.data) {
            state.message = 'PEdit Undo: không còn thao tác để hoàn tác';
            return false;
        }
        Object.keys(sel.data).forEach(function (key) { delete sel.data[key]; });
        Object.assign(sel.data, cloneData(snapshot.data));
        if (snapshot.extra) {
            var collection = snapshot.extra.type === 'wall'
                ? (typeof walls !== 'undefined' ? walls : null)
                : (snapshot.extra.type === 'line' && typeof lines !== 'undefined' ? lines : null);
            if (collection && !collection.some(function (item) {
                return String(item.id) === String(snapshot.extra.data.id);
            })) {
                collection.push(cloneData(snapshot.extra.data));
            }
        }
        if (sel.type === 'room' && OT()) OT().updatePolygonBBox(sel.data);
        commitSave();
        state.message = 'PEdit Undo: đã hoàn tác thao tác gần nhất';
        if (typeof showToast === 'function') showToast(state.message, 'success');
        return true;
    }

    function peditCurve(sel, mode) {
        if (!sel || !sel.data || !Array.isArray(sel.data.points)) return false;
        var ge = GE();
        var fn = mode === 'fit' ? ge && ge.fitPolyline : ge && ge.splinePolyline;
        if (!fn) return false;
        var isClosed = !!sel.data.closed;
        var controlPoints = Array.isArray(sel.data.peditControlPoints)
            ? sel.data.peditControlPoints
            : cloneData(sel.data.points);
        var next = mode === 'fit'
            ? fn(controlPoints, isClosed)
            : fn(controlPoints, isClosed, 8);
        if (!next || next.length < 3) {
            state.message = 'PEdit ' + mode + ': cần ít nhất 3 đỉnh hợp lệ';
            return false;
        }
        if (typeof saveState === 'function') saveState();
        pushPeditUndo(sel);
        sel.data.peditControlPoints = cloneData(controlPoints);
        sel.data.points = next;
        sel.data.peditCurve = mode;
        if (sel.type === 'room' && OT()) OT().updatePolygonBBox(sel.data);
        commitSave();
        state.message = 'PEdit ' + (mode === 'fit' ? 'Fit' : 'Spline') + ': đã làm mượt';
        if (typeof showToast === 'function') showToast(state.message, 'success');
        return true;
    }

    function peditClose(sel) {
        if (!sel || !sel.data || !sel.data.points) return false;
        if (sel.type === 'room') {
            // Đa giác phòng đã đóng
            state.message = 'PEdit: đa giác phòng đã đóng sẵn';
            return false;
        }
        var ge = GE();
        if (!ge || !ge.closePolyline) return false;
        var res = ge.closePolyline(sel.data.points, 1e-3);
        if (!res) {
            state.message = 'PEdit Close: cần ≥3 đỉnh';
            return false;
        }
        if (typeof saveState === 'function') saveState();
        pushPeditUndo(sel);
        clearPeditCurveData(sel);
        sel.data.points = res.points;
        sel.data.closed = true;
        commitSave();
        state.message = res.alreadyClosed
            ? 'PEdit Close: đã khép (snap đuôi→đầu)'
            : 'PEdit Close: đã đóng polyline';
        if (typeof showToast === 'function') showToast(state.message, 'success');
        return true;
    }

    function peditWidth(sel) {
        if (!sel || !sel.data) return false;
        if (sel.type !== 'wall' && sel.type !== 'line') {
            state.message = 'PEdit Width: chỉ tường / đoạn';
            return false;
        }
        var cur = sel.type === 'wall'
            ? (sel.data.thickness != null ? sel.data.thickness : 4)
            : (sel.data.lineWeight != null ? sel.data.lineWeight : 2);
        var raw = null;
        var promptFn = (typeof globalThis !== 'undefined' && typeof globalThis.prompt === 'function')
            ? globalThis.prompt
            : (typeof prompt === 'function' ? prompt : null);
        if (promptFn) {
            raw = promptFn('PEdit Width — độ dày (px):', String(cur));
        }
        if (raw == null || String(raw).trim() === '') return false;
        var n = parseFloat(raw);
        if (!Number.isFinite(n) || n <= 0) {
            if (typeof showToast === 'function') showToast('Độ dày không hợp lệ', 'error');
            return false;
        }
        if (typeof saveState === 'function') saveState();
        pushPeditUndo(sel);
        if (sel.type === 'wall') {
            sel.data.thickness = Math.max(1, Math.min(80, n));
        } else {
            sel.data.lineWeight = (typeof clampLineWeight === 'function')
                ? clampLineWeight(n)
                : Math.max(0.5, Math.min(20, n));
        }
        commitSave();
        state.message = 'PEdit Width = ' + (sel.type === 'wall' ? sel.data.thickness : sel.data.lineWeight);
        if (typeof showToast === 'function') showToast(state.message, 'success');
        return true;
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
        if (state.mode === MODE.PEDIT && state.stage === 'pedit') {
            var selP = getSelection();
            var k = String(key || '').toLowerCase();
            if (k === 'c') {
                peditClose(selP);
                return getSnapshot();
            }
            if (k === 'j') {
                if (!selP || (selP.type !== 'wall' && selP.type !== 'line')) {
                    state.message = 'PEdit Join: chọn tường/đoạn trước';
                    return getSnapshot();
                }
                state.stage = 'pedit-join';
                state.message = 'PEdit Join: click đối tượng thứ 2 (cùng loại) để nối';
                if (typeof showToast === 'function') showToast(state.message, 'info');
                return getSnapshot();
            }
            if (k === 'w') {
                peditWidth(selP);
                return getSnapshot();
            }
            if (k === 'f') {
                peditCurve(selP, 'fit');
                return getSnapshot();
            }
            if (k === 's') {
                peditCurve(selP, 'spline');
                return getSnapshot();
            }
            if (k === 'u') {
                peditUndoLast(selP);
                return getSnapshot();
            }
        }
        if (state.mode === MODE.PEDIT && state.stage === 'pedit-join' &&
            (key === 'Escape' || key === 'Esc')) {
            state.stage = 'pedit';
            state.message = 'PEdit: đã hủy Join · C/J/W tiếp';
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
                pushPeditUndo(sel);
                clearPeditCurveData(sel);
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
            arrayMode: state.arrayMode,
            arrayCols: state.arrayCols,
            arrayRows: state.arrayRows,
            arrayPolarAngle: state.arrayPolarAngle,
            arrayRotateItems: state.arrayRotateItems,
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
        setArrayOptions: setArrayOptions,
        isActive: isActive,
        isModifyTool: isModifyTool,
        getMode: getMode
    };
});
