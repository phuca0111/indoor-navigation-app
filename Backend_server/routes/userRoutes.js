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
  changePassword,
  adminResetPassword
} = require('../controllers/userController');
const { auth, requireAdmin } = require('../middlewares/auth');

// Route cho current user profile — chỉ cần auth, không phải Super Admin
router.get('/me', auth, getMe);
router.put('/me', auth, updateMe);
router.put('/me/password', auth, changePassword);

// Admin routes: Super Admin toàn hệ thống, Org Admin trong org (2.6)
router.use(auth, requireAdmin);

router.get('/', getUsers);
router.put('/:userId/reset-password', adminResetPassword);
router.get('/:userId', getUserById);
router.put('/:userId', updateUser);

module.exports = router;
