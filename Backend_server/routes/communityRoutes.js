const express = require('express');
const router = express.Router();
const {
  searchCommunityBuildings,
  searchCommunityPlaces,
  communityHub
} = require('../controllers/communityController');
const { auth, requireSuperAdmin } = require('../middlewares/auth');

// Public
router.get('/buildings', searchCommunityBuildings);
router.get('/places', searchCommunityPlaces);

// Super Admin hub
router.get('/hub', auth, requireSuperAdmin, communityHub);

module.exports = router;
