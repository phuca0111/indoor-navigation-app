// ============================================
// FILE: draftController.js
// MỤC ĐÍCH: HTTP handlers cho Draft API riêng (collection 'drafts')
// Route: /api/v1/buildings/:buildingId/floors/:floor/draft
// ============================================

const Building = require('../models/Building');
const Organization = require('../models/Organization');
const { assertFloorInRange } = require('../services/floorLifecycle');
const { assertBuildingWritable } = require('../utils/overQuotaLock');
const { loadOrCreate, save } = require('../services/draftService');
const { assertNoBase64Background } = require('../services/objectStorage');

// GET /api/v1/buildings/:buildingId/floors/:floor/draft
const getDraft = async (req, res) => {
  try {
    const { buildingId, floor } = req.params;
    const floorNum = parseInt(floor, 10);
    if (!Number.isFinite(floorNum)) {
      return res.status(400).json({ message: 'Số tầng không hợp lệ.' });
    }

    const buildingMeta = await Building.findById(buildingId)
      .select('organization_id total_floors')
      .lean();
    if (!buildingMeta) {
      return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
    }

    try {
      assertFloorInRange(floorNum, buildingMeta.total_floors);
    } catch (e) {
      return res.status(e.status || 400).json({
        message: e.message,
        code: e.code || 'FLOOR_OUT_OF_RANGE',
        floor_number: e.floor_number,
        total_floors: e.total_floors
      });
    }

    if (req.user?.role !== 'SUPER_ADMIN') {
      if (buildingMeta.organization_id) {
        const org = await Organization.findById(buildingMeta.organization_id);
        const writable = await assertBuildingWritable(buildingId, org);
        if (!writable.ok) {
          return res.status(403).json({
            message: writable.message,
            code: writable.code
          });
        }
      }
    }

    const draft = await loadOrCreate(buildingId, floorNum, req.user?.userId || null);

    res.status(200).json({
      payload: draft.payload,
      version: draft.version,
      updatedAt: draft.updatedAt,
      updated_by: draft.updated_by
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi tải nháp: ' + error.message });
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

    const bgCheck = assertNoBase64Background(payload);
    if (!bgCheck.ok) {
      return res.status(400).json({
        message: bgCheck.message,
        code: bgCheck.code
      });
    }

    const buildingMeta = await Building.findById(buildingId)
      .select('organization_id total_floors')
      .lean();
    if (!buildingMeta) {
      return res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
    }

    try {
      assertFloorInRange(floorNum, buildingMeta.total_floors);
    } catch (e) {
      return res.status(e.status || 400).json({
        message: e.message,
        code: e.code || 'FLOOR_OUT_OF_RANGE',
        floor_number: e.floor_number,
        total_floors: e.total_floors
      });
    }

    if (req.user?.role !== 'SUPER_ADMIN') {
      if (buildingMeta.organization_id) {
        const org = await Organization.findById(buildingMeta.organization_id);
        const writable = await assertBuildingWritable(buildingId, org);
        if (!writable.ok) {
          return res.status(403).json({
            message: writable.message,
            code: writable.code
          });
        }
      }
    }

    const draft = await save(buildingId, floorNum, payload, req.user?.userId || null);

    res.status(200).json({
      message: 'Đã lưu nháp tầng ' + floor + '.',
      version: draft.version,
      updatedAt: draft.updatedAt,
      updated_by: draft.updated_by
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi lưu nháp: ' + error.message });
  }
};

module.exports = { getDraft, putDraft };
