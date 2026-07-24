const express = require('express');
const {
  getBySlug,
  recordView,
  createReport,
  myReports,
  closeReport,
  upsertReview,
  myReviews,
  markHelpful,
  createClaim,
  listEvents,
  createEvent,
  myProposals
} = require('../controllers/placePlatformController');
const {
  auth,
  optionalAuth,
  requirePermission,
  requireAnyPermission
} = require('../middlewares/auth');
const { P } = require('../utils/permissions');

const router = express.Router();

router.get('/places/:slugOrId', optionalAuth, getBySlug);
router.post('/places/:slugOrId/view', optionalAuth, recordView);
router.get('/places/:placeId/events', optionalAuth, listEvents);

router.post('/reports', auth, requirePermission(P.PLACE_REPORT), createReport);
router.get('/reports/mine', auth, myReports);
router.post('/reports/:id/close', auth, requireAnyPermission(P.PLACE_MODERATE, P.PLACE_MANAGE), closeReport);

router.post('/reviews', auth, requirePermission(P.PLACE_REVIEW), upsertReview);
router.get('/reviews/mine', auth, myReviews);
router.post('/reviews/:id/helpful', auth, markHelpful);

router.post('/claims', auth, requirePermission(P.PLACE_CLAIM), createClaim);
router.get('/proposals/mine', auth, myProposals);

router.post('/events', auth, requireAnyPermission(P.PLACE_MANAGE, P.PLACE_MODERATE), createEvent);

module.exports = router;
