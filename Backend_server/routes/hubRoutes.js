const express = require('express');
const { auth } = require('../middlewares/auth');
const {
  hubMe,
  listFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
  listHistory,
  addHistory,
  listMyWorkspaces,
  listMyProposals,
  submitWorkspaceCommunity
} = require('../controllers/hubController');

const router = express.Router();

router.use(auth);

router.get('/me', hubMe);
router.get('/favorites', listFavorites);
router.get('/favorites/check', checkFavorite);
router.post('/favorites', addFavorite);
router.delete('/favorites/:placeId', removeFavorite);
router.get('/history', listHistory);
router.post('/history', addHistory);
router.get('/workspaces', listMyWorkspaces);
router.post('/workspaces/:id/submit-community', submitWorkspaceCommunity);
router.get('/proposals', listMyProposals);

module.exports = router;
