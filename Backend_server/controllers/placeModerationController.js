/**
 * GĐ5 — Moderation queues (Proposal / Duplicate / Claim / Report).
 * MAP_MOD + SUPER; ORG_ADMIN xem claim liên quan org (scope đơn giản).
 */
const PlaceProposal = require('../models/PlaceProposal');
const PlaceOwnershipRequest = require('../models/PlaceOwnershipRequest');
const MapModerationReport = require('../models/MapModerationReport');
const { scanDuplicatePairs } = require('../services/placeDuplicateDetection');
const { PROPOSAL_STATUS } = require('../utils/placePlatform');
const { roleHasPermission, P } = require('../utils/permissions');

function isMapMod(user) {
  return user && roleHasPermission(user.role, P.PLACE_MODERATE);
}

function isSuper(user) {
  return user && String(user.role).toUpperCase() === 'SUPER_ADMIN';
}

async function listQueue(req, res) {
  try {
    const type = String(req.params.type || '').toLowerCase();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

    if (!isMapMod(req.user) && !isSuper(req.user) && String(req.user.role).toUpperCase() !== 'ORG_ADMIN') {
      return res.status(403).json({ message: 'Không có quyền moderation.', code: 'PERMISSION_DENIED' });
    }

    const orgOnly = String(req.user.role).toUpperCase() === 'ORG_ADMIN' && !isMapMod(req.user) && !isSuper(req.user);
    if (orgOnly && type !== 'claims') {
      return res.status(403).json({
        message: 'ORG_ADMIN chỉ truy cập queue claims (scope org).',
        code: 'ORG_SCOPE_ONLY'
      });
    }

    if (type === 'proposals') {
      const filter = {
        status: { $in: [PROPOSAL_STATUS.SUBMITTED, PROPOSAL_STATUS.IN_REVIEW] }
      };
      if (req.query.escalated === '1') filter.escalated = true;
      // Super mặc định chỉ escalation nếu ?inbox=escalation
      if (isSuper(req.user) && req.query.inbox === 'escalation') {
        filter.escalated = true;
      }
      const rows = await PlaceProposal.find(filter).sort({ risk: -1, createdAt: 1 }).limit(limit).lean();
      return res.status(200).json({ queue: 'proposals', total: rows.length, items: rows });
    }

    if (type === 'duplicates') {
      const scan = await scanDuplicatePairs({
        threshold: req.query.threshold ? Number(req.query.threshold) : undefined,
        limit
      });
      return res.status(200).json({
        queue: 'duplicates',
        total: scan.count,
        items: scan.pairs,
        meta: { threshold: scan.threshold, scanned: scan.total_places_scanned }
      });
    }

    if (type === 'claims') {
      const filter = { type: 'CLAIM', status: 'PENDING' };
      if (String(req.user.role).toUpperCase() === 'ORG_ADMIN' && !isMapMod(req.user)) {
        // Scope org: chỉ claim của org user (nếu có org trên token)
        const orgId = req.user.organization_id || req.user.org_id;
        if (orgId) filter.organization_id = orgId;
      }
      const rows = await PlaceOwnershipRequest.find(filter).sort({ createdAt: 1 }).limit(limit).lean();
      return res.status(200).json({ queue: 'claims', total: rows.length, items: rows });
    }

    if (type === 'reports') {
      const rows = await MapModerationReport.find({ status: 'OPEN' })
        .sort({ createdAt: 1 })
        .limit(limit)
        .lean();
      return res.status(200).json({ queue: 'reports', total: rows.length, items: rows });
    }

    return res.status(400).json({
      message: 'type phải là proposals|duplicates|claims|reports',
      code: 'INVALID_QUEUE'
    });
  } catch (error) {
    console.error('listQueue:', error);
    return res.status(500).json({ message: error.message });
  }
}

async function escalateItem(req, res) {
  try {
    const { type, id } = req.params;
    if (String(type).toLowerCase() !== 'proposals') {
      return res.status(400).json({ message: 'Hiện chỉ escalate proposal.' });
    }
    const doc = await PlaceProposal.findById(id);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy.' });
    doc.escalated = true;
    doc.route_hint = 'ESCALATE';
    await doc.save();
    return res.status(200).json({ item: doc });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function queueStats(req, res) {
  try {
    const [proposals, claims, reports] = await Promise.all([
      PlaceProposal.countDocuments({
        status: { $in: [PROPOSAL_STATUS.SUBMITTED, PROPOSAL_STATUS.IN_REVIEW] }
      }),
      PlaceOwnershipRequest.countDocuments({ type: 'CLAIM', status: 'PENDING' }),
      MapModerationReport.countDocuments({ status: 'OPEN' })
    ]);
    const escalated = await PlaceProposal.countDocuments({
      status: { $in: [PROPOSAL_STATUS.SUBMITTED, PROPOSAL_STATUS.IN_REVIEW] },
      escalated: true
    });
    return res.status(200).json({
      proposals,
      claims,
      reports,
      escalated,
      note: 'duplicates là scan on-demand — không đếm cố định'
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  listQueue,
  escalateItem,
  queueStats
};
