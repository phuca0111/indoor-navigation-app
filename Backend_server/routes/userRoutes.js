// ============================================
// FILE: userRoutes.js
// MỤC ĐÍCH: BIỂN BÁO CHỈ ĐƯỜNG cho API Quản lý Tài khoản (Chỉ SUPER ADMIN được vào)
// ============================================

const express = require('express');
const router = express.Router();

const { getUsers, updateUser, deleteUser } = require('../controllers/userController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

// Bắt buộc tất cả các đường dẫn ở đây phải đi qua 2 trạm gác:
// 1. Phải có Thẻ (auth)
// 2. Thẻ đó phải là của SUPER ADMIN (requireSuperAdmin)
router.use(auth, requireSuperAdmin);

// Đường 1: Xem danh sách Admin (GET /api/users)
router.get('/', getUsers);

// Đường 2: Sửa tài khoản (Gán tòa nhà, khóa/mở) (PUT /api/users/:userId)
router.put('/:userId', updateUser);

// Đường 3: Xóa tài khoản (DELETE /api/users/:userId)
router.delete('/:userId', deleteUser);

module.exports = router;
