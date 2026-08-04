const express = require('express');
const router = express.Router();
const { getGeocode } = require('../controllers/geocodeController');
const { geocodeLimiter } = require('../middlewares/rateLimit');

/** GET /api/geocode?q=&limit=&lat=&lng=&countrycodes= */
router.get('/', geocodeLimiter, getGeocode);

module.exports = router;
