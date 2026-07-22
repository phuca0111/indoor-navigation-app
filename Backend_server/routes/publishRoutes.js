// ============================================
// FILE: publishRoutes.js
// Phase 2c — Publish validate + async job
// Mount: app.use('/api/v1', publishRoutes)
// ============================================

const express = require('express');
const router = express.Router();
const {
  validatePublish,
  enqueuePublish,
  getJobStatus,
  listJobs,
  retryJob
} = require('../controllers/publishController');
const { auth, requirePermission, P } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');
const { publishLimiter } = require('../middlewares/rateLimit');

router.post(
  '/buildings/:buildingId/floors/:floor/publish/validate',
  auth,
  requirePermission(P.BUILDING_PUBLISH),
  requireBuildingAccess,
  validatePublish
);

router.post(
  '/buildings/:buildingId/floors/:floor/publish',
  auth,
  publishLimiter,
  requirePermission(P.BUILDING_PUBLISH),
  requireBuildingAccess,
  enqueuePublish
);

router.get('/publish-jobs', auth, requirePermission(P.BUILDING_PUBLISH), listJobs);
router.get('/publish-jobs/:jobId', auth, requirePermission(P.BUILDING_PUBLISH), getJobStatus);
router.post('/publish-jobs/:jobId/retry', auth, publishLimiter, requirePermission(P.BUILDING_PUBLISH), retryJob);

module.exports = router;
