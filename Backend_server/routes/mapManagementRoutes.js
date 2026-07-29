const express = require('express');
const router = express.Router();
const { getStats } = require('../controllers/mapManagementController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

// P2.2 — thống kê vận hành bản đồ toàn nền tảng (tách khỏi /api/map-moderation/stats)
router.get('/stats', auth, requireSuperAdmin, getStats);

module.exports = router;
