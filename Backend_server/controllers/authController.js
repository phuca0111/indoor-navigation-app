// ============================================
// FILE: authController.js
// MỤC ĐÍCH: NÃO BỘ xử lý logic Đăng Ký và Đăng Nhập
// FILE NÀY CHỨA 2 HÀM: register (tạo tài khoản) và login (đăng nhập lấy thẻ)
// ============================================

const User = require('../models/User');
const Organization = require('../models/Organization');
const Building = require('../models/Building');
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

function validateRegisterInput(fullName, email, password, confirmPassword) {
    const errors = [];
    if (!fullName || fullName.trim() === '') {
        errors.push('Họ tên là bắt buộc.');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('Email không hợp lệ.');
    }
    if (!password || password.length < 8) {
        errors.push('Mật khẩu phải có ít nhất 8 ký tự.');
    }
    if (!/(?=.*[a-z])/.test(password)) {
        errors.push('Mật khẩu phải chứa ít nhất 1 chữ thường.');
    }
    if (!/(?=.*[A-Z])/.test(password)) {
        errors.push('Mật khẩu phải chứa ít nhất 1 chữ hoa.');
    }
    if (!/(?=.*\d)/.test(password)) {
        errors.push('Mật khẩu phải chứa ít nhất 1 số.');
    }
    if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) {
        errors.push('Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt.');
    }
    if (password !== confirmPassword) {
        errors.push('Xác nhận mật khẩu không khớp.');
    }
    return errors;
}

// Đăng ký công khai — is_active=false, chờ Super Admin duyệt (Phase 1A)
const registerPublic = async (req, res) => {
    try {
        const { fullName, email, password, confirmPassword } = req.body;

        const validationErrors = validateRegisterInput(fullName, email, password, confirmPassword);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                message: 'Dữ liệu không hợp lệ.',
                errors: validationErrors
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email này đã được đăng ký rồi!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            email,
            password: hashedPassword,
            role: 'BUILDING_ADMIN',
            full_name: fullName.trim(),
            is_active: false,
            assigned_buildings: [],
            created_by: null
        });

        logActivity({
            user_id: newUser._id,
            action: 'REGISTER',
            target_type: 'user',
            target_id: String(newUser._id),
            target: newUser.email,
            ip_address: req.ip || ''
        });

        res.status(201).json({
            message: 'Đăng ký thành công, tài khoản đang chờ quản trị viên duyệt.',
            user: {
                id: newUser._id,
                email: newUser.email,
                role: newUser.role,
                is_active: newUser.is_active
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// ==========================================
// HÀM 1: ĐĂNG KÝ TÀI KHOẢN MỚI (REGISTER)
// ==========================================
// Super Admin hoặc Org Admin tạo tài khoản nhân viên
const register = async (req, res) => {
    try {
        const { email, password, role, full_name, phone, organization_id, assigned_buildings } = req.body;
        const callerRole = req.user?.role;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: 'Email không hợp lệ.' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 8 ký tự.' });
        }
        if (!full_name || full_name.trim() === '') {
            return res.status(400).json({ message: 'Họ tên không được để trống.' });
        }
        if (phone !== undefined && phone !== null && phone !== '' && typeof phone !== 'string') {
            return res.status(400).json({ message: 'Số điện thoại phải là chuỗi.' });
        }
        if (phone && !/^[0-9\+\-\s]{1,20}$/.test(phone)) {
            return res.status(400).json({ message: 'Số điện thoại không hợp lệ.' });
        }

        const userDaTonTai = await User.findOne({ email: email.trim() });
        if (userDaTonTai) {
            return res.status(400).json({ message: 'Email này đã được đăng ký rồi!' });
        }

        let targetRole = role || 'BUILDING_ADMIN';
        let targetOrgId = organization_id || null;
        let targetBuildings = Array.isArray(assigned_buildings) ? assigned_buildings : [];

        if (callerRole === 'ORG_ADMIN') {
            if (targetRole !== 'BUILDING_ADMIN') {
                return res.status(403).json({ message: 'Org Admin chỉ được tạo tài khoản BUILDING_ADMIN.' });
            }
            const me = await User.findById(req.user.userId).select('organization_id').lean();
            if (!me?.organization_id) {
                return res.status(403).json({ message: 'Tài khoản ORG_ADMIN chưa được gán tổ chức.' });
            }
            targetRole = 'BUILDING_ADMIN';
            targetOrgId = me.organization_id;
            if (organization_id !== undefined && organization_id !== null &&
                String(organization_id) !== String(targetOrgId)) {
                return res.status(403).json({ message: 'Org Admin không được gán user sang tổ chức khác.' });
            }
        } else if (callerRole === 'SUPER_ADMIN') {
            const validRoles = ['SUPER_ADMIN', 'ORG_ADMIN', 'BUILDING_ADMIN'];
            if (!validRoles.includes(targetRole)) {
                return res.status(400).json({ message: `role phải là: ${validRoles.join(', ')}` });
            }
            if (targetRole === 'SUPER_ADMIN') {
                targetOrgId = null;
                targetBuildings = [];
            } else if (!targetOrgId) {
                return res.status(400).json({ message: `${targetRole} bắt buộc phải có organization_id.` });
            }
        } else {
            return res.status(403).json({ message: 'Bạn không có quyền tạo tài khoản.' });
        }

        if (targetOrgId) {
            const org = await Organization.findById(targetOrgId).select('is_active name').lean();
            if (!org) {
                return res.status(400).json({ message: 'Organization không tồn tại.' });
            }
            if (!org.is_active) {
                return res.status(400).json({ message: 'Organization đã bị vô hiệu hóa.' });
            }
        }

        if (targetRole === 'BUILDING_ADMIN' && targetBuildings.length > 0 && targetOrgId) {
            const buildings = await Building.find({ _id: { $in: targetBuildings } }).select('organization_id');
            const mismatched = buildings.filter(b => String(b.organization_id) !== String(targetOrgId));
            if (mismatched.length > 0) {
                return res.status(400).json({
                    message: 'Một số tòa nhà không thuộc organization của user.',
                    mismatched_building_ids: mismatched.map(b => b._id)
                });
            }
        }

        const matKhauDaNghien = await bcrypt.hash(password, 10);

        const userMoi = await User.create({
            email: email.trim(),
            password: matKhauDaNghien,
            role: targetRole,
            full_name: full_name.trim(),
            phone: phone ? String(phone).trim() : '',
            organization_id: targetOrgId,
            assigned_buildings: targetRole === 'BUILDING_ADMIN' ? targetBuildings : [],
            is_active: true,
            created_by: req.user ? req.user.userId : null
        });

        logActivity({
            user_id: req.user ? req.user.userId : userMoi._id,
            action: 'CREATE_USER',
            target_type: 'user',
            target_id: String(userMoi._id),
            target: userMoi.email,
            details: {
                role: userMoi.role,
                organization_id: userMoi.organization_id ? String(userMoi.organization_id) : null,
                assigned_buildings: (userMoi.assigned_buildings || []).map(String)
            },
            ip_address: req.ip || '',
            organization_id: userMoi.organization_id ? String(userMoi.organization_id) : undefined
        });

        res.status(201).json({
            message: 'Tạo tài khoản thành công!',
            user: {
                id: userMoi._id,
                email: userMoi.email,
                role: userMoi.role,
                full_name: userMoi.full_name,
                organization_id: userMoi.organization_id
            }
        });

    } catch (error) {
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
            ip_address:  req.ip || '',
            organization_id: user.organization_id || undefined
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
        let userId = null;

        // Ưu tiên JWT access token (dashboard gửi qua Authorization khi đăng xuất)
        try {
            const authHeader = req.headers.authorization;
            if (authHeader) {
                const token = authHeader.split(' ')[1];
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    userId = decoded.userId;
                } catch (_) {
                    // Token hết hạn vẫn decode để ghi log đăng xuất
                    const decoded = jwt.decode(token);
                    if (decoded?.userId) userId = decoded.userId;
                }
            }
        } catch (_) { /* bỏ qua */ }

        if (refreshToken) {
            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            const record = await RefreshToken.findOne({ token_hash: tokenHash });
            if (record) {
                if (!record.is_revoked) {
                    await RefreshToken.updateOne({ token_hash: tokenHash }, { is_revoked: true });
                }
                if (!userId) userId = record.user_id;
            }
        }

        if (userId) {
            const user = await User.findById(userId).select('email organization_id').lean();
            logActivity({
                user_id:     userId,
                action:      'LOGOUT',
                target_type: 'user',
                target_id:   String(userId),
                target:      user?.email || '',
                ip_address:  req.ip || '',
                organization_id: user?.organization_id || undefined
            });
        }

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
            ip_address: req.ip || '',
            organization_id: user.organization_id || undefined
        });

        return res.status(200).json({
            success: true,
            unlockUser: { id: String(user._id), email: user.email }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ: ' + error.message });
    }
};

module.exports = { register, login, refresh, logout, unlockSession, registerPublic };
