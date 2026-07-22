// ============================================
// Map Governance P0 — Place routes (Super Admin)
// ============================================

const express = require('express');
const router = express.Router();
const {
  listPlaces,
  getPlace,
  createPlace,
  updatePlace,
  removePlace,
  attachBuilding,
  detachBuilding,
  updateBuildingVisibility,
  getVisibilityMeta,
  checkDuplicates,
  scanDuplicates,
  resolvePlaceVerification
} = require('../controllers/placeController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

router.use(auth, requireSuperAdmin);

router.get('/meta/visibility', getVisibilityMeta);
router.get('/duplicates/scan', scanDuplicates);
router.post('/check-duplicates', checkDuplicates);
router.get('/', listPlaces);
router.post('/', createPlace);
router.patch('/buildings/:buildingId/visibility', updateBuildingVisibility);
router.get('/:id', getPlace);
router.patch('/:id', updatePlace);
router.post('/:id/verification', resolvePlaceVerification);
router.delete('/:id', removePlace);
router.post('/:id/attach-building', attachBuilding);
router.post('/:id/detach-building', detachBuilding);

module.exports = router;
