// ============================================
// FILE: draftController.js
// MỤC ĐÍCH: HTTP handlers cho Draft API riêng (collection 'drafts')
// Route: /api/v1/buildings/:buildingId/floors/:floor/draft
// ============================================

const {
  loadDraft,
  saveDraft,
  draftEtag
} = require('../application/mapLifecycle/draftApplicationService');

// GET /api/v1/buildings/:buildingId/floors/:floor/draft
const getDraft = async (req, res) => {
  try {
    const { buildingId, floor } = req.params;
    const floorNum = parseInt(floor, 10);
    if (!Number.isFinite(floorNum)) {
      return res.status(400).json({ message: 'Số tầng không hợp lệ.' });
    }

    const draft = await loadDraft({
      actor: req.user,
      buildingId,
      floorNumber: floorNum
    });
    const version = draft?.version ?? 0;
    res.setHeader('ETag', draftEtag(version));

    res.status(200).json({
      payload: draft?.payload ?? null,
      version,
      updatedAt: draft?.updatedAt ?? null,
      updated_by: draft?.updated_by ?? null,
      source: draft?.source ?? null
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.status ? error.message : 'Lỗi tải nháp: ' + error.message,
      code: error.code
    });
  }
};

// PUT /api/v1/buildings/:buildingId/floors/:floor/draft
const putDraft = async (req, res) => {
  try {
    const { buildingId, floor } = req.params;
    const floorNum = parseInt(floor, 10);
    if (!Number.isFinite(floorNum)) {
      return res.status(400).json({ message: 'Số tầng không hợp lệ.' });
    }

    const payload = req.body?.map_data;
    if (payload === undefined || payload === null) {
      return res.status(400).json({ message: 'Thiếu map_data trong body.' });
    }

    const editSessionId = String(
      req.headers['x-edit-session'] || req.body?.edit_session_id || req.body?.session_id || ''
    ).trim();
    const expectedVersion =
      req.headers['if-match'] ?? req.body?.expected_version ?? req.body?.revision;
    const draft = await saveDraft({
      actor: req.user,
      buildingId,
      floorNumber: floorNum,
      payload,
      expectedRevision: expectedVersion,
      editSessionId,
      ip: req.ip || ''
    });
    res.setHeader('ETag', draftEtag(draft.version));

    res.status(200).json({
      message: 'Đã lưu nháp tầng ' + floor + '.',
      version: draft.version,
      updatedAt: draft.updatedAt,
      updated_by: draft.updated_by
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      message: error.message || 'Lỗi lưu nháp.',
      code: error.code,
      current: error.current || undefined
    });
  }
};

module.exports = { getDraft, putDraft };
