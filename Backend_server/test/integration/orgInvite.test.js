/**
 * B5 — Organization invite
 * Chạy: npm run test:org-invite
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const OrganizationInvite = require('../../models/OrganizationInvite');
const OrganizationJoinRequest = require('../../models/OrganizationJoinRequest');
const { setTestTransporter, resetMailServiceCache } = require('../../services/mailService');

const API = '/api/org-invites';

function tokenFor(user) {
  return jwt.sign(
    {
      userId: String(user._id),
      role: user.role,
      organization_id: user.organization_id ? String(user.organization_id) : undefined,
      sv: Number(user.session_version) || 0
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('B5 — Organization invite', () => {
  let org;
  let orgAdmin;
  let orgAdminToken;
  let invitee;
  let inviteeToken;
  let buildingAdmin;
  let buildingAdminToken;
  const sent = [];

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    setTestTransporter({
      sendMail: async (payload) => {
        sent.push(payload);
        return { messageId: 'invite-test' };
      }
    });

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    org = await Organization.create({
      name: `Invite Org ${suffix}`,
      slug: `invite-org-${suffix}`,
      plan: 'PRO',
      billing_status: 'ACTIVE',
      is_active: true
    });
    orgAdmin = await User.create({
      email: `invite-admin-${suffix}@test.local`,
      password: '$2b$10$inviteadminhashinviteadminhashinv',
      role: 'ORG_ADMIN',
      organization_id: org._id,
      is_active: true
    });
    invitee = await User.create({
      email: `invitee-${suffix}@test.local`,
      password: '$2b$10$inviteehashinviteehashinviteehash',
      role: 'REGISTERED_USER',
      organization_id: null,
      is_active: true
    });
    buildingAdmin = await User.create({
      email: `invite-ba-${suffix}@test.local`,
      password: '$2b$10$invitebahashinvitebahashinviteba',
      role: 'BUILDING_ADMIN',
      organization_id: org._id,
      is_active: true
    });
    orgAdminToken = tokenFor(orgAdmin);
    inviteeToken = tokenFor(invitee);
    buildingAdminToken = tokenFor(buildingAdmin);
  });

  afterAll(async () => {
    resetMailServiceCache();
    if (org?._id) {
      await Promise.all([
        OrganizationInvite.deleteMany({ organization_id: org._id }),
        OrganizationJoinRequest.deleteMany({ organization_id: org._id }),
        User.deleteMany({
          _id: { $in: [orgAdmin._id, invitee._id, buildingAdmin._id] }
        }),
        Organization.deleteOne({ _id: org._id })
      ]);
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('TC-B5-01 ORG_ADMIN tạo invite → 201 + email', async () => {
    sent.length = 0;
    const res = await request(app)
      .post(API)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: invitee.email, role: 'BUILDING_ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.invite.status).toBe('PENDING');
    expect(res.body.invite.email).toBe(invitee.email);
    expect(res.body.invite_token).toBeTruthy();
    expect(sent.length).toBe(1);
  });

  test('TC-B5-02 BUILDING_ADMIN tạo invite → 403', async () => {
    const res = await request(app)
      .post(API)
      .set('Authorization', `Bearer ${buildingAdminToken}`)
      .send({ email: `other-${Date.now()}@test.local` });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('TC-B5-03 trùng email PENDING → 409', async () => {
    const res = await request(app)
      .post(API)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: invitee.email, role: 'BUILDING_ADMIN' });
    expect(res.status).toBe(409);
  });

  test('TC-B5-04 preview + accept thành công', async () => {
    const create = await request(app)
      .post(API)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: invitee.email, role: 'BUILDING_ADMIN' });
    // revoke previous pending first if needed
    let token = create.body.invite_token;
    if (create.status === 409) {
      const list = await request(app)
        .get(API)
        .set('Authorization', `Bearer ${orgAdminToken}`);
      const pending = (list.body.items || []).find((item) => item.email === invitee.email);
      expect(pending).toBeTruthy();
      const inviteDoc = await OrganizationInvite.findById(pending.id).select('+token_hash');
      // Tạo lại sau revoke
      await request(app)
        .post(`${API}/${pending.id}/revoke`)
        .set('Authorization', `Bearer ${orgAdminToken}`);
      const again = await request(app)
        .post(API)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ email: invitee.email, role: 'BUILDING_ADMIN' });
      expect(again.status).toBe(201);
      token = again.body.invite_token;
      expect(inviteDoc).toBeTruthy();
    } else {
      expect(create.status).toBe(201);
    }

    const preview = await request(app).get(`${API}/accept`).query({ token });
    expect(preview.status).toBe(200);
    expect(preview.body.email).toBe(invitee.email);
    expect(preview.body.organization.slug).toBe(org.slug);

    const accept = await request(app)
      .post(`${API}/accept`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({ token });
    expect(accept.status).toBe(200);
    expect(accept.body.user.role).toBe('BUILDING_ADMIN');
    expect(String(accept.body.user.organization_id)).toBe(String(org._id));

    const refreshed = await User.findById(invitee._id).lean();
    expect(refreshed.role).toBe('BUILDING_ADMIN');
    expect(String(refreshed.organization_id)).toBe(String(org._id));
  });

  test('TC-B5-05 token đã dùng / email không khớp → 400', async () => {
    const suffix = `${Date.now()}-x`;
    const other = await User.create({
      email: `other-invitee-${suffix}@test.local`,
      password: '$2b$10$otherinvitehashotherinvitehashot',
      role: 'REGISTERED_USER',
      is_active: true
    });
    const stranger = await User.create({
      email: `stranger-invitee-${suffix}@test.local`,
      password: '$2b$10$strangerinvitehashstrangerinvite',
      role: 'REGISTERED_USER',
      is_active: true
    });
    const create = await request(app)
      .post(API)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: other.email, role: 'BUILDING_ADMIN' });
    expect(create.status).toBe(201);
    const token = create.body.invite_token;

    const mismatch = await request(app)
      .post(`${API}/accept`)
      .set('Authorization', `Bearer ${tokenFor(stranger)}`)
      .send({ token });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.code).toBe('EMAIL_MISMATCH');

    const ok = await request(app)
      .post(`${API}/accept`)
      .set('Authorization', `Bearer ${tokenFor(other)}`)
      .send({ token });
    expect(ok.status).toBe(200);

    const refreshedOther = await User.findById(other._id).lean();
    const reused = await request(app)
      .post(`${API}/accept`)
      .set('Authorization', `Bearer ${tokenFor(refreshedOther)}`)
      .send({ token });
    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe('INVITE_INVALID');

    await User.deleteMany({ _id: { $in: [other._id, stranger._id] } });
  });

  test('TC-B5-06 revoke rồi accept → 400', async () => {
    const suffix = `${Date.now()}-r`;
    const user = await User.create({
      email: `revoke-invitee-${suffix}@test.local`,
      password: '$2b$10$revokeinvitehashrevokeinvitehash',
      role: 'REGISTERED_USER',
      is_active: true
    });
    const create = await request(app)
      .post(API)
      .set('Authorization', `Bearer ${orgAdminToken}`)
      .send({ email: user.email });
    expect(create.status).toBe(201);
    const revoke = await request(app)
      .post(`${API}/${create.body.invite.id}/revoke`)
      .set('Authorization', `Bearer ${orgAdminToken}`);
    expect(revoke.status).toBe(200);
    const accept = await request(app)
      .post(`${API}/accept`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ token: create.body.invite_token });
    expect(accept.status).toBe(400);
    await User.deleteOne({ _id: user._id });
  });
});
