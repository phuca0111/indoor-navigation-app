// WHY: Không lưu background_image — giữ ảnh nền hiện tại khi rollback
function buildMapSnapshot(mapData) {
    if (!mapData || typeof mapData !== 'object') return null;
    return {
        scale_ratio: mapData.scale_ratio,
        rooms: mapData.rooms || [],
        doors: mapData.doors || [],
        pois: mapData.pois || [],
        nodes: mapData.nodes || [],
        edges: mapData.edges || [],
        walls: mapData.walls || [],
        qr_anchors: mapData.qr_anchors || []
    };
}

module.exports = { buildMapSnapshot };
