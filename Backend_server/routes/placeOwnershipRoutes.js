const express = require('express');
const router = express.Router();
const {
  listOwnership,
  createOwnership,
  approveOwnership,
  rejectOwnership,
  setPlaceOwner
} = require('../controllers/placeOwnershipController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

router.use(auth, requireSuperAdmin);

router.get('/', listOwnership);
router.post('/', createOwnership);
router.patch('/places/:placeId/owner', setPlaceOwner);
router.post('/:id/approve', approveOwnership);
router.post('/:id/reject', rejectOwnership);

module.exports = router;
