// ============================================
// FILE: buildingController.js
// MỤC ĐÍCH: NÃO BỘ xử lý logic Tạo / Xem / Sửa Tòa Nhà
// ============================================

const Building = require('../models/Building');
const Organization = require('../models/Organization');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { assertCanCreateBuilding } = require('../utils/planQuota');
const {
  annotateBuildingsQuotaLock,
  assertBuildingWritable
} = require('../utils/overQuotaLock');
const {
  addFloor,
  removeFloor,
  applyTotalFloorsChange,
  floorRangeList,
  clampCreateTotalFloors
} = require('../services/floorLifecycle');

function logActivity(data) {
    ActivityLog.create(data).catch(() => {});
}

// ==========================================
// HÀM 1: LẤY DANH SÁCH TÒA NHÀ
// ==========================================
// Dashboard gọi hàm này để hiển thị bảng danh sách
const getBuildings = async (req, res) => {
    try {
        let buildings;
        // Tòa nhà cũ có thể chưa có field is_active — coi là active trừ khi is_active === false
        const activeOnlyFilter = { is_active: { $ne: false } };

        // KIỂM TRA: Nếu không có req.user (truy cập công khai từ Mobile)
        if (!req.user) {
            // App Di động → Chỉ thấy các tòa nhà đã được PUBLISHED và còn active
            buildings = await Building.find({ ...activeOnlyFilter, status: 'PUBLISHED' }).lean();
            buildings = await filterPublicBuildingsOverQuota(buildings);
        } else if (req.user.role === 'SUPER_ADMIN') {
            // Super Admin → tòa nhà active; ?include_inactive=true để xem cả đã vô hiệu hóa
            const filter = req.query.include_inactive === 'true' ? {} : activeOnlyFilter;
            buildings = await Building.find(filter).lean();
            buildings = await annotateBuildingsForSuperAdmin(buildings);
        } else if (req.user.role === 'ORG_ADMIN') {
            const User = require('../models/User');
            const user = await User.findById(req.user.userId).select('organization_id').lean();
            const orgFilter = user?.organization_id ? { organization_id: user.organization_id } : { _id: null };
            const filter = req.query.include_inactive === 'true'
                ? orgFilter
                : { ...orgFilter, ...activeOnlyFilter };
            buildings = await Building.find(filter).lean();
            if (user?.organization_id) {
                const org = await Organization.findById(user.organization_id);
                if (org) {
                    buildings = await annotateBuildingsQuotaLock(org, buildings);
                }
            }
        } else {
            // Building Admin → Chỉ thấy tòa nhà được gán, thuộc organization của mình, và còn active
            const User = require('../models/User');
            const user = await User.findById(req.user.userId).select('assigned_buildings organization_id').lean();
            buildings = await Building.find({
                _id: { $in: user.assigned_buildings },
                organization_id: user.organization_id,
                ...activeOnlyFilter
            }).lean();
            if (user?.organization_id) {
                const org = await Organization.findById(user.organization_id);
                if (org) {
                    buildings = await annotateBuildingsQuotaLock(org, buildings);
                }
            }
        }

        res.status(200).json(buildings);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

async function annotateBuildingsForSuperAdmin(buildings) {
    if (!buildings.length) return buildings;
    const orgIds = [...new Set(buildings.map((b) => String(b.organization_id)).filter(Boolean))];
    const orgs = await Organization.find({ _id: { $in: orgIds } });
    const orgMap = Object.fromEntries(orgs.map((o) => [String(o._id), o]));
    const byOrg = {};
    buildings.forEach((b) => {
        const key = String(b.organization_id || '');
        if (!byOrg[key]) byOrg[key] = [];
        byOrg[key].push(b);
    });
    const result = [];
    for (const [orgKey, list] of Object.entries(byOrg)) {
        const org = orgMap[orgKey];
        if (org) {
            result.push(...(await annotateBuildingsQuotaLock(org, list)));
        } else {
            result.push(...list.map((b) => ({ ...b, quota_locked: false })));
        }
    }
    return result;
}

async function filterPublicBuildingsOverQuota(buildings) {
    if (!buildings.length) return buildings;
    const orgIds = [...new Set(buildings.map((b) => String(b.organization_id)).filter(Boolean))];
    const orgs = await Organization.find({ _id: { $in: orgIds } });
    const orgMap = Object.fromEntries(orgs.map((o) => [String(o._id), o]));
    const annotated = await annotateBuildingsForSuperAdmin(buildings);
    return annotated.filter((b) => !b.quota_locked);
}

// ==========================================
// HÀM 2: TẠO TÒA NHÀ MỚI
// ==========================================
// Super Admin bắt buộc gửi organization_id trong body
const createBuilding = async (req, res) => {
    try {
        if (req.user.role === 'BUILDING_ADMIN') {
            return res.status(403).json({ message: 'Building Admin không được tạo tòa nhà mới.' });
        }

        const { name, address, lat, lng, activation_radius, organization_id } = req.body;

        let orgId = organization_id;

        if (req.user.role === 'ORG_ADMIN') {
            const me = await User.findById(req.user.userId).select('organization_id').lean();
            if (!me?.organization_id) {
                return res.status(403).json({ message: 'Tài khoản ORG_ADMIN chưa được gán tổ chức.' });
            }
            if (organization_id && String(organization_id) !== String(me.organization_id)) {
                return res.status(403).json({ message: 'Org Admin không được tạo tòa nhà cho tổ chức khác.' });
            }
            orgId = me.organization_id;
        }

        if (!orgId) {
            return res.status(400).json({
                message: 'Thiếu organization_id. Super Admin phải chỉ định organization khi tạo building.'
            });
        }
        const org = await Organization.findById(orgId);
        if (!org) {
            return res.status(400).json({ message: 'Organization không tồn tại.' });
        }
        if (!org.is_active) {
            return res.status(400).json({ message: 'Organization đã bị vô hiệu hóa.' });
        }

        // Phase 5.1 — chặn tạo tòa khi vượt hạn mức gói
        const quota = await assertCanCreateBuilding(org);
        if (!quota.ok) {
            return res.status(403).json({
                message: quota.message,
                code: quota.code,
                usage: quota.usage
            });
        }

        let initialFloors;
        try {
            initialFloors = clampCreateTotalFloors(req.body.total_floors || 1);
        } catch (e) {
            return res.status(e.status || 400).json({
                message: e.message,
                code: e.code,
                max: e.max
            });
        }

        const building = await Building.create({
            name:              name,
            address:           address || '',
            gps_location:      { lat: lat || 0, lng: lng || 0 },
            activation_radius: activation_radius || 50,
            description:       req.body.description || '',
            total_floors:      initialFloors,
            created_by:        req.user ? req.user.userId : null,
            organization_id:   orgId
        });

        logActivity({
            user_id:     req.user ? req.user.userId : null,
            action:      'CREATE_BUILDING',
            target_type: 'building',
            target_id:   String(building._id),
            target:      building.name,
            details:     {
                message: 'Tạo tòa nhà mới',
                organization_id: orgId
            },
            ip_address:  req.ip || '',
            organization_id: orgId
        });

        res.status(201).json({
            message: 'Tạo tòa nhà thành công!',
            building: building
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// HÀM 3: APP ANDROID - TÌM TÒA NHÀ GẦN NHẤT BẰNG GPS
// ==========================================
// App gửi tọa độ GPS lên, Server chạy Haversine tìm tòa gần nhất
const checkLocation = async (req, res) => {
    try {
        const { lat, lng } = req.query;   // Lấy tọa độ từ URL: ?lat=10.7&lng=106.6

        // Lấy tất cả tòa nhà đã Publish và còn active
        const buildings = await Building.find({ status: 'PUBLISHED', is_active: { $ne: false } }).lean();
        const visibleBuildings = await filterPublicBuildingsOverQuota(buildings);

        // Chạy thuật toán Haversine tìm tòa nhà trong bán kính
        const nearbyBuildings = visibleBuildings.filter(function (b) {
            const distance = haversine(lat, lng, b.gps_location.lat, b.gps_location.lng);
            return distance <= b.activation_radius;  // Nằm trong vòng bán kính kích hoạt
        });

        if (nearbyBuildings.length > 0) {
            res.status(200).json({
                found: true,
                message: 'Tìm thấy tòa nhà gần bạn!',
                buildings: nearbyBuildings
            });
        } else {
            res.status(200).json({
                found: false,
                message: 'Không tìm thấy tòa nhà nào trong bán kính.'
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// THUẬT TOÁN HAVERSINE - Tính khoảng cách 2 điểm trên Trái Đất (mét)
// ==========================================
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;  // Bán kính Trái Đất (mét)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;  // Trả về khoảng cách tính bằng mét
}

// ==========================================
// HÀM 4: CẬP NHẬT THÔNG TIN TÒA NHÀ
// ==========================================
const updateBuilding = async (req, res) => {
    try {
        if (req.user.role === 'BUILDING_ADMIN') {
            return res.status(403).json({
                message: 'Building Admin không được sửa thông tin tòa nhà. Chỉ được vẽ và xuất bản bản đồ.'
            });
        }

        const { id } = req.params;
        const { name, address, lat, lng, activation_radius, description, total_floors, status, organization_id } = req.body;

        const updateData = {};
        if (name !== undefined)              updateData.name = name;
        if (address !== undefined)           updateData.address = address;
        if (description !== undefined)       updateData.description = description;
        if (activation_radius !== undefined) updateData.activation_radius = activation_radius;
        if (status !== undefined)            updateData.status = status;
        if (lat !== undefined || lng !== undefined) {
            updateData['gps_location.lat'] = lat;
            updateData['gps_location.lng'] = lng;
        }

        const oldBuilding = await Building.findById(id);
        if (!oldBuilding) return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });

        if (oldBuilding.organization_id && req.user.role !== 'SUPER_ADMIN') {
            const org = await Organization.findById(oldBuilding.organization_id);
            if (org) {
                const writable = await assertBuildingWritable(id, org);
                if (!writable.ok) {
                    return res.status(403).json({
                        message: writable.message,
                        code: writable.code
                    });
                }
            }
        }

        // total_floors: đi qua floorLifecycle (không gán thẳng)
        let floorLifecycleResult = null;
        if (total_floors !== undefined) {
            try {
                floorLifecycleResult = await applyTotalFloorsChange(oldBuilding, total_floors);
            } catch (e) {
                return res.status(e.status || 400).json({
                    message: e.message,
                    code: e.code,
                    floor_number: e.floor_number,
                    version: e.version,
                    max: e.max
                });
            }
        }

        if (organization_id !== undefined && organization_id !== '') {
            if (req.user.role !== 'SUPER_ADMIN') {
                return res.status(403).json({ message: 'Chỉ Super Admin được thay đổi organization của tòa nhà.' });
            }
            const org = await Organization.findById(organization_id);
            if (!org) {
                return res.status(400).json({ message: 'Organization không tồn tại.' });
            }
            if (!org.is_active) {
                return res.status(400).json({ message: 'Organization đã bị vô hiệu hóa.' });
            }
            updateData.organization_id = organization_id;
        }

        let building = oldBuilding;
        if (Object.keys(updateData).length > 0) {
            building = await Building.findByIdAndUpdate(id, updateData, { new: true });
            if (!building) return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        } else if (floorLifecycleResult) {
            building = floorLifecycleResult.building;
        }

        const changes = {};
        const trackFields = ['name', 'address', 'description', 'status', 'activation_radius'];
        trackFields.forEach(field => {
            if (updateData[field] !== undefined && String(oldBuilding[field] ?? '') !== String(updateData[field] ?? '')) {
                changes[field] = { from: oldBuilding[field], to: updateData[field] };
            }
        });
        if (floorLifecycleResult?.changed) {
            changes.total_floors = { from: floorLifecycleResult.from, to: floorLifecycleResult.to };
        }
        if (updateData['gps_location.lat'] !== undefined || updateData['gps_location.lng'] !== undefined) {
            const oldLat = oldBuilding.gps_location?.lat;
            const oldLng = oldBuilding.gps_location?.lng;
            const newLat = updateData['gps_location.lat'] ?? oldLat;
            const newLng = updateData['gps_location.lng'] ?? oldLng;
            if (oldLat !== newLat || oldLng !== newLng) {
                changes.gps_location = { from: { lat: oldLat, lng: oldLng }, to: { lat: newLat, lng: newLng } };
            }
        }
        if (updateData.organization_id !== undefined && String(oldBuilding.organization_id || '') !== String(updateData.organization_id || '')) {
            changes.organization_id = { from: oldBuilding.organization_id, to: updateData.organization_id };
        }

        logActivity({
            user_id:     req.user ? req.user.userId : null,
            action:      'UPDATE_BUILDING',
            target_type: 'building',
            target_id:   String(building._id),
            target:      building.name,
            details:     Object.keys(changes).length
                ? { message: 'Cập nhật thông tin tòa nhà', changes }
                : { message: 'Cập nhật thông tin tòa nhà (không có thay đổi)' },
            ip_address:  req.ip || '',
            organization_id: oldBuilding.organization_id
        });

        res.status(200).json({ message: 'Cập nhật tòa nhà thành công!', building });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// PATCH /api/buildings/:id/floors — thêm/bớt tầng đuôi
// Body: { action: "add" | "remove" }
// ==========================================
const patchBuildingFloors = async (req, res) => {
    try {
        if (req.user.role === 'BUILDING_ADMIN') {
            return res.status(403).json({
                message: 'Building Admin không được sửa số tầng. Chỉ SUPER_ADMIN / ORG_ADMIN.'
            });
        }

        const { id } = req.params;
        const action = String(req.body?.action || '').toLowerCase();
        if (action !== 'add' && action !== 'remove') {
            return res.status(400).json({
                message: 'action phải là "add" hoặc "remove".',
                code: 'FLOOR_ACTION_INVALID'
            });
        }

        const building = await Building.findById(id);
        if (!building) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }

        if (building.organization_id && req.user.role !== 'SUPER_ADMIN') {
            const org = await Organization.findById(building.organization_id);
            if (org) {
                const writable = await assertBuildingWritable(id, org);
                if (!writable.ok) {
                    return res.status(403).json({
                        message: writable.message,
                        code: writable.code
                    });
                }
            }
        }

        let result;
        try {
            result = action === 'add' ? await addFloor(building) : await removeFloor(building);
        } catch (e) {
            return res.status(e.status || 400).json({
                message: e.message,
                code: e.code,
                floor_number: e.floor_number,
                version: e.version,
                max: e.max
            });
        }

        const logAction = action === 'add' ? 'ADD_FLOOR' : 'REMOVE_FLOOR';
        logActivity({
            user_id: req.user ? req.user.userId : null,
            action: logAction,
            target_type: 'building',
            target_id: String(result.building._id),
            target: result.building.name,
            details: {
                message: action === 'add' ? 'Thêm tầng (đuôi)' : 'Bớt tầng cao nhất',
                changes: { total_floors: { from: result.from, to: result.to } },
                new_floor_number: result.new_floor_number,
                removed_floor_number: result.removed_floor_number
            },
            ip_address: req.ip || '',
            organization_id: result.building.organization_id
        });

        const n = result.building.total_floors;
        res.status(200).json({
            message: action === 'add'
                ? `Đã thêm tầng. Số tầng hiện tại: ${n}.`
                : `Đã bớt tầng cao nhất. Số tầng hiện tại: ${n}.`,
            building: result.building,
            total_floors: n,
            floors: floorRangeList(n)
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// HÀM 5: XÓA TÒA NHÀ (SOFT DELETE)
// ==========================================
const deleteBuilding = async (req, res) => {
    try {
        if (req.user.role === 'BUILDING_ADMIN') {
            return res.status(403).json({
                message: 'Building Admin không được xóa tòa nhà. Liên hệ Org Admin hoặc Super Admin.'
            });
        }

        const { id } = req.params;

        // Kiểm tra building tồn tại
        const building = await Building.findById(id);
        if (!building) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }

        // Nếu đã bị deactivate rồi (chỉ khi explicitly false)
        if (building.is_active === false) {
            return res.status(400).json({ message: 'Tòa nhà đã được vô hiệu hóa trước đó!' });
        }

        // Soft delete: set is_active = false
        const updated = await Building.findByIdAndUpdate(
            id,
            { is_active: false },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }

        // Log DEACTIVATE_BUILDING (giữ DELETE_BUILDING để backward compat)
        logActivity({
            user_id:     req.user ? req.user.userId : null,
            action:      'DEACTIVATE_BUILDING',
            target_type: 'building',
            target_id:   String(id),
            target:      building.name,
            details:     {
                message: 'Vô hiệu hóa tòa nhà (soft delete)',
                changes: {
                    is_active: { from: true, to: false }
                }
            },
            ip_address:  req.ip || '',
            organization_id: building.organization_id
        });

        res.status(200).json({ message: 'Đã vô hiệu hóa tòa nhà thành công!' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// HÀM 6: KHÔI PHỤC TÒA NHÀ (RESTORE SOFT DELETE) — Phase 4.4
// ==========================================
const restoreBuilding = async (req, res) => {
    try {
        if (req.user.role === 'BUILDING_ADMIN') {
            return res.status(403).json({
                message: 'Building Admin không được khôi phục tòa nhà. Liên hệ Org Admin hoặc Super Admin.'
            });
        }

        const { id } = req.params;
        const building = await Building.findById(id);
        if (!building) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }

        if (building.is_active !== false) {
            return res.status(400).json({ message: 'Tòa nhà đang hoạt động, không cần khôi phục.' });
        }

        if (req.user.role === 'ORG_ADMIN') {
            const me = await User.findById(req.user.userId).select('organization_id').lean();
            if (!me?.organization_id) {
                return res.status(403).json({ message: 'Tài khoản ORG_ADMIN chưa được gán tổ chức.' });
            }
            if (String(building.organization_id) !== String(me.organization_id)) {
                return res.status(403).json({ message: 'Bạn chỉ được khôi phục tòa nhà trong tổ chức của mình.' });
            }
        }

        if (building.organization_id) {
            const org = await Organization.findById(building.organization_id);
            if (!org) {
                return res.status(400).json({ message: 'Tổ chức của tòa nhà không tồn tại.' });
            }
            if (!org.is_active) {
                return res.status(400).json({
                    message: 'Không thể khôi phục tòa nhà khi tổ chức "' + org.name + '" đang tạm dừng.'
                });
            }
            // Phase 5.1 — restore cũng tính vào hạn mức tòa active
            const quota = await assertCanCreateBuilding(org);
            if (!quota.ok) {
                return res.status(403).json({
                    message: quota.message,
                    code: quota.code,
                    usage: quota.usage
                });
            }
        }

        const updated = await Building.findByIdAndUpdate(id, { is_active: true }, { new: true });
        if (!updated) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }

        logActivity({
            user_id: req.user ? req.user.userId : null,
            action: 'ACTIVATE_BUILDING',
            target_type: 'building',
            target_id: String(id),
            target: building.name,
            details: {
                message: 'Khôi phục tòa nhà (restore soft delete)',
                changes: { is_active: { from: false, to: true } }
            },
            ip_address: req.ip || '',
            organization_id: building.organization_id
        });

        res.status(200).json({
            message: 'Đã khôi phục tòa nhà thành công!',
            building: updated
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// GET /api/buildings/:id — chi tiết tòa nhà (editor / dashboard)
const getBuildingById = async (req, res) => {
    try {
        const { id } = req.params;
        const building = await Building.findById(id).lean();
        if (!building) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }
        if (building.organization_id) {
            const org = await Organization.findById(building.organization_id);
            if (org) {
                const [annotated] = await annotateBuildingsQuotaLock(org, [building]);
                return res.status(200).json(annotated);
            }
        }
        res.status(200).json({ ...building, quota_locked: false });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

module.exports = {
    getBuildings,
    getBuildingById,
    createBuilding,
    updateBuilding,
    patchBuildingFloors,
    deleteBuilding,
    restoreBuilding,
    checkLocation
};

