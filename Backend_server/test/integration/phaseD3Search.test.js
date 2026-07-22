const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const Building = require('../../models/Building');

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('D3 — Global Search', () => {
  const keyword = `SearchD3${Date.now()}`;
  let admin;
  let financeAdmin;
  let foreignOrg;
  let ownBuilding;
  let foreignBuilding;

  beforeAll(async () => {
    require('dotenv').config();
    const uri =
      process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    admin = await User.findOne({
      role: 'ORG_ADMIN',
      organization_id: { $ne: null },
      is_active: { $ne: false }
    });
    financeAdmin = await User.findOne({
      role: 'FINANCE_ADMIN',
      is_active: { $ne: false }
    });
    if (!admin) throw new Error('Thiếu ORG_ADMIN để test search scope.');
    foreignOrg = await Organization.create({
      name: `${keyword} Foreign`,
      slug: `${keyword}-${Math.random().toString(36).slice(2)}`.toLowerCase()
    });
    ownBuilding = await Building.create({
      name: `${keyword} Own`,
      organization_id: admin.organization_id
    });
    foreignBuilding = await Building.create({
      name: `${keyword} Foreign`,
      organization_id: foreignOrg._id
    });
  });

  afterAll(async () => {
    await Building.deleteMany({ _id: { $in: [ownBuilding?._id, foreignBuilding?._id] } });
    await Organization.deleteMany({ _id: foreignOrg?._id });
  });

  test('ORG_ADMIN chỉ tìm thấy dữ liệu trong tenant', async () => {
    const response = await request(app)
      .get(`/api/search?q=${encodeURIComponent(keyword)}&limit=10`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`);

    expect(response.status).toBe(200);
    const buildingIds = response.body.items
      .filter((item) => item.type === 'building')
      .map((item) => item.id);
    expect(buildingIds).toContain(String(ownBuilding._id));
    expect(buildingIds).not.toContain(String(foreignBuilding._id));
    expect(response.body.items.some((item) => item.type === 'organization')).toBe(false);
  });

  test('từ khóa quá ngắn bị từ chối', async () => {
    const response = await request(app)
      .get('/api/search?q=x')
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(response.status).toBe(400);
  });

  test('FINANCE_ADMIN không thấy building/user ngoài phạm vi tài chính', async () => {
    if (!financeAdmin) return;
    const response = await request(app)
      .get(`/api/search?q=${encodeURIComponent(keyword)}&limit=10`)
      .set('Authorization', `Bearer ${tokenFor(financeAdmin)}`);
    expect(response.status).toBe(200);
    expect(
      response.body.items.some((item) => ['building', 'user', 'place'].includes(item.type))
    ).toBe(false);
  });
});
