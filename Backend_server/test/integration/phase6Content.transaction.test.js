const mongoose = require('mongoose');
const User = require('../../models/User');
const CmsArticle = require('../../models/CmsArticle');
const CmsRevision = require('../../models/CmsRevision');
const CmsAuditLog = require('../../models/CmsAuditLog');
const AuditLog = require('../../models/AuditLog');
const DomainEvent = require('../../models/DomainEvent');
const outbox = require('../../repositories/outboxRepository');
const {
  createArticle
} = require('../../application/content/cmsApplicationService');

describe('Phase 6 CMS transaction', () => {
  let actor;
  const prefix = `phase6-tx-${Date.now()}`;
  const originalTransactions = process.env.CONTENT_TRANSACTIONS_ENABLED;

  beforeAll(async () => {
    process.env.CONTENT_TRANSACTIONS_ENABLED = 'true';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.TEST_MONGO_REPLICA_URI);
    }
    actor = await User.create({
      email: `${prefix}@test.local`,
      password: 'unused-test-hash',
      role: 'SUPER_ADMIN',
      full_name: 'Phase 6 Transaction',
      is_active: true
    });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    const articles = await CmsArticle.find({ slug: new RegExp(`^${prefix}`) }).select('_id').lean();
    const ids = articles.map((row) => String(row._id));
    await Promise.all([
      CmsArticle.deleteMany({ _id: { $in: articles.map((row) => row._id) } }),
      CmsRevision.deleteMany({ resource_id: { $in: ids } }),
      CmsAuditLog.deleteMany({ resource_id: { $in: ids } }),
      AuditLog.deleteMany({ actor_id: String(actor._id), resource_type: 'ARTICLE' }),
      DomainEvent.deleteMany({ aggregate_id: { $in: ids } }),
      User.deleteOne({ _id: actor._id })
    ]);
    if (originalTransactions === undefined) delete process.env.CONTENT_TRANSACTIONS_ENABLED;
    else process.env.CONTENT_TRANSACTIONS_ENABLED = originalTransactions;
  });

  test('outbox lỗi rollback mutation, revision và audit', async () => {
    jest.spyOn(outbox, 'append').mockRejectedValueOnce(new Error('phase6-outbox-fault'));
    await expect(createArticle({
      title: 'Rollback article',
      slug: `${prefix}-rollback`,
      status: 'DRAFT'
    }, {
      actorId: actor._id,
      correlationId: `${prefix}-correlation`
    })).rejects.toThrow('phase6-outbox-fault');

    await expect(CmsArticle.countDocuments({ slug: `${prefix}-rollback` })).resolves.toBe(0);
    await expect(CmsRevision.countDocuments({
      correlation_id: `${prefix}-correlation`
    })).resolves.toBe(0);
    await expect(AuditLog.countDocuments({
      correlation_id: `${prefix}-correlation`
    })).resolves.toBe(0);
  });

  test('mutation, immutable revision, audit và outbox commit cùng nhau', async () => {
    const item = await createArticle({
      title: 'Committed article',
      slug: `${prefix}-commit`,
      status: 'DRAFT'
    }, {
      actorId: actor._id,
      correlationId: `${prefix}-commit-correlation`
    });
    await expect(CmsRevision.countDocuments({
      resource_id: String(item._id),
      revision: 1
    })).resolves.toBe(1);
    await expect(CmsAuditLog.countDocuments({
      resource_id: String(item._id),
      resource_version: 1
    })).resolves.toBe(1);
    await expect(AuditLog.countDocuments({
      resource_id: String(item._id),
      correlation_id: `${prefix}-commit-correlation`
    })).resolves.toBe(1);
    await expect(DomainEvent.countDocuments({
      aggregate_id: String(item._id),
      type: 'CmsContentChanged'
    })).resolves.toBe(1);
  });
});
