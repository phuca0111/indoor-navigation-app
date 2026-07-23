/**
 * GĐ7 — Indoor Workspace API (Building giả lập Workspace)
 * GET/POST /api/workspaces
 * POST /:id/submit|publish|deprecate|archive
 */
const express = require('express');
const router = express.Router();
const {
  listWorkspaces,
  createWorkspace,
  getWorkspace,
  submitWorkspace,
  publishWorkspace,
  deprecateWorkspace,
  archiveWorkspace
} = require('../controllers/workspaceController');
const { auth, requirePermission } = require('../middlewares/auth');
const { P } = require('../utils/permissions');

router.get('/', listWorkspaces);
router.get('/:id', getWorkspace);

router.post('/', auth, requirePermission(P.BUILDINGS_CREATE), createWorkspace);
router.post('/:id/submit', auth, requirePermission(P.BUILDING_WRITE), submitWorkspace);
router.post('/:id/publish', auth, requirePermission(P.BUILDING_PUBLISH), publishWorkspace);
router.post('/:id/deprecate', auth, requirePermission(P.BUILDING_PUBLISH), deprecateWorkspace);
router.post('/:id/archive', auth, requirePermission(P.BUILDING_PUBLISH), archiveWorkspace);

module.exports = router;
