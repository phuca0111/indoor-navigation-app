/**
 * Phase 8 — Web Collaboration & Publish Safety
 * npm run test:phase8
 *
 * Gate tự động thay checklist tay K1–K9 (user không test tay).
 * K8B callback Google thật với tài khoản Google: không auto (cần OAuth browser) —
 * đã cover status/enabled + auth URL + UI ẩn nút khi tắt.
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = require('../../server');
const User = require('../../models/User');
const Building = require('../../models/Building');
const Floor = require('../../models/Floor');
const Organization = require('../../models/Organization');
const FloorEditLock = require('../../models/FloorEditLock');
const MapVersion = require('../../models/MapVersion');
const ActivityLog = require('../../models/ActivityLog');
const OrganizationRegistration = require('../../models/OrganizationRegistration');
const Invoice = require('../../models/Invoice');
const { sendExpiryReminders } = require('../../services/billingScheduler');
const { clearLocksForBuilding } = require('../../services/floorEditLock');
const memoryStore = require('../../services/floorLockMemoryStore');

const API = '/api';
const ROOT = path.join(__dirname, '../..');
const REPO = path.join(__dirname, '../../..');

function tokenFor(userId, role, sv = 0) {
  return jwt.sign(
    { userId: String(userId), role, sv },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function authReq(token) {
  return (method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readRepo(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

describe('Phase 8 — Web upgrades', () => {
  let superUser;
  let orgUser;
  let superToken;
  let orgToken;
  let testOrg;
  let testBuildingId;
  let prevPermitEnv;
  let prevGoogleId;
  let prevGoogleSecret;
  let prevForceRl;
  const createdBuildingIds = [];
  const createdOrgIds = [];
  const createdUserIds = [];
  let origOrgContact;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) require('dotenv').config();
    prevPermitEnv = process.env.PUBLISH_PERMIT_REQUIRED;
    prevGoogleId = process.env.GOOGLE_CLIENT_ID;
    prevGoogleSecret = process.env.GOOGLE_CLIENT_SECRET;
    prevForceRl = process.env.FORCE_PUBLISH_RATE_LIMIT;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.FORCE_PUBLISH_RATE_LIMIT;
    process.env.PUBLISH_PERMIT_REQUIRED = 'false';

    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }

    superUser = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } });
    orgUser = await User.findOne({
      role: 'ORG_ADMIN',
      is_active: { $ne: false },
      organization_id: { $ne: null }
    });
    if (!superUser) throw new Error('Thiếu SUPER_ADMIN — không chạy Phase 8 test');
    if (!orgUser) throw new Error('Thiếu ORG_ADMIN — không chạy Phase 8 test');

    superToken = tokenFor(superUser._id, 'SUPER_ADMIN', Number(superUser.session_version) || 0);
    orgToken = tokenFor(orgUser._id, 'ORG_ADMIN', Number(orgUser.session_version) || 0);

    testOrg = await Organization.findById(orgUser.organization_id);
    if (!testOrg) throw new Error('ORG_ADMIN thiếu organization');

    origOrgContact = {
      phone: testOrg.contact_phone,
      address: testOrg.contact_address,
      permitKey: testOrg.publish_permit_key,
      permitExp: testOrg.publish_permit_expires_at,
      planExpires: testOrg.plan_expires_at,
      remindedAt: testOrg.plan_expiry_reminded_at
    };

    const createRes = await authReq(superToken)('post', `${API}/buildings`).send({
      name: `P8 Draft Lock ${Date.now()}`,
      address: 'Phase8 test',
      total_floors: 1,
      organization_id: String(testOrg._id),
      lat: 10.77,
      lng: 106.69
    });
    expect(createRes.status).toBe(201);
    testBuildingId = String(createRes.body.building._id);
    createdBuildingIds.push(testBuildingId);

    await authReq(orgToken)('post', `${API}/maps/${testBuildingId}/0/publish`).send({
      map_data: {
        rooms: [{ id: 'r-public', name: 'Public Room' }],
        nodes: [],
        edges: []
      }
    });
  });

  afterAll(async () => {
    for (const id of createdBuildingIds) {
      await clearLocksForBuilding(id);
      memoryStore.kvClearAll();
      await FloorEditLock.deleteMany({ building_id: id });
      await MapVersion.deleteMany({ building_id: id });
      await Floor.deleteMany({ building_id: id });
      await Building.findByIdAndDelete(id);
      await ActivityLog.deleteMany({ target: new RegExp(id) });
    }
    for (const id of createdUserIds) {
      await User.findByIdAndDelete(id);
    }
    for (const id of createdOrgIds) {
      await OrganizationRegistration.deleteMany({ organization_id: id });
      await User.deleteMany({ organization_id: id });
      await Organization.findByIdAndDelete(id);
    }
    if (testOrg) {
      await Organization.findByIdAndUpdate(testOrg._id, {
        contact_phone: origOrgContact.phone || '',
        contact_address: origOrgContact.address || '',
        publish_permit_key: origOrgContact.permitKey || '',
        publish_permit_expires_at: origOrgContact.permitExp || null,
        plan_expires_at: origOrgContact.planExpires || null,
        plan_expiry_reminded_at: origOrgContact.remindedAt || null
      });
    }
    if (prevPermitEnv === undefined) delete process.env.PUBLISH_PERMIT_REQUIRED;
    else process.env.PUBLISH_PERMIT_REQUIRED = prevPermitEnv;
    if (prevGoogleId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = prevGoogleId;
    if (prevGoogleSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = prevGoogleSecret;
    if (prevForceRl === undefined) delete process.env.FORCE_PUBLISH_RATE_LIMIT;
    else process.env.FORCE_PUBLISH_RATE_LIMIT = prevForceRl;
  });

  test('TC-8.0a UI static — tooltip admin + profile org + Google wrap + editor draft/lock', () => {
    const dashHtml = read('admin/dashboard.html');
    const dashJs = read('js/dashboard.js');
    const adminShellJs = read('js/admin-shell.js');
    const adminUiJs = read('js/admin-ui.js');
    const adminCss = read('admin/css/admin.css');
    const adminThemeCss = read('admin/css/admin-theme.css');
    const loginHtml = read('admin/index.html');
    const landingLoginHtml = read('public/login/index.html');
    const loginJs = read('js/login.js');
    const landingLoginJs = read('public/login.js');
    const editorHtml = readRepo('WebMapEditor/index.html');
    const editorApi = readRepo('WebMapEditor/js/api.js');
    const editorCss = readRepo('WebMapEditor/styles.css');
    const trialHtml = read('public/org-trial.html');

    expect(dashHtml).toMatch(/id="btnLogout"[^>]*title="/);
    expect(dashHtml).toMatch(/id="adminSidebar"/);
    expect(dashHtml).toMatch(/id="btnOpenSidebar"/);
    expect(dashHtml).toMatch(/id="tabNav"[^>]*admin-sidebar-nav/);
    expect(dashHtml).toMatch(/id="adminPageTitle"/);
    expect(dashHtml).toMatch(/id="btnAdminTheme"/);
    expect(dashHtml).toMatch(/indoorNavAdminTheme/);
    expect(dashHtml).toMatch(/admin-theme\.css\?v=[a-z0-9]+/i);
    expect(dashHtml).toMatch(/data-overview-force-hidden="1"/);
    expect(dashHtml).toMatch(/admin-menu-icon/);
    expect(dashHtml).toMatch(/admin-theme-icon-light/);
    expect(dashHtml).toMatch(/admin-shell\.js/);
    expect(dashHtml).toMatch(/admin-ui\.js/);
    expect(dashHtml).toMatch(/id="adminToastRegion"/);
    expect(dashHtml).toMatch(/id="adminPageProgress"/);
    expect(dashHtml).toMatch(/admin-nav-group/);
    expect(dashHtml).toMatch(/data-nav-group="overview"/);
    expect(dashHtml).toMatch(/data-nav-group="customers"/);
    expect(dashHtml).toMatch(/data-tab="maps"/);
    expect(dashHtml).toMatch(/id="tab-maps"/);
    expect(dashHtml).toMatch(/id="buildingDetailBody"/);
    expect(dashHtml).toMatch(/id="buildingDetailSubnav"/);
    expect(dashHtml).toMatch(/switchBuildingDetailSubtab\('floors'\)/);
    expect(dashHtml).toMatch(/id="analyticsRevenueTrend"/);
    expect(dashHtml).toMatch(/id="analyticsConversionFunnel"/);
    expect(dashHtml).toMatch(/id="analyticsTopOrganizations"/);
    expect(dashHtml).toMatch(/id="analyticsInsights"/);
    expect(dashHtml).toMatch(/data-nav-group="website"/);
    expect(dashHtml).toMatch(/id="tab-website"/);
    expect(dashHtml).toMatch(/website-cms\.js/);
    expect(dashHtml).toMatch(/id="websiteContactCrm"/);
    expect(dashHtml).toMatch(/id="ov-w-contact_crm"/);
    expect(dashHtml).toMatch(/>Chi tiết tòa</);
    expect(dashHtml).toMatch(/data-tab="plans"/);
    expect(dashHtml).toMatch(/id="tab-plans"/);
    expect(dashHtml).toMatch(/id="plansCatalogGrid"/);
    expect(dashHtml).toMatch(/id="planEditorModal"/);
    expect(dashHtml).toMatch(/openFinanceInvoicesNav/);
    expect(dashHtml).toMatch(/openProfileSectionNav\('security'\)/);
    expect(dashHtml).toMatch(/>Gói đăng ký</);
    expect(dashHtml).toMatch(/>Danh mục gói</);
    expect(dashHtml).toMatch(/>Nhật ký hệ thống</);
    expect(dashHtml).toMatch(/id="billingOrgListPanel"/);
    expect(dashHtml).toMatch(/id="billingOrgKeyword"/);
    expect(dashHtml).toMatch(/id="billingPlanFilter"/);
    expect(dashHtml).toMatch(/id="financeSubNav"/);
    expect(dashHtml).toMatch(/id="tab-overview"/);
    expect(dashHtml).toMatch(/id="overviewKpiCards"/);
    expect(dashHtml).toMatch(/id="overviewRangeSelect"/);
    expect(dashHtml).toMatch(/id="overviewCustomRange"/);
    expect(dashHtml).toMatch(/id="ov-w-org_growth"/);
    expect(dashHtml).toMatch(/id="ov-w-revenue_expense"/);
    expect(dashHtml).toMatch(/id="ov-body-map_publish"/);
    expect(dashHtml).toMatch(/id="orgDetailPage"/);
    expect(dashHtml).toMatch(/id="orgListView"/);
    expect(dashHtml).toMatch(/switchTab\('overview'\)/);
    expect(adminShellJs).toMatch(/admin-sidebar-open/);
    expect(adminShellJs).toMatch(/aria-current/);
    expect(adminShellJs).toMatch(/indoorNavAdminTheme/);
    expect(adminShellJs).toMatch(/document\.documentElement\.setAttribute/);
    expect(adminShellJs).toMatch(/admin-nav-group-toggle/);
    expect(adminShellJs).toMatch(/syncNavGroupVisibility/);
    expect(adminShellJs).toMatch(/isTabBtnRoleVisible/);
    expect(adminShellJs).toMatch(/tabStateChanged/);
    expect(adminCss).toMatch(/--brand-primary/);
    expect(adminCss).toMatch(/--admin-sidebar-width/);
    expect(adminCss).toMatch(/admin-nav-group/);
    expect(adminCss).toMatch(/max-height 0\.32s/);
    expect(adminThemeCss).toMatch(/TailAdmin-inspired component theme/);
    expect(adminThemeCss).toMatch(/data-admin-theme="dark"/);
    expect(adminThemeCss).toMatch(/\.admin-main \.status-published/);
    expect(adminThemeCss).toMatch(/billing-state-paid_active/);
    expect(adminThemeCss).toMatch(/\.admin-menu-icon/);
    expect(adminThemeCss).toMatch(/\.admin-page-progress/);
    expect(adminThemeCss).toMatch(/\.admin-empty-state/);
    expect(adminThemeCss).toMatch(/\.finance-subnav/);
    expect(adminThemeCss).toMatch(/\.overview-kpi-grid/);
    expect(adminThemeCss).toMatch(/\.overview-toolbar/);
    expect(adminThemeCss).toMatch(/\.overview-custom-range/);
    expect(adminUiJs).toMatch(/admin-toast/);
    expect(adminUiJs).toMatch(/wrapSwitchTab/);
    expect(dashJs).toMatch(/dashUiLoading/);
    expect(dashJs).toMatch(/showBillingOrgList/);
    expect(dashJs).toMatch(/renderBillingOrgList/);
    expect(dashJs).toMatch(/switchFinanceSubtab/);
    expect(dashJs).toMatch(/org-row-actions/);
    expect(dashJs).toMatch(/renderOverviewDashboard/);
    expect(dashJs).toMatch(/loadOverviewDashboard/);
    expect(dashJs).toMatch(/\/overview\/dashboard/);
    expect(dashJs).toMatch(/renderOverviewRevExpWidget/);
    expect(dashJs).toMatch(/setOverviewRevExpPeriod/);
    expect(dashJs).toMatch(/buildOverviewAreaSparkline/);
    expect(dashJs).toMatch(/buildOverviewStackedBar/);
    expect(dashJs).toMatch(/buildOverviewDonut/);
    expect(dashJs).toMatch(/buildOverviewProgressRing/);
    expect(dashJs).toMatch(/buildOverviewStatusGauge/);
    expect(adminThemeCss).toMatch(/AD17/);
    expect(dashJs).toMatch(/buildOverviewOrgGrowthChart/);
    expect(dashJs).toMatch(/handleOverviewOrgGrowthWheel/);
    expect(dashJs).toMatch(/shiftOverviewOrgGrowth/);
    expect(adminThemeCss).toMatch(/AD18/);
    expect(dashJs).toMatch(/buildOverviewDonutChart/);
    expect(dashJs).toMatch(/buildOverviewSubscriptionTable/);
    expect(dashJs).toMatch(/buildOverviewSubscriptionRevenue/);
    expect(dashJs).toMatch(/buildOverviewSubscriptionTrend/);
    expect(dashJs).toMatch(/buildOverviewSubscriptionKpiStrip/);
    expect(dashJs).toMatch(/buildOverviewNewSubscriptionChart/);
    expect(dashJs).toMatch(/buildOverviewUpgradeFlow/);
    expect(dashJs).toMatch(/setOverviewSubscriptionRange/);
    expect(adminThemeCss).toMatch(/AD26/);
    expect(dashJs).toMatch(/setOverviewDashboardSection/);
    expect(dashHtml).toMatch(/data-overview-section-btn="priority"/);
    expect(adminThemeCss).toMatch(/AD27/);
    expect(dashJs).toMatch(/formatOverviewPeriodLabel/);
    expect(dashHtml).toMatch(/id="overviewRangeSummary"/);
    expect(dashHtml).toMatch(/Trạng thái tòa nhà/);
    expect(dashJs).toMatch(/buildOverviewMapStats/);
    expect(dashJs).toMatch(/Bản đồ hiện hành/);
    expect(adminThemeCss).toMatch(/AD20/);
    expect(dashHtml).toMatch(/data-revexp-period="weekly"/);
    expect(dashJs).toMatch(/'overview'/);
    expect(adminThemeCss).toMatch(/AD13/);
    expect(dashJs).toMatch(/title="Mở trình soạn bản đồ tầng"/);
    expect(dashJs).toMatch(/Mở quản lý gói & thanh toán/);

    expect(dashHtml).toMatch(/id="profileOrgSection"/);
    expect(dashHtml).toMatch(/id="profileOrgPlan"/);
    expect(dashHtml).toMatch(/id="profileOrgExpiry"/);
    expect(dashHtml).toMatch(/id="profileOrgContactPhone"/);
    expect(dashHtml).toMatch(/id="profileOrgContactAddress"/);
    expect(dashJs).toMatch(/\/organizations\/me\/contact/);

    expect(editorApi).toMatch(/saveDraftToServer/);
    expect(editorHtml).toMatch(/Lưu nháp/);
    expect(editorHtml).toMatch(/id="editorFloorLockBanner"/);
    expect(editorCss).toMatch(/editor-floor-lock-banner/);
    expect(editorApi).toMatch(/acquireFloorLock/);
    expect(editorApi).toMatch(/saveDraftToServer/);
    expect(editorApi).toMatch(/\/draft/);

    expect(trialHtml).toMatch(/id="contactPhone"/);
    expect(trialHtml).not.toMatch(/id="contactPhone"[^>]*required/);

    // WL4 — entry login là Landing; /admin/index.html chỉ redirect
    expect(loginHtml).toMatch(/id="googleLoginWrap"[^>]*display:none/);
    expect(loginHtml).toMatch(/\/login/);
    expect(landingLoginHtml).toMatch(/id="loginForm"/);
    expect(landingLoginHtml).toMatch(/id="googleLoginWrap"/);
    expect(landingLoginJs).toMatch(/\/auth\/google\/status/);
    expect(landingLoginJs).toMatch(/wrap\.style\.display = 'block'/);
    expect(loginJs).toMatch(/\/auth\/google\/status/);
    expect(loginJs).toMatch(/wrap\.style\.display = 'block'/);
  });

  test('TC-8.0b building resource detail trả KPI và trạng thái từng tầng', async () => {
    const res = await authReq(orgToken)('get', `${API}/buildings/${testBuildingId}`);

    expect(res.status).toBe(200);
    expect(res.body.resource_summary).toEqual(expect.objectContaining({
      total_floors: expect.any(Number),
      map_count: expect.any(Number),
      qr_count: expect.any(Number),
      building_admin_count: expect.any(Number),
      version_count: expect.any(Number)
    }));
    expect(Array.isArray(res.body.floors)).toBe(true);
    expect(res.body.floors[0]).toEqual(expect.objectContaining({
      floor_number: 0,
      has_map: true,
      is_published: true,
      version: expect.any(Number),
      qr_count: expect.any(Number)
    }));
    expect(Array.isArray(res.body.recent_activity)).toBe(true);
    expect(Array.isArray(res.body.qr_scan_series_30d)).toBe(true);
  });

  test('TC-8.1 draft save → public GET unchanged; publish → public changed', async () => {
    const beforePublic = await request(app).get(`${API}/maps/${testBuildingId}/0/public`);
    expect(beforePublic.status).toBe(200);
    const beforeName = beforePublic.body.map_data?.rooms?.[0]?.name;

    const draftRes = await authReq(orgToken)('put', `${API}/maps/${testBuildingId}/0/draft`).send({
      map_data: {
        rooms: [{ id: 'r-draft', name: 'Draft Only Room' }],
        nodes: [],
        edges: []
      }
    });
    expect(draftRes.status).toBe(200);

    const afterDraftPublic = await request(app).get(`${API}/maps/${testBuildingId}/0/public`);
    expect(afterDraftPublic.status).toBe(200);
    expect(afterDraftPublic.body.map_data?.rooms?.[0]?.name).toBe(beforeName);
    expect(afterDraftPublic.body.map_data?.rooms?.[0]?.name).not.toBe('Draft Only Room');

    const getDraft = await authReq(orgToken)('get', `${API}/maps/${testBuildingId}/0/draft`);
    expect(getDraft.status).toBe(200);
    expect(getDraft.body.draft_map_data?.rooms?.[0]?.name).toBe('Draft Only Room');

    const publish = await authReq(orgToken)('post', `${API}/maps/${testBuildingId}/0/publish`).send({
      use_draft: true
    });
    expect([200, 201]).toContain(publish.status);

    const afterPublish = await request(app).get(`${API}/maps/${testBuildingId}/0/public`);
    expect(afterPublish.status).toBe(200);
    expect(afterPublish.body.map_data?.rooms?.[0]?.name).toBe('Draft Only Room');
  });

  test('TC-8.2 lock acquire conflict → 409; publish bị chặn khi người khác giữ', async () => {
    const sessionA = 'sess-p8-a-' + Date.now();
    const sessionB = 'sess-p8-b-' + Date.now();

    const lockA = await authReq(orgToken)('post', `${API}/maps/${testBuildingId}/0/lock`).send({
      session_id: sessionA
    });
    expect(lockA.status).toBe(200);

    const lockB = await authReq(superToken)('post', `${API}/maps/${testBuildingId}/0/lock`).send({
      session_id: sessionB
    });
    expect(lockB.status).toBe(409);
    expect(lockB.body.code).toBe('LOCK_HELD');

    const pubBlocked = await authReq(superToken)('post', `${API}/maps/${testBuildingId}/0/publish`)
      .set('X-Edit-Session-Id', sessionB)
      .send({
        map_data: { rooms: [{ id: 'r-x', name: 'Should Block' }], nodes: [], edges: [] }
      });
    expect(pubBlocked.status).toBe(409);
    expect(pubBlocked.body.code).toBe('LOCK_HELD');

    await authReq(orgToken)('post', `${API}/maps/${testBuildingId}/0/lock/release`).send({
      session_id: sessionA
    });
  });

  test('TC-8.3 permit required → 403 when env on', async () => {
    process.env.PUBLISH_PERMIT_REQUIRED = 'true';
    await Organization.findByIdAndUpdate(testOrg._id, {
      publish_permit_key: '',
      publish_permit_expires_at: null
    });

    const res = await authReq(orgToken)('post', `${API}/maps/${testBuildingId}/0/publish`).send({
      map_data: { rooms: [{ id: 'r1', name: 'Need Permit' }], nodes: [], edges: [] }
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PUBLISH_PERMIT_REQUIRED');

    const grant = await authReq(superToken)(
      'post',
      `${API}/organizations/${testOrg._id}/publish-permit`
    ).send({});
    expect(grant.status).toBe(200);
    expect(grant.body.organization.publish_permit_key).toBeTruthy();

    const ok = await authReq(orgToken)('post', `${API}/maps/${testBuildingId}/0/publish`).send({
      map_data: { rooms: [{ id: 'r1', name: 'With Permit' }], nodes: [], edges: [] }
    });
    expect([200, 201]).toContain(ok.status);

    await authReq(superToken)('delete', `${API}/organizations/${testOrg._id}/publish-permit`);
    process.env.PUBLISH_PERMIT_REQUIRED = 'false';
  });

  test('TC-8.4 publish limiter skip in Jest mặc định — publish vẫn hoạt động', async () => {
    expect(process.env.JEST_WORKER_ID).toBeTruthy();
    expect(process.env.FORCE_PUBLISH_RATE_LIMIT).toBeUndefined();
    const res = await authReq(orgToken)('post', `${API}/maps/${testBuildingId}/0/publish`).send({
      map_data: { rooms: [{ id: 'r-rl', name: 'Rate Limit Skip' }], nodes: [], edges: [] }
    });
    expect([200, 201]).toContain(res.status);
  });

  test('TC-8.5 google status disabled without env; enabled + auth URL with dummy env', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const status = await request(app).get(`${API}/auth/google/status`);
    expect(status.status).toBe(200);
    expect(status.body.enabled).toBe(false);

    const start = await request(app).get(`${API}/auth/google`).set('Accept', 'application/json');
    expect(start.status).toBe(503);

    process.env.GOOGLE_CLIENT_ID = 'dummy-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'dummy-secret';
    const on = await request(app).get(`${API}/auth/google/status`);
    expect(on.status).toBe(200);
    expect(on.body.enabled).toBe(true);
    const urlRes = await request(app)
      .get(`${API}/auth/google`)
      .set('Accept', 'application/json');
    expect(urlRes.status).toBe(200);
    expect(urlRes.body.url).toMatch(/accounts\.google\.com/);

    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  test('TC-8.6 getMe includes plan_expires_at when org has it', async () => {
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await Organization.findByIdAndUpdate(testOrg._id, { plan_expires_at: expires });

    const me = await authReq(orgToken)('get', `${API}/users/me`);
    expect(me.status).toBe(200);
    expect(me.body.organization).toBeTruthy();
    expect(me.body.organization.plan_expires_at).toBeTruthy();
    expect(me.body.organization).toHaveProperty('contact_phone');
    expect(me.body.organization).toHaveProperty('contact_address');
  });

  test('TC-8.6b ORG_ADMIN cập nhật contact org qua PUT /organizations/me/contact', async () => {
    const phone = '0909988776';
    const address = '12 Nguyen Hue, Q1, HCM';
    const res = await authReq(orgToken)('put', `${API}/organizations/me/contact`).send({
      contact_phone: phone,
      contact_address: address
    });
    expect(res.status).toBe(200);
    expect(res.body.organization.contact_phone).toBe(phone);
    expect(res.body.organization.contact_address).toBe(address);

    const me = await authReq(orgToken)('get', `${API}/users/me`);
    expect(me.status).toBe(200);
    expect(me.body.organization.contact_phone).toBe(phone);
    expect(me.body.organization.contact_address).toBe(address);

    const denied = await authReq(superToken)('put', `${API}/organizations/me/contact`).send({
      contact_phone: '1'
    });
    expect(denied.status).toBe(403);
  });

  test('TC-8.7 checkout PROFILE_INCOMPLETE then OK after contact', async () => {
    const prevSandbox = process.env.TPTP_SANDBOX_ENABLED;
    const originalOrg = await Organization.findById(testOrg._id).lean();
    const prevPhone = orgUser.phone;
    let invoiceId;
    try {
      process.env.TPTP_SANDBOX_ENABLED = 'true';
      await Organization.findByIdAndUpdate(testOrg._id, {
        plan: 'FREE',
        billing_status: 'ACTIVE',
        contact_phone: '',
        contact_address: ''
      });
      await User.findByIdAndUpdate(orgUser._id, { phone: '' });

      const res = await authReq(orgToken)('post', `${API}/billing/checkout`).send({
        plan: 'PRO',
        action: 'upgrade'
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PROFILE_INCOMPLETE');

      const contact = await authReq(orgToken)('put', `${API}/organizations/me/contact`).send({
        contact_phone: '0911222333',
        contact_address: 'So 1 Le Loi Q1'
      });
      expect(contact.status).toBe(200);

      const ok = await authReq(orgToken)('post', `${API}/billing/checkout`).send({
        plan: 'PRO',
        action: 'upgrade'
      });
      expect(ok.status).toBe(201);
      expect(ok.body.checkout_url || ok.body.invoice).toBeTruthy();
      invoiceId = ok.body.invoice?._id;
    } finally {
      if (invoiceId) await Invoice.findByIdAndDelete(invoiceId);
      await User.findByIdAndUpdate(orgUser._id, { phone: prevPhone || '' });
      await Organization.findByIdAndUpdate(testOrg._id, {
        plan: originalOrg.plan,
        billing_status: originalOrg.billing_status,
        contact_phone: originalOrg.contact_phone || '',
        contact_address: originalOrg.contact_address || ''
      });
      if (prevSandbox === undefined) delete process.env.TPTP_SANDBOX_ENABLED;
      else process.env.TPTP_SANDBOX_ENABLED = prevSandbox;
    }
  });

  test('TC-8.8 trial self-service không bắt SĐT', async () => {
    const stamp = Date.now();
    const email = `p8.trial.${stamp}@example.com`;
    const slug = `p8-trial-${stamp}`;
    const res = await request(app).post(`${API}/org-registrations/self-service`).send({
      organizationName: `P8 Trial ${stamp}`,
      slug,
      contactName: 'Nguyen Van Trial',
      contactEmail: email,
      password: 'Password1!',
      contactPhone: ''
    });
    expect(res.status).toBe(201);
    expect(res.body.organization).toBeTruthy();
    const orgId = String(res.body.organization._id);
    createdOrgIds.push(orgId);
    const admin = await User.findOne({ email });
    expect(admin).toBeTruthy();
    if (admin) createdUserIds.push(String(admin._id));
  });

  test('TC-8.9 expiry reminder không crash khi thiếu SMTP', async () => {
    const prevHost = process.env.SMTP_HOST;
    const prevUser = process.env.SMTP_USER;
    const prevPass = process.env.SMTP_PASS;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const expires = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await Organization.findByIdAndUpdate(testOrg._id, {
      billing_status: 'ACTIVE',
      plan_expires_at: expires,
      plan_expiry_reminded_at: null
    });

    const stats = { scanned: 0, refreshed: 0, reminders: 0, errors: 0 };
    await expect(sendExpiryReminders(stats)).resolves.toBeUndefined();
    expect(stats.errors).toBe(0);

    const updated = await Organization.findById(testOrg._id).select('plan_expiry_reminded_at').lean();
    expect(updated.plan_expiry_reminded_at).toBeTruthy();

    if (prevHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = prevHost;
    if (prevUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = prevUser;
    if (prevPass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = prevPass;
  });

  // K5A — chạy cuối (chiếm rate limit bucket của org user)
  test('TC-8.10 FORCE rate limit → 429 sau 10 publish', async () => {
    process.env.FORCE_PUBLISH_RATE_LIMIT = 'true';
    process.env.PUBLISH_PERMIT_REQUIRED = 'false';

    const statuses = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await authReq(orgToken)('post', `${API}/maps/${testBuildingId}/0/publish`).send({
        map_data: {
          rooms: [{ id: 'r-rl', name: `RL ${i}` }],
          nodes: [],
          edges: []
        }
      });
      statuses.push(res.status);
      if (res.status === 429) {
        expect(res.body.code).toBe('PUBLISH_RATE_LIMIT');
      }
    }

    const okCount = statuses.filter((s) => s === 200 || s === 201).length;
    const limited = statuses.filter((s) => s === 429).length;
    expect(okCount).toBeGreaterThanOrEqual(1);
    expect(okCount).toBeLessThanOrEqual(10);
    expect(limited).toBeGreaterThanOrEqual(1);

    delete process.env.FORCE_PUBLISH_RATE_LIMIT;
  });
});
