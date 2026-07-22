const ActivityLog = require('../models/ActivityLog');
const { dualWriteActivity } = require('../services/auditService');

async function recordActivity(input, { session } = {}) {
  const created = new ActivityLog(input);
  created.$locals.skipAuditDualWrite = true;
  await created.save(session ? { session } : undefined);
  await dualWriteActivity(created, { session });
  return typeof created.toObject === 'function' ? created.toObject() : created;
}

module.exports = { recordActivity };
