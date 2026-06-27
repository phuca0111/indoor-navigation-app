// ============================================
// FILE: userRoutes.js
// MỤC ĐÍCH: BIỂN BÁO CHỈ ĐƯỜNG cho API Quản lý Tài khoản (Chỉ SUPER ADMIN được vào)
// ============================================

const express = require('express');
const router = express.Router();

const {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getMe,
  updateMe,
  changePassword
} = require('../controllers/userController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

// Route cho current user profile — chỉ cần auth, không phải Super Admin
router.get('/me', auth, getMe);
router.put('/me', auth, updateMe);
router.put('/me/password', auth, changePassword); // Change own password

// Admin-only routes (Super Admin)
router.use(auth, requireSuperAdmin);

// Đường 1: Xem danh sách User (GET /api/users) — Super Admin only
router.get('/', getUsers);

// Đường 2: Xem chi tiết 1 user (GET /api/users/:userId) — Super Admin only
router.get('/:userId', getUserById);

// Đường 3: Sửa tài khoản (Gán tòa nhà, khóa/mở, chỉnh role) (PUT /api/users/:userId) — Super Admin only
router.put('/:userId', updateUser);

module.exports = router;
