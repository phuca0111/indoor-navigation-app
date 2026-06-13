// ============================================
// FILE: buildingRoutes.js
// MỤC ĐÍCH: BIỂN BÁO CHỈ ĐƯỜNG cho API Tòa nhà
// ============================================

const express = require('express');
const router = express.Router();

const { getBuildings, createBuilding, updateBuilding, deleteBuilding, checkLocation } = require('../controllers/buildingController');
const { auth } = require('../middlewares/auth');

router.get('/',                auth, getBuildings);    // Web Admin — phải đăng nhập để thấy DRAFT
router.get('/public',          getBuildings);          // Android public — chỉ thấy PUBLISHED
router.get('/check-location',  checkLocation);         // Android kiểm tra GPS

router.post('/',       auth, createBuilding);          // Tạo mới — phải đăng nhập
router.put('/:id',     auth, updateBuilding);          // Sửa — phải đăng nhập
router.delete('/:id',  auth, deleteBuilding);          // Xóa — phải đăng nhập

module.exports = router;
