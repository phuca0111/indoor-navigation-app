// ============================================
// FILE: mapRoutes.js
// MỤC ĐÍCH: BIỂN BÁO CHỈ ĐƯỜNG cho API Bản đồ
// ============================================

const express = require('express');
const router = express.Router();

const { saveMap, loadMap, downloadMap, saveDraft, getDraft } = require('../controllers/mapController');
const {
  acquireLock,
  heartbeatLock,
  releaseLock,
  getLockStatus
} = require('../controllers/floorLockController');
const { auth } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');
const { publishLimiter } = require('../middlewares/rateLimit');

// PUBLIC ROUTES — đặt trước để không bị generic :buildingId match trước
// Android/Public có thể tải bản đồ mà không cần đăng nhập
router.get('/:buildingId/:floor/public', loadMap);
router.get('/:buildingId/download', downloadMap);

// PRIVATE ROUTES — yêu cầu xác thực và quyền truy cập building
// Phase 8 — draft (đặt trước GET :floor generic)
router.get('/:buildingId/:floor/draft', auth, requireBuildingAccess, getDraft);
router.put('/:buildingId/:floor/draft', auth, requireBuildingAccess, saveDraft);

// Phase 8 — floor edit lock
router.get('/:buildingId/:floor/lock', auth, requireBuildingAccess, getLockStatus);
router.post('/:buildingId/:floor/lock', auth, requireBuildingAccess, acquireLock);
router.post('/:buildingId/:floor/lock/heartbeat', auth, requireBuildingAccess, heartbeatLock);
router.post('/:buildingId/:floor/lock/release', auth, requireBuildingAccess, releaseLock);

// Web Editor (login) — chỉ user có quyền trên building mới được load/publish
router.get('/:buildingId/:floor', auth, requireBuildingAccess, loadMap);
router.post('/:buildingId/:floor/publish', auth, publishLimiter, requireBuildingAccess, saveMap);

module.exports = router;
