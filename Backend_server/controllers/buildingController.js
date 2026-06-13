// ============================================
// FILE: buildingController.js
// MỤC ĐÍCH: NÃO BỘ xử lý logic Tạo / Xem / Sửa Tòa Nhà
// ============================================

const Building = require('../models/Building');
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

        // KIỂM TRA: Nếu không có req.user (truy cập công khai từ Mobile)
        if (!req.user) {
            // App Di động → Chỉ thấy các tòa nhà đã được PUBLISHED (Đã vẽ xong bản đồ)
            buildings = await Building.find({ status: 'PUBLISHED' });
        } else if (req.user.role === 'SUPER_ADMIN') {
            // Super Admin → Thấy TẤT CẢ tòa nhà
            buildings = await Building.find();
        } else {
            // Building Admin → Chỉ thấy tòa nhà được gán
            const User = require('../models/User');
            const user = await User.findById(req.user.userId);
            buildings = await Building.find({ _id: { $in: user.assigned_buildings } });
        }

        res.status(200).json(buildings);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// HÀM 2: TẠO TÒA NHÀ MỚI
// ==========================================
const createBuilding = async (req, res) => {
    try {
        const { name, address, lat, lng, activation_radius } = req.body;

        const building = await Building.create({
            name:              name,
            address:           address || '',
            gps_location:      { lat: lat || 0, lng: lng || 0 },
            activation_radius: activation_radius || 50,
            description:       req.body.description || '',
            total_floors:      req.body.total_floors || 1,
            created_by:        req.user ? req.user.userId : null
        });

        logActivity({
            user_id:     req.user ? req.user.userId : null,
            action:      'CREATE_BUILDING',
            target_type: 'building',
            target_id:   String(building._id),
            target:      building.name,
            ip_address:  req.ip || ''
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

        // Lấy tất cả tòa nhà đã Publish
        const buildings = await Building.find({ status: 'PUBLISHED' });

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
        const { id } = req.params;
        const { name, address, lat, lng, activation_radius, description, total_floors, status } = req.body;

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

        const building = await Building.findByIdAndUpdate(id, updateData, { new: true });
        if (!building) return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });

        logActivity({
            user_id:     req.user ? req.user.userId : null,
            action:      'UPDATE_BUILDING',
            target_type: 'building',
            target_id:   String(building._id),
            target:      building.name,
            ip_address:  req.ip || ''
        });

        res.status(200).json({ message: 'Cập nhật tòa nhà thành công!', building });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// HÀM 5: XÓA TÒA NHÀ
// ==========================================
const deleteBuilding = async (req, res) => {
    try {
        const { id } = req.params;
        const building = await Building.findByIdAndDelete(id);
        if (!building) return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });

        logActivity({
            user_id:     req.user ? req.user.userId : null,
            action:      'DELETE_BUILDING',
            target_type: 'building',
            target_id:   String(id),
            target:      building.name,
            ip_address:  req.ip || ''
        });

        res.status(200).json({ message: 'Đã xóa tòa nhà thành công!' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

module.exports = { getBuildings, createBuilding, updateBuilding, deleteBuilding, checkLocation };
