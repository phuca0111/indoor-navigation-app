const express = require('express');
const router = express.Router();
const { getLogs } = require('../controllers/activityLogController');
const { auth, requirePermission, P } = require('../middlewares/auth');

// Super / Org / Finance (có platform.logs.read); scope theo role + stream
router.get('/', auth, requirePermission(P.PLATFORM_LOGS_READ), getLogs);

module.exports = router;
