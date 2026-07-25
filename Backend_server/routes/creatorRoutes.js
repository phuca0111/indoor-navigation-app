const express = require('express');
const { auth, requirePermission, P } = require('../middlewares/auth');
const { meStats } = require('../controllers/creatorController');

/**
 * Creator API (module B)
 * GET /api/creator/me/stats — JWT + creator.stats.read
 * Response: { funnel, stats, placeholders, note }
 */
const router = express.Router();
router.use(auth);
router.get('/me/stats', requirePermission(P.CREATOR_STATS_READ), meStats);

module.exports = router;
