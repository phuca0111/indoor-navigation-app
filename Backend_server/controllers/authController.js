// ============================================
// FILE: authController.js
// MỤC ĐÍCH: NÃO BỘ xử lý logic Đăng Ký và Đăng Nhập
// FILE NÀY CHỨA 2 HÀM: register (tạo tài khoản) và login (đăng nhập lấy thẻ)
// ============================================

const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const RefreshToken = require('../models/RefreshToken');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// WHY: Tránh bị buộc đăng nhập lại sau mỗi 15 phút.
// Có thể override bằng ENV JWT_ACCESS_EXPIRES_IN (ví dụ: 12h, 7d).
const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '7d';

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

        // Bước 5: Tạo access token (mặc định 7 ngày) + refresh token (7 ngày)
        const accessToken = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
        );

        const rawRefresh  = crypto.randomBytes(40).toString('hex');
        const tokenHash   = crypto.createHash('sha256').update(rawRefresh).digest('hex');
        const expiresAt   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 ngày

        await RefreshToken.create({
            user_id:    user._id,
            token_hash: tokenHash,
            expires_at: expiresAt,
            ip_address: req.ip || ''
        });

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

        // Bước 7: Trả token về (access + refresh)
        res.status(200).json({
            message:      'Đăng nhập thành công!',
            token:        accessToken,
            refreshToken: rawRefresh,
            user: {
                id:    user._id,
                email: user.email,
                role:  user.role
            }
        });

    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// HÀM 3: REFRESH TOKEN — Gia hạn access token
// ==========================================
const refresh = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ message: 'Thiếu refresh token!' });

        const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const record = await RefreshToken.findOne({ token_hash: tokenHash, is_revoked: false });

        if (!record || record.expires_at < new Date()) {
            return res.status(401).json({ message: 'Refresh token không hợp lệ hoặc đã hết hạn!' });
        }

        const user = await User.findById(record.user_id);
        if (!user || !user.is_active) {
            return res.status(401).json({ message: 'Tài khoản không tồn tại hoặc đã bị khóa!' });
        }

        const newAccessToken = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
        );

        res.status(200).json({ token: newAccessToken });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// HÀM 4: LOGOUT — Thu hồi refresh token
// ==========================================
const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (refreshToken) {
            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            await RefreshToken.updateOne({ token_hash: tokenHash }, { is_revoked: true });
        }
        logActivity({
            user_id:     req.user ? req.user.userId : null,
            action:      'LOGOUT',
            target_type: 'user',
            target_id:   req.user ? String(req.user.userId) : '',
            ip_address:  req.ip || ''
        });
        res.status(200).json({ message: 'Đăng xuất thành công!' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// HÀM 5: UNLOCK SESSION — Mở khóa editor bằng mật khẩu
// ==========================================
const unlockSession = async (req, res) => {
    try {
        const { password } = req.body || {};
        if (!password) {
            return res.status(400).json({ success: false, message: 'Thiếu mật khẩu.' });
        }

        const userId = req.user && req.user.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ.' });
        }

        const user = await User.findById(userId);
        if (!user || !user.is_active) {
            return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị khóa.' });
        }

        // Hỗ trợ tương thích account dev cũ lưu plain-text.
        const passwordOk = await bcrypt.compare(password, user.password).catch(() => false) || (user.password === password);
        if (!passwordOk) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password',
                // WHY: Cho frontend biết chính xác đang verify mật khẩu cho account nào,
                // giúp debug trường hợp user nghĩ mình đăng nhập account A nhưng token lại là account B.
                unlockUser: { id: String(user._id), email: user.email }
            });
        }

        logActivity({
            user_id: user._id,
            action: 'UNLOCK_SESSION',
            target_type: 'user',
            target_id: String(user._id),
            target: user.email,
            ip_address: req.ip || ''
        });

        return res.status(200).json({
            success: true,
            unlockUser: { id: String(user._id), email: user.email }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ: ' + error.message });
    }
};

module.exports = { register, login, refresh, logout, unlockSession };
