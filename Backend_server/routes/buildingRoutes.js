// ============================================
// FILE: buildingRoutes.js
// MỤC ĐÍCH: BIỂN BÁO CHỈ ĐƯỜNG cho API Tòa nhà
// ============================================

const express = require('express');
const router = express.Router();

const { getBuildings, getBuildingById, createBuilding, updateBuilding, deleteBuilding, checkLocation } = require('../controllers/buildingController');
const { auth, requireAdmin } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');

router.get('/',                auth, getBuildings);    // Web Admin — phải đăng nhập để thấy DRAFT
router.get('/public',          getBuildings);          // Android public — chỉ thấy PUBLISHED
router.get('/check-location',  checkLocation);         // Android kiểm tra GPS

router.get('/:id',             auth, requireBuildingAccess, getBuildingById);

router.post('/',       auth, requireAdmin, createBuilding);

// Update: chỉ user có quyền trên building (SUPER_ADMIN hoặc assigned) mới được sửa
router.put('/:id',     auth, requireBuildingAccess, updateBuilding);

// Delete: SUPER_ADMIN mọi tòa; ORG_ADMIN tòa trong org (requireBuildingAccess); BUILDING_ADMIN bị chặn trong controller
router.delete('/:id',  auth, requireBuildingAccess, deleteBuilding);

module.exports = router;
