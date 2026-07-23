/**
 * GĐ5 — Moderation dashboard API
 * GET /api/moderation/queues/:type
 * GET /api/moderation/stats
 * POST /api/moderation/items/:type/:id/escalate
 */
const express = require('express');
const router = express.Router();
const {
  listQueue,
  escalateItem,
  queueStats
} = require('../controllers/placeModerationController');
const {
  approveProposal,
  rejectProposal
} = require('../controllers/placeRegistryController');
const { auth, requirePermission, requireAnyPermission } = require('../middlewares/auth');
const { P } = require('../utils/permissions');

router.use(auth);

router.get(
  '/stats',
  requireAnyPermission(P.PLACE_MODERATE, P.PLATFORM_MODERATION_MANAGE, P.ORG_USERS_MANAGE),
  queueStats
);
router.get(
  '/queues/:type',
  requireAnyPermission(P.PLACE_MODERATE, P.PLATFORM_MODERATION_MANAGE, P.ORG_USERS_MANAGE),
  listQueue
);
router.post(
  '/items/:type/:id/escalate',
  requirePermission(P.PLACE_MODERATE),
  escalateItem
);

// Convenience: approve/reject proposal từ moderation UI
router.post(
  '/items/proposals/:id/approve',
  requirePermission(P.PLACE_MODERATE),
  approveProposal
);
router.post(
  '/items/proposals/:id/reject',
  requirePermission(P.PLACE_MODERATE),
  rejectProposal
);

module.exports = router;
