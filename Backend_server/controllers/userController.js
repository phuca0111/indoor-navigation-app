// ============================================
// FILE: userController.js
// MỤC ĐÍCH: NÃO BỘ xử lý logic Xem danh sách, Xóa, Sửa Quản Trị Viên (Dành riêng cho Super Admin)
// ============================================

const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

function logActivity(data) {
    ActivityLog.create(data).catch(() => {});
}

// ==========================================
// HÀM 1: LẤY DANH SÁCH TẤT CẢ TÀI KHOẢN
// ==========================================
const getUsers = async (req, res) => {
    try {
        // Chỉ lấy những người KHÔNG PHẢI là chính mình (tránh Super Admin tự xóa mình)
        // Dùng populate để kéo thêm thông tin "Tên tòa nhà" dựa vào ID tòa nhà được gán
        const users = await User.find({ _id: { $ne: req.user.userId } })
                                .populate('assigned_buildings', 'name address')
                                .select('-password'); // Bỏ cột password ra, không gửi mật khẩu về mạng

        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy danh sách tài khoản: ' + error.message });
    }
};

// ==========================================
// HÀM 2: CẬP NHẬT THÔNG TIN ADMIN (SỬA)
// ==========================================
const bcrypt = require('bcryptjs'); // Cần bcrypt để xay mật khẩu mới

const updateUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { email, password, role, assigned_buildings, is_active } = req.body;

        // Chuẩn bị dữ liệu muốn cập nhật
        let updateData = { email, role, assigned_buildings, is_active };

        // NẾU CÓ GÕ MẬT KHẨU MỚI -> Thì mới xay mật khẩu
        if (password && password.trim() !== "") {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản để cập nhật!' });
        }

        // Phân biệt log: gán tòa nhà hay cập nhật thông tin
        const actionType = assigned_buildings !== undefined ? 'ASSIGN_BUILDING' : 'UPDATE_USER';
        logActivity({
            user_id:     req.user.userId,
            action:      actionType,
            target_type: 'user',
            target_id:   userId,
            target:      updatedUser.email,
            ip_address:  req.ip || ''
        });

        res.status(200).json({
            message: 'Cập nhật tài khoản thành công!',
            user: updatedUser
        });

    } catch (error) {
        res.status(500).json({ message: 'Lỗi cập nhật tài khoản: ' + error.message });
    }
};

// ==========================================
// HÀM 3: XÓA TÀI KHOẢN ADMIN
// ==========================================
const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findByIdAndDelete(userId);
        
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản để xóa!' });
        }

        logActivity({
            user_id:     req.user.userId,
            action:      'DELETE_USER',
            target_type: 'user',
            target_id:   userId,
            target:      user.email,
            ip_address:  req.ip || ''
        });

        res.status(200).json({ message: 'Đã xóa tài khoản vĩnh viễn!' });

    } catch (error) {
        res.status(500).json({ message: 'Lỗi xóa tài khoản: ' + error.message });
    }
};

module.exports = { getUsers, updateUser, deleteUser };
