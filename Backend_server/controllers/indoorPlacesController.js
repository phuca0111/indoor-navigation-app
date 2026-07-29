const indoorPlaces = require('../application/indoorPlaces/indoorPlacesApplicationService');

function userIdOf(req) {
  return req.user?.userId || req.user?.id || null;
}

function handle(err, res) {
  if (err.status) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  return res.status(500).json({ message: 'Lỗi máy chủ: ' + err.message });
}

async function getTarget(req, res) {
  try {
    const data = await indoorPlaces.getTargetSummary({
      buildingId: req.params.buildingId,
      floorNumber: req.params.floor,
      entityKind: req.params.kind,
      entityId: req.params.entityId,
      entityName: req.query.name,
      userId: userIdOf(req)
    });
    return res.json(data);
  } catch (e) {
    return handle(e, res);
  }
}

async function listTargetReviews(req, res) {
  try {
    const data = await indoorPlaces.listReviews({
      buildingId: req.params.buildingId,
      floorNumber: req.params.floor,
      entityKind: req.params.kind,
      entityId: req.params.entityId,
      entityName: req.query.name,
      limit: req.query.limit
    });
    return res.json(data);
  } catch (e) {
    return handle(e, res);
  }
}

async function upsertReview(req, res) {
  try {
    const body = req.body || {};
    const review = await indoorPlaces.upsertReview({
      buildingId: body.building_id,
      floorNumber: body.floor_number,
      entityKind: body.entity_kind,
      entityId: body.entity_id,
      entityName: body.entity_name,
      userId: userIdOf(req),
      rating: body.rating,
      comment: body.comment
    });
    return res.status(201).json({ message: 'Đã lưu đánh giá.', review });
  } catch (e) {
    return handle(e, res);
  }
}

async function createReport(req, res) {
  try {
    const body = req.body || {};
    const report = await indoorPlaces.createReport({
      buildingId: body.building_id,
      floorNumber: body.floor_number,
      entityKind: body.entity_kind,
      entityId: body.entity_id,
      entityName: body.entity_name,
      userId: userIdOf(req),
      reasonCode: body.reason_code,
      detail: body.detail
    });
    return res.status(201).json({ message: 'Đã gửi báo cáo.', report });
  } catch (e) {
    return handle(e, res);
  }
}

async function addFavorite(req, res) {
  try {
    const body = req.body || {};
    const favorite = await indoorPlaces.addFavorite({
      buildingId: body.building_id,
      floorNumber: body.floor_number,
      entityKind: body.entity_kind,
      entityId: body.entity_id,
      entityName: body.entity_name,
      userId: userIdOf(req)
    });
    return res.status(201).json({ message: 'Đã lưu.', favorite });
  } catch (e) {
    return handle(e, res);
  }
}

async function removeFavorite(req, res) {
  try {
    const body = req.body || {};
    await indoorPlaces.removeFavorite({
      buildingId: body.building_id || req.params.buildingId,
      floorNumber: body.floor_number != null ? body.floor_number : req.params.floor,
      entityKind: body.entity_kind || req.params.kind,
      entityId: body.entity_id || req.params.entityId,
      userId: userIdOf(req)
    });
    return res.json({ ok: true, message: 'Đã bỏ lưu.' });
  } catch (e) {
    return handle(e, res);
  }
}

async function myFavorites(req, res) {
  try {
    const data = await indoorPlaces.listMyFavorites(userIdOf(req), { limit: req.query.limit });
    return res.json(data);
  } catch (e) {
    return handle(e, res);
  }
}

async function adminListReports(req, res) {
  try {
    const data = await indoorPlaces.adminListIndoorReports({
      status: req.query.status,
      reasonCode: req.query.reason_code,
      limit: req.query.limit
    });
    return res.json(data);
  } catch (e) {
    return handle(e, res);
  }
}

async function closeReport(req, res) {
  try {
    const report = await indoorPlaces.closeIndoorReport(req.params.id, {
      userId: userIdOf(req),
      status: req.body?.status,
      note: req.body?.note
    });
    return res.json({ message: 'Đã cập nhật báo cáo.', report });
  } catch (e) {
    return handle(e, res);
  }
}

async function adminListReviews(req, res) {
  try {
    const data = await indoorPlaces.adminListIndoorReviews({
      q: req.query.q,
      includeInactive: req.query.include_inactive === '1' || req.query.include_inactive === 'true',
      buildingId: req.query.building_id,
      limit: req.query.limit,
      skip: req.query.skip
    });
    return res.json(data);
  } catch (e) {
    return handle(e, res);
  }
}

async function adminDeactivateReview(req, res) {
  try {
    const review = await indoorPlaces.adminDeactivateIndoorReview(req.params.id);
    return res.json({ message: 'Đã ẩn đánh giá.', review });
  } catch (e) {
    return handle(e, res);
  }
}

async function adminActivateReview(req, res) {
  try {
    const review = await indoorPlaces.adminActivateIndoorReview(req.params.id);
    return res.json({ message: 'Đã hiện lại đánh giá.', review });
  } catch (e) {
    return handle(e, res);
  }
}

async function adminListFavorites(req, res) {
  try {
    const data = await indoorPlaces.adminListIndoorFavorites({
      buildingId: req.query.building_id,
      limit: req.query.limit,
      skip: req.query.skip
    });
    return res.json(data);
  } catch (e) {
    return handle(e, res);
  }
}

async function adminRemoveFavorite(req, res) {
  try {
    const favorite = await indoorPlaces.adminRemoveIndoorFavorite(req.params.id);
    return res.json({ message: 'Đã xóa yêu thích.', favorite });
  } catch (e) {
    return handle(e, res);
  }
}

module.exports = {
  getTarget,
  listTargetReviews,
  upsertReview,
  createReport,
  addFavorite,
  removeFavorite,
  myFavorites,
  adminListReports,
  closeReport,
  adminListReviews,
  adminDeactivateReview,
  adminActivateReview,
  adminListFavorites,
  adminRemoveFavorite
};
