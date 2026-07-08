// ============================================
// FILE: buildingController.js
// MỤC ĐÍCH: NÃO BỘ xử lý logic Tạo / Xem / Sửa Tòa Nhà
// ============================================

const Building = require('../models/Building');
const Organization = require('../models/Organization');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

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
            buildings = await Building.find({ ...activeOnlyFilter, status: 'PUBLISHED' });
        } else if (req.user.role === 'SUPER_ADMIN') {
            // Super Admin → tòa nhà active; ?include_inactive=true để xem cả đã vô hiệu hóa
            const filter = req.query.include_inactive === 'true' ? {} : activeOnlyFilter;
            buildings = await Building.find(filter);
        } else if (req.user.role === 'ORG_ADMIN') {
            const User = require('../models/User');
            const user = await User.findById(req.user.userId).select('organization_id').lean();
            const orgFilter = user?.organization_id ? { organization_id: user.organization_id } : { _id: null };
            const filter = req.query.include_inactive === 'true'
                ? orgFilter
                : { ...orgFilter, ...activeOnlyFilter };
            buildings = await Building.find(filter);
        } else {
            // Building Admin → Chỉ thấy tòa nhà được gán, thuộc organization của mình, và còn active
            const User = require('../models/User');
            const user = await User.findById(req.user.userId).select('assigned_buildings organization_id').lean();
            buildings = await Building.find({
                _id: { $in: user.assigned_buildings },
                organization_id: user.organization_id,
                ...activeOnlyFilter
            });
        }

        res.status(200).json(buildings);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

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

        const building = await Building.create({
            name:              name,
            address:           address || '',
            gps_location:      { lat: lat || 0, lng: lng || 0 },
            activation_radius: activation_radius || 50,
            description:       req.body.description || '',
            total_floors:      req.body.total_floors || 1,
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
        const buildings = await Building.find({ status: 'PUBLISHED', is_active: { $ne: false } });

        // Chạy thuật toán Haversine tìm tòa nhà trong bán kính
        const nearbyBuildings = buildings.filter(function (b) {
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
        if (total_floors !== undefined)      updateData.total_floors = total_floors;
        if (activation_radius !== undefined) updateData.activation_radius = activation_radius;
        if (status !== undefined)            updateData.status = status;
        if (lat !== undefined || lng !== undefined) {
            updateData['gps_location.lat'] = lat;
            updateData['gps_location.lng'] = lng;
        }

        const oldBuilding = await Building.findById(id);
        if (!oldBuilding) return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });

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
  const building = await Building.findByIdAndUpdate(id, updateData, { new: true });
        if (!building) return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });

        const changes = {};
        const trackFields = ['name', 'address', 'description', 'total_floors', 'status', 'activation_radius'];
        trackFields.forEach(field => {
          if (updateData[field] !== undefined && String(oldBuilding[field] ?? '') !== String(updateData[field] ?? '')) {
            changes[field] = { from: oldBuilding[field], to: updateData[field] };
          }
        });
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
            const org = await Organization.findById(building.organization_id).select('is_active name').lean();
            if (!org) {
                return res.status(400).json({ message: 'Tổ chức của tòa nhà không tồn tại.' });
            }
            if (!org.is_active) {
                return res.status(400).json({
                    message: 'Không thể khôi phục tòa nhà khi tổ chức "' + org.name + '" đang tạm dừng.'
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
        res.status(200).json(building);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

module.exports = { getBuildings, getBuildingById, createBuilding, updateBuilding, deleteBuilding, restoreBuilding, checkLocation };

