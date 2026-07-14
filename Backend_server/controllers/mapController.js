// ============================================
// FILE: mapController.js
// MỤC ĐÍCH: NÃO BỘ xử lý logic Lưu / Tải / Publish Bản Đồ JSON
// ĐÂY LÀ FILE CỐT LÕI: Nối Web Map Editor với Database
// ============================================

const Floor      = require('../models/Floor');
const Building   = require('../models/Building');
const Organization = require('../models/Organization');
const MapVersion = require('../models/MapVersion');
const QrCode     = require('../models/QrCode');
const ActivityLog = require('../models/ActivityLog');
const { buildMapSnapshot } = require('../utils/mapSnapshot');
const { applyRetentionForFloor } = require('../utils/mapVersionRetention');
const { assertBuildingWritable, isBuildingQuotaLocked } = require('../utils/overQuotaLock');
const { assertFloorInRange } = require('../services/floorLifecycle');
const { assertOrgCanPublish } = require('../services/publishPermit');
const { assertCanPublish } = require('../services/floorEditLock');

function logActivity(data) {
    return ActivityLog.create(data).catch(() => {});
}

async function assertPublicBuildingAccess(buildingId, res) {
    const building = await Building.findById(buildingId).select('status is_active organization_id').lean();
    if (!building || building.is_active === false || building.status !== 'PUBLISHED') {
        res.status(404).json({ message: 'Không tìm thấy bản đồ hoặc tòa nhà chưa được xuất bản.' });
        return false;
    }
    if (building.organization_id) {
        const org = await Organization.findById(building.organization_id);
        if (org && await isBuildingQuotaLocked(buildingId, org)) {
            res.status(403).json({
                message: 'Bản đồ tòa nhà tạm khóa do vượt hạn mức gói. Liên hệ quản trị tổ chức.',
                code: 'OVER_QUOTA_LOCKED'
            });
            return false;
        }
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

function resolveEditSessionId(req) {
    const header = req.headers['x-edit-session'];
    if (header && String(header).trim()) return String(header).trim();
    if (req.body?.edit_session_id) return String(req.body.edit_session_id).trim();
    return '';
}

// ==========================================
// Phase 8: LƯU NHÁP (không version bump / không public)
// ==========================================
const saveDraft = async (req, res) => {
    try {
        const { buildingId, floor } = req.params;
        const floorNum = parseInt(floor, 10);
        if (!Number.isFinite(floorNum)) {
            return res.status(400).json({ message: 'Số tầng không hợp lệ.' });
        }

        const map_data = req.body?.map_data;
        if (map_data === undefined || map_data === null) {
            return res.status(400).json({ message: 'Thiếu map_data trong body.' });
        }

        const buildingMeta = await Building.findById(buildingId)
            .select('organization_id total_floors')
            .lean();
        if (!buildingMeta) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }
        try {
            assertFloorInRange(floorNum, buildingMeta.total_floors);
        } catch (e) {
            return res.status(e.status || 400).json({
                message: e.message,
                code: e.code || 'FLOOR_OUT_OF_RANGE',
                floor_number: e.floor_number,
                total_floors: e.total_floors
            });
        }

        if (req.user?.role !== 'SUPER_ADMIN') {
            if (buildingMeta.organization_id) {
                const org = await Organization.findById(buildingMeta.organization_id);
                const writable = await assertBuildingWritable(buildingId, org);
                if (!writable.ok) {
                    return res.status(403).json({
                        message: writable.message,
                        code: writable.code
                    });
                }
            }
        }

        const userId = req.user ? req.user.userId : null;
        const now = new Date();

        let floorDoc = await Floor.findOne({
            building_id: buildingId,
            floor_number: floorNum
        });

        if (floorDoc) {
            floorDoc.draft_map_data = map_data;
            floorDoc.draft_updated_at = now;
            floorDoc.draft_updated_by = userId;
            await floorDoc.save();
        } else {
            floorDoc = await Floor.create({
                building_id: buildingId,
                floor_number: floorNum,
                floor_name: 'Tầng ' + floorNum,
                version: 0,
                map_data: { rooms: [], nodes: [], edges: [] },
                draft_map_data: map_data,
                draft_updated_at: now,
                draft_updated_by: userId
            });
        }

        logActivity({
            user_id: userId,
            action: 'SAVE_DRAFT',
            target_type: 'floor',
            target_id: String(floorDoc._id),
            target: `Building ${buildingId} - Tầng ${floor}`,
            details: 'Lưu nháp server (không xuất bản)',
            ip_address: req.ip || ''
        });

        res.status(200).json({
            message: 'Đã lưu nháp tầng ' + floor + '.',
            draft_updated_at: floorDoc.draft_updated_at,
            draft_updated_by: floorDoc.draft_updated_by
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lưu nháp: ' + error.message });
    }
};

// ==========================================
// Phase 8: LẤY NHÁP
// ==========================================
const getDraft = async (req, res) => {
    try {
        const { buildingId, floor } = req.params;
        const floorNum = parseInt(floor, 10);
        if (!Number.isFinite(floorNum)) {
            return res.status(400).json({ message: 'Số tầng không hợp lệ.' });
        }

        const floorDoc = await Floor.findOne({
            building_id: buildingId,
            floor_number: floorNum
        }).select('draft_map_data draft_updated_at draft_updated_by version published_at');

        if (!floorDoc || floorDoc.draft_map_data == null) {
            return res.status(200).json({
                draft_map_data: null,
                draft_updated_at: null,
                draft_updated_by: null,
                published_version: floorDoc?.version ?? null
            });
        }

        res.status(200).json({
            draft_map_data: floorDoc.draft_map_data,
            draft_updated_at: floorDoc.draft_updated_at,
            draft_updated_by: floorDoc.draft_updated_by,
            published_version: floorDoc.version
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi tải nháp: ' + error.message });
    }
};

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

        const buildingMeta = await Building.findById(buildingId)
            .select('organization_id total_floors')
            .lean();
        if (!buildingMeta) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }
        try {
            assertFloorInRange(floorNum, buildingMeta.total_floors);
        } catch (e) {
            return res.status(e.status || 400).json({
                message: e.message,
                code: e.code || 'FLOOR_OUT_OF_RANGE',
                floor_number: e.floor_number,
                total_floors: e.total_floors
            });
        }

        if (req.user?.role !== 'SUPER_ADMIN') {
            if (buildingMeta.organization_id) {
                const org = await Organization.findById(buildingMeta.organization_id);
                const writable = await assertBuildingWritable(buildingId, org);
                if (!writable.ok) {
                    return res.status(403).json({
                        message: writable.message,
                        code: writable.code
                    });
                }
            }
        }

        // Phase 8.4 — publish permit (sau writable checks)
        if (buildingMeta.organization_id) {
            const orgForPermit = await Organization.findById(buildingMeta.organization_id);
            if (orgForPermit) {
                const permit = assertOrgCanPublish(orgForPermit);
                if (!permit.ok) {
                    return res.status(403).json({
                        message: permit.message,
                        code: permit.code
                    });
                }
            }
        }

        // Phase 8.3 — floor lock (advisory: chỉ chặn nếu người khác giữ)
        const editSessionId = resolveEditSessionId(req);
        const lockCheck = await assertCanPublish(
            buildingId,
            floorNum,
            req.user?.userId,
            editSessionId || null
        );
        if (!lockCheck.ok) {
            return res.status(409).json({
                message: lockCheck.message,
                code: lockCheck.code,
                holder: lockCheck.holder
            });
        }

        // Phase 8.2 — map_data từ body hoặc từ draft
        let map_data = req.body?.map_data;
        if (req.body?.use_draft === true) {
            const existingForDraft = await Floor.findOne({
                building_id: buildingId,
                floor_number: floorNum
            }).select('draft_map_data');
            if (!existingForDraft?.draft_map_data) {
                return res.status(400).json({
                    message: 'Không có bản nháp để xuất bản.',
                    code: 'DRAFT_EMPTY'
                });
            }
            map_data = existingForDraft.draft_map_data;
        }

        if (map_data === undefined || map_data === null) {
            return res.status(400).json({ message: 'Thiếu map_data (hoặc use_draft=true).' });
        }

        // Tìm xem bản đồ tầng này đã tồn tại chưa
        let existingMap = await Floor.findOne({
            building_id: buildingId,
            floor_number: floorNum
        });

        const userId = req.user ? req.user.userId : null;

        if (existingMap) {
            existingMap.map_data         = map_data;
            existingMap.version          = (existingMap.version || 0) + 1;
            existingMap.published_at     = new Date();
            existingMap.last_modified_by = userId;
            // leave draft (không xóa draft_map_data)
            await existingMap.save();

            await Building.findByIdAndUpdate(buildingId, { status: 'PUBLISHED' });

            // Lưu snapshot version (không lưu ảnh nền để tiết kiệm dung lượng)
            await MapVersion.create({
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
            });

            await applyRetentionForFloor(buildingId, floorNum, {
                userId,
                ip: req.ip || ''
            });

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

            await MapVersion.create({
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
            });

            await applyRetentionForFloor(buildingId, floorNum, {
                userId,
                ip: req.ip || ''
            });

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
        const floorNum = parseInt(floor, 10);

        if (!req.user) {
            const allowed = await assertPublicBuildingAccess(buildingId, res);
            if (!allowed) return;
        }

        const buildingMeta = await Building.findById(buildingId).select('total_floors').lean();
        if (!buildingMeta) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }
        if (Number.isFinite(floorNum)) {
            const n = Number(buildingMeta.total_floors) || 1;
            if (floorNum < 0 || floorNum >= n) {
                return res.status(404).json({
                    message: `Tầng ${floorNum} ngoài phạm vi (0..${n - 1}).`,
                    code: 'FLOOR_OUT_OF_RANGE'
                });
            }
        }

        const map = await Floor.findOne({
            building_id: buildingId,
            floor_number: Number.isFinite(floorNum) ? { $in: [floorNum, String(floorNum)] } : floor
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

        const buildingMeta = await Building.findById(buildingId).select('total_floors').lean();
        // total_floors = metadata tòa (0..N-1); floors_count = số Floor document thực tế
        res.status(200).json({
            building_id: buildingId,
            total_floors: buildingMeta?.total_floors ?? maps.length,
            floors_count: maps.length,
            floors: maps
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi tải bản đồ: ' + error.message });
    }
};

module.exports = { saveMap, loadMap, downloadMap, syncQrCodes, saveDraft, getDraft };
