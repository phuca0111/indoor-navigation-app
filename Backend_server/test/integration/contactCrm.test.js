/**
 * Contact CRM mini — Landing → ContactRequest trong Admin
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const ContactMessage = require('../../models/ContactMessage');

const API = '/api/contact';

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Contact CRM', () => {
  let superToken;
  let createdId;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser);
  });

  afterAll(async () => {
    if (createdId) await ContactMessage.findByIdAndDelete(createdId).catch(() => {});
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('public submit tạo ContactRequest NEW + DEMO', async () => {
    const res = await request(app)
      .post(API)
      .send({
        name: 'Nguyen Van CRM',
        email: 'crm-test@example.com',
        phone: '0901111222',
        company: 'ABC',
        message: 'Toi muon dang ky demo he thong indoor navigation.',
        request_type: 'DEMO',
        subject: 'Dang ky Demo'
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    createdId = res.body.id;
    const doc = await ContactMessage.findById(createdId).lean();
    expect(doc.status).toBe('NEW');
    expect(doc.request_type).toBe('DEMO');
    expect(Array.isArray(doc.history)).toBe(true);
  });

  test('super admin list + reply chuyển REPLIED', async () => {
    const list = await request(app)
      .get(API)
      .query({ status: 'NEW', request_type: 'DEMO' })
      .set('Authorization', `Bearer ${superToken}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.items)).toBe(true);

    const reply = await request(app)
      .post(`${API}/${createdId}/reply`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ subject: 'Re: Demo', body: 'Cam on anh/chi. Chung toi se lien he.' });
    expect(reply.status).toBe(200);
    expect(reply.body.item.status).toBe('REPLIED');

    const unread = await request(app)
      .get(`${API}/unread-count`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(unread.status).toBe(200);
    expect(typeof unread.body.count).toBe('number');
  });
});
