// ============================================
// Map Governance P1/P3 — Review routes
// Cộng đồng (đã login) được POST gửi duyệt; Super duyệt/list.
// ============================================

const express = require('express');
const router = express.Router();
const {
  listReviews,
  createReview,
  approveReview,
  rejectReview,
  mergeStubReview
} = require('../controllers/mapReviewController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

router.use(auth);

router.post('/', createReview);

router.get('/', requireSuperAdmin, listReviews);
router.post('/:id/approve', requireSuperAdmin, approveReview);
router.post('/:id/reject', requireSuperAdmin, rejectReview);
router.post('/:id/merge-stub', requireSuperAdmin, mergeStubReview);

module.exports = router;
