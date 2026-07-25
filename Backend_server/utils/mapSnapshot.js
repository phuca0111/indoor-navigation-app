const crypto = require('crypto');
const { buildEditorRoundTripSnapshot } = require('../services/mapContract');

// WHY: Không lưu background_image — giữ ảnh nền hiện tại khi rollback
function buildMapSnapshot(mapData) {
    if (!mapData || typeof mapData !== 'object') return null;
    return buildEditorRoundTripSnapshot(mapData);
}

/** Đếm phần tử map/draft mà không round-trip snapshot (GET building / Floor Manager). */
function countMapElements(mapData) {
    const src = mapData && typeof mapData === 'object' ? mapData : {};
    return {
        rooms_count: Array.isArray(src.rooms) ? src.rooms.length : 0,
        pois_count: Array.isArray(src.pois) ? src.pois.length : 0,
        nodes_count: Array.isArray(src.nodes) ? src.nodes.length : 0,
        edges_count: Array.isArray(src.edges) ? src.edges.length : 0,
        walls_count: Array.isArray(src.walls) ? src.walls.length : 0,
        qr_count: Array.isArray(src.qr_anchors) ? src.qr_anchors.length : 0
    };
}

function summarizeMapForAudit(mapData, version = 0) {
    const snapshot = buildMapSnapshot(mapData) || {};
    const counts = countMapElements(snapshot);
    const serialized = JSON.stringify(snapshot);
    return {
        version: Number(version) || 0,
        ...counts,
        snapshot_sha256: crypto.createHash('sha256').update(serialized).digest('hex')
    };
}

module.exports = { buildMapSnapshot, countMapElements, summarizeMapForAudit };
