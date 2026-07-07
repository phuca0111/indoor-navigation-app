const express = require('express');
const router = express.Router();
const { getVersions, getVersionDetail, rollbackVersion } = require('../controllers/mapVersionController');
const { auth } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');

router.get('/:buildingId/:floor', auth, requireBuildingAccess, getVersions);
router.get('/:buildingId/:floor/:version', auth, requireBuildingAccess, getVersionDetail);
router.post('/:buildingId/:floor/:version/rollback', auth, requireBuildingAccess, rollbackVersion);

module.exports = router;
