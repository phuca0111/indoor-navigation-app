/**
 * Phase 4.4 — POST /api/buildings/:id/restore
 * Chạy: npm run test:phase4-4
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const Building = require('../../models/Building');

const API = '/api/buildings';

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Phase 4.4 — restore building (soft delete)', () => {
  let superToken;
  let orgAdminToken;
  let buildingAdminToken;
  let testOrgId;
  let testBuildingId;
  const testBuildingName = '__phase44_restore_test__';

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);

    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    const buildingAdmin = await User.findOne({ role: 'BUILDING_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN trong DB');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', Number(superUser.session_version) || 0);
    if (orgAdmin) {
      orgAdminToken = tokenFor(orgAdmin._id, 'ORG_ADMIN', Number(orgAdmin.session_version) || 0);
    }
    if (buildingAdmin) {
      buildingAdminToken = tokenFor(
        buildingAdmin._id,
        'BUILDING_ADMIN',
        Number(buildingAdmin.session_version) || 0
      );
    }

    const org = await Organization.findOne({ is_active: { $ne: false } }).lean();
    if (!org) throw new Error('Thiếu org active để test');
    testOrgId = org._id;

    let building = await Building.findOne({ name: testBuildingName }).lean();
    if (!building) {
      building = await Building.create({
        name: testBuildingName,
        address: 'Test restore',
        organization_id: testOrgId,
        status: 'DRAFT',
        is_active: true
      });
    } else {
      await Building.findByIdAndUpdate(building._id, { is_active: true, organization_id: testOrgId });
    }
    testBuildingId = String(building._id);
  });

  afterAll(async () => {
    if (testBuildingId) {
      await Building.findByIdAndUpdate(testBuildingId, { is_active: true });
    }
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Building.findByIdAndUpdate(testBuildingId, { is_active: false });
  });

  test('TC-4.4-01 SUPER_ADMIN restore → 200 + is_active true', async () => {
    const res = await request(app)
      .post(`${API}/${testBuildingId}/restore`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(200);
    expect(res.body.building.is_active).toBe(true);

    const doc = await Building.findById(testBuildingId).lean();
    expect(doc.is_active).toBe(true);
  });

  test('TC-4.4-02 BUILDING_ADMIN restore → 403', async () => {
    if (!buildingAdminToken) return;
    const res = await request(app)
      .post(`${API}/${testBuildingId}/restore`)
      .set('Authorization', `Bearer ${buildingAdminToken}`);
    expect(res.status).toBe(403);
  });

  test('TC-4.4-03 restore tòa đang active → 400', async () => {
    await Building.findByIdAndUpdate(testBuildingId, { is_active: true });
    const res = await request(app)
      .post(`${API}/${testBuildingId}/restore`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(res.status).toBe(400);
  });

  test('TC-4.4-04 ORG_ADMIN restore tòa cùng org → 200', async () => {
    if (!orgAdminToken) return;
    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    await Building.findByIdAndUpdate(testBuildingId, {
      is_active: false,
      organization_id: orgAdmin.organization_id
    });

    const res = await request(app)
      .post(`${API}/${testBuildingId}/restore`)
      .set('Authorization', `Bearer ${orgAdminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.building.is_active).toBe(true);
  });
});
