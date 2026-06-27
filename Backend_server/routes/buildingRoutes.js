// ============================================
// FILE: buildingRoutes.js
// MỤC ĐÍCH: BIỂN BÁO CHỈ ĐƯỜNG cho API Tòa nhà
// ============================================

const express = require('express');
const router = express.Router();

const { getBuildings, createBuilding, updateBuilding, deleteBuilding, checkLocation } = require('../controllers/buildingController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');

router.get('/',                auth, getBuildings);    // Web Admin — phải đăng nhập để thấy DRAFT
router.get('/public',          getBuildings);          // Android public — chỉ thấy PUBLISHED
router.get('/check-location',  checkLocation);         // Android kiểm tra GPS

router.post('/',       auth, createBuilding);          // Tạo mới — phải đăng nhập

// Update: chỉ user có quyền trên building (SUPER_ADMIN hoặc assigned) mới được sửa
router.put('/:id',     auth, requireBuildingAccess, updateBuilding);

// Delete: chỉ SUPER_ADMIN được xóa (hard delete)
router.delete('/:id',  auth, requireSuperAdmin, deleteBuilding);

module.exports = router;
