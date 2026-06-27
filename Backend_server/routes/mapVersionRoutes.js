const express = require('express');
const router = express.Router();
const { getVersions, getVersionDetail } = require('../controllers/mapVersionController');
const { auth } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');

// Yêu cầu quyền truy cập building
router.get('/:buildingId/:floor', auth, requireBuildingAccess, getVersions);
router.get('/:buildingId/:floor/:version', auth, requireBuildingAccess, getVersionDetail);

module.exports = router;
