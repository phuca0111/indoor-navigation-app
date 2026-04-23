// ============================================
// FILE: authController.js
// MỤC ĐÍCH: NÃO BỘ xử lý logic Đăng Ký và Đăng Nhập
// FILE NÀY CHỨA 2 HÀM: register (tạo tài khoản) và login (đăng nhập lấy thẻ)
// ============================================

const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function logActivity(data) {
    ActivityLog.create(data).catch(() => {});  // fire-and-forget
}

// ==========================================
// HÀM 1: ĐĂNG KÝ TÀI KHOẢN MỚI (REGISTER)
// ==========================================
// Khi Super Admin muốn tạo tài khoản cho nhân viên quản trị tòa nhà
const register = async (req, res) => {
    try {
        // Bước 1: Lấy thông tin người dùng gửi lên từ form Web
        const { email, password, role } = req.body;

        // Bước 2: Kiểm tra xem email này đã có ai đăng ký trước đó chưa
        const userDaTonTai = await User.findOne({ email: email });
        if (userDaTonTai) {
            // Nếu đã tồn tại -> Từ chối, báo lỗi
            return res.status(400).json({ message: 'Email này đã được đăng ký rồi!' });
        }

        // Bước 3: Ném mật khẩu gốc vào máy xay bcrypt nghiền nát
        // Số 10 là độ mạnh của máy xay (càng cao càng an toàn nhưng càng chậm)
        const matKhauDaNghien = await bcrypt.hash(password, 10);

        // Bước 4: Tạo 1 dòng dữ liệu mới trong bảng User của MongoDB
        const userMoi = await User.create({
            email:      email,
            password:   matKhauDaNghien,
            role:       role || 'BUILDING_ADMIN',
            full_name:  req.body.full_name || '',
            created_by: req.user ? req.user.userId : null
        });

        // Ghi log CREATE_USER
        logActivity({
            user_id:     req.user ? req.user.userId : userMoi._id,
            action:      'CREATE_USER',
            target_type: 'user',
            target_id:   String(userMoi._id),
            target:      userMoi.email,
            ip_address:  req.ip || ''
        });

        // Bước 5: Báo thành công về cho Web
        res.status(201).json({
            message: 'Tạo tài khoản thành công!',
            user: {
                id: userMoi._id,
                email: userMoi.email,
                role: userMoi.role
            }
        });

    } catch (error) {
        // Nếu xảy ra lỗi bất ngờ (mất mạng, DB sập...) -> Báo lỗi server
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// HÀM 2: ĐĂNG NHẬP (LOGIN) - Lấy Thẻ Từ JWT
// ==========================================
// Khi Admin gõ Email + Mật khẩu trên giao diện Web Admin
const login = async (req, res) => {
    try {
        // Bước 1: Lấy email và mật khẩu người dùng vừa gõ
        const { email, password } = req.body;

        // Bước 2: Lục bảng User trong MongoDB tìm xem có ai có email này không
        const user = await User.findOne({ email: email });
        if (!user) {
            // Không tìm thấy email -> Từ chối
            return res.status(400).json({ message: 'Email không tồn tại trong hệ thống!' });
        }

        // Bước 3: Kiểm tra tài khoản có bị khóa không
        if (!user.is_active) {
            return res.status(403).json({ message: 'Tài khoản đã bị Super Admin khóa!' });
        }

        // BƯỚC 4: So sánh mật khẩu
        let matKhauDung = await bcrypt.compare(password, user.password);
        
        // --- ĐOẠN CODE CỬA HẬU DÀNH CHO LẦN DEV ĐẦU TIÊN TẠO ADMIN BẰNG TAY (COMPASS) ---
        if (user.password === password) {
            matKhauDung = true;
        }
        // -------------------------------------------------------------------------

        if (!matKhauDung) {
            // Sai mật khẩu -> Từ chối
            return res.status(400).json({ message: 'Mật khẩu không đúng!' });
        }

        // Bước 5: Mật khẩu đúng! -> Bật máy in JWT đúc ra 1 tấm Thẻ Từ
        // Thẻ này chứa: ID người dùng + Vai trò (Admin hay Super Admin)
        // Thẻ có hạn sử dụng 24 giờ, sau 24h phải đăng nhập lại
        const token = jwt.sign(
            { userId: user._id, role: user.role },   // Thông tin nhét vào trong thẻ
            process.env.JWT_SECRET,                    // Con dấu bí mật lấy từ két .env
            { expiresIn: '24h' }                       // Hạn sử dụng: 24 giờ
        );

        // Bước 6: Cập nhật thời gian đăng nhập gần nhất
        user.last_login = new Date();
        await user.save();

        // Ghi log LOGIN
        logActivity({
            user_id:     user._id,
            action:      'LOGIN',
            target_type: 'user',
            target_id:   String(user._id),
            target:      user.email,
            ip_address:  req.ip || ''
        });

        // Bước 7: Trả Thẻ Từ JWT về cho trình duyệt Web
        res.status(200).json({
            message: 'Đăng nhập thành công!',
            token: token,
            user: {
                id: user._id,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// Đóng gói 2 hàm này lại, xuất ra ngoài cho file khác gọi dùng
module.exports = { register, login };
