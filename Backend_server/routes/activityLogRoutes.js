const express = require('express');
const router  = express.Router();
const { getLogs } = require('../controllers/activityLogController');
const { auth, requireAdmin } = require('../middlewares/auth');

// Super Admin: toàn hệ thống; Org Admin: log trong org (2.6)
router.get('/', auth, requireAdmin, getLogs);

module.exports = router;
