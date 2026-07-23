/**
 * GĐ3 — Place Proposal routes
 * POST/GET /api/proposals
 * POST /api/proposals/:id/approve|reject
 */
const express = require('express');
const router = express.Router();
const {
  createProposal,
  listProposals,
  approveProposal,
  rejectProposal
} = require('../controllers/placeRegistryController');
const { auth, requirePermission } = require('../middlewares/auth');
const { P } = require('../utils/permissions');

router.use(auth);

router.post('/', requirePermission(P.PLACE_PROPOSE), createProposal);
router.get('/', requirePermission(P.PLACE_PROPOSE), listProposals);
router.post('/:id/approve', requirePermission(P.PLACE_MODERATE), approveProposal);
router.post('/:id/reject', requirePermission(P.PLACE_MODERATE), rejectProposal);

module.exports = router;
