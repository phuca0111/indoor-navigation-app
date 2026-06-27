// ============================================
// FILE: User.js
// MỤC ĐÍCH: Tạo khuôn mẫu (Schema) cho bảng Tài Khoản người dùng
// BẢNG NÀY LƯU: Email, mật khẩu, vai trò (Super Admin hay Building Admin)
// ============================================

// Bước 1: Lôi thư viện mongoose ra dùng
const mongoose = require('mongoose');

// Bước 2: Vẽ ra cái khuôn (Schema) - giống như kẻ bảng Excel có các cột cố định
const userSchema = new mongoose.Schema({

    // Cột 1: Email đăng nhập (Kiểu chữ, bắt buộc phải có, không được trùng)
    email: {
        type: String,       // Kiểu dữ liệu: Chuỗi ký tự
        required: true,     // Bắt buộc: Không được bỏ trống
        unique: true        // Duy nhất: Không ai được đăng ký trùng email
    },

    // Cột 2: Mật khẩu đã được máy xay bcrypt nghiền nát
    password: {
        type: String,
        required: true
    },

    // Cột 3: Vai trò của người dùng (Chỉ được chọn 1 trong 2)
    role: {
        type: String,
        enum: ['SUPER_ADMIN', 'BUILDING_ADMIN'],  // Chỉ chấp nhận 2 giá trị này
        default: 'BUILDING_ADMIN'                  // Mặc định khi tạo mới là Building Admin
    },

    // Cột 4: Danh sách các tòa nhà được gán cho Admin này quản lý
    // Ví dụ: Admin A được gán quản lý Tòa nhà X và Tòa nhà Y
    assigned_buildings: [{
        type: mongoose.Schema.Types.ObjectId,  // Lưu mã ID của tòa nhà (liên kết sang bảng Building)
        ref: 'Building'                        // Tham chiếu: Trỏ sang bảng Building bên cạnh
    }],

    // Cột 5: Tài khoản đang mở hay bị khóa
    is_active: {
        type: Boolean,      // Kiểu đúng/sai
        default: true       // Mặc định: Tài khoản đang mở
    },

    // Cột 6: Lần đăng nhập gần nhất
    last_login: {
        type: Date,
        default: null
    },

    // Cột 7: Tên hiển thị trong Admin UI
    full_name: {
        type: String,
        default: ''
    },

    // Cột 8: Số điện thoại (optional)
    phone: {
        type: String,
        default: ''
    },

    // Cột 9: Super Admin nào đã tạo account này
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // Cột 10: Organization mà user thuộc về (multi-tenant)
    // SUPER_ADMIN: null (cross-tenant)
    // BUILDING_ADMIN: bắt buộc sau migration
    organization_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null
    }

}, {
    // Tự động thêm 2 cột: createdAt (ngày tạo) và updatedAt (ngày cập nhật)
    timestamps: true
});

// Bước 3: Đúc khuôn thành một Model tên là 'User' rồi xuất ra ngoài cho file khác dùng
module.exports = mongoose.model('User', userSchema);
