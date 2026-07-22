const express = require('express');
const { auth, requirePermission, P } = require('../middlewares/auth');
const { listAuditLogs } = require('../controllers/auditController');

const router = express.Router();
router.get('/', auth, requirePermission(P.PLATFORM_LOGS_READ), listAuditLogs);

module.exports = router;
