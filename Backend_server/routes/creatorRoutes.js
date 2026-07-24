const express = require('express');
const { auth } = require('../middlewares/auth');
const { meStats } = require('../controllers/creatorController');

const router = express.Router();
router.use(auth);
router.get('/me/stats', meStats);

module.exports = router;
