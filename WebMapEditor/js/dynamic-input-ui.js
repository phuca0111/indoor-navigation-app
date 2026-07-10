// ============================================================
// DYNAMIC-INPUT-UI.JS — Thanh nhập chiều dài/góc (status bar)
// ============================================================
(function () {
    'use strict';

    var wrap = null;
    var input = null;
    var hint = null;

    /** Snap chính xác theo số đã gõ — không kéo lại OSNAP/polar. */
    var EXACT_SNAP_OPTS = { objectSnap: false, gridSnap: false, polar: false };

    function getDI() {
        return (typeof EditorCore !== 'undefined' && EditorCore.DynamicInput)
            ? EditorCore.DynamicInput
            : null;
    }

    function getDrawContext() {
        if (typeof currentTool === 'undefined') return null;

        if (currentTool === 'wall' && typeof EditorCore !== 'undefined' && EditorCore.PolylineTool
            && EditorCore.PolylineTool.getState() === 'drawing') {
            var pts = EditorCore.PolylineTool.getPoints();
            if (!pts.length) return null;
            var previewW = EditorCore.PolylineTool.getPreview();
            var refW = previewW || (typeof window !== 'undefined' && window.lastMouseWorld ? window.lastMouseWorld : null);
            return {
                tool: 'wall',
                anchor: { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y },
                reference: refW
            };
        }

        if (currentTool === 'line' && typeof EditorCore !== 'undefined' && EditorCore.LineTool
            && EditorCore.LineTool.getState() === 'drawing') {
            var sp = EditorCore.LineTool.getStartPoint();
            if (!sp) return null;
            var previewL = EditorCore.LineTool.getPreview();
            var refL = previewL || (typeof window !== 'undefined' && window.lastMouseWorld ? window.lastMouseWorld : null);
            return { tool: 'line', anchor: { x: sp.x, y: sp.y }, reference: refL };
        }

        return null;
    }

    function isActive() {
        return !!getDrawContext();
    }

    function updateVisibility() {
        if (!wrap) return;
        var ctx = getDrawContext();
        if (ctx) {
            wrap.style.display = 'flex';
            if (input && document.activeElement !== input) {
                input.placeholder = buildPlaceholder(ctx);
            }
            updateHint(ctx);
        } else {
            wrap.style.display = 'none';
            if (input) input.value = '';
            if (hint) hint.textContent = '';
        }
    }

    function buildPlaceholder(ctx) {
        var DI = getDI();
        if (!DI || !ctx.reference) return '100 | @100<45 | @50,30';
        var dist = DI.distanceBetween(ctx.anchor, ctx.reference);
        var ang = DI.angleDegBetween(ctx.anchor, ctx.reference);
        var parts = [];
        if (dist > 0.5) parts.push(Math.round(dist) + 'px');
        if (ang != null) parts.push('<' + Math.round(ang) + '°');
        if (parts.length) return parts.join(' · ') + ' | 100 | @100<45';
        return '100 | @100<45 | @50,30';
    }

    function updateHint(ctx) {
        if (!hint || !ctx || !ctx.reference) {
            if (hint) hint.textContent = '';
            return;
        }
        var DI = getDI();
        if (!DI) return;
        var dist = DI.distanceBetween(ctx.anchor, ctx.reference);
        var ang = DI.angleDegBetween(ctx.anchor, ctx.reference);
        var bits = [];
        if (dist > 0.5) bits.push('L≈' + Math.round(dist) + 'px');
        if (ang != null) bits.push('∠' + Math.round(ang) + '°');
        hint.textContent = bits.join(' ');
    }

    function submit() {
        if (!input) return false;
        var text = input.value;
        if (!text || !text.trim()) return false;

        var ctx = getDrawContext();
        var DI = getDI();
        if (!ctx || !DI) return false;

        var result = DI.resolvePoint(text, ctx.anchor, ctx.reference);
        if (!result.ok) {
            if (hint) hint.textContent = 'Lỗi: ' + (result.error || 'không hợp lệ');
            return false;
        }

        var world = { x: result.x, y: result.y };
        if (ctx.tool === 'wall' && typeof handleWallVertex === 'function') {
            handleWallVertex(world, EXACT_SNAP_OPTS);
        } else if (ctx.tool === 'line' && typeof handleLineVertex === 'function') {
            handleLineVertex(world, EXACT_SNAP_OPTS);
        } else {
            return false;
        }

        input.value = '';
        if (typeof draw === 'function') draw();
        updateVisibility();
        return true;
    }

    function hasPendingText() {
        return input && input.value && input.value.trim().length > 0;
    }

    function init() {
        wrap = document.getElementById('dynamicInputWrap');
        input = document.getElementById('dynamicInput');
        hint = document.getElementById('dynamicInputHint');
        if (!wrap || !input) return;

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                submit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                input.value = '';
                input.blur();
            }
        });

        input.addEventListener('input', function () {
            var ctx = getDrawContext();
            if (ctx && hint && (!input.value || !input.value.trim())) {
                updateHint(ctx);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.DynamicInputUI = {
        isActive: isActive,
        updateVisibility: updateVisibility,
        submit: submit,
        hasPendingText: hasPendingText,
        getDrawContext: getDrawContext
    };
})();
