const express = require('express');
const router = express.Router();
const { getCurrentWeather } = require('../controllers/weatherController');
const { geocodeLimiter } = require('../middlewares/rateLimit');

/** GET /api/weather/current?lat=&lng= — OpenWeatherMap proxy (cần OPENWEATHER_API_KEY). */
router.get('/current', geocodeLimiter, getCurrentWeather);

module.exports = router;
