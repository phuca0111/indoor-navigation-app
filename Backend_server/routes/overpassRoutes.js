const express = require('express');
const router = express.Router();
const { getNearby } = require('../controllers/overpassController');
const { overpassLimiter } = require('../middlewares/rateLimit');

/** GET /api/overpass/nearby?lat=&lng=&radius=&amenities=&limit= */
router.get('/nearby', overpassLimiter, getNearby);

module.exports = router;
