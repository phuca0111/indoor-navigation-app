const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/auth');
const { getOverviewDashboard } = require('../controllers/overviewDashboardController');

/** AD15 — Overview Dashboard bundle */
router.get('/dashboard', auth, getOverviewDashboard);

module.exports = router;
