// ============================================
// FILE: buildingController.js
// MỤC ĐÍCH: NÃO BỘ xử lý logic Tạo / Xem / Sửa Tòa Nhà
// ============================================

const Building = require('../models/Building');
const Organization = require('../models/Organization');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const Floor = require('../models/Floor');
const Draft = require('../models/Draft');
const MapVersion = require('../models/MapVersion');
const QrCode = require('../models/QrCode');
const QrScanLog = require('../models/QrScanLog');
const { assertCanCreateBuilding, assertCanCreateBuildingForUser, assertCanAddFloorForUser } = require('../utils/planQuota');
const {
  annotateBuildingsQuotaLock,
  assertBuildingWritable
} = require('../utils/overQuotaLock');
const {
  isCommunitySearchable,
  communityPublicMongoFilter
} = require('../utils/mapVisibility');
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
            // App Di động → chỉ COMMUNITY/OFFICIAL đã PUBLISHED (Map Governance)
            buildings = await Building.find(communityPublicMongoFilter()).lean();
            buildings = await filterPublicBuildingsOverQuota(buildings);
        } else if (req.user.role === 'SUPER_ADMIN') {
            // Super Admin → tòa nhà active; ?include_inactive=true để xem cả đã vô hiệu hóa
            const filter = req.query.include_inactive === 'true' ? {} : activeOnlyFilter;
            buildings = await Building.find(filter).lean();
            buildings = await annotateBuildingsForSuperAdmin(buildings);
        } else if (req.user.role === 'REGISTERED_USER') {
            // Personal Workspace — chỉ tòa nhà thuộc sở hữu của user
            const ownerFilter = { owner_user_id: req.user.userId };
            const filter = req.query.include_inactive === 'true'
                ? ownerFilter
                : { ...ownerFilter, ...activeOnlyFilter };
            buildings = await Building.find(filter).lean();
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
    const orgIds = [...new Set(buildings.map((b) => b.organization_id).filter(Boolean).map(String))];
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
    const orgIds = [...new Set(buildings.map((b) => b.organization_id).filter(Boolean).map(String))];
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

        // REGISTERED_USER: tạo tòa nhà trong Personal Workspace (không thuộc Organization)
        if (req.user.role === 'REGISTERED_USER') {
            const me = await User.findById(req.user.userId).select('plan').lean();
            const quota = await assertCanCreateBuildingForUser({ _id: req.user.userId, plan: me?.plan });
            if (!quota.ok) {
                return res.status(403).json({ message: quota.message, code: quota.code, usage: quota.usage });
            }
            let personalFloors;
            try {
                personalFloors = clampCreateTotalFloors(req.body.total_floors || 1);
            } catch (e) {
                return res.status(e.status || 400).json({ message: e.message, code: e.code, max: e.max });
            }
            // Không cho vượt giới hạn tầng của gói cá nhân ngay khi tạo
            if (quota.limits && quota.limits.maxFloorsPerBuilding != null &&
                personalFloors > quota.limits.maxFloorsPerBuilding) {
                personalFloors = quota.limits.maxFloorsPerBuilding;
            }
            const personalBuilding = await Building.create({
                name,
                address: address || '',
                gps_location: { lat: lat || 0, lng: lng || 0 },
                activation_radius: activation_radius || 50,
                description: req.body.description || '',
                total_floors: personalFloors,
                created_by: req.user.userId,
                organization_id: null,
                owner_user_id: req.user.userId
            });
            logActivity({
                user_id: req.user.userId,
                action: 'CREATE_BUILDING',
                target_type: 'building',
                target_id: String(personalBuilding._id),
                target: personalBuilding.name,
                details: { message: 'Tạo tòa nhà (Personal Workspace)', workspace: 'personal' },
                ip_address: req.ip || ''
            });
            return res.status(201).json({ message: 'Tạo tòa nhà thành công!', building: personalBuilding });
        }

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

        await logActivity({
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

        // Lấy tòa COMMUNITY/OFFICIAL đã Publish (không lộ PRIVATE/UNLISTED)
        const buildings = await Building.find(communityPublicMongoFilter()).lean();
        const visibleBuildings = await filterPublicBuildingsOverQuota(
          buildings.filter(isCommunitySearchable)
        );

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
        const { name, address, lat, lng, activation_radius, description, total_floors, status, organization_id, place_id, visibility } = req.body;

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

        // Map Governance P0 — chỉ SUPER_ADMIN đổi place_id qua API buildings
        if (place_id !== undefined && req.user.role === 'SUPER_ADMIN') {
            if (!place_id) {
                updateData.place_id = null;
            } else {
                const Place = require('../models/Place');
                const place = await Place.findById(place_id).select('_id status').lean();
                if (!place) {
                    return res.status(400).json({ message: 'Place không tồn tại.', code: 'PLACE_NOT_FOUND' });
                }
                if (place.status === 'LOCKED' || place.status === 'MERGED') {
                    return res.status(400).json({ message: 'Place đang khóa/merge.', code: 'PLACE_NOT_ATTACHABLE' });
                }
                updateData.place_id = place_id;
            }
        }
        if (visibility !== undefined) {
            const { normalizeVisibility, MAP_VISIBILITY_VALUES } = require('../utils/mapVisibility');
            const v = normalizeVisibility(visibility, '');
            if (!MAP_VISIBILITY_VALUES.includes(v)) {
                return res.status(400).json({
                    message: 'visibility phải là PRIVATE | UNLISTED | COMMUNITY | OFFICIAL',
                    code: 'INVALID_VISIBILITY'
                });
            }
            if (!['SUPER_ADMIN', 'ORG_ADMIN', 'REGISTERED_USER'].includes(req.user.role)) {
                return res.status(403).json({ message: 'Không có quyền đổi visibility.' });
            }
            updateData.visibility = v;
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

        // Personal Workspace: giới hạn số tầng theo gói cá nhân (FREE/PRO)
        if (action === 'add' && building.owner_user_id && !building.organization_id) {
            const owner = await User.findById(building.owner_user_id).select('plan').lean();
            const floorQuota = assertCanAddFloorForUser({ plan: owner?.plan }, building);
            if (!floorQuota.ok) {
                return res.status(403).json({
                    message: floorQuota.message,
                    code: floorQuota.code,
                    usage: floorQuota.usage
                });
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
        await logActivity({
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

// GET /api/buildings/:id — chi tiết tòa nhà (editor / dashboard profile)
const getBuildingById = async (req, res) => {
    try {
        const { id } = req.params;
        let building = await Building.findById(id).lean();
        if (!building) {
            return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
        }

        let organization = null;
        if (building.organization_id) {
            const orgDoc = await Organization.findById(building.organization_id);
            if (orgDoc) {
                organization = {
                    _id: orgDoc._id,
                    name: orgDoc.name,
                    slug: orgDoc.slug,
                    is_active: orgDoc.is_active,
                    plan: orgDoc.plan
                };
                const [annotated] = await annotateBuildingsQuotaLock(orgDoc, [building]);
                building = annotated;
            } else {
                building = { ...building, quota_locked: false };
            }
        } else {
            building = { ...building, quota_locked: false };
        }

        let created_by_user = null;
        if (building.created_by) {
            created_by_user = await User.findById(building.created_by)
                .select('full_name email role is_active')
                .lean();
        }

        const managers = await User.find({
            role: 'BUILDING_ADMIN',
            assigned_buildings: building._id,
            is_active: { $ne: false }
        })
            .select('full_name email role is_active')
            .lean();

        let org_admins = [];
        if (building.organization_id) {
            org_admins = await User.find({
                role: 'ORG_ADMIN',
                organization_id: building.organization_id,
                is_active: { $ne: false }
            })
                .select('full_name email role is_active')
                .limit(20)
                .lean();
        }

        const buildingId = building._id;
        const activityTarget = new RegExp(`Building ${String(buildingId)}`, 'i');
        const scanSince = new Date();
        scanSince.setDate(scanSince.getDate() - 29);
        scanSince.setHours(0, 0, 0, 0);

        const [
            floorDocs,
            draftDocs,
            versionDocs,
            qrDocs,
            activityDocs,
            scanRows,
            versionTotal,
            qrTotal
        ] = await Promise.all([
            Floor.find({ building_id: buildingId })
                .select('floor_number floor_name version published_at last_modified_by map_data.scale_ratio map_data.map_bearing_offset')
                .populate('last_modified_by', 'full_name email')
                .sort({ floor_number: 1 })
                .lean(),
            Draft.find({ building_id: buildingId })
                .select('floor_number version updatedAt updated_by')
                .populate('updated_by', 'full_name email')
                .sort({ floor_number: 1 })
                .lean(),
            MapVersion.find({ building_id: buildingId })
                .select('floor_number version rooms_count nodes_count edges_count published_by published_at')
                .populate('published_by', 'full_name email')
                .sort({ published_at: -1 })
                .limit(100)
                .lean(),
            QrCode.find({ building_id: buildingId })
                .select('qr_code floor_number label node_id createdAt')
                .sort({ floor_number: 1, createdAt: -1 })
                .limit(500)
                .lean(),
            ActivityLog.find({
                $or: [
                    { target_id: String(buildingId) },
                    { target: activityTarget },
                    { 'details.building_ids': String(buildingId) },
                    { 'details.building_ids': buildingId }
                ]
            })
                .select('user_id action target_type target_id target details createdAt')
                .populate('user_id', 'full_name email')
                .sort({ createdAt: -1 })
                .limit(30)
                .lean(),
            QrScanLog.aggregate([
                { $match: { building_id: buildingId, scanned_at: { $gte: scanSince } } },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$scanned_at',
                                timezone: 'Asia/Ho_Chi_Minh'
                            }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            MapVersion.countDocuments({ building_id: buildingId }),
            QrCode.countDocuments({ building_id: buildingId })
        ]);

        const draftByFloor = new Map(
            draftDocs.map((draft) => [Number(draft.floor_number), draft])
        );
        const qrCountByFloor = {};
        qrDocs.forEach((qr) => {
            const key = String(Number(qr.floor_number));
            qrCountByFloor[key] = (qrCountByFloor[key] || 0) + 1;
        });
        const versionCountByFloor = {};
        versionDocs.forEach((version) => {
            const key = String(Number(version.floor_number));
            versionCountByFloor[key] = (versionCountByFloor[key] || 0) + 1;
        });
        const floorByNumber = new Map(
            floorDocs.map((floor) => [Number(floor.floor_number), floor])
        );
        const totalFloors = Math.max(1, Number(building.total_floors) || 1);
        const floors = Array.from({ length: totalFloors }, (_, floorNumber) => {
            const floor = floorByNumber.get(floorNumber) || null;
            const draft = draftByFloor.get(floorNumber) || null;
            return {
                floor_number: floorNumber,
                floor_name: floor?.floor_name || (floorNumber === 0 ? 'Tầng trệt' : `Tầng ${floorNumber}`),
                has_map: Boolean(floor),
                is_published: Boolean(floor?.published_at),
                has_draft: Boolean(draft),
                version: floor?.version || 0,
                version_count: versionCountByFloor[String(floorNumber)] || 0,
                qr_count: qrCountByFloor[String(floorNumber)] || 0,
                published_at: floor?.published_at || null,
                draft_updated_at: draft?.updatedAt || null,
                scale_ratio: floor?.map_data?.scale_ratio ?? null,
                map_bearing_offset: floor?.map_data?.map_bearing_offset ?? null,
                last_modified_by: floor?.last_modified_by || draft?.updated_by || null
            };
        });

        const latestVersion = versionDocs[0] || null;
        const scanCount30d = scanRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
        const qrCodes = qrDocs.map((qr) => ({
            _id: qr._id,
            qr_code: qr.qr_code,
            floor_number: qr.floor_number,
            label: qr.label,
            node_id: qr.node_id,
            createdAt: qr.createdAt
        }));

        res.status(200).json({
            ...building,
            organization,
            created_by_user,
            managers,
            org_admins,
            resource_summary: {
                total_floors: totalFloors,
                map_count: floorDocs.length,
                published_floor_count: floorDocs.filter((floor) => Boolean(floor.published_at)).length,
                draft_floor_count: draftDocs.length,
                qr_count: qrTotal,
                building_admin_count: managers.length,
                version_count: versionTotal,
                latest_publish_at: latestVersion?.published_at || null,
                qr_scans_30d: scanCount30d
            },
            floors,
            versions: versionDocs,
            qr_codes: qrCodes,
            recent_activity: activityDocs,
            qr_scan_series_30d: scanRows.map((row) => ({
                date: row._id,
                count: row.count
            }))
        });
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

