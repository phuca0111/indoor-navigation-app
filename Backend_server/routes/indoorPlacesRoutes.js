const express = require('express');
const {
  getTarget,
  listTargetReviews,
  upsertReview,
  createReport,
  addFavorite,
  removeFavorite,
  myFavorites,
  adminListReports,
  closeReport,
  adminListReviews,
  adminDeactivateReview,
  adminActivateReview,
  adminListFavorites,
  adminRemoveFavorite
} = require('../controllers/indoorPlacesController');
const {
  auth,
  optionalAuth,
  requirePermission,
  requireAnyPermission
} = require('../middlewares/auth');
const { P } = require('../utils/permissions');

const router = express.Router();
const requirePlaceModerate = requireAnyPermission(P.PLACE_MODERATE, P.PLACE_MANAGE);

router.get('/admin/reports', auth, requirePlaceModerate, adminListReports);
router.post('/reports/:id/close', auth, requirePlaceModerate, closeReport);

router.get('/admin/reviews', auth, requirePlaceModerate, adminListReviews);
router.delete('/admin/reviews/:id', auth, requirePlaceModerate, adminDeactivateReview);
router.post('/admin/reviews/:id/activate', auth, requirePlaceModerate, adminActivateReview);
router.get('/admin/favorites', auth, requirePlaceModerate, adminListFavorites);
router.delete('/admin/favorites/:id', auth, requirePlaceModerate, adminRemoveFavorite);

router.get(
  '/targets/:buildingId/:floor/:kind/:entityId',
  optionalAuth,
  getTarget
);
router.get(
  '/targets/:buildingId/:floor/:kind/:entityId/reviews',
  optionalAuth,
  listTargetReviews
);

router.post('/reviews', auth, requirePermission(P.PLACE_REVIEW), upsertReview);
router.post('/reports', auth, requirePermission(P.PLACE_REPORT), createReport);

router.get('/favorites/mine', auth, myFavorites);
router.post('/favorites', auth, addFavorite);
router.delete(
  '/favorites/:buildingId/:floor/:kind/:entityId',
  auth,
  removeFavorite
);

module.exports = router;
