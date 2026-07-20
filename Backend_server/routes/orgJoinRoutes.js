// ============================================
// FILE: orgJoinRoutes.js
// MỤC ĐÍCH: Routes cho luồng tham gia tổ chức (REGISTERED_USER ↔ ORG_ADMIN)
// ============================================

const express = require('express');
const router = express.Router();
const {
  requestJoin,
  listMyRequests,
  listPendingForOrg,
  approveRequest,
  rejectRequest
} = require('../controllers/orgJoinController');
const { auth } = require('../middlewares/auth');

router.use(auth);

// REGISTERED_USER
router.post('/', requestJoin);
router.get('/mine', listMyRequests);

// ORG_ADMIN
router.get('/', listPendingForOrg);
router.post('/:id/approve', approveRequest);
router.post('/:id/reject', rejectRequest);

module.exports = router;
