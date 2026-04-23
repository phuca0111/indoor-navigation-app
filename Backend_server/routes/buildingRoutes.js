// ============================================
// FILE: buildingRoutes.js
// MỤC ĐÍCH: BIỂN BÁO CHỈ ĐƯỜNG cho API Tòa nhà
// ============================================

const express = require('express');
const router = express.Router();

const { getBuildings, createBuilding, checkLocation } = require('../controllers/buildingController');
const { auth } = require('../middlewares/auth');

// Đường 1: Lấy danh sách tòa nhà (Quản trị viên)
router.get('/', auth, getBuildings);

// Đường 1.1: Lấy danh sách tòa nhà cho App Di động (Công khai)
router.get('/public', getBuildings);

// Đường 2: Tạo tòa nhà mới (Phải đăng nhập)
router.post('/', auth, createBuilding);

// Đường 3: App Android kiểm tra GPS (Không cần đăng nhập)
router.get('/check-location', checkLocation);

module.exports = router;
