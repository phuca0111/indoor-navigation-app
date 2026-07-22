const express = require('express');
const router = express.Router();
const { getVersions, getVersionDetail, rollbackVersion } = require('../controllers/mapVersionController');
const { auth, requirePermission, P } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');

router.get('/:buildingId/:floor', auth, requirePermission(P.BUILDING_READ), requireBuildingAccess, getVersions);
router.get('/:buildingId/:floor/:version', auth, requirePermission(P.BUILDING_READ), requireBuildingAccess, getVersionDetail);
router.post('/:buildingId/:floor/:version/rollback', auth, requirePermission(P.MAP_VERSION_ROLLBACK), requireBuildingAccess, rollbackVersion);

module.exports = router;
