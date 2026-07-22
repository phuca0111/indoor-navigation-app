const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const RefreshToken = require('../../models/RefreshToken');
const IdentityChallenge = require('../../models/IdentityChallenge');
const ActivityLog = require('../../models/ActivityLog');
const AuditLog = require('../../models/AuditLog');
const DomainEvent = require('../../models/DomainEvent');
const Organization = require('../../models/Organization');
const OrganizationMember = require('../../models/OrganizationMember');
const outbox = require('../../repositories/outboxRepository');
const {
  createChallenge,
  consumeChallenge
} = require('../../services/identityChallengeService');
const { rotateRefreshToken, hashToken } = require('../../services/refreshTokenService');
const { changePassword } = require('../../application/identity/userApplicationService');
const {
  createOrganizationWithAdmin
} = require('../../application/coreTenant/createOrganizationWithAdmin');

describe('Phase 5 Identity transaction và concurrency', () => {
  let user;
  const originalTransactions = process.env.IDENTITY_TRANSACTIONS_ENABLED;
  const originalSecret = process.env.IDENTITY_CHALLENGE_SECRET;
  const originalCoreTransactions = process.env.CORE_TENANT_TRANSACTIONS_ENABLED;

  beforeAll(async () => {
    process.env.IDENTITY_TRANSACTIONS_ENABLED = 'true';
    process.env.CORE_TENANT_TRANSACTIONS_ENABLED = 'true';
    process.env.IDENTITY_CHALLENGE_SECRET = 'identity-transaction-test-secret';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.TEST_MONGO_REPLICA_URI);
    }
    user = await User.create({
      email: `identity-transaction-${Date.now()}@test.local`,
      password: await bcrypt.hash('OldPassword123!', 4),
      role: 'REGISTERED_USER',
      full_name: 'Identity Transaction',
      is_active: true
    });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await Promise.all([
      User.deleteOne({ _id: user._id }),
      RefreshToken.deleteMany({ user_id: user._id }),
      IdentityChallenge.deleteMany({ user_id: user._id }),
      ActivityLog.deleteMany({ user_id: user._id }),
      AuditLog.deleteMany({ actor_id: String(user._id) }),
      DomainEvent.deleteMany({ aggregate_id: String(user._id) })
    ]);
    if (originalTransactions === undefined) delete process.env.IDENTITY_TRANSACTIONS_ENABLED;
    else process.env.IDENTITY_TRANSACTIONS_ENABLED = originalTransactions;
    if (originalSecret === undefined) delete process.env.IDENTITY_CHALLENGE_SECRET;
    else process.env.IDENTITY_CHALLENGE_SECRET = originalSecret;
    if (originalCoreTransactions === undefined) delete process.env.CORE_TENANT_TRANSACTIONS_ENABLED;
    else process.env.CORE_TENANT_TRANSACTIONS_ENABLED = originalCoreTransactions;
  });

  test('challenge chỉ được consume đúng một lần dưới race', async () => {
    let deliveredCode;
    const provider = {
      name: 'test',
      async send({ code }) {
        deliveredCode = code;
        return { provider: 'test' };
      }
    };
    const created = await createChallenge({
      userId: user._id,
      purpose: 'EMAIL_VERIFY',
      provider,
      to: user.email
    });
    const results = await Promise.all([
      consumeChallenge({
        challengeId: created.challenge._id,
        userId: user._id,
        purpose: 'EMAIL_VERIFY',
        code: deliveredCode
      }),
      consumeChallenge({
        challengeId: created.challenge._id,
        userId: user._id,
        purpose: 'EMAIL_VERIFY',
        code: deliveredCode
      })
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)[0].code).toBe('CHALLENGE_ALREADY_CONSUMED');
  });

  test('refresh rotation race phát hiện reuse và thu hồi family', async () => {
    const rawToken = 'identity-concurrent-refresh';
    await RefreshToken.create({
      user_id: user._id,
      token_hash: hashToken(rawToken),
      family_id: 'identity-race-family',
      expires_at: new Date(Date.now() + 60000)
    });
    const results = await Promise.all([
      rotateRefreshToken({ rawToken, req: {} }),
      rotateRefreshToken({ rawToken, req: {} })
    ]);
    expect(results.some((result) => result.ok)).toBe(true);
    expect(results.some((result) => result.code === 'REFRESH_REUSE_DETECTED')).toBe(true);
    await expect(RefreshToken.countDocuments({
      family_id: 'identity-race-family',
      is_revoked: false
    })).resolves.toBe(0);
  });

  test('outbox lỗi rollback password, session revocation và audit', async () => {
    await RefreshToken.create({
      user_id: user._id,
      token_hash: hashToken('rollback-refresh'),
      family_id: 'identity-rollback-family',
      expires_at: new Date(Date.now() + 60000)
    });
    jest.spyOn(outbox, 'append').mockRejectedValueOnce(new Error('fault-after-audit'));
    await expect(changePassword(
      user._id,
      'OldPassword123!',
      'NewPassword123!',
      {
        principal: { userId: String(user._id), role: 'REGISTERED_USER' },
        ipAddress: '127.0.0.1'
      }
    )).rejects.toThrow('fault-after-audit');

    const persisted = await User.findById(user._id).lean();
    expect(await bcrypt.compare('OldPassword123!', persisted.password)).toBe(true);
    await expect(RefreshToken.countDocuments({
      family_id: 'identity-rollback-family',
      is_revoked: false
    })).resolves.toBe(1);
    await expect(ActivityLog.countDocuments({
      user_id: user._id,
      action: 'CHANGE_PASSWORD'
    })).resolves.toBe(0);
    await expect(AuditLog.countDocuments({
      actor_id: String(user._id),
      action: { $in: ['CHANGE_PASSWORD', 'SESSION_REVOKED'] }
    })).resolves.toBe(0);
  });

  test('organization onboarding dual-write membership trong cùng UoW', async () => {
    const suffix = Date.now().toString(36);
    const result = await createOrganizationWithAdmin({
      organizationName: `Identity Membership ${suffix}`,
      slug: `identity-membership-${suffix}`,
      plan: 'FREE',
      adminName: 'Identity Membership Admin',
      adminEmail: `identity-membership-${suffix}@test.local`,
      adminPassword: 'StrongPassword123!',
      source: 'IDENTITY_TRANSACTION_TEST'
    });
    await expect(OrganizationMember.findOne({
      organization_id: result.organization._id,
      user_id: result.adminUser._id
    }).lean()).resolves.toMatchObject({
      role: 'ORG_ADMIN',
      status: 'ACTIVE'
    });
    await Promise.all([
      OrganizationMember.deleteMany({ organization_id: result.organization._id }),
      User.deleteOne({ _id: result.adminUser._id }),
      Organization.deleteOne({ _id: result.organization._id }),
      ActivityLog.deleteMany({ organization_id: result.organization._id }),
      AuditLog.deleteMany({ organization_id: result.organization._id }),
      DomainEvent.deleteMany({ organization_id: result.organization._id })
    ]);
  });
});
