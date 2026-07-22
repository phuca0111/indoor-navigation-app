const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../server');
const User = require('../../models/User');
const CmsArticle = require('../../models/CmsArticle');
const WebsiteBanner = require('../../models/WebsiteBanner');
const CmsAuditLog = require('../../models/CmsAuditLog');
const WebsiteConfig = require('../../models/WebsiteConfig');

const API = '/api/website';
const runId = Date.now();
const slug = `d5-it-${runId}`;
const bannerName = `D5 IT ${runId}`;

function tokenFor(user) {
  return jwt.sign(
    { userId: String(user._id), role: user.role, sv: Number(user.session_version) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('D5 Website CMS full', () => {
  let superToken;
  let orgToken;
  let articleId;
  let activeBannerId;
  let futureBannerId;
  let configTestStartedAt;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    const [superUser, orgAdmin] = await Promise.all([
      User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } }).lean(),
      User.findOne({ role: 'ORG_ADMIN', is_active: { $ne: false } }).lean()
    ]);
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN để chạy integration test D5.');
    if (!orgAdmin) throw new Error('Thiếu ORG_ADMIN để kiểm tra tenant/quyền D5.');
    superToken = tokenFor(superUser);
    orgToken = tokenFor(orgAdmin);
  });

  afterAll(async () => {
    const articles = await CmsArticle.find({ slug: new RegExp(`^${slug}`) }).select('_id').lean();
    const banners = await WebsiteBanner.find({ name: new RegExp(`^${bannerName}`) }).select('_id').lean();
    const resourceIds = [...articles, ...banners].map((item) => String(item._id));
    await Promise.all([
      CmsArticle.deleteMany({ slug: new RegExp(`^${slug}`) }),
      WebsiteBanner.deleteMany({ name: new RegExp(`^${bannerName}`) }),
      CmsAuditLog.deleteMany({
        $or: [
          { resource_id: { $in: resourceIds } },
          { resource_label: new RegExp(`${runId}`) },
          ...(configTestStartedAt ? [{
            resource_type: 'CONFIG',
            createdAt: { $gte: configTestStartedAt }
          }] : [])
        ]
      })
    ]);
    if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
  });

  test('tenant ORG_ADMIN không thể đọc hoặc tạo nội dung CMS nền tảng', async () => {
    const [list, create] = await Promise.all([
      request(app)
        .get(`${API}/articles`)
        .set('Authorization', `Bearer ${orgToken}`),
      request(app)
        .post(`${API}/articles`)
        .set('Authorization', `Bearer ${orgToken}`)
        .send({ type: 'BLOG', title: bannerName, slug })
    ]);
    expect(list.status).toBe(403);
    expect(list.body.code).toBe('PERMISSION_DENIED');
    expect(create.status).toBe(403);
    expect(await CmsArticle.countDocuments({ slug })).toBe(0);
  });

  test('CRUD article BLOG/NEWS, SEO và public chỉ thấy PUBLISHED', async () => {
    const created = await request(app)
      .post(`${API}/articles`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        type: 'BLOG',
        title: `Bài D5 ${runId}`,
        slug,
        excerpt: 'Bản nháp không được public',
        content: '<p>Nội dung D5</p>',
        status: 'DRAFT',
        seo: {
          meta_title: `SEO D5 ${runId}`,
          meta_description: 'Mô tả SEO',
          keywords: ['cms', 'indoor']
        }
      });
    expect(created.status).toBe(201);
    expect(created.body.item.slug).toBe(slug);
    articleId = created.body.item._id;

    const hiddenDraft = await request(app).get(`${API}/public/articles/${slug}`);
    expect(hiddenDraft.status).toBe(404);

    const scheduled = await request(app)
      .put(`${API}/articles/${articleId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        status: 'SCHEDULED',
        publish_at: new Date(Date.now() + 3600000).toISOString()
      });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body.item.status).toBe('SCHEDULED');
    expect((await request(app).get(`${API}/public/articles/${slug}`)).status).toBe(404);

    const published = await request(app)
      .put(`${API}/articles/${articleId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ type: 'NEWS', status: 'PUBLISHED', publish_at: new Date().toISOString() });
    expect(published.status).toBe(200);
    expect(published.body.item.status).toBe('PUBLISHED');
    expect(published.body.item.type).toBe('NEWS');

    const detail = await request(app).get(`${API}/public/articles/${slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.item.seo.meta_title).toBe(`SEO D5 ${runId}`);
    expect(detail.body.item.content).toContain('Nội dung D5');

    const publicPage = await request(app).get(`/blog/${slug}`);
    expect(publicPage.status).toBe(200);
    expect(publicPage.text).toContain('id="publicArticle"');
    expect(publicPage.text).toContain('/article.js?v=');

    const list = await request(app).get(`${API}/public/articles?type=NEWS`);
    expect(list.status).toBe(200);
    expect(list.body.items.some((item) => item.slug === slug)).toBe(true);
    expect(list.body.items.every((item) => item.status === 'PUBLISHED')).toBe(true);
  });

  test('CRUD banner áp dụng đúng cửa sổ hiển thị public', async () => {
    const active = await request(app)
      .post(`${API}/banners`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: `${bannerName} active`,
        title: 'Banner đang chạy',
        placement: 'HOME',
        enabled: true,
        starts_at: new Date(Date.now() - 60000).toISOString(),
        ends_at: new Date(Date.now() + 3600000).toISOString(),
        image_url: '/uploads/d5-active.jpg',
        priority: 20
      });
    expect(active.status).toBe(201);
    activeBannerId = active.body.item._id;

    const future = await request(app)
      .post(`${API}/banners`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: `${bannerName} future`,
        title: 'Banner tương lai',
        placement: 'HOME',
        enabled: true,
        starts_at: new Date(Date.now() + 3600000).toISOString()
      });
    expect(future.status).toBe(201);
    futureBannerId = future.body.item._id;

    const publicResult = await request(app).get(`${API}/public/banners?placement=HOME`);
    expect(publicResult.status).toBe(200);
    expect(publicResult.body.items.some((item) => item._id === activeBannerId)).toBe(true);
    expect(publicResult.body.items.some((item) => item._id === futureBannerId)).toBe(false);

    const disabled = await request(app)
      .put(`${API}/banners/${activeBannerId}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({ enabled: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.item.enabled).toBe(false);
    expect(
      (await request(app).get(`${API}/public/banners?placement=HOME`))
        .body.items.some((item) => item._id === activeBannerId)
    ).toBe(false);

    const removed = await request(app)
      .delete(`${API}/banners/${futureBannerId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(removed.status).toBe(200);
    await expect(WebsiteBanner.findById(futureBannerId).lean()).resolves.toMatchObject({
      enabled: false,
      deleted_at: expect.any(Date)
    });
  });

  test('audit log ghi before/after và thao tác xóa CMS', async () => {
    const logs = await request(app)
      .get(`${API}/audit-logs?resource_type=ARTICLE`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(logs.status).toBe(200);
    const articleLogs = logs.body.items.filter((item) => item.resource_id === articleId);
    expect(articleLogs.some((item) => item.action === 'CREATE')).toBe(true);
    expect(articleLogs.some((item) => item.action === 'SCHEDULE')).toBe(true);
    expect(articleLogs.some((item) => item.action === 'PUBLISH')).toBe(true);
    expect(articleLogs.some((item) => item.before && item.after)).toBe(true);

    const removed = await request(app)
      .delete(`${API}/articles/${articleId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(removed.status).toBe(200);
    expect((await request(app).get(`${API}/public/articles/${slug}`)).status).toBe(404);

    const deleteLog = await CmsAuditLog.findOne({
      resource_type: 'ARTICLE',
      resource_id: articleId,
      action: 'DELETE'
    }).lean();
    expect(deleteLog).toBeTruthy();
    expect(deleteLog.before.slug).toBe(slug);

    const restored = await request(app)
      .post(`${API}/audit-logs/${deleteLog._id}/restore`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(restored.status).toBe(200);
    expect(restored.body.item.slug).toBe(slug);
    expect((await request(app).get(`${API}/public/articles/${slug}`)).status).toBe(200);
  });

  test('audit log có phân trang và khôi phục được phiên bản cấu hình', async () => {
    const original = await WebsiteConfig.findOne({ key: 'default' }).lean();
    const markerA = `SEO restore A ${runId}`;
    configTestStartedAt = new Date();
    try {

      const savedA = await request(app)
        .put(`${API}/config`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ seo: { meta_title: markerA } });
      expect(savedA.status).toBe(200);

      const versionA = await CmsAuditLog.findOne({
        resource_type: 'CONFIG',
        'after.seo.meta_title': markerA
      }).sort({ createdAt: -1 }).lean();
      expect(versionA).toBeTruthy();

      const savedB = await request(app)
        .put(`${API}/config`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ seo: { meta_title: `SEO restore B ${runId}` } });
      expect(savedB.status).toBe(200);

      const restored = await request(app)
        .post(`${API}/audit-logs/${versionA._id}/restore`)
        .set('Authorization', `Bearer ${superToken}`);
      expect(restored.status).toBe(200);
      expect(restored.body.item.seo.meta_title).toBe(markerA);

      const page = await request(app)
        .get(`${API}/audit-logs?resource_type=CONFIG&limit=1&page=2`)
        .set('Authorization', `Bearer ${superToken}`);
      expect(page.status).toBe(200);
      expect(page.body.page).toBe(2);
      expect(page.body.limit).toBe(1);
      expect(page.body.total).toBeGreaterThanOrEqual(3);
      expect(page.body.items).toHaveLength(1);
    } finally {
      const doc = await WebsiteConfig.findOne({ key: 'default' });
      ['settings', 'theme', 'seo', 'banner', 'navigation', 'updated_by'].forEach((key) => {
        doc.set(key, original[key]);
      });
      await doc.save();
    }
  });
});
