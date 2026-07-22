const express = require('express');
const router = express.Router();
const {
  listMerges,
  createMerge,
  approveMerge,
  rejectMerge,
  executeMerge
} = require('../controllers/placeMergeController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

router.use(auth, requireSuperAdmin);

router.get('/', listMerges);
router.post('/', createMerge);
router.post('/execute', executeMerge);
router.post('/:id/approve', approveMerge);
router.post('/:id/reject', rejectMerge);

module.exports = router;
