const express = require('express');
const router = express.Router();
const { auth, requirePermission, P } = require('../middlewares/auth');
const { getOverviewDashboard } = require('../controllers/overviewDashboardController');

/** AD15 — Overview Dashboard bundle */
router.get('/dashboard', auth, requirePermission(P.OVERVIEW_READ), getOverviewDashboard);

module.exports = router;
