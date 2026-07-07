// ============================================
// FILE: mapController.js
// MỤC ĐÍCH: NÃO BỘ xử lý logic Lưu / Tải / Publish Bản Đồ JSON
// ĐÂY LÀ FILE CỐT LÕI: Nối Web Map Editor với Database
// ============================================

const Floor      = require('../models/Floor');
const Building   = require('../models/Building');
const MapVersion = require('../models/MapVersion');
const QrCode     = require('../models/QrCode');
const ActivityLog = require('../models/ActivityLog');
const { buildMapSnapshot } = require('../utils/mapSnapshot');

function logActivity(data) {
    return ActivityLog.create(data).catch(() => {});
}

async function assertPublicBuildingAccess(buildingId, res) {
    const building = await Building.findById(buildingId).select('status is_active').lean();
    if (!building || building.is_active === false || building.status !== 'PUBLISHED') {
        res.status(404).json({ message: 'Không tìm thấy bản đồ hoặc tòa nhà chưa được xuất bản.' });
        return false;
    }
    return true;
}

// Sync qr_anchors từ floor document sang collection QrCode riêng (fire-and-forget)
async function syncQrCodes(floorDoc) {
    const anchors = floorDoc.map_data?.qr_anchors || [];
    for (const anchor of anchors) {
        // Web Editor hiện lưu mã ngắn ở qr_id (VD: QR-001).
        // Bảng qrcodes cần qr_code đúng chuỗi in trong QR để Android scan tra được.
        const qrId = anchor.qr_id || anchor.serial || anchor.qr_code;
        if (!qrId) continue;

        const x = Math.round(anchor.x || 0);
        const y = Math.round(anchor.y || 0);
        const qrCode = anchor.qr_code || `MAP_NAV|${floorDoc.building_id}|${floorDoc.floor_number}|${x}|${y}|${qrId}`;

        await QrCode.updateOne(
            { qr_code: qrCode },
            {
                $set: {
                    building_id:  floorDoc.building_id,
                    floor_number: floorDoc.floor_number,
                    x:            x,
                    y:            y,
                    node_id:      anchor.node_id || '',
                    label:        anchor.label || anchor.room_name || ''
                }
            },
            { upsert: true }
        );
    }
}

// ==========================================
// HÀM 1: LƯU BẢN ĐỒ (Web Editor bấm Publish)
// ==========================================
// Web Map Editor gom cục JSON (rooms, nodes, edges...) bắn lên đây
const saveMap = async (req, res) => {
    try {
        const { buildingId, floor } = req.params;   // Lấy ID tòa nhà và tầng từ URL
        const floorNum = parseInt(floor, 10);
        if (!Number.isFinite(floorNum)) {
            return res.status(400).json({ message: 'Số tầng không hợp lệ.' });
        }
        const { map_data } = req.body;              // Lấy cục JSON bản đồ từ body

        // Tìm xem bản đồ tầng này đã tồn tại chưa
        let existingMap = await Floor.findOne({
            building_id: buildingId,
            floor_number: floorNum
        });

        const userId = req.user ? req.user.userId : null;

        if (existingMap) {
            existingMap.map_data         = map_data;
            existingMap.version          = existingMap.version + 1;
            existingMap.published_at     = new Date();
            existingMap.last_modified_by = userId;
            await existingMap.save();

            await Building.findByIdAndUpdate(buildingId, { status: 'PUBLISHED' });

            // Lưu snapshot version (không lưu ảnh nền để tiết kiệm dung lượng)
            MapVersion.create({
                building_id:    buildingId,
                floor_number:   floorNum,
                version:        existingMap.version,
                rooms_count:    map_data.rooms?.length  || 0,
                nodes_count:    map_data.nodes?.length  || 0,
                edges_count:    map_data.edges?.length  || 0,
                graph_snapshot: { nodes: map_data.nodes, edges: map_data.edges },
                map_snapshot:   buildMapSnapshot(map_data),
                published_by:   userId,
                published_at:   new Date()
            }).catch(() => {});

            // Sync QR codes sang collection riêng
            syncQrCodes(existingMap).catch(() => {});

            logActivity({
                user_id:     userId,
                action:      'PUBLISH_MAP',
                target_type: 'floor',
                target_id:   String(existingMap._id),
                target:      `Building ${buildingId} - Tầng ${floor}`,
                details:     `Phiên bản ${existingMap.version}`,
                ip_address:  req.ip || ''
            });

            res.status(200).json({
                message: 'Cập nhật bản đồ Tầng ' + floor + ' thành công! (Version ' + existingMap.version + ')',
                map: existingMap
            });
        } else {
            const newMap = await Floor.create({
                building_id:      buildingId,
                floor_number:     floorNum,
                floor_name:       'Tầng ' + floorNum,
                version:          1,
                map_data:         map_data,
                published_at:     new Date(),
                last_modified_by: userId
            });

            await Building.findByIdAndUpdate(buildingId, { status: 'PUBLISHED' });

            MapVersion.create({
                building_id:    buildingId,
                floor_number:   floorNum,
                version:        1,
                rooms_count:    map_data.rooms?.length  || 0,
                nodes_count:    map_data.nodes?.length  || 0,
                edges_count:    map_data.edges?.length  || 0,
                graph_snapshot: { nodes: map_data.nodes, edges: map_data.edges },
                map_snapshot:   buildMapSnapshot(map_data),
                published_by:   userId,
                published_at:   new Date()
            }).catch(() => {});

            syncQrCodes(newMap).catch(() => {});

            logActivity({
                user_id:     userId,
                action:      'PUBLISH_MAP',
                target_type: 'floor',
                target_id:   String(newMap._id),
                target:      `Building ${buildingId} - Tầng ${floor}`,
                details:     'Phiên bản 1 (tạo mới)',
                ip_address:  req.ip || ''
            });

            res.status(201).json({
                message: 'Tạo bản đồ Tầng ' + floor + ' thành công!',
                map: newMap
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lưu bản đồ: ' + error.message });
    }
};

// ==========================================
// HÀM 2: TẢI BẢN ĐỒ VỀ (Web Editor mở lên sửa tiếp)
// ==========================================
const loadMap = async (req, res) => {
    try {
        const { buildingId, floor } = req.params;

        if (!req.user) {
            const allowed = await assertPublicBuildingAccess(buildingId, res);
            if (!allowed) return;
        }

        const map = await Floor.findOne({
            building_id: buildingId,
            floor_number: floor
        });

        if (!map) {
            console.log(`⚠️ LOAD: Không tìm thấy bản đồ [Tòa nhà: ${buildingId}, Tầng: ${floor}]`);
            return res.status(404).json({ message: 'Chưa có bản đồ cho tầng này!' });
        }

        // Log LOAD_MAP (chỉ route private có req.user; public route bỏ qua)
        if (req.user?.userId) {
            logActivity({
                user_id: req.user.userId,
                action: 'LOAD_MAP',
                target_type: 'floor',
                target_id: String(map._id),
                target: `Building ${buildingId} - Tầng ${floor}`,
                details: { version: map.version, message: 'Tải bản đồ lên Editor' },
                ip_address: req.ip || ''
            });
        }

        console.log(`📥 LOAD: Tải bản đồ thành công [Tòa nhà: ${buildingId}, Tầng: ${floor}] - Phòng: ${map.map_data?.rooms?.length || 0}`);
        res.status(200).json(map);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi tải bản đồ: ' + error.message });
    }
};

// ==========================================
// HÀM 3: APP ANDROID TẢI BẢN ĐỒ OFFLINE
// ==========================================
// App gọi hàm này để kéo toàn bộ bản đồ mọi tầng của 1 tòa nhà về cache
const downloadMap = async (req, res) => {
    try {
        const { buildingId } = req.params;

        const allowed = await assertPublicBuildingAccess(buildingId, res);
        if (!allowed) return;

        // Lấy tất cả tầng của tòa nhà này
        const maps = await Floor.find({ building_id: buildingId });

        if (!maps.length) {
            return res.status(404).json({ message: 'Tòa nhà này chưa có bản đồ!' });
        }

        res.status(200).json({
            building_id: buildingId,
            total_floors: maps.length,
            floors: maps
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi tải bản đồ: ' + error.message });
    }
};

module.exports = { saveMap, loadMap, downloadMap, syncQrCodes };
