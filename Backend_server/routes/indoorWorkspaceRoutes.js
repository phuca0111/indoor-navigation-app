const express = require('express');
const router = express.Router();
const {
  listWorkspaces,
  getWorkspace,
  createWorkspace
} = require('../controllers/indoorWorkspaceController');
const { auth, requireBuildingCreator } = require('../middlewares/auth');

router.use(auth);

router.get('/', listWorkspaces);
router.get('/:id', getWorkspace);
router.post('/', requireBuildingCreator, createWorkspace);

module.exports = router;
