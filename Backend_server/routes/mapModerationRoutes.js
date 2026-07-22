const express = require('express');
const router = express.Router();
const {
  listReports,
  createReport,
  resolveReport,
  getReputation,
  patchReputation,
  getStats,
  aiDuplicateCheck
} = require('../controllers/mapModerationController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

router.use(auth);

// Cộng đồng có thể gửi báo cáo
router.post('/reports', createReport);

router.get('/stats', requireSuperAdmin, getStats);
router.post('/ai-duplicate-check', requireSuperAdmin, aiDuplicateCheck);
router.get('/reports', requireSuperAdmin, listReports);
router.post('/reports/:id/resolve', requireSuperAdmin, resolveReport);
router.get('/reputation/:userId', requireSuperAdmin, getReputation);
router.patch('/reputation/:userId', requireSuperAdmin, patchReputation);

module.exports = router;
