const express = require('express');
const router  = express.Router();
const { getLogs } = require('../controllers/activityLogController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

// Chỉ Super Admin được xem lịch sử thao tác
router.get('/', auth, requireSuperAdmin, getLogs);

module.exports = router;
