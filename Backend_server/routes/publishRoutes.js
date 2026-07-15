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
  getJobStatus
} = require('../controllers/publishController');
const { auth } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');
const { publishLimiter } = require('../middlewares/rateLimit');

router.post(
  '/buildings/:buildingId/floors/:floor/publish/validate',
  auth,
  requireBuildingAccess,
  validatePublish
);

router.post(
  '/buildings/:buildingId/floors/:floor/publish',
  auth,
  publishLimiter,
  requireBuildingAccess,
  enqueuePublish
);

router.get('/publish-jobs/:jobId', auth, getJobStatus);

module.exports = router;
