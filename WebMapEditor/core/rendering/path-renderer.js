// ============================================================
// PATH-RENDERER.JS — Vẽ đường đi: edges + nodes (Phase 0 bước 4)
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.PathRenderer = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} viewport — { zoom }
   * @param {Array} pathEdges — [{ from, to }]
   * @param {function} findNodeById — (id) => node | null
   */
    function renderPathEdges(ctx, viewport, pathEdges, findNodeById) {
        if (!pathEdges || !pathEdges.length || typeof findNodeById !== 'function') return;

        var zoom = viewport.zoom || 1;

        ctx.strokeStyle = 'rgba(0, 210, 255, 0.3)';
        ctx.lineWidth = 8 / zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (var i = 0; i < pathEdges.length; i++) {
            var edge = pathEdges[i];
            var nodeA = findNodeById(edge.from);
            var nodeB = findNodeById(edge.to);
            if (nodeA && nodeB) {
                ctx.beginPath();
                ctx.moveTo(nodeA.x, nodeA.y);
                ctx.lineTo(nodeB.x, nodeB.y);
                ctx.stroke();
            }
        }

        ctx.strokeStyle = '#00d2ff';
        ctx.lineWidth = 4 / zoom;
        ctx.setLineDash([]);

        for (var j = 0; j < pathEdges.length; j++) {
            var e = pathEdges[j];
            var a = findNodeById(e.from);
            var b = findNodeById(e.to);
            if (a && b) {
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }
    }

  /**
   * @param {object} [options] — { nodeRadius, isStarting }
   */
    function renderPathNode(ctx, viewport, node, isSelected, options) {
        var zoom = viewport.zoom || 1;
        var nodeRadius = (options && options.nodeRadius != null) ? options.nodeRadius : 8;
        var isStarting = !!(options && options.isStarting);

        var color = '#3498db';
        var label = node.id;

        if (node.nodeType === 'elevator') {
            color = '#2ecc71';
            label = 'E';
        } else if (node.nodeType === 'stairs') {
            color = '#9b59b6';
            label = 'S';
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#f39c12' : (isStarting ? '#e67e22' : color);
        ctx.fill();
        ctx.strokeStyle = isStarting ? '#ffffff' : (isSelected ? '#e74c3c' : '#2980b9');
        ctx.lineWidth = (isSelected || isStarting) ? 3 / zoom : 1.5 / zoom;
        ctx.stroke();

        var fontSize = Math.max(10, 12 / zoom);
        ctx.font = 'bold ' + fontSize + 'px Arial';
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2 / zoom;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(String(label), node.x, node.y);
        ctx.fillText(String(label), node.x, node.y);
    }

    return {
        renderPathEdges: renderPathEdges,
        renderPathNode: renderPathNode
    };
});
