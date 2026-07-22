const crypto = require('crypto');
const { buildEditorRoundTripSnapshot } = require('../services/mapContract');

// WHY: Không lưu background_image — giữ ảnh nền hiện tại khi rollback
function buildMapSnapshot(mapData) {
    if (!mapData || typeof mapData !== 'object') return null;
    return buildEditorRoundTripSnapshot(mapData);
}

function summarizeMapForAudit(mapData, version = 0) {
    const snapshot = buildMapSnapshot(mapData) || {};
    const serialized = JSON.stringify(snapshot);
    return {
        version: Number(version) || 0,
        rooms_count: Array.isArray(snapshot.rooms) ? snapshot.rooms.length : 0,
        nodes_count: Array.isArray(snapshot.nodes) ? snapshot.nodes.length : 0,
        edges_count: Array.isArray(snapshot.edges) ? snapshot.edges.length : 0,
        walls_count: Array.isArray(snapshot.walls) ? snapshot.walls.length : 0,
        qr_count: Array.isArray(snapshot.qr_anchors) ? snapshot.qr_anchors.length : 0,
        snapshot_sha256: crypto.createHash('sha256').update(serialized).digest('hex')
    };
}

module.exports = { buildMapSnapshot, summarizeMapForAudit };
