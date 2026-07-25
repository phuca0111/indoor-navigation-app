// ============================================
// FILE: buildingRoutes.js
// MỤC ĐÍCH: BIỂN BÁO CHỈ ĐƯỜNG cho API Tòa nhà
// ============================================

const express = require('express');
const router = express.Router();

const {
  getBuildings,
  getBuildingById,
  getBuildingExplorer,
  searchIndoorPois,
  createBuilding,
  updateBuilding,
  patchBuildingFloors,
  renameBuildingFloor,
  duplicateBuildingFloor,
  deleteBuilding,
  restoreBuilding,
  checkLocation
} = require('../controllers/buildingController');
const { auth, requireAdmin, requireBuildingCreator } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');

router.get('/',                auth, getBuildings);    // Web Admin — phải đăng nhập để thấy DRAFT
router.get('/public',          getBuildings);          // Android public — chỉ thấy PUBLISHED
router.get('/check-location',  checkLocation);         // Android kiểm tra GPS
// GĐ4 — Indoor Search public (trước /:id)
router.get('/indoor-search',   searchIndoorPois);
// GĐ2 — Building Explorer (public, chỉ PUBLISHED); phải trước /:id có auth
router.get('/:id/explorer',    getBuildingExplorer);

router.get('/:id',             auth, requireBuildingAccess, getBuildingById);

router.post('/',       auth, requireBuildingCreator, createBuilding);

// Floor lifecycle: thêm/bớt tầng đuôi (SUPER/ORG — BUILDING_ADMIN bị chặn trong controller)
router.patch('/:id/floors', auth, requireBuildingAccess, patchBuildingFloors);
// F6 — nhân bản tầng (thêm tầng đuôi + copy map vào draft); BUILDING_ADMIN bị chặn trong controller
router.post('/:id/floors/duplicate', auth, requireBuildingAccess, duplicateBuildingFloor);
// F2 — đổi tên tầng (BUILDING_ADMIN được phép nếu có building access)
router.patch('/:id/floors/:floorNumber', auth, requireBuildingAccess, renameBuildingFloor);

// Update: chỉ user có quyền trên building (SUPER_ADMIN hoặc assigned) mới được sửa
router.put('/:id',     auth, requireBuildingAccess, updateBuilding);

// Delete: SUPER_ADMIN mọi tòa; ORG_ADMIN tòa trong org (requireBuildingAccess); BUILDING_ADMIN bị chặn trong controller
router.delete('/:id',  auth, requireBuildingAccess, deleteBuilding);

// Restore: cho phép trên tòa inactive — RBAC trong controller (Phase 4.4)
router.post('/:id/restore', auth, restoreBuilding);

module.exports = router;
