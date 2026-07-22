// ============================================
// FILE: draftRoutes.js
// MỤC ĐÍCH: Draft API đời mới (collection 'drafts')
// Mount: app.use('/api/v1', draftRoutes)
// Full: GET/PUT /api/v1/buildings/:buildingId/floors/:floor/draft
// ============================================

const express = require('express');
const router = express.Router();
const { getDraft, putDraft } = require('../controllers/draftController');
const { auth, requirePermission, P } = require('../middlewares/auth');
const { requireBuildingAccess } = require('../middlewares/buildingAccess');

router.get('/buildings/:buildingId/floors/:floor/draft', auth, requirePermission(P.BUILDING_READ), requireBuildingAccess, getDraft);
router.put('/buildings/:buildingId/floors/:floor/draft', auth, requirePermission(P.MAP_DRAFT_EDIT), requireBuildingAccess, putDraft);

module.exports = router;
