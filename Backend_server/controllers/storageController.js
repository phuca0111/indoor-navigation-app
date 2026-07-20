// ============================================
// FILE: storageController.js
// Phase 2d — Upload ảnh nền map → Object Storage
// ============================================

const Building = require('../models/Building');
const Organization = require('../models/Organization');
const { assertFloorInRange } = require('../services/floorLifecycle');
const { assertBuildingCanUploadCad } = require('../utils/overQuotaLock');
const {
  putMapBackground,
  deleteByKey,
  getMaxBytes,
  getBackend
} = require('../services/objectStorage');

function parseFloor(params) {
  const floorNum = parseInt(params.floor, 10);
  if (!Number.isFinite(floorNum)) {
    return { error: { status: 400, message: 'Số tầng không hợp lệ.' } };
  }
  return { floorNum };
}

async function assertCanUpload(req, res, buildingId, floorNum) {
  const buildingMeta = await Building.findById(buildingId)
    .select('organization_id total_floors')
    .lean();
  if (!buildingMeta) {
    res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
    return null;
  }
  try {
    assertFloorInRange(floorNum, buildingMeta.total_floors);
  } catch (e) {
    res.status(e.status || 400).json({
      message: e.message,
      code: e.code || 'FLOOR_OUT_OF_RANGE'
    });
    return null;
  }
  if (req.user?.role !== 'SUPER_ADMIN' && buildingMeta.organization_id) {
    const org = await Organization.findById(buildingMeta.organization_id);
    const writable = await assertBuildingCanUploadCad(buildingId, org);
    if (!writable.ok) {
      res.status(403).json({ message: writable.message, code: writable.code });
      return null;
    }
  }
  return buildingMeta;
}

// POST /api/v1/buildings/:buildingId/floors/:floor/assets/background
async function uploadBackground(req, res) {
  try {
    const { buildingId } = req.params;
    const { floorNum, error } = parseFloor(req.params);
    if (error) return res.status(error.status).json({ message: error.message });

    const ok = await assertCanUpload(req, res, buildingId, floorNum);
    if (!ok) return;

    if (!req.file) {
      return res.status(400).json({
        message: 'Thiếu file (field name: file).',
        code: 'STORAGE_NO_FILE'
      });
    }

    const result = await putMapBackground({
      buildingId,
      floorNumber: floorNum,
      buffer: req.file.buffer,
      mime: req.file.mimetype,
      originalName: req.file.originalname,
      req
    });

    return res.status(201).json({
      message: 'Đã upload ảnh nền.',
      ...result,
      max_bytes: getMaxBytes(),
      hint: 'Gắn URL vào map_data.background_image (không dùng Base64).'
    });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({
      message: e.message || 'Lỗi upload.',
      code: e.code || 'STORAGE_ERROR'
    });
  }
}

// DELETE /api/v1/buildings/:buildingId/floors/:floor/assets/background
// body: { key }
async function deleteBackground(req, res) {
  try {
    const { buildingId } = req.params;
    const { floorNum, error } = parseFloor(req.params);
    if (error) return res.status(error.status).json({ message: error.message });

    const ok = await assertCanUpload(req, res, buildingId, floorNum);
    if (!ok) return;

    const key = String(req.body?.key || '').trim();
    if (!key) {
      return res.status(400).json({ message: 'Thiếu key.', code: 'STORAGE_KEY' });
    }
    // Chỉ cho xoá object thuộc đúng building
    const prefix = `map-backgrounds/${buildingId}/`;
    if (!key.replace(/\\/g, '/').startsWith(prefix)) {
      return res.status(403).json({
        message: 'Key không thuộc tòa nhà này.',
        code: 'STORAGE_KEY_FORBIDDEN'
      });
    }

    const deleted = await deleteByKey(key);
    return res.status(200).json({
      message: deleted ? 'Đã xóa object.' : 'Object không tồn tại.',
      deleted,
      backend: getBackend()
    });
  } catch (e) {
    return res.status(500).json({ message: 'Lỗi xóa: ' + e.message });
  }
}

module.exports = {
  uploadBackground,
  deleteBackground
};
