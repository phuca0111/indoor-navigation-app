// ============================================
// FILE: mapRoutes.js
// MỤC ĐÍCH: BIỂN BÁO CHỈ ĐƯỜNG cho API Bản đồ
// ============================================

const express = require('express');
const router = express.Router();

const { saveMap, loadMap, downloadMap } = require('../controllers/mapController');
const { auth } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');

// PUBLIC ROUTES — đặt trước để không bị generic :buildingId match trước
// Android/Public có thể tải bản đồ mà không cần đăng nhập
router.get('/:buildingId/:floor/public', loadMap);
router.get('/:buildingId/download', downloadMap);

// PRIVATE ROUTES — yêu cầu xác thực và quyền truy cập building
// Web Editor (login) — chỉ user có quyền trên building mới được load/publish
router.get('/:buildingId/:floor', auth, requireBuildingAccess, loadMap);
router.post('/:buildingId/:floor/publish', auth, requireBuildingAccess, saveMap);

module.exports = router;
