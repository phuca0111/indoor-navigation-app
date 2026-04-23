// ============================================
// FILE: authRoutes.js
// MỤC ĐÍCH: TẤM BIỂN BÁO CHỈ ĐƯỜNG cho các link URL đăng nhập/đăng ký
// ============================================

const express = require('express');
const router = express.Router();   // Tạo 1 tấm biển báo mới

// Lôi não bộ xử lý từ controllers ra
const { register, login } = require('../controllers/authController');

// Lôi ông bảo vệ và kiểm tra quyền ra
const { auth, requireSuperAdmin } = require('../middlewares/auth');

// ==========================================
// ĐĂNG KÝ CÁC ĐƯỜNG DẪN (ROUTES)
// ==========================================

// Đường 1: Đăng nhập (Ai cũng được gõ, không cần thẻ)
// Khi ai gửi POST tới /api/auth/login -> Dẫn về hàm login trong não bộ
router.post('/login', login);

// Đường 2: Đăng ký tài khoản mới (CHỈ Super Admin mới được tạo)
// Phải đi qua 2 trạm: Ông bảo vệ soi thẻ (auth) -> Kiểm tra quyền (requireSuperAdmin) -> Não bộ register
router.post('/register', auth, requireSuperAdmin, register);

// Xuất tấm biển báo ra ngoài cho server.js gắn vào
module.exports = router;
