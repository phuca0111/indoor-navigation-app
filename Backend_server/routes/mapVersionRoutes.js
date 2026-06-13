const express = require('express');
const router  = express.Router();
const { getVersions, getVersionDetail } = require('../controllers/mapVersionController');
const { auth } = require('../middlewares/auth');

router.get('/:buildingId/:floor',          auth, getVersions);
router.get('/:buildingId/:floor/:version', auth, getVersionDetail);

module.exports = router;
