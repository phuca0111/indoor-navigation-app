const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const NotificationDelivery = require('../../models/NotificationDelivery');
const { createForUsers } = require('../../services/notificationService');
const { resolveTestMongoUri } = require('../support/testDatabase');

function tokenFor(user) {
  return jwt.sign(
    {
      userId: String(user._id),
      role: user.role,
      sv: Number(user.session_version) || 0
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('D2 — Notification Module', () => {
  const prefix = `d2-${Date.now()}`;
  let firstUser;
  let secondUser;
  let firstToken;
  let secondToken;

  beforeAll(async () => {
    require('dotenv').config();
    const uri = resolveTestMongoUri();
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    [firstUser, secondUser] = await User.find({
      is_active: { $ne: false },
      role: { $in: ['SUPER_ADMIN', 'FINANCE_ADMIN'] }
    }).limit(2);
    if (!firstUser || !secondUser) {
      throw new Error('Cần ít nhất 2 SUPER_ADMIN/FINANCE_ADMIN để test isolation.');
    }
    firstToken = tokenFor(firstUser);
    secondToken = tokenFor(secondUser);
  });

  afterAll(async () => {
    const rows = await Notification.find({ dedupe_key: new RegExp(`^${prefix}`) })
      .select('_id')
      .lean();
    await NotificationDelivery.deleteMany({
      notification_id: { $in: rows.map((row) => row._id) }
    });
    await Notification.deleteMany({ dedupe_key: new RegExp(`^${prefix}`) });
  });

  test('TC-D2-01 danh sách cách ly theo user và tạo idempotent', async () => {
    await createForUsers([firstUser._id], {
      type: 'TEST',
      title: 'Thông báo riêng',
      dedupe_key: `${prefix}:private`
    });
    await createForUsers([firstUser._id], {
      type: 'TEST',
      title: 'Thông báo riêng',
      dedupe_key: `${prefix}:private`
    });

    const first = await request(app)
      .get('/api/notifications?limit=50')
      .set('Authorization', `Bearer ${firstToken}`);
    const second = await request(app)
      .get('/api/notifications?limit=50')
      .set('Authorization', `Bearer ${secondToken}`);

    expect(first.status).toBe(200);
    expect(
      first.body.items.filter((row) => row.dedupe_key === `${prefix}:private`)
    ).toHaveLength(1);
    expect(
      second.body.items.some((row) => row.dedupe_key === `${prefix}:private`)
    ).toBe(false);
  });

  test('TC-D2-02 unread-count, read một mục và read-all', async () => {
    await createForUsers([firstUser._id], {
      type: 'TEST',
      title: 'Chưa đọc A',
      dedupe_key: `${prefix}:read-a`
    });
    await createForUsers([firstUser._id], {
      type: 'TEST',
      title: 'Chưa đọc B',
      dedupe_key: `${prefix}:read-b`
    });
    const row = await Notification.findOne({
      user_id: firstUser._id,
      dedupe_key: `${prefix}:read-a`
    });

    const readOne = await request(app)
      .patch(`/api/notifications/${row._id}/read`)
      .set('Authorization', `Bearer ${firstToken}`);
    expect(readOne.status).toBe(200);
    expect(readOne.body.notification.read_at).toBeTruthy();

    const forbidden = await request(app)
      .patch(`/api/notifications/${row._id}/read`)
      .set('Authorization', `Bearer ${secondToken}`);
    expect(forbidden.status).toBe(404);

    const readAll = await request(app)
      .post('/api/notifications/read-all')
      .set('Authorization', `Bearer ${firstToken}`);
    expect(readAll.status).toBe(200);

    const count = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${firstToken}`);
    expect(count.status).toBe(200);
    expect(count.body.unread_count).toBe(0);
  });
});
