const express = require('express');
const { health, liveness, readiness, metrics } = require('../controllers/healthController');

const router = express.Router();
router.get('/health', health);
router.get('/live', liveness);
router.get('/ready', readiness);
router.get('/metrics', metrics);

module.exports = router;
