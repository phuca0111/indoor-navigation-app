const drafts = require('../application/mapLifecycle/draftApplicationService');
const publish = require('../application/mapLifecycle/publishApplicationService');

function floorNumber(req) {
  const value = Number.parseInt(req.params.floor, 10);
  if (!Number.isFinite(value)) {
    throw Object.assign(new Error('Số tầng không hợp lệ.'), { status: 400 });
  }
  return value;
}

function editSession(req) {
  return String(
    req.headers['x-edit-session'] ||
    req.body?.edit_session_id ||
    req.body?.session_id ||
    ''
  ).trim();
}

async function saveDraft(req, res) {
  try {
    if (req.body?.map_data == null) return res.status(400).json({ message: 'Thiếu map_data trong body.' });
    const saved = await drafts.saveDraft({
      actor: req.user,
      buildingId: req.params.buildingId,
      floorNumber: floorNumber(req),
      payload: req.body.map_data,
      expectedRevision: req.headers['if-match'] ?? req.body?.expected_version ?? req.body?.revision,
      editSessionId: editSession(req),
      ip: req.ip || ''
    });
    res.setHeader('ETag', drafts.draftEtag(saved.version));
    return res.status(200).json({
      message: `Đã lưu nháp tầng ${req.params.floor}.`,
      draft_updated_at: saved.updatedAt,
      draft_updated_by: saved.updated_by,
      version: saved.version
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.status ? error.message : `Lỗi lưu nháp: ${error.message}`,
      code: error.code,
      current: error.current
    });
  }
}

async function getDraft(req, res) {
  try {
    const draft = await drafts.loadDraft({
      actor: req.user,
      buildingId: req.params.buildingId,
      floorNumber: floorNumber(req)
    });
    res.setHeader('ETag', drafts.draftEtag(draft?.version || 0));
    return res.status(200).json({
      draft_map_data: draft?.payload ?? null,
      draft_updated_at: draft?.updatedAt ?? null,
      draft_updated_by: draft?.updated_by ?? null,
      published_version: draft?.published_version ?? null
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.status ? error.message : `Lỗi tải nháp: ${error.message}`,
      code: error.code
    });
  }
}

async function saveMap(req, res) {
  try {
    const floor = floorNumber(req);
    const resolved = await publish.resolveMapData(req.params.buildingId, floor, req.body || {});
    if (!resolved.ok) return res.status(400).json({ message: resolved.message, code: resolved.code });
    const validation = await publish.validatePublish({
      buildingId: req.params.buildingId,
      floorNumber: floor,
      body: req.body || {}
    });
    if (!validation.ok) {
      return res.status(400).json({
        message: 'Validate map thất bại.',
        code: 'VALIDATE_FAILED',
        errors: validation.errors
      });
    }
    const guardJob = await publish.requestPublish({
      actor: req.user,
      buildingId: req.params.buildingId,
      floorNumber: floor,
      body: req.body || {},
      editSessionId: editSession(req),
      idempotencyKey: `legacy-sync:${req.user?.userId}:${Date.now()}`,
      ip: req.ip || ''
    });
    const result = await publish.processPublishJob(String(guardJob._id), {
      owner: `legacy-http:${process.pid}`
    });
    if (result.status !== 'SUCCESS') {
      throw Object.assign(new Error(result.error?.message || 'Publish thất bại.'), {
        status: 409,
        code: result.error?.code
      });
    }
    const completed = await publish.getPublishedFloor(req.params.buildingId, floor);
    return res.status(result.version === 1 ? 201 : 200).json({
      message: result.version === 1
        ? `Tạo bản đồ Tầng ${req.params.floor} thành công!`
        : `Cập nhật bản đồ Tầng ${req.params.floor} thành công! (Version ${result.version})`,
      map: completed,
      version: result.version
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: `Lỗi lưu bản đồ: ${error.message}`,
      code: error.code
    });
  }
}

async function syncQrCodes(floor) {
  return publish.syncPublishedFloorQr(floor);
}

module.exports = { saveMap, saveDraft, getDraft, syncQrCodes };
