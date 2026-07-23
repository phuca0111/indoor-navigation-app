/**
 * Place routes — GĐ2 Registry public + admin CRUD (MAP_MOD / SUPER).
 * GĐ3 Proposal endpoints.
 * GĐ4 Validation preview.
 */
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
const {
  listPlacesRegistry,
  getPlaceRegistry,
  searchPlacesRegistry,
  reportPlace,
  claimPlace,
  reviewPlace,
  createProposal,
  listProposals,
  approveProposal,
  rejectProposal,
  previewValidation
} = require('../controllers/placeRegistryController');
const { auth, requirePermission, requireAnyPermission, requireSuperAdmin } = require('../middlewares/auth');
const { P } = require('../utils/permissions');

// —— Public Registry (không bắt buộc Super) ——
router.get('/', listPlacesRegistry);
router.post('/search', searchPlacesRegistry);
router.get('/meta/visibility', auth, requireAnyPermission(P.PLACE_MANAGE, P.PLACE_MODERATE), getVisibilityMeta);

// Validation preview (GĐ4)
router.post('/validation/preview', auth, requirePermission(P.PLACE_PROPOSE), previewValidation);

// Claim / Report / Review (auth)
router.post('/report', auth, requirePermission(P.PLACE_REPORT), reportPlace);
router.post('/claim', auth, requirePermission(P.PLACE_CLAIM), claimPlace);
router.post('/review', auth, requirePermission(P.PLACE_REVIEW), reviewPlace);

// Admin duplicate tools
router.get('/duplicates/scan', auth, requirePermission(P.PLACE_MODERATE), scanDuplicates);
router.post('/check-duplicates', auth, requirePermission(P.PLACE_VALIDATE), checkDuplicates);

// CRUD quản trị Place (MAP_MOD hoặc quyền manage; SUPER có *)
router.post('/', auth, requirePermission(P.PLACE_MANAGE), createPlace);
router.patch('/buildings/:buildingId/visibility', auth, requirePermission(P.PLACE_MANAGE), updateBuildingVisibility);
router.patch('/:id', auth, requirePermission(P.PLACE_MANAGE), updatePlace);
router.post('/:id/verification', auth, requirePermission(P.PLACE_MODERATE), resolvePlaceVerification);
router.delete('/:id', auth, requireSuperAdmin, removePlace);
router.post('/:id/attach-building', auth, requirePermission(P.PLACE_MANAGE), attachBuilding);
router.post('/:id/detach-building', auth, requirePermission(P.PLACE_MANAGE), detachBuilding);

router.get('/:id', getPlaceRegistry);

module.exports = router;
