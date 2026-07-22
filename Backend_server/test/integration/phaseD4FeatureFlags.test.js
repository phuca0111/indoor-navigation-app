const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const FeatureFlag = require('../../models/FeatureFlag');
const { clearCache } = require('../../services/featureFlagService');

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('D4 — Feature flags và maintenance mode', () => {
  let superAdmin;
  let regularAdmin;

  beforeAll(async () => {
    require('dotenv').config();
    const uri =
      process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    superAdmin = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } });
    regularAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } });
    await FeatureFlag.deleteMany({ key: 'maintenance_mode' });
    clearCache();
  });

  afterAll(async () => {
    await FeatureFlag.deleteMany({ key: 'maintenance_mode' });
    clearCache();
  });

  test('SUPER_ADMIN bật bảo trì, user thường nhận 503 nhưng SUPER_ADMIN bypass', async () => {
    const enabled = await request(app)
      .put('/api/feature-flags/maintenance_mode')
      .set('Authorization', `Bearer ${tokenFor(superAdmin)}`)
      .send({ enabled: true });
    expect(enabled.status).toBe(200);

    const blocked = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${tokenFor(regularAdmin)}`);
    expect(blocked.status).toBe(503);
    expect(blocked.body.code).toBe('MAINTENANCE_MODE');

    const bypass = await request(app)
      .get('/api/feature-flags')
      .set('Authorization', `Bearer ${tokenFor(superAdmin)}`);
    expect(bypass.status).toBe(200);
    expect(bypass.body.maintenance_mode).toBe(true);
  });
});
