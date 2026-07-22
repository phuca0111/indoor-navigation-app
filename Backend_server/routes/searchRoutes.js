const express = require('express');
const { auth, requirePermission, P } = require('../middlewares/auth');
const { search } = require('../controllers/searchController');

const router = express.Router();
router.get('/', auth, requirePermission(P.SEARCH_READ), search);

module.exports = router;
