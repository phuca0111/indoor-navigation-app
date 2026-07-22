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
    // Phase 8: không bắt buộc nếu đăng nhập Google (google_id)
    password: {
        type: String,
        required: function () {
            return !this.google_id;
        }
    },

    // Phase 8 — Google OAuth (sparse unique: chỉ index khi có giá trị)
    google_id: {
        type: String,
        unique: true,
        sparse: true
    },

    email_verified_at: { type: Date, default: null },
    two_factor: {
        enabled: { type: Boolean, default: false },
        provider: { type: String, enum: ['email', 'totp'], default: 'email' },
        enabled_at: { type: Date, default: null },
        recovery_code_hashes: { type: [String], default: [], select: false }
    },

    // Cột 3: Vai trò của người dùng
    // REGISTERED_USER: tài khoản cá nhân (không thuộc Organization), có Personal Workspace
    role: {
        type: String,
        enum: ['SUPER_ADMIN', 'FINANCE_ADMIN', 'MARKETING_MANAGER', 'ORG_ADMIN', 'BUILDING_ADMIN', 'REGISTERED_USER'],
        default: 'BUILDING_ADMIN'
    },

    // Gói cước cá nhân (chỉ áp dụng cho REGISTERED_USER — Personal Workspace).
    // Role quyết định quyền, Plan quyết định hạn mức tài nguyên — hai khái niệm độc lập.
    // Với ORG_ADMIN/BUILDING_ADMIN, gói cước lấy theo Organization.plan (không dùng trường này).
    // Mã động theo catalog (FREE/PRO + tùy chỉnh như TT) — validate ở service, không enum cứng.
    plan: {
        type: String,
        uppercase: true,
        trim: true,
        default: 'FREE'
    },
    plan_expires_at: {
        type: Date,
        default: null
    },
    // Khóa fulfillment giữ retry thanh toán trực tiếp không gia hạn cùng giao dịch hai lần.
    personal_payment_fulfillments: {
        type: [String],
        default: [],
        select: false
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

    avatar: {
        url: { type: String, default: '', maxlength: 2048 },
        object_key: { type: String, default: '', maxlength: 512 }
    },
    preferences: {
        locale: { type: String, default: 'vi', maxlength: 10 },
        timezone: { type: String, default: 'Asia/Ho_Chi_Minh', maxlength: 64 },
        theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' }
    },
    notification_preferences: {
        email_security: { type: Boolean, default: true },
        email_product: { type: Boolean, default: true },
        in_app: { type: Boolean, default: true }
    },

    // Hồ sơ thanh toán / hóa đơn — tự điền form checkout lần sau
    billing_profile: {
        full_name: { type: String, default: '' },
        company: { type: String, default: '' },
        address: { type: String, default: '' },
        city: { type: String, default: '' },
        country: { type: String, default: '' },
        phone: { type: String, default: '' },
        updated_at: { type: Date, default: null }
    },

    // Cột 9: Super Admin nào đã tạo account này
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // Cột 10: Organization mà user thuộc về (multi-tenant)
    // SUPER_ADMIN: null (cross-tenant)
    // ORG_ADMIN / BUILDING_ADMIN: bắt buộc organization_id sau migration
    organization_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null
    },

    // Phase 7 — tăng mỗi lần logout-all / đổi MK; JWT mang field sv để đối chiếu
    session_version: {
        type: Number,
        default: 0
    },

    // Phase 7 — quên mật khẩu (chỉ lưu hash, không lưu raw token)
    password_reset_token_hash: {
        type: String,
        default: null,
        select: false
    },
    password_reset_expires: {
        type: Date,
        default: null,
        select: false
    },

    // Map Governance P3 — reputation cộng đồng
    map_trust_score: {
        type: Number,
        default: 50,
        min: 0,
        max: 100
    },
    map_trust_level: {
        type: Number,
        default: 3,
        min: 1,
        max: 5
    },
    map_banned_until: {
        type: Date,
        default: null
    },
    map_ban_permanent: {
        type: Boolean,
        default: false
    },
    map_ban_reason: {
        type: String,
        default: '',
        maxlength: 500
    }

}, {
    // Tự động thêm 2 cột: createdAt (ngày tạo) và updatedAt (ngày cập nhật)
    timestamps: true
});

// Bước 3: Đúc khuôn thành một Model tên là 'User' rồi xuất ra ngoài cho file khác dùng
module.exports = mongoose.model('User', userSchema);
