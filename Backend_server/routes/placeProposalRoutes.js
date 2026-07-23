const express = require('express');
const router = express.Router();
const {
  createProposal,
  listProposals,
  getProposal,
  validateOnly,
  approveProposal,
  rejectProposal
} = require('../controllers/placeProposalController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

router.use(auth);

router.post('/validate', validateOnly);
router.post('/', createProposal);
router.get('/', listProposals);
router.get('/:id', getProposal);

router.post('/:id/approve', requireSuperAdmin, approveProposal);
router.post('/:id/reject', requireSuperAdmin, rejectProposal);

module.exports = router;
