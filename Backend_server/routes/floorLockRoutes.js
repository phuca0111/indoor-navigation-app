// ============================================
// FILE: floorLockRoutes.js
// Phase 2b — Lock API đời mới (Redis / memory)
// Mount: app.use('/api/v1', floorLockRoutes)
// Full: /api/v1/buildings/:buildingId/floors/:floor/lock
// ============================================

const express = require('express');
const router = express.Router();
const {
  acquireLock,
  heartbeatLock,
  releaseLock,
  getLockStatus
} = require('../controllers/floorLockController');
const { auth } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');

router.get('/buildings/:buildingId/floors/:floor/lock', auth, requireBuildingAccess, getLockStatus);
router.post('/buildings/:buildingId/floors/:floor/lock', auth, requireBuildingAccess, acquireLock);
router.post(
  '/buildings/:buildingId/floors/:floor/lock/heartbeat',
  auth,
  requireBuildingAccess,
  heartbeatLock
);
router.post(
  '/buildings/:buildingId/floors/:floor/lock/release',
  auth,
  requireBuildingAccess,
  releaseLock
);

module.exports = router;
