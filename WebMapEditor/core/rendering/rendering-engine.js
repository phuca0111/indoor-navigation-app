// ============================================================
// RENDERING-ENGINE.JS — Facade vẽ nền + lưới (Phase 0 skeleton)
// Object/room render vẫn ở canvas.js — migrate dần
// ============================================================
(function (root) {
    'use strict';

    function getBackgroundState() {
        return {
            image: root.bgImage || null,
            opacity: root.bgOpacity != null ? root.bgOpacity : 0.5,
            x: root.bgX || 0,
            y: root.bgY || 0,
            scale: root.bgScale != null ? root.bgScale : 1,
            rotation: root.bgRotation || 0
        };
    }

    function isGridVisible() {
        var gc = typeof document !== 'undefined' ? document.getElementById('gridCheck') : null;
        if (!gc) return false;
        return !!gc.checked;
    }

    var RenderingEngine = {
        renderCanvasClear: function (ctx, viewport) {
            if (!root.EditorCore || !root.EditorCore.BackgroundRenderer) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, viewport.width, viewport.height);
                return;
            }
            root.EditorCore.BackgroundRenderer.renderCanvasClear(ctx, viewport.width, viewport.height);
        },

        renderBackground: function (ctx, viewport, options) {
            if (!root.EditorCore || !root.EditorCore.BackgroundRenderer) return;
            var bg = getBackgroundState();
            if (!bg.image) return;
            root.EditorCore.BackgroundRenderer.renderBackgroundImage(ctx, viewport, bg, options || {});
        },

        renderGrid: function (ctx, viewport, gridSize) {
            if (!root.EditorCore || !root.EditorCore.GridRenderer) return;
            root.EditorCore.GridRenderer.renderGrid(ctx, viewport, gridSize, {
                visible: isGridVisible()
            });
        },

        renderRoom: function (ctx, viewport, room, isSelected, hooks) {
            if (!root.EditorCore || !root.EditorCore.RoomRenderer) return false;
            root.EditorCore.RoomRenderer.renderRoom(ctx, viewport, room, isSelected, hooks);
            return true;
        },

        renderWall: function (ctx, viewport, wall, isSelected) {
            if (!root.EditorCore || !root.EditorCore.WallRenderer) return false;
            root.EditorCore.WallRenderer.renderWall(ctx, viewport, wall, isSelected);
            return true;
        },

        renderWallPreview: function (ctx, viewport, start, end) {
            if (!root.EditorCore || !root.EditorCore.WallRenderer) return false;
            root.EditorCore.WallRenderer.renderWallPreview(ctx, viewport, start, end);
            return true;
        },

        renderDoor: function (ctx, viewport, door, isSelected, hooks) {
            if (!root.EditorCore || !root.EditorCore.DoorRenderer) return false;
            root.EditorCore.DoorRenderer.renderDoor(ctx, viewport, door, isSelected, hooks);
            return true;
        },

        renderPathEdges: function (ctx, viewport, pathEdges, findNodeById) {
            if (!root.EditorCore || !root.EditorCore.PathRenderer) return false;
            root.EditorCore.PathRenderer.renderPathEdges(ctx, viewport, pathEdges, findNodeById);
            return true;
        },

        renderPathNode: function (ctx, viewport, node, isSelected, options) {
            if (!root.EditorCore || !root.EditorCore.PathRenderer) return false;
            root.EditorCore.PathRenderer.renderPathNode(ctx, viewport, node, isSelected, options);
            return true;
        },

        renderPoi: function (ctx, viewport, poi, isSelected, hooks) {
            if (!root.EditorCore || !root.EditorCore.PoiRenderer) return false;
            root.EditorCore.PoiRenderer.renderPoi(ctx, viewport, poi, isSelected, hooks);
            return true;
        },

        renderQr: function (ctx, viewport, qr, isSelected, options) {
            if (!root.EditorCore || !root.EditorCore.QrRenderer) return false;
            root.EditorCore.QrRenderer.renderQr(ctx, viewport, qr, isSelected, options);
            return true;
        }
    };

    root.EditorCore = root.EditorCore || {};
    root.EditorCore.RenderingEngine = RenderingEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
