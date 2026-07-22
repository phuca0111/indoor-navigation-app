const express = require('express');
const { auth } = require('../middlewares/auth');
const {
  listFlags,
  updateFlag
} = require('../controllers/featureFlagController');

const router = express.Router();
router.get('/', auth, listFlags);
router.put('/:key', auth, updateFlag);

module.exports = router;
