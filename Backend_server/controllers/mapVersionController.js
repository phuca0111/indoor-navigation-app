const Floor = require('../models/Floor');
const Building = require('../models/Building');
const MapVersion = require('../models/MapVersion');
const ActivityLog = require('../models/ActivityLog');
const { syncQrCodes } = require('./mapController');
const { buildMapSnapshot } = require('../utils/mapSnapshot');
const { applyRetentionForFloor, getRetentionMax } = require('../utils/mapVersionRetention');

function logActivity(data) {
    ActivityLog.create(data).catch(() => {});
}

function toPlainMapData(mapData) {
    if (!mapData) return {};
    if (typeof mapData.toObject === 'function') return mapData.toObject();
    return { ...mapData };
}

// GET /api/map-versions/:buildingId/:floor
const getVersions = async (req, res) => {
    try {
        const { buildingId, floor } = req.params;
        const floorNum = parseInt(floor, 10);
        const versionsRaw = await MapVersion.find({
            building_id: buildingId,
            floor_number: { $in: [floorNum, String(floorNum)] }
        })
            .sort({ version: -1 })
            .populate('published_by', 'email')
            .lean();

        const versions = versionsRaw.map(function (v) {
            const hasFull = !!(v.map_snapshot && typeof v.map_snapshot === 'object' &&
                Array.isArray(v.map_snapshot.rooms));
            return {
                _id: v._id,
                building_id: v.building_id,
                floor_number: v.floor_number,
                version: v.version,
                rooms_count: v.rooms_count,
                nodes_count: v.nodes_count,
                edges_count: v.edges_count,
                published_by: v.published_by,
                published_at: v.published_at,
                has_full_snapshot: hasFull
            };
        });

        const floorDoc = await Floor.findOne({ building_id: buildingId, floor_number: floorNum })
            .select('version')
            .lean();

        res.status(200).json({
            current_version: floorDoc ? floorDoc.version : null,
            retention: {
                max_per_floor: getRetentionMax(),
                stored_count: versionsRaw.length
            },
            versions
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// GET /api/map-versions/:buildingId/:floor/:version  — lấy snapshot đồ thị cụ thể
const getVersionDetail = async (req, res) => {
    try {
        const { buildingId, floor, version } = req.params;
        const v = await MapVersion.findOne({
            building_id: buildingId,
            floor_number: parseInt(floor, 10),
            version: parseInt(version, 10)
        }).lean();
        if (!v) return res.status(404).json({ message: 'Không tìm thấy phiên bản này!' });
        res.status(200).json(v);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// POST /api/map-versions/:buildingId/:floor/:version/rollback
const rollbackVersion = async (req, res) => {
    try {
        const { buildingId, floor, version } = req.params;
        const floorNum = parseInt(floor, 10);
        const targetVersion = parseInt(version, 10);

        if (!Number.isFinite(floorNum) || !Number.isFinite(targetVersion)) {
            return res.status(400).json({ message: 'Tầng hoặc phiên bản không hợp lệ.' });
        }

        const snapshot = await MapVersion.findOne({
            building_id: buildingId,
            floor_number: { $in: [floorNum, String(floorNum)] },
            version: targetVersion
        }).lean();

        if (!snapshot) {
            return res.status(404).json({ message: 'Không tìm thấy phiên bản này!' });
        }

        const floorDoc = await Floor.findOne({ building_id: buildingId, floor_number: floorNum });
        if (!floorDoc) {
            return res.status(404).json({ message: 'Chưa có bản đồ cho tầng này!' });
        }

        const userId = req.user ? req.user.userId : null;
        const currentMap = toPlainMapData(floorDoc.map_data);
        const backgroundImage = currentMap.background_image || '';
        const graphNodes = snapshot.graph_snapshot?.nodes || [];
        const graphEdges = snapshot.graph_snapshot?.edges || [];
        const hasMapSnapshot = !!(snapshot.map_snapshot && typeof snapshot.map_snapshot === 'object' &&
            Array.isArray(snapshot.map_snapshot.rooms));
        const hasGraphData = graphNodes.length > 0 || graphEdges.length > 0;

        if (!hasMapSnapshot && !hasGraphData) {
            return res.status(400).json({
                message: 'Không thể khôi phục phiên bản v' + targetVersion +
                    ': bản publish cũ không lưu snapshot phòng/cửa (chỉ có thống kê ' +
                    (snapshot.rooms_count || 0) + ' phòng). Hãy chọn phiên bản có nhãn "snapshot đủ" (từ v2 trở đi).',
                reason: 'no_restorable_snapshot',
                target_version: targetVersion,
                target_rooms_count: snapshot.rooms_count || 0,
                current_version: floorDoc.version
            });
        }

        let restoredMapData;
        let rollbackMode;

        if (hasMapSnapshot) {
            restoredMapData = { ...snapshot.map_snapshot, background_image: backgroundImage };
            rollbackMode = 'full';
        } else if (hasGraphData) {
            restoredMapData = {
                ...currentMap,
                nodes: graphNodes,
                edges: graphEdges
            };
            rollbackMode = 'graph_only';
        } else {
            return res.status(400).json({ message: 'Phiên bản này không có dữ liệu để khôi phục.' });
        }

        floorDoc.map_data = restoredMapData;
        floorDoc.version = (floorDoc.version || 0) + 1;
        floorDoc.published_at = new Date();
        floorDoc.last_modified_by = userId;
        await floorDoc.save();

        await Building.findByIdAndUpdate(buildingId, { status: 'PUBLISHED' });

        const mapSnapshot = buildMapSnapshot(restoredMapData);
        await MapVersion.create({
            building_id: buildingId,
            floor_number: floorNum,
            version: floorDoc.version,
            rooms_count: restoredMapData.rooms?.length || 0,
            nodes_count: restoredMapData.nodes?.length || 0,
            edges_count: restoredMapData.edges?.length || 0,
            graph_snapshot: { nodes: restoredMapData.nodes, edges: restoredMapData.edges },
            map_snapshot: mapSnapshot,
            published_by: userId,
            published_at: new Date()
        });

        await applyRetentionForFloor(buildingId, floorNum, {
            userId,
            ip: req.ip || ''
        });

        syncQrCodes(floorDoc).catch(() => {});

        const building = await Building.findById(buildingId).select('organization_id').lean();
        logActivity({
            user_id: userId,
            action: 'ROLLBACK_MAP',
            target_type: 'floor',
            target_id: String(floorDoc._id),
            target: `Building ${buildingId} - Tầng ${floorNum}`,
            details: {
                message: `Khôi phục từ phiên bản ${targetVersion} → v${floorDoc.version}`,
                rollback_from_version: targetVersion,
                rollback_mode: rollbackMode,
                new_version: floorDoc.version
            },
            ip_address: req.ip || '',
            organization_id: building?.organization_id || null
        });

        res.status(200).json({
            message: rollbackMode === 'full'
                ? `Đã khôi phục bản đồ tầng ${floorNum} từ phiên bản ${targetVersion} (v${floorDoc.version}).`
                : `Đã khôi phục nodes/edges tầng ${floorNum} từ phiên bản ${targetVersion} (v${floorDoc.version}). Bản cũ không có snapshot đầy đủ.`,
            rollback_mode: rollbackMode,
            rolled_back_from: targetVersion,
            map: floorDoc
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi rollback: ' + error.message });
    }
};

module.exports = { getVersions, getVersionDetail, rollbackVersion };
