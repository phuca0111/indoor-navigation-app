const express = require('express');
const router = express.Router();
const {
  createContribution,
  listContributions,
  approveContribution,
  rejectContribution
} = require('../controllers/mapContributionController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

router.use(auth);

/** User đã login có thể gửi đề xuất / xem của mình */
router.post('/', createContribution);
router.get('/', listContributions);

/** Platform moderation — Super Admin */
router.post('/:id/approve', requireSuperAdmin, approveContribution);
router.post('/:id/reject', requireSuperAdmin, rejectContribution);

module.exports = router;
