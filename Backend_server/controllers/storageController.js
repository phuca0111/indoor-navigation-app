// ============================================
// FILE: storageController.js
// Phase 2d — Upload ảnh nền map → Object Storage
// ============================================

const {
  uploadMapBackground,
  deleteMapBackground
} = require('../application/content/mediaApplicationService');

function parseFloor(params) {
  const floorNum = parseInt(params.floor, 10);
  if (!Number.isFinite(floorNum)) {
    return { error: { status: 400, message: 'Số tầng không hợp lệ.' } };
  }
  return { floorNum };
}

// POST /api/v1/buildings/:buildingId/floors/:floor/assets/background
async function uploadBackground(req, res) {
  try {
    const { buildingId } = req.params;
    const { floorNum, error } = parseFloor(req.params);
    if (error) return res.status(error.status).json({ message: error.message });

    const result = await uploadMapBackground({
      buildingId,
      floorNumber: floorNum,
      file: req.file,
      actor: req.user,
      req
    });
    return res.status(201).json({
      message: 'Đã upload ảnh nền.',
      ...result,
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

    const key = String(req.body?.key || '').trim();
    const result = await deleteMapBackground({
      buildingId,
      floorNumber: floorNum,
      key,
      actor: req.user
    });
    return res.status(200).json({
      message: result.deleted ? 'Đã xóa object.' : 'Object không tồn tại.',
      ...result
    });
  } catch (e) {
    return res.status(e.status || 500).json({
      message: e.status ? e.message : 'Lỗi xóa: ' + e.message,
      code: e.code || 'STORAGE_ERROR'
    });
  }
}

module.exports = {
  uploadBackground,
  deleteBackground
};
