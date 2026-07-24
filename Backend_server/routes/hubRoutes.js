const express = require('express');
const { auth } = require('../middlewares/auth');
const {
  hubMe,
  listFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
  listHistory,
  clearHistory,
  addHistory,
  listMyWorkspaces,
  listMyProposals,
  submitWorkspaceCommunity,
  communityDashboard,
  communityProfile,
  followPlace,
  unfollowPlace,
  listFollowing,
  hubDashboard,
  hubExplore,
  hubActivities,
  hubSubscription,
  hubUpgradeMock,
  hubGetSettings,
  hubPutSettings,
  hubCreateWorkspace
} = require('../controllers/hubController');

const router = express.Router();

router.use(auth);

router.get('/me', hubMe);
router.get('/dashboard', hubDashboard);
router.get('/explore', hubExplore);
router.get('/activities', hubActivities);

router.get('/favorites', listFavorites);
router.get('/favorites/check', checkFavorite);
router.post('/favorites', addFavorite);
router.delete('/favorites/:placeId', removeFavorite);

router.get('/history', listHistory);
router.post('/history', addHistory);
router.delete('/history', clearHistory);

router.get('/workspaces', listMyWorkspaces);
router.post('/workspaces', hubCreateWorkspace);
router.post('/workspaces/:id/submit-community', submitWorkspaceCommunity);

router.get('/proposals', listMyProposals);

router.get('/community', communityDashboard);
router.get('/community/profile', communityProfile);
router.get('/community/following', listFollowing);
router.post('/community/follow', followPlace);
router.delete('/community/follow/:placeId', unfollowPlace);

router.get('/subscription', hubSubscription);
router.post('/subscription/upgrade-mock', hubUpgradeMock);

router.get('/settings', hubGetSettings);
router.put('/settings', hubPutSettings);

module.exports = router;
