require('dotenv').config();
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const CmsAuditLog = require('../models/CmsAuditLog');
const AuditLog = require('../models/AuditLog');
const { dualWriteActivity, writeAudit } = require('../services/auditService');
const { assertSafeTestMongoUri } = require('../test/support/testDatabase');

async function main() {
  const uri = process.env.TEST_MONGO_URI;
  if (!uri) throw new Error('Bắt buộc TEST_MONGO_URI; không dùng DB development.');
  assertSafeTestMongoUri(uri);
  const apply = process.argv.includes('--apply');
  const verifyOnly = process.argv.includes('--verify');
  await mongoose.connect(uri);
  const [activities, cmsRows] = await Promise.all([
    ActivityLog.find({}).lean(),
    CmsAuditLog.find({}).lean()
  ]);
  const sources = [
    ...activities.map((row) => ({ source: 'ACTIVITY_LOG', source_id: String(row._id) })),
    ...cmsRows.map((row) => ({ source: 'CMS_AUDIT_LOG', source_id: String(row._id) }))
  ];
  const existing = await AuditLog.countDocuments({
    $or: sources.length ? sources : [{ _id: null }]
  });
  const summary = {
    dry_run: !apply,
    source_count: sources.length,
    existing,
    missing: Math.max(0, sources.length - existing)
  };
  if (!verifyOnly && apply) {
    for (const row of activities) await dualWriteActivity(row);
    for (const row of cmsRows) {
      await writeAudit({
        source: 'CMS_AUDIT_LOG',
        source_id: row._id,
        actor_type: 'USER',
        actor_id: row.actor_id,
        action: `CMS_${row.action}`,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        before: row.before,
        after: row.after,
        ip_address: row.ip_address,
        occurred_at: row.createdAt
      });
    }
    summary.after = await AuditLog.countDocuments({
      $or: sources.length ? sources : [{ _id: null }]
    });
  }
  console.log(JSON.stringify(summary, null, 2));
  if (verifyOnly && summary.missing) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
