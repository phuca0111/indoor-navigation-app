const AuditLog = require('../models/AuditLog');

async function listAuditLogs(req, res, next) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);
    const filter = {};
    if (req.user.role !== 'SUPER_ADMIN') {
      filter.organization_id = req.user.organization_id || null;
    } else if (req.query.organization_id) {
      filter.organization_id = req.query.organization_id;
    }
    if (req.query.action) filter.action = String(req.query.action);
    if (req.query.resource_type) filter.resource_type = String(req.query.resource_type);
    if (req.query.actor_id) filter.actor_id = String(req.query.actor_id);
    if (req.query.outcome) filter.outcome = String(req.query.outcome);
    if (req.query.from || req.query.to) {
      filter.occurred_at = {};
      if (req.query.from) filter.occurred_at.$gte = new Date(req.query.from);
      if (req.query.to) filter.occurred_at.$lte = new Date(req.query.to);
    }
    const [items, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ occurred_at: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter)
    ]);
    res.json({ items, total, page, limit });
  } catch (error) {
    next(error);
  }
}

module.exports = { listAuditLogs };
