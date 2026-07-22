/**
 * Website CMS — Landing cố định (không WordPress)
 */
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const LandingPage = require('../../models/LandingPage');
const WebsiteConfig = require('../../models/WebsiteConfig');
const { ensureWebsiteConfig } = require('../../services/websiteCmsService');

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

  test('public bundle trả navigation + pages (không Demo)', async () => {
    const res = await request(app).get(`${API}/public`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.navigation)).toBe(true);
    expect(Array.isArray(res.body.pages)).toBe(true);
    expect(res.body.pages.length).toBeGreaterThanOrEqual(4);
    expect(res.body.pages.some((p) => p.slug === 'demo')).toBe(false);
    expect(
      (res.body.navigation || []).some((n) =>
        String(n.href || '').toLowerCase().includes('demo') ||
        String(n.label || '').toLowerCase() === 'demo'
      )
    ).toBe(false);
  });

  test('ORG_ADMIN không sửa pages', async () => {
    if (!orgToken) return;
    const res = await request(app)
      .get(`${API}/pages`)
      .set('Authorization', `Bearer ${orgToken}`);
    expect(res.status).toBe(403);
  });

  test('SUPER_ADMIN list 4 trang cố định + draft/publish', async () => {
    const list = await request(app)
      .get(`${API}/pages`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(list.status).toBe(200);
    const slugs = list.body.pages.map((p) => p.slug).sort();
    expect(slugs).toEqual(['contact', 'features', 'home', 'pricing'].sort());
    expect(slugs).not.toContain('demo');

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

  test('C6 ensureWebsiteConfig strip Demo nav + updateConfig không ghi lại Demo', async () => {
    const doc = await WebsiteConfig.findOne({ key: 'default' });
    expect(doc).toBeTruthy();
    doc.navigation = [
      { id: 'n1', label: 'Home', href: '/', order: 1, enabled: true },
      { id: 'n2', label: 'Demo', href: '/demo', order: 2, enabled: true }
    ];
    await doc.save();

    await ensureWebsiteConfig();
    const cleaned = await WebsiteConfig.findOne({ key: 'default' }).lean();
    expect((cleaned.navigation || []).some((n) => String(n.href).includes('demo'))).toBe(false);

    const put = await request(app)
      .put(`${API}/config`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        navigation: [
          { label: 'Home', href: '/', order: 1 },
          { label: 'Demo', href: '/demo', order: 2 },
          { label: 'Giá', href: '/pricing', order: 3 }
        ]
      });
    expect(put.status).toBe(200);
    expect((put.body.navigation || put.body.config?.navigation || []).some?.((n) =>
      String(n.href || '').includes('demo')
    ) || false).toBe(false);

    const after = await WebsiteConfig.findOne({ key: 'default' }).lean();
    expect((after.navigation || []).some((n) => String(n.href).includes('demo'))).toBe(false);
  });

  test('C6 /demo redirect → /login', async () => {
    const res = await request(app).get('/demo');
    expect([301, 302]).toContain(res.status);
    expect(String(res.headers.location || '')).toMatch(/\/login/);
  });
});
