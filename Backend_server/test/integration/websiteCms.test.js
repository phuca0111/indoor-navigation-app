/**
 * Website CMS — Landing cố định (không WordPress)
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const LandingPage = require('../../models/LandingPage');

const API = '/api/website';

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Website CMS', () => {
  let superToken;
  let orgToken;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    const superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean();
    const orgAdmin = await User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean();
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN');
    superToken = tokenFor(superUser);
    if (orgAdmin) orgToken = tokenFor(orgAdmin);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('public bundle trả navigation + pages', async () => {
    const res = await request(app).get(`${API}/public`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.navigation)).toBe(true);
    expect(Array.isArray(res.body.pages)).toBe(true);
    expect(res.body.pages.length).toBeGreaterThanOrEqual(5);
  });

  test('ORG_ADMIN không sửa pages', async () => {
    if (!orgToken) return;
    const res = await request(app)
      .get(`${API}/pages`)
      .set('Authorization', `Bearer ${orgToken}`);
    expect(res.status).toBe(403);
  });

  test('SUPER_ADMIN list 5 trang cố định + draft/publish', async () => {
    const list = await request(app)
      .get(`${API}/pages`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(list.status).toBe(200);
    expect(list.body.pages).toHaveLength(5);
    expect(list.body.pages.map((p) => p.slug).sort()).toEqual(
      ['contact', 'demo', 'features', 'home', 'pricing'].sort()
    );

    const draft = await request(app)
      .put(`${API}/pages/home/draft`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        sections: [
          {
            id: 'hero',
            type: 'hero',
            label: 'Hero',
            enabled: true,
            props: { title: 'Tiêu đề test CMS', subtitle: 'Mô tả' }
          }
        ]
      });
    expect(draft.status).toBe(200);
    expect(draft.body.page.status).toBe('DRAFT');

    const publish = await request(app)
      .post(`${API}/pages/home/publish`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(publish.status).toBe(200);
    expect(publish.body.page.status).toBe('PUBLISHED');

    const page = await LandingPage.findOne({ slug: 'home' }).lean();
    expect(page.published_sections[0].props.title).toBe('Tiêu đề test CMS');
  });
});
