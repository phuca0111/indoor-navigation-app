const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/auth');
const { getPlatformStats } = require('../controllers/platformStatsController');

router.get('/stats', auth, getPlatformStats);

module.exports = router;
