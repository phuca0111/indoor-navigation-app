// ============================================
// Map Governance P2 — Place Merge Requests + Engine
// ============================================

const mongoose = require('mongoose');
const PlaceMergeRequest = require('../models/PlaceMergeRequest');
const Place = require('../models/Place');
const ActivityLog = require('../models/ActivityLog');
const { mergePlaces } = require('../services/placeMergeEngine');
const { compositeScore } = require('../services/placeDuplicateDetection');

function logActivity(data) {
  ActivityLog.create(data).catch(() => {});
}

function assertObjectId(id, label = 'id') {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    const err = new Error(`${label} không hợp lệ.`);
    err.status = 400;
    err.code = 'INVALID_ID';
    throw err;
  }
  return String(id);
}

function serialize(doc, extras = {}) {
  const r = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: r._id,
    source_place_id: r.source_place_id,
    target_place_id: r.target_place_id,
    status: r.status,
    similarity: r.similarity,
    note: r.note || '',
    reject_reason: r.reject_reason || '',
    merge_result: r.merge_result,
    submitted_by: r.submitted_by,
    reviewer_id: r.reviewer_id,
    decided_at: r.decided_at,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    source_place: extras.source_place || null,
    target_place: extras.target_place || null
  };
}

async function listMerges(req, res) {
  try {
    const status = String(req.query.status || 'PENDING').toUpperCase();
    const filter = {};
    if (['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'ALL'].includes(status) && status !== 'ALL') {
      filter.status = status;
    }
    const rows = await PlaceMergeRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit, 10) || 50, 100))
      .lean();

    const ids = [...new Set(rows.flatMap((r) => [String(r.source_place_id), String(r.target_place_id)]))];
    const places = await Place.find({ _id: { $in: ids } }).select('name verified status owner_org_id aliases').lean();
    const pMap = Object.fromEntries(places.map((p) => [String(p._id), p]));

    return res.status(200).json({
      total: rows.length,
      requests: rows.map((r) => serialize(r, {
        source_place: pMap[String(r.source_place_id)] || null,
        target_place: pMap[String(r.target_place_id)] || null
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

async function createMerge(req, res) {
  try {
    const sourceId = assertObjectId(req.body?.source_place_id, 'source_place_id');
    const targetId = assertObjectId(req.body?.target_place_id, 'target_place_id');
    if (sourceId === targetId) {
      return res.status(400).json({ message: 'Source và target phải khác nhau.', code: 'SAME_PLACE' });
    }

    const [source, target] = await Promise.all([
      Place.findById(sourceId).lean(),
      Place.findById(targetId).lean()
    ]);
    if (!source || !target) return res.status(404).json({ message: 'Place nguồn/đích không tồn tại.' });

    const existing = await PlaceMergeRequest.findOne({
      source_place_id: sourceId,
      target_place_id: targetId,
      status: 'PENDING'
    }).lean();
    if (existing) {
      return res.status(409).json({
        message: 'Đã có yêu cầu merge đang chờ.',
        code: 'MERGE_PENDING',
        request_id: existing._id
      });
    }

    const score = compositeScore(source, target);

    // execute_now: Super Admin merge ngay không qua queue
    if (req.body?.execute_now === true || req.body?.execute_now === '1') {
      const result = await mergePlaces(sourceId, targetId, {
        markVerified: !!req.body?.mark_verified
      });
      const doc = await PlaceMergeRequest.create({
        source_place_id: sourceId,
        target_place_id: targetId,
        status: 'COMPLETED',
        similarity: score.score,
        note: String(req.body?.note || '').slice(0, 1000),
        merge_result: result,
        submitted_by: req.user.userId,
        reviewer_id: req.user.userId,
        decided_at: new Date()
      });
      logActivity({
        user_id: req.user.userId,
        action: 'PLACE_MERGE_EXECUTE',
        target_type: 'place',
        target_id: String(targetId),
        target: target.name,
        details: { source_place_id: sourceId, result },
        ip_address: req.ip || ''
      });
      return res.status(201).json({
        message: 'Đã merge Place ngay.',
        request: serialize(doc, { source_place: source, target_place: target }),
        result
      });
    }

    const doc = await PlaceMergeRequest.create({
      source_place_id: sourceId,
      target_place_id: targetId,
      status: 'PENDING',
      similarity: Math.round(score.score * 1000) / 1000,
      note: String(req.body?.note || '').slice(0, 1000),
      submitted_by: req.user.userId
    });

    return res.status(201).json({
      message: 'Đã tạo yêu cầu merge.',
      request: serialize(doc, { source_place: source, target_place: target })
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Đã có yêu cầu merge chờ duyệt.', code: 'MERGE_PENDING' });
    }
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

async function approveMerge(req, res) {
  try {
    assertObjectId(req.params.id, 'request id');
    const doc = await PlaceMergeRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy yêu cầu.' });
    if (doc.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu không còn PENDING.', code: 'NOT_PENDING' });
    }

    const result = await mergePlaces(doc.source_place_id, doc.target_place_id, {
      markVerified: req.body?.mark_verified !== false
    });

    doc.status = 'COMPLETED';
    doc.merge_result = result;
    doc.reviewer_id = req.user.userId;
    doc.decided_at = new Date();
    await doc.save();

    logActivity({
      user_id: req.user.userId,
      action: 'PLACE_MERGE_APPROVE',
      target_type: 'place',
      target_id: String(doc.target_place_id),
      target: String(doc.target_place_id),
      details: { request_id: String(doc._id), result },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: 'Đã duyệt và thực hiện merge.',
      request: serialize(doc),
      result
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

async function rejectMerge(req, res) {
  try {
    assertObjectId(req.params.id, 'request id');
    const doc = await PlaceMergeRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy yêu cầu.' });
    if (doc.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu không còn PENDING.', code: 'NOT_PENDING' });
    }
    doc.status = 'REJECTED';
    doc.reject_reason = String(req.body?.reason || '').slice(0, 1000);
    doc.reviewer_id = req.user.userId;
    doc.decided_at = new Date();
    await doc.save();
    return res.status(200).json({ message: 'Đã từ chối merge.', request: serialize(doc) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

/** POST /api/place-merges/execute — merge thẳng không tạo queue (alias create execute_now) */
async function executeMerge(req, res) {
  req.body = { ...(req.body || {}), execute_now: true };
  return createMerge(req, res);
}

module.exports = {
  listMerges,
  createMerge,
  approveMerge,
  rejectMerge,
  executeMerge
};
