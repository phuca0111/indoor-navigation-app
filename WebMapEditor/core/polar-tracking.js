// ============================================================
// POLAR-TRACKING.JS — Hút góc chuẩn quanh điểm neo (Phase 1)
// Giống AutoCAD Polar Tracking: hướng con trỏ gần 0°/45°/90°…
// (± toleranceDeg) thì chiếu điểm lên tia góc đó.
// Ưu tiên: OSNAP endpoint/midpoint > polar > grid (xử lý ở tool).
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PolarTracking = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var settings = {
        enabled: true,
        incrementDeg: 45,   // góc bội số: 0, 45, 90, 135, …
        toleranceDeg: 6,    // lệch tối đa để kích hoạt hút
        minDistPx: 8        // quá gần anchor thì bỏ qua (tránh giật)
    };

    function normalizeDeg(deg) {
        var d = deg % 360;
        if (d < 0) d += 360;
        return d;
    }

    /**
     * @param {{x:number,y:number}} anchor — điểm neo (đỉnh trước)
     * @param {{x:number,y:number}} point — điểm con trỏ (world)
     * @param {object} [opts] — override settings
     * @returns {{x:number,y:number,active:boolean,angleDeg?:number}}
     */
    function resolvePolarPoint(anchor, point, opts) {
        opts = opts || {};
        var enabled = opts.enabled !== undefined ? !!opts.enabled : settings.enabled;
        var inactive = { x: point.x, y: point.y, active: false };
        if (!enabled || !anchor || point == null) return inactive;

        var dx = point.x - anchor.x;
        var dy = point.y - anchor.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var minDist = opts.minDistPx != null ? opts.minDistPx : settings.minDistPx;
        if (dist < minDist) return inactive;

        var incDeg = opts.incrementDeg != null ? opts.incrementDeg : settings.incrementDeg;
        var tolDeg = opts.toleranceDeg != null ? opts.toleranceDeg : settings.toleranceDeg;
        if (!(incDeg > 0)) return inactive;

        var angDeg = Math.atan2(dy, dx) * 180 / Math.PI;
        var snappedDeg = Math.round(angDeg / incDeg) * incDeg;
        if (Math.abs(angDeg - snappedDeg) > tolDeg) return inactive;

        var rad = snappedDeg * Math.PI / 180;
        return {
            x: anchor.x + Math.cos(rad) * dist,
            y: anchor.y + Math.sin(rad) * dist,
            active: true,
            angleDeg: normalizeDeg(snappedDeg)
        };
    }

    /**
     * Áp polar lên kết quả snap của tool.
     * Không đè OSNAP endpoint/midpoint; opts.polar === false thì bỏ qua (Shift).
     */
    function applyToSnapped(anchor, snapped, snapOpts) {
        if (!anchor || !snapped) return snapped;
        if (snapOpts && snapOpts.polar === false) return snapped;
        // Không đè OSNAP object (endpoint / midpoint / intersection / perpendicular)
        if (snapped.kind === 'endpoint' || snapped.kind === 'midpoint' ||
            snapped.kind === 'intersection' || snapped.kind === 'perpendicular') {
            return snapped;
        }

        var r = resolvePolarPoint(anchor, snapped);
        if (!r.active) return snapped;
        return {
            x: r.x,
            y: r.y,
            kind: 'polar',
            source: 'polar',
            angleDeg: r.angleDeg
        };
    }

    function configure(partial) {
        if (partial) {
            Object.keys(partial).forEach(function (k) {
                if (Object.prototype.hasOwnProperty.call(settings, k)) {
                    settings[k] = partial[k];
                }
            });
        }
        return getSettings();
    }

    function setEnabled(enabled) {
        settings.enabled = !!enabled;
        return settings.enabled;
    }

    function getSettings() {
        return {
            enabled: settings.enabled,
            incrementDeg: settings.incrementDeg,
            toleranceDeg: settings.toleranceDeg,
            minDistPx: settings.minDistPx
        };
    }

    return {
        resolvePolarPoint: resolvePolarPoint,
        applyToSnapped: applyToSnapped,
        configure: configure,
        setEnabled: setEnabled,
        getSettings: getSettings
    };
});
