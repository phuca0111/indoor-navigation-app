// ============================================
// FILE: authRoutes.js
// MỤC ĐÍCH: TẤM BIỂN BÁO CHỈ ĐƯỜNG cho các link URL đăng nhập/đăng ký
// ============================================

const express = require('express');
const router = express.Router();   // Tạo 1 tấm biển báo mới

// Lôi não bộ xử lý từ controllers ra
const { register, login, refresh, logout, unlockSession } = require('../controllers/authController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

router.post('/login',    login);                          // Public
router.post('/register', auth, requireSuperAdmin, register); // Chỉ Super Admin
router.post('/refresh',  refresh);                        // Public — dùng refreshToken
router.post('/logout',   logout);                         // Public — có thể không cần token
router.post('/unlock-session', auth, unlockSession);      // Private — mở khóa editor bằng password

module.exports = router;
