// ============================================
// FILE: organizationController.js
// MỤC ĐÍCH: Xử lý logic liên quan đến Organization
// ============================================

const Organization = require('../models/Organization');
const Building = require('../models/Building');
const OrganizationBillingEvent = require('../models/OrganizationBillingEvent');
const Invoice = require('../models/Invoice');
const QrCode = require('../models/QrCode');
const MapVersion = require('../models/MapVersion');
const dashboardRead = require('../repositories/dashboardReadRepository');
const { recordActivity } = require('../repositories/activityLogRepository');
const { recordPlanChange } = require('../repositories/organizationPlanHistoryRepository');
const {
  createOrganizationWithAdmin
} = require('../application/coreTenant/createOrganizationWithAdmin');
const {
  upgradePersonalUser
} = require('../application/identity/organizationUpgradeApplicationService');
const { countActiveBuildings, countActiveUsers } = require('../utils/planQuota');
const {
  handlePlanChangeBilling,
  normalizeBillingStatus,
  getOrgQuotaSnapshot,
  annotateBuildingsQuotaLock,
  annotateUsersQuotaLock
} = require('../utils/overQuotaLock');
const {
  getCurrentSubscription,
  applyBillingEventToSubscription,
  activateOrRenewSubscription,
  cancelCurrentSubscription,
  expireCurrentSubscription,
  refreshSubscriptionStatus
} = require('../application/billing/subscriptionApplicationService');
const { getPlanPrice, getPlanPeriodDays } = require('../config/planPricing');
const { assertPlanCode, isPaidPlan } = require('../services/planCatalog');

const VALID_PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED'];

function logActivity(data) {
  recordActivity(data).catch(() => {});
}

async function recordPlanHistory(org, meta) {
  try {
    const [buildingsActive, usersActive] = await Promise.all([
      countActiveBuildings(org._id),
      countActiveUsers(org._id)
    ]);
    await recordPlanChange({
      organization_id: org._id,
      from_plan: meta.from_plan ?? null,
      to_plan: meta.to_plan,
      from_billing_status: meta.from_billing_status ?? null,
      to_billing_status: meta.to_billing_status ?? org.billing_status,
      changed_by: meta.changed_by ?? null,
      source: meta.source || 'MANUAL_SUPER_ADMIN',
      note: meta.note || '',
      snapshot: { buildings_active: buildingsActive, users_active: usersActive }
    });
  } catch (e) {
    console.warn('recordPlanHistory:', e.message);
  }
}

function normalizePaymentStatus(status) {
  const s = String(status || '').toUpperCase();
  return VALID_PAYMENT_STATUSES.includes(s) ? s : null;
}

/**
 * Phase 5.6 — billing event đi qua Subscription lifecycle (source of truth),
 * rồi ghi OrganizationPlanHistory nếu org đổi trạng thái.
 */
async function applyBillingEventToOrganization(org, event) {
  const prev = {
    plan: org.plan,
    billing_status: org.billing_status,
    plan_started_at: org.plan_started_at ? new Date(org.plan_started_at).toISOString() : null,
    plan_expires_at: org.plan_expires_at ? new Date(org.plan_expires_at).toISOString() : null
  };

  const result = await applyBillingEventToSubscription(org, event);

  const changed =
    prev.plan !== org.plan ||
    prev.billing_status !== org.billing_status ||
    prev.plan_started_at !== (org.plan_started_at ? new Date(org.plan_started_at).toISOString() : null) ||
    prev.plan_expires_at !== (org.plan_expires_at ? new Date(org.plan_expires_at).toISOString() : null);

  if (changed) {
    await recordPlanHistory(org, {
      from_plan: prev.plan,
      to_plan: org.plan,
      from_billing_status: prev.billing_status,
      to_billing_status: org.billing_status,
      changed_by: event.created_by || null,
      source: 'PAYMENT',
      note: `[${event.event_type}] ${event.note || ''}`.trim()
    });
  }

  return result;
}

async function listOrganizations(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được truy cập.' });
    }

    const { active, with_counts } = req.query;
    const query = active === 'true' ? { is_active: true } : {};

    let orgs = await Organization.find(query)
      .select('name slug is_active plan billing_status grace_ends_at plan_started_at plan_expires_at createdAt created_at')
      .sort({ name: 1 })
      .lean();

    if (with_counts === 'true' && orgs.length) {
      const orgIds = orgs.map(o => o._id);

      const [buildingCounts, buildingStatusCounts, userCounts, orgAdmins] = await Promise.all([
        Building.aggregate([
          { $match: { organization_id: { $in: orgIds } } },
          { $group: { _id: '$organization_id', count: { $sum: 1 } } }
        ]),
        Building.aggregate([
          { $match: { organization_id: { $in: orgIds } } },
          { $group: { _id: { org: '$organization_id', status: '$status' }, count: { $sum: 1 } } }
        ]),
        dashboardRead.aggregateUsers([
          { $match: { organization_id: { $in: orgIds } } },
          { $group: { _id: '$organization_id', count: { $sum: 1 } } }
        ]),
        dashboardRead.findUsers(
          { organization_id: { $in: orgIds }, role: 'ORG_ADMIN' },
          {
            select: 'organization_id email full_name is_active createdAt',
            sort: { createdAt: 1 }
          }
        )
      ]);

      const bMap = Object.fromEntries(buildingCounts.map(b => [String(b._id), b.count]));
      const pubMap = {};
      const draftMap = {};
      buildingStatusCounts.forEach((row) => {
        const orgKey = String(row._id.org);
        if (row._id.status === 'PUBLISHED') pubMap[orgKey] = row.count;
        else if (row._id.status === 'DRAFT') draftMap[orgKey] = row.count;
      });
      const uMap = Object.fromEntries(userCounts.map(u => [String(u._id), u.count]));
      const adminMap = {};
      orgAdmins.forEach((a) => {
        const key = String(a.organization_id);
        if (!adminMap[key]) adminMap[key] = [];
        adminMap[key].push({
          _id: a._id,
          email: a.email,
          full_name: a.full_name,
          is_active: a.is_active
        });
      });

      orgs = orgs.map((org) => {
        const admins = adminMap[String(org._id)] || [];
        return {
          ...org,
          building_count: bMap[String(org._id)] || 0,
          building_published_count: pubMap[String(org._id)] || 0,
          building_draft_count: draftMap[String(org._id)] || 0,
          user_count: uMap[String(org._id)] || 0,
          org_admins: admins,
          org_admin: admins[0] || null
        };
      });
    }

    res.status(200).json(orgs);
  } catch (error) {
    console.error('ListOrganizations error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

async function createWithAdmin(req, res) {
 try {
   if (!req.user || req.user.role !== 'SUPER_ADMIN') {
     return res.status(403).json({ message: 'Chỉ Super Admin được tạo tổ chức.' });
   }

    const {
      organizationName,
      slug,
      plan,
      adminName,
      adminEmail,
      adminPassword
    } = req.body;

    const result = await createOrganizationWithAdmin({
      organizationName,
      slug,
      plan,
      adminName,
      adminEmail,
      adminPassword,
      source: 'MANUAL',
      createdByUserId: req.user.userId,
      ipAddress: req.ip || ''
    });

    res.status(201).json({
      message: 'Tạo tổ chức và tài khoản quản trị thành công!',
      ...result
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: error.message || 'Slug hoặc email đã tồn tại.' });
    }
    const status = error.message && (
      error.message.includes('Slug') ||
      error.message.includes('Email') ||
      error.message.includes('Mật khẩu') ||
      error.message.includes('không')
    ) ? 400 : 500;
    res.status(status).json({ message: error.message || 'Không thể tạo tổ chức.' });
  }
}

// Dựng payload chi tiết tổ chức (dùng chung cho Super Admin và ORG_ADMIN/me).
async function buildOrgDetailPayload(orgDoc) {
    const orgId = orgDoc._id;
    const [
      buildingCount,
      userCount,
      activeBuildingCount,
      activeUserCount,
      orgAdmins,
      recentBuildings,
      recentUsers,
      recentLogs,
      userRoleCounts,
      buildingStatusCounts,
      quota,
      planHistory,
      planDistributionRows,
      planChangeCount,
      activityRows,
      recentBillingEvents,
      billingStatusRows,
      recentInvoices,
      floorSumAgg,
      buildingIdsForOrg
    ] = await Promise.all([
      Building.countDocuments({ organization_id: orgId }),
      dashboardRead.countUsers({ organization_id: orgId }),
      Building.countDocuments({ organization_id: orgId, is_active: { $ne: false } }),
      dashboardRead.countUsers({
        organization_id: orgId,
        is_active: { $ne: false },
        role: { $in: ['ORG_ADMIN', 'BUILDING_ADMIN'] }
      }),
      dashboardRead.findUsers(
        { organization_id: orgId, role: 'ORG_ADMIN' },
        {
          select: 'email full_name phone is_active last_login createdAt updatedAt',
          sort: { createdAt: 1 }
        }
      ),
      Building.find({ organization_id: orgId })
        .select('name status address total_floors is_active updatedAt createdAt')
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
      dashboardRead.findUsers(
        { organization_id: orgId },
        {
          select: 'email full_name phone role is_active last_login createdAt',
          sort: { createdAt: -1 },
          limit: 10
        }
      ),
      dashboardRead.findActivity(
        { organization_id: orgId },
        { sort: { createdAt: -1 }, limit: 10 }
      ),
      dashboardRead.aggregateUsers([
        { $match: { organization_id: orgId } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      Building.aggregate([
        { $match: { organization_id: orgId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      getOrgQuotaSnapshot(orgDoc),
      dashboardRead.findPlanHistory(
        { organization_id: orgId },
        { sort: { createdAt: -1 }, limit: 20 }
      ),
      dashboardRead.aggregatePlanHistory([
        { $match: { organization_id: orgId } },
        { $group: { _id: '$to_plan', count: { $sum: 1 } } }
      ]),
      dashboardRead.countPlanHistory({ organization_id: orgId }),
      dashboardRead.aggregateActivity([
        { $match: { organization_id: orgId } },
        { $group: { _id: '$action', count: { $sum: 1 } } }
      ]),
      OrganizationBillingEvent.find({ organization_id: orgId })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      OrganizationBillingEvent.aggregate([
        { $match: { organization_id: orgId } },
        { $group: { _id: '$payment_status', count: { $sum: 1 } } }
      ]),
      Invoice.find({ organization_id: orgId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      Building.aggregate([
        { $match: { organization_id: orgId } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$total_floors', 0] } } } }
      ]),
      Building.distinct('_id', { organization_id: orgId })
    ]);

    // Stats thật cho card Overview (chỉ số có nguồn dữ liệu rõ ràng)
    const orgBuildingIds = Array.isArray(buildingIdsForOrg) ? buildingIdsForOrg : [];
    const [qrCount, publishedFloorAgg] = await Promise.all([
      orgBuildingIds.length
        ? QrCode.countDocuments({ building_id: { $in: orgBuildingIds } })
        : 0,
      orgBuildingIds.length
        ? MapVersion.aggregate([
            { $match: { building_id: { $in: orgBuildingIds } } },
            { $group: { _id: { b: '$building_id', f: '$floor_number' } } },
            { $count: 'floors' }
          ])
        : []
    ]);
    const publishedMapCount = (publishedFloorAgg && publishedFloorAgg[0] && publishedFloorAgg[0].floors) || 0;
    const total_floors = (floorSumAgg && floorSumAgg[0] && floorSumAgg[0].total) || 0;
    const stats = {
      building_count: buildingCount,
      published_building_count: 0, // gán bên dưới sau khi có building_status_counts
      total_floors,
      published_map_count: publishedMapCount,
      qr_count: qrCount,
      building_admin_count: 0 // gán bên dưới sau khi có role_counts
    };

    // Phase 5.6 — subscription hiện hành (sau refresh quota/billing)
    let currentSubscription = await getCurrentSubscription(orgId);
    if (currentSubscription) {
      await refreshSubscriptionStatus(orgDoc, currentSubscription);
      currentSubscription = await getCurrentSubscription(orgId);
    }

    const [recentBuildingsAnnotated, recentUsersAnnotated, orgAdminsAnnotated] = await Promise.all([
      annotateBuildingsQuotaLock(orgDoc, recentBuildings),
      annotateUsersQuotaLock(orgDoc, recentUsers),
      annotateUsersQuotaLock(orgDoc, orgAdmins)
    ]);

    const role_counts = {};
    userRoleCounts.forEach((r) => { role_counts[r._id] = r.count; });
    stats.building_admin_count = role_counts.BUILDING_ADMIN || 0;
    const building_status_counts = {};
    buildingStatusCounts.forEach((b) => { building_status_counts[b._id] = b.count; });
    stats.published_building_count = building_status_counts.PUBLISHED || 0;
    const plan_distribution = {};
    planDistributionRows.forEach((row) => {
      const code = String(row._id || 'FREE').toUpperCase();
      plan_distribution[code] = row.count || 0;
    });
    if (plan_distribution.FREE == null) plan_distribution.FREE = 0;
    const paid_registrations_total = Object.keys(plan_distribution).reduce((sum, code) => {
      if (code === 'FREE') return sum;
      return sum + (isPaidPlan(code) ? (plan_distribution[code] || 0) : 0);
    }, 0);
    const activity_counts = {};
    activityRows.forEach((row) => { activity_counts[row._id] = row.count; });
    const billing_status_counts = { PENDING: 0, PAID: 0, FAILED: 0, EXPIRED: 0, REFUNDED: 0 };
    billingStatusRows.forEach((row) => {
      if (billing_status_counts[row._id] !== undefined) {
        billing_status_counts[row._id] = row.count;
      }
    });
    const lifecycle_stats = {
      plan_changes_total: planChangeCount || 0,
      plan_distribution,
      paid_registrations_total,
      current_cycle_started_at: orgDoc.plan_started_at || null,
      current_cycle_expires_at: orgDoc.plan_expires_at || null,
      last_activity_at: recentLogs[0]?.createdAt || null,
      billing_status_counts,
      activity_counts: {
        create_building: activity_counts.CREATE_BUILDING || 0,
        publish_map: activity_counts.PUBLISH_MAP || 0,
        create_user: activity_counts.CREATE_USER || 0,
        deactivate_user: activity_counts.DEACTIVATE_USER || 0,
        update_building: activity_counts.UPDATE_BUILDING || 0,
        rollback_map: activity_counts.ROLLBACK_MAP || 0,
        login: activity_counts.LOGIN || 0
      }
    };

    return {
      organization: orgDoc.toObject(),
      building_count: buildingCount,
      active_building_count: activeBuildingCount,
      user_count: userCount,
      active_user_count: activeUserCount,
      role_counts,
      building_status_counts,
      stats,
      quota,
      lifecycle_stats,
      plan_history: planHistory,
      billing_events: recentBillingEvents,
      current_subscription: currentSubscription
        ? (typeof currentSubscription.toObject === 'function' ? currentSubscription.toObject() : currentSubscription)
        : null,
      invoices: recentInvoices,
      org_admins: orgAdminsAnnotated,
      recent_buildings: recentBuildingsAnnotated,
      recent_users: recentUsersAnnotated,
      recent_logs: recentLogs
    };
}

// GET /api/organizations/:id — Super Admin: chi tiết tổ chức (Phase 4.1)
async function getOrganization(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được truy cập.' });
    }
    const orgDoc = await Organization.findById(req.params.id);
    if (!orgDoc) {
      return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });
    }
    const payload = await buildOrgDetailPayload(orgDoc);
    res.status(200).json(payload);
  } catch (error) {
    console.error('GetOrganization error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/organizations/me/detail — ORG_ADMIN: chi tiết tổ chức của chính mình
async function getMyOrganizationDetail(req, res) {
  try {
    if (!req.user || req.user.role !== 'ORG_ADMIN') {
      return res.status(403).json({ message: 'Chỉ ORG_ADMIN được xem tổ chức của mình.' });
    }
    if (!req.user.organization_id) {
      return res.status(403).json({ message: 'Tài khoản ORG_ADMIN chưa được gán tổ chức.' });
    }
    const orgDoc = await Organization.findById(req.user.organization_id);
    if (!orgDoc) {
      return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });
    }
    const payload = await buildOrgDetailPayload(orgDoc);
    res.status(200).json(payload);
  } catch (error) {
    console.error('GetMyOrganizationDetail error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

/**
 * Lõi tạo tổ chức từ tài khoản cá nhân (dùng chung cho tạo trực tiếp & tạo sau thanh toán).
 * KHÔNG bump session_version, KHÔNG cấp session — để caller tự quyết định thời điểm.
 * @param {Object} user - document User (REGISTERED_USER, chưa có tổ chức)
 * @param {Object} opts - { name, slug, plan, activatePaid, source, ip }
 * @returns {Object} { org, migratedCount }
 */
async function createOrgForUserCore(user, { name, slug = '', plan = 'BUSINESS', activatePaid = false, source = 'SELF_UPGRADE', ip = '' } = {}) {
  const orgName = String(name || '').trim();
  if (orgName.length < 2) {
    throw Object.assign(new Error('Tên tổ chức phải có ít nhất 2 ký tự.'), { status: 400 });
  }
  let planCode = String(plan || 'BUSINESS').toUpperCase();
  if (!['BUSINESS', 'ENTERPRISE', 'PRO', 'FREE'].includes(planCode)) planCode = 'BUSINESS';

  // Slug duy nhất
  const baseSlug = String(slug || orgName)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';
  let finalSlug = baseSlug;
  let attempt = 0;
  while (await Organization.findOne({ slug: finalSlug }).select('_id').lean()) {
    attempt += 1;
    finalSlug = `${baseSlug}-${attempt}`;
    if (attempt > 50) { finalSlug = `${baseSlug}-${Date.now().toString(36)}`; break; }
  }

  const orgData = { name: orgName, slug: finalSlug, plan: planCode, is_active: true };
  // Nếu đã thanh toán → kích hoạt kỳ hạn gói trả phí
  if (activatePaid && isPaidPlan(planCode)) {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + (getPlanPeriodDays(planCode) || 30));
    orgData.plan_started_at = now;
    orgData.plan_expires_at = end;
    orgData.billing_status = 'ACTIVE';
  }
  const org = await Organization.create(orgData);

  // Nâng cấp user -> ORG_ADMIN + gán tổ chức (KHÔNG bump session_version ở đây)
  user.role = 'ORG_ADMIN';
  user.organization_id = org._id;
  await user.save();

  // Di trú building Personal Workspace sang tổ chức
  const migrate = await Building.updateMany(
    { owner_user_id: user._id },
    { $set: { organization_id: org._id, owner_user_id: null } }
  );

  logActivity({
    user_id: user._id,
    action: 'CREATE_ORG',
    target_type: 'organization',
    target_id: String(org._id),
    target: org.name,
    details: { slug: org.slug, plan: org.plan, source, migrated_buildings: migrate.modifiedCount || 0 },
    ip_address: ip || '',
    organization_id: String(org._id)
  });

  return { org, migratedCount: migrate.modifiedCount || 0 };
}

// POST /api/organizations/me/create — REGISTERED_USER tạo tổ chức, tự nâng lên ORG_ADMIN
async function createOrganizationFromPersonal(req, res) {
  try {
    if (!req.user || req.user.role !== 'REGISTERED_USER') {
      return res.status(403).json({ message: 'Chỉ tài khoản cá nhân mới được tạo tổ chức.' });
    }

    // Chính sách Freeze: tạo tổ chức = gói trả phí (BUSINESS/ENTERPRISE) → phải qua thanh toán.
    // Đường tạo miễn phí đã bị vô hiệu hóa; dùng luồng checkout QR để tạo tổ chức.
    if (String(process.env.ALLOW_FREE_ORG_CREATE || '').toLowerCase() !== 'true') {
      return res.status(403).json({
        message: 'Tạo tổ chức phải qua thanh toán gói (BUSINESS/ENTERPRISE). Vui lòng dùng trang nâng cấp: /admin/upgrade-pro.html?scope=create-org&plan=BUSINESS',
        code: 'FREE_ORG_CREATE_DISABLED'
      });
    }

    const { org, migratedCount, user, authSession } = await upgradePersonalUser({
      userId: req.user.userId,
      name: req.body?.name,
      slug: req.body?.slug,
      plan: req.body?.plan,
      source: 'SELF_UPGRADE',
      ip: req.ip || ''
    }, {
      req,
      ipAddress: req.ip || ''
    });

    return res.status(201).json({
      message: 'Tạo tổ chức thành công! Bạn giờ là Quản trị tổ chức.',
      organization: { _id: org._id, name: org.name, slug: org.slug, plan: org.plan },
      migrated_buildings: migratedCount,
      token: authSession.token,
      refreshToken: authSession.refreshToken,
      user: { id: user._id, email: user.email, role: user.role, organization_id: user.organization_id }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Slug tổ chức đã tồn tại, vui lòng thử tên khác.' });
    }
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('createOrganizationFromPersonal:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// PATCH /api/organizations/:id — Super Admin: đổi plan, tạm dừng / kích hoạt org (Phase 4.1a)
async function updateOrganization(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được cập nhật tổ chức.' });
    }

    const { id } = req.params;
    const body = req.body || {};

    const blocked = ['name', 'slug', '_id', 'createdAt', 'updatedAt'];
    const illegal = blocked.filter((k) => body[k] !== undefined);
    if (illegal.length) {
      return res.status(400).json({
        message: 'Không được sửa các trường: ' + illegal.join(', ') + '. Chỉ cho phép is_active, plan, billing_status, grace_ends_at, plan_started_at, plan_expires_at, contact_phone, contact_address.'
      });
    }

    if (
      body.is_active === undefined &&
      body.plan === undefined &&
      body.billing_status === undefined &&
      body.grace_ends_at === undefined &&
      body.plan_started_at === undefined &&
      body.plan_expires_at === undefined &&
      body.contact_phone === undefined &&
      body.contact_address === undefined
    ) {
      return res.status(400).json({
        message: 'Cần gửi is_active, plan, billing_status, grace_ends_at, plan_started_at, plan_expires_at, contact_phone hoặc contact_address để cập nhật.'
      });
    }

    const org = await Organization.findById(id);
    if (!org) {
      return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });
    }

    const changes = {};
    let logAction = 'UPDATE_ORGANIZATION';

    if (body.plan !== undefined) {
      let plan;
      try {
        plan = await assertPlanCode(body.plan, { mustExist: true });
      } catch (err) {
        return res.status(err.status || 400).json({
          message: err.message || 'Gói không hợp lệ trong danh mục.'
        });
      }
      if (org.plan !== plan) {
        const oldPlan = org.plan;
        const oldBilling = org.billing_status;
        const oldGrace = org.grace_ends_at;
        changes.plan = { from: oldPlan, to: plan };
        org.plan = plan;
        await handlePlanChangeBilling(org, oldPlan, plan, {
          changedBy: req.user.userId,
          note: `Đổi gói ${oldPlan} → ${plan}`
        });
        if (org.billing_status !== oldBilling) {
          changes.billing_status = { from: oldBilling, to: org.billing_status };
        }
        const oldGraceIso = oldGrace ? new Date(oldGrace).toISOString() : null;
        const newGraceIso = org.grace_ends_at ? new Date(org.grace_ends_at).toISOString() : null;
        if (oldGraceIso !== newGraceIso) {
          changes.grace_ends_at = { from: oldGraceIso, to: newGraceIso };
        }
      }
    }

    if (body.billing_status !== undefined) {
      const billingStatus = normalizeBillingStatus(body.billing_status);
      if (org.billing_status !== billingStatus) {
        changes.billing_status = { from: org.billing_status, to: billingStatus };
        org.billing_status = billingStatus;
        if (billingStatus !== 'GRACE_PERIOD') {
          org.grace_ends_at = null;
        }
      }
    }

    if (body.grace_ends_at !== undefined) {
      const nextGrace = body.grace_ends_at ? new Date(body.grace_ends_at) : null;
      if (Number.isNaN(nextGrace?.getTime?.()) && body.grace_ends_at) {
        return res.status(400).json({ message: 'grace_ends_at không hợp lệ.' });
      }
      const prev = org.grace_ends_at ? org.grace_ends_at.toISOString() : null;
      const next = nextGrace ? nextGrace.toISOString() : null;
      if (prev !== next) {
        changes.grace_ends_at = { from: prev, to: next };
        org.grace_ends_at = nextGrace;
        if (nextGrace && org.billing_status !== 'GRACE_PERIOD') {
          org.billing_status = 'GRACE_PERIOD';
        }
      }
    }

    if (body.plan_started_at !== undefined) {
      const nextStarted = body.plan_started_at ? new Date(body.plan_started_at) : null;
      if (Number.isNaN(nextStarted?.getTime?.()) && body.plan_started_at) {
        return res.status(400).json({ message: 'plan_started_at không hợp lệ.' });
      }
      const prev = org.plan_started_at ? org.plan_started_at.toISOString() : null;
      const next = nextStarted ? nextStarted.toISOString() : null;
      if (prev !== next) {
        changes.plan_started_at = { from: prev, to: next };
        org.plan_started_at = nextStarted;
      }
    }

    if (body.plan_expires_at !== undefined) {
      const nextExpires = body.plan_expires_at ? new Date(body.plan_expires_at) : null;
      if (Number.isNaN(nextExpires?.getTime?.()) && body.plan_expires_at) {
        return res.status(400).json({ message: 'plan_expires_at không hợp lệ.' });
      }
      const startTs = org.plan_started_at ? new Date(org.plan_started_at).getTime() : null;
      const endTs = nextExpires ? nextExpires.getTime() : null;
      if (startTs != null && endTs != null && endTs < startTs) {
        return res.status(400).json({ message: 'plan_expires_at phải lớn hơn hoặc bằng plan_started_at.' });
      }
      const prev = org.plan_expires_at ? org.plan_expires_at.toISOString() : null;
      const next = nextExpires ? nextExpires.toISOString() : null;
      if (prev !== next) {
        changes.plan_expires_at = { from: prev, to: next };
        org.plan_expires_at = nextExpires;
      }
    }

    if (body.contact_phone !== undefined) {
      const nextPhone = String(body.contact_phone || '').trim();
      if (org.contact_phone !== nextPhone) {
        changes.contact_phone = { from: org.contact_phone || '', to: nextPhone };
        org.contact_phone = nextPhone;
      }
    }

    if (body.contact_address !== undefined) {
      const nextAddr = String(body.contact_address || '').trim();
      if (org.contact_address !== nextAddr) {
        changes.contact_address = { from: org.contact_address || '', to: nextAddr };
        org.contact_address = nextAddr;
      }
    }

    if (body.is_active !== undefined) {
      const nextActive = !!body.is_active;
      const wasActive = org.is_active !== false;
      if (nextActive === wasActive) {
        if (body.plan === undefined || Object.keys(changes).length === 0) {
          return res.status(400).json({
            message: nextActive ? 'Tổ chức đã đang hoạt động.' : 'Tổ chức đã được tạm dừng trước đó.'
          });
        }
      } else {
        if (!nextActive && org.slug === 'legacy') {
          return res.status(400).json({ message: 'Không thể tạm dừng tổ chức legacy (dữ liệu mặc định).' });
        }
        changes.is_active = { from: wasActive, to: nextActive };
        org.is_active = nextActive;
        logAction = nextActive ? 'ACTIVATE_ORGANIZATION' : 'DEACTIVATE_ORGANIZATION';
      }
    }

    if (!Object.keys(changes).length) {
      return res.status(400).json({ message: 'Không có thay đổi nào.' });
    }

    await org.save();

    if (changes.plan || changes.billing_status) {
      await recordPlanHistory(org, {
        from_plan: changes.plan?.from ?? org.plan,
        to_plan: changes.plan?.to ?? org.plan,
        from_billing_status: changes.billing_status?.from ?? null,
        to_billing_status: org.billing_status,
        changed_by: req.user.userId,
        note: changes.plan
          ? `Đổi gói ${changes.plan.from} → ${changes.plan.to}`
          : `Đổi billing ${changes.billing_status?.from} → ${org.billing_status}`
      });
    }

    logActivity({
      user_id: req.user.userId,
      action: logAction,
      target_type: 'organization',
      target_id: String(org._id),
      target: org.name,
      details: {
        message: logAction === 'DEACTIVATE_ORGANIZATION'
          ? 'Tạm dừng tổ chức'
          : logAction === 'ACTIVATE_ORGANIZATION'
            ? 'Kích hoạt lại tổ chức'
            : 'Cập nhật tổ chức',
        changes
      },
      ip_address: req.ip || '',
      organization_id: org._id
    });

    res.status(200).json({
      message: 'Cập nhật tổ chức thành công!',
      organization: org,
      quota: await getOrgQuotaSnapshot(org)
    });
  } catch (error) {
    console.error('UpdateOrganization error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/organizations/:id/billing-events — Super Admin: ghi nhận sự kiện billing
async function createOrganizationBillingEvent(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được cập nhật billing.' });
    }

    const { id } = req.params;
    const body = req.body || {};
    const eventType = String(body.event_type || '').toUpperCase();
    const paymentStatus = normalizePaymentStatus(body.payment_status);
    const nextPlan = body.plan !== undefined ? String(body.plan).toUpperCase() : null;

    if (!eventType) {
      return res.status(400).json({ message: 'event_type là bắt buộc.' });
    }
    if (!paymentStatus) {
      return res.status(400).json({ message: 'payment_status phải là PENDING/PAID/FAILED/EXPIRED/REFUNDED.' });
    }
    if (nextPlan) {
      try {
        await assertPlanCode(nextPlan, { mustExist: true });
      } catch (err) {
        return res.status(err.status || 400).json({
          message: err.message || 'Gói không hợp lệ trong danh mục.'
        });
      }
    }

    const org = await Organization.findById(id);
    if (!org) {
      return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });
    }

    const periodStart = body.period_start_at ? new Date(body.period_start_at) : null;
    const periodEnd = body.period_end_at ? new Date(body.period_end_at) : null;
    if (body.period_start_at && Number.isNaN(periodStart.getTime())) {
      return res.status(400).json({ message: 'period_start_at không hợp lệ.' });
    }
    if (body.period_end_at && Number.isNaN(periodEnd.getTime())) {
      return res.status(400).json({ message: 'period_end_at không hợp lệ.' });
    }
    if (periodStart && periodEnd && periodEnd.getTime() <= periodStart.getTime()) {
      return res.status(400).json({ message: 'period_end_at phải lớn hơn period_start_at.' });
    }

    const amountValue = Number(body.amount ?? 0);
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      return res.status(400).json({ message: 'amount phải là số không âm.' });
    }
    const currencyValue = String(body.currency || 'VND').toUpperCase().trim();
    if (!currencyValue || currencyValue.length > 8) {
      return res.status(400).json({ message: 'currency không hợp lệ.' });
    }

    const eventPayload = {
      organization_id: org._id,
      event_type: eventType,
      payment_status: paymentStatus,
      plan: nextPlan || null,
      amount: amountValue,
      currency: currencyValue,
      period_start_at: periodStart,
      period_end_at: periodEnd,
      external_ref: String(body.external_ref || '').trim(),
      idempotency_key: String(body.idempotency_key || '').trim(),
      note: String(body.note || '').trim(),
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      created_by: req.user.userId
    };

    let event;
    try {
      event = await OrganizationBillingEvent.create(eventPayload);
    } catch (err) {
      if (err?.code === 11000 && eventPayload.idempotency_key) {
        const existed = await OrganizationBillingEvent.findOne({
          organization_id: org._id,
          idempotency_key: eventPayload.idempotency_key
        }).lean();
        return res.status(409).json({
          message: 'idempotency_key đã tồn tại cho tổ chức này.',
          billing_event: existed || null
        });
      }
      throw err;
    }

    await applyBillingEventToOrganization(org, event);
    const currentSubscription = await getCurrentSubscription(org._id);
    const latestInvoice = currentSubscription
      ? await Invoice.findOne({ subscription_id: currentSubscription._id }).sort({ createdAt: -1 })
      : null;

    logActivity({
      user_id: req.user.userId,
      action: 'CREATE_BILLING_EVENT',
      target_type: 'organization',
      target_id: String(org._id),
      target: org.name,
      details: {
        message: 'Ghi nhận billing event',
        event_type: event.event_type,
        payment_status: event.payment_status,
        plan: event.plan || null,
        period_start_at: event.period_start_at || null,
        period_end_at: event.period_end_at || null,
        amount: event.amount,
        currency: event.currency,
        subscription_id: currentSubscription?._id || null,
        invoice_id: latestInvoice?._id || null
      },
      ip_address: req.ip || '',
      organization_id: org._id
    });

    res.status(201).json({
      message: 'Ghi nhận billing event thành công.',
      billing_event: event,
      organization: org,
      current_subscription: currentSubscription,
      invoice: latestInvoice,
      quota: await getOrgQuotaSnapshot(org)
    });
  } catch (error) {
    console.error('CreateOrganizationBillingEvent error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/organizations/:id/subscription — subscription hiện hành
async function getOrganizationSubscription(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được truy cập.' });
    }
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });

    let subscription = await getCurrentSubscription(org._id);
    if (subscription) {
      await refreshSubscriptionStatus(org, subscription);
      subscription = await getCurrentSubscription(org._id);
    }
    const invoices = await Invoice.find({ organization_id: org._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.status(200).json({
      organization: org,
      current_subscription: subscription,
      invoices,
      quota: await getOrgQuotaSnapshot(org)
    });
  } catch (error) {
    console.error('GetOrganizationSubscription error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// POST /api/organizations/:id/subscription/activate — kích hoạt/gia hạn gói trả phí
async function activateOrganizationSubscription(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được kích hoạt subscription.' });
    }

    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });

    const body = req.body || {};
    let plan;
    try {
      plan = await assertPlanCode(body.plan || 'PRO', { mustBePaid: true });
    } catch (err) {
      return res.status(err.status || 400).json({
        message: err.message || 'plan phải là gói trả phí trong danh mục.'
      });
    }

    const result = await activateOrRenewSubscription({
      org,
      plan,
      periodStart: body.period_start_at,
      periodEnd: body.period_end_at,
      amount: body.amount != null ? body.amount : getPlanPrice(plan),
      currency: body.currency || 'VND',
      note: body.note || `Kích hoạt ${plan} từ dashboard`,
      createdBy: req.user.userId,
      provider: body.provider || 'MANUAL',
      idempotencyKey: body.idempotency_key || '',
      metadata: body.metadata || {},
      recordHistory: true
    });

    logActivity({
      user_id: req.user.userId,
      action: 'ACTIVATE_SUBSCRIPTION',
      target_type: 'organization',
      target_id: String(org._id),
      target: org.name,
      details: {
        message: 'Kích hoạt/gia hạn subscription',
        plan,
        subscription_id: result.subscription?._id,
        invoice_id: result.invoice?._id
      },
      ip_address: req.ip || '',
      organization_id: org._id
    });

    res.status(201).json({
      message: 'Kích hoạt subscription thành công.',
      organization: org,
      current_subscription: result.subscription,
      invoice: result.invoice,
      quota: await getOrgQuotaSnapshot(org)
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('ActivateOrganizationSubscription error:', error);
    res.status(status).json({ message: error.message || 'Lỗi máy chủ.' });
  }
}

// POST /api/organizations/:id/subscription/cancel — hủy subscription
async function cancelOrganizationSubscription(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được hủy subscription.' });
    }
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });

    const immediate = req.body?.immediate !== false;
    const result = await cancelCurrentSubscription(org, {
      immediate,
      createdBy: req.user.userId,
      note: req.body?.note || 'Hủy subscription từ dashboard',
      source: 'MANUAL_SUPER_ADMIN'
   });

   logActivity({
     user_id: req.user.userId,
      action: 'CANCEL_SUBSCRIPTION',
     target_type: 'organization',
     target_id: String(org._id),
     target: org.name,
      details: {
        message: immediate ? 'Hủy subscription ngay' : 'Đặt hủy cuối chu kỳ',
        subscription_id: result.subscription?._id
      },
      ip_address: req.ip || '',
      organization_id: org._id
    });

    res.status(200).json({
      message: immediate ? 'Đã hủy subscription.' : 'Đã đặt hủy cuối chu kỳ.',
      organization: org,
      current_subscription: result.subscription,
      quota: await getOrgQuotaSnapshot(org)
    });
 } catch (error) {
    const status = error.status || 500;
    console.error('CancelOrganizationSubscription error:', error);
    res.status(status).json({ message: error.message || 'Lỗi máy chủ.' });
  }
}

// POST /api/organizations/:id/subscription/expire — hết hạn → FREE
async function expireOrganizationSubscription(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được expire subscription.' });
    }
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });

    const result = await expireCurrentSubscription(org, {
      createdBy: req.user.userId,
      note: req.body?.note || 'Expire subscription từ dashboard',
      source: 'MANUAL_SUPER_ADMIN',
      recordHistory: true
    });

    logActivity({
      user_id: req.user.userId,
      action: 'EXPIRE_SUBSCRIPTION',
      target_type: 'organization',
      target_id: String(org._id),
      target: org.name,
      details: {
        message: 'Expire subscription → FREE',
        subscription_id: result.subscription?._id
      },
      ip_address: req.ip || '',
      organization_id: org._id
    });

    res.status(200).json({
      message: 'Đã hết hạn subscription, org về FREE.',
      organization: org,
      current_subscription: result.subscription,
      quota: await getOrgQuotaSnapshot(org)
    });
  } catch (error) {
    console.error('ExpireOrganizationSubscription error:', error);
   res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
 }
}

// ==========================================
 // Phase 8 — Publish permit (SUPER_ADMIN)
 // ==========================================
async function setOrganizationPublishPermit(req, res) {
  try {
    const { setPermit } = require('../services/publishPermit');
    const { key, expires_at, expiresAt } = req.body || {};
    const org = await setPermit(req.params.id, {
      key,
      expiresAt: expires_at || expiresAt || null
    });

    logActivity({
      user_id: req.user.userId,
      action: 'SET_PUBLISH_PERMIT',
      target_type: 'organization',
      target_id: String(org._id),
      target: org.name || org.slug,
      details: {
        has_key: !!org.publish_permit_key,
        expires_at: org.publish_permit_expires_at
      },
      ip_address: req.ip || '',
      organization_id: org._id
    });

    res.status(200).json({
      message: 'Đã cấp publish permit.',
      organization: {
        _id: org._id,
        name: org.name,
        publish_permit_key: org.publish_permit_key,
        publish_permit_expires_at: org.publish_permit_expires_at
      }
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('setOrganizationPublishPermit:', error);
    res.status(status).json({ message: error.message || 'Lỗi cấp permit.' });
  }
}

async function clearOrganizationPublishPermit(req, res) {
  try {
    const { clearPermit } = require('../services/publishPermit');
    const org = await clearPermit(req.params.id);

    logActivity({
      user_id: req.user.userId,
      action: 'CLEAR_PUBLISH_PERMIT',
      target_type: 'organization',
      target_id: String(org._id),
      target: org.name || org.slug,
      ip_address: req.ip || '',
      organization_id: org._id
    });

    res.status(200).json({
      message: 'Đã thu hồi publish permit.',
      organization: {
        _id: org._id,
        name: org.name,
        publish_permit_key: org.publish_permit_key,
        publish_permit_expires_at: org.publish_permit_expires_at
      }
    });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('clearOrganizationPublishPermit:', error);
    res.status(status).json({ message: error.message || 'Lỗi thu hồi permit.' });
  }
}

// Phase 8 — ORG_ADMIN cập nhật hồ sơ liên hệ org (cho checkout PRO)
async function updateMyOrganizationContact(req, res) {
  try {
    if (!req.user || req.user.role !== 'ORG_ADMIN') {
      return res.status(403).json({ message: 'Chỉ ORG_ADMIN được cập nhật hồ sơ tổ chức của mình.' });
    }

    const me = await dashboardRead.findUserById(req.user.userId, 'organization_id');
    if (!me?.organization_id) {
      return res.status(403).json({ message: 'Tài khoản chưa gắn tổ chức.' });
    }

    const org = await Organization.findById(me.organization_id);
    if (!org) {
      return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });
    }

    const body = req.body || {};
    if (body.contact_phone === undefined && body.contact_address === undefined) {
      return res.status(400).json({ message: 'Cần gửi contact_phone và/hoặc contact_address.' });
    }

    if (body.contact_phone !== undefined) {
      org.contact_phone = String(body.contact_phone || '').trim();
    }
    if (body.contact_address !== undefined) {
      org.contact_address = String(body.contact_address || '').trim();
    }

    await org.save();

    logActivity({
      user_id: req.user.userId,
      action: 'UPDATE_ORG_CONTACT',
      target_type: 'organization',
      target_id: String(org._id),
      target: org.name || org.slug,
      details: {
        contact_phone: org.contact_phone,
        contact_address: org.contact_address
      },
      ip_address: req.ip || '',
      organization_id: org._id
    });

    res.status(200).json({
      message: 'Đã cập nhật hồ sơ tổ chức.',
      organization: {
        _id: org._id,
        name: org.name,
        contact_phone: org.contact_phone,
        contact_address: org.contact_address
      }
    });
  } catch (error) {
    console.error('updateMyOrganizationContact:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

module.exports = {
  listOrganizations,
  createWithAdmin,
  getOrganization,
  getMyOrganizationDetail,
  createOrganizationFromPersonal,
  createOrgForUserCore,
  updateOrganization,
  createOrganizationBillingEvent,
  getOrganizationSubscription,
  activateOrganizationSubscription,
  cancelOrganizationSubscription,
  expireOrganizationSubscription,
  setOrganizationPublishPermit,
  clearOrganizationPublishPermit,
  updateMyOrganizationContact
};
