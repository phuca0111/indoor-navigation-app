const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/auth');
const {
  getOverview,
  getAlerts,
  getTimeseries
} = require('../controllers/analyticsController');

router.get('/overview', auth, getOverview);
router.get('/alerts', auth, getAlerts);
router.get('/timeseries', auth, getTimeseries);

module.exports = router;
