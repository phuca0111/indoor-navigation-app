const express = require('express');
const router = express.Router();
const { auth, requirePermission, P } = require('../middlewares/auth');
const {
  getOverview,
  getAlerts,
  getTimeseries,
  postTelemetry,
  getConversionFunnel
} = require('../controllers/analyticsController');

router.get('/overview', auth, getOverview);
router.get('/alerts', auth, getAlerts);
router.get('/timeseries', auth, getTimeseries);
router.post('/telemetry', auth, postTelemetry);
router.get(
  '/funnel',
  auth,
  requirePermission(P.ANALYTICS_READ),
  getConversionFunnel
);

module.exports = router;
