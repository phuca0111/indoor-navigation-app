// ============================================
// FILE: organizationController.js
// MỤC ĐÍCH: Xử lý logic liên quan đến Organization
// ============================================

const Organization = require('../models/Organization');
const Building = require('../models/Building');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { createOrganizationWithAdmin } = require('../services/organizationOnboarding');

const VALID_PLANS = ['FREE', 'PRO', 'ENTERPRISE'];

function logActivity(data) {
  ActivityLog.create(data).catch(() => {});
}

async function listOrganizations(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được truy cập.' });
    }

    const { active, with_counts } = req.query;
    const query = active === 'true' ? { is_active: true } : {};

    let orgs = await Organization.find(query)
      .select('name slug is_active plan createdAt created_at')
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
        User.aggregate([
          { $match: { organization_id: { $in: orgIds } } },
          { $group: { _id: '$organization_id', count: { $sum: 1 } } }
        ]),
        User.find({ organization_id: { $in: orgIds }, role: 'ORG_ADMIN' })
          .select('organization_id email full_name is_active createdAt')
          .sort({ createdAt: 1 })
          .lean()
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

// GET /api/organizations/:id — Super Admin: chi tiết tổ chức (Phase 4.1)
async function getOrganization(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được truy cập.' });
    }

    const { id } = req.params;
    const org = await Organization.findById(id).lean();
    if (!org) {
      return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });
    }

    const orgId = org._id;
    const [
      buildingCount,
      userCount,
      orgAdmins,
      recentBuildings,
      recentUsers,
      recentLogs,
      userRoleCounts,
      buildingStatusCounts
    ] = await Promise.all([
      Building.countDocuments({ organization_id: orgId }),
      User.countDocuments({ organization_id: orgId }),
      User.find({ organization_id: orgId, role: 'ORG_ADMIN' })
        .select('email full_name phone is_active last_login createdAt updatedAt')
        .sort({ createdAt: 1 })
        .lean(),
      Building.find({ organization_id: orgId })
        .select('name status address total_floors updatedAt createdAt')
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
      User.find({ organization_id: orgId })
        .select('email full_name phone role is_active last_login createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      ActivityLog.find({ organization_id: orgId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      User.aggregate([
        { $match: { organization_id: orgId } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]),
      Building.aggregate([
        { $match: { organization_id: orgId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const role_counts = {};
    userRoleCounts.forEach((r) => { role_counts[r._id] = r.count; });
    const building_status_counts = {};
    buildingStatusCounts.forEach((b) => { building_status_counts[b._id] = b.count; });

    res.status(200).json({
      organization: org,
      building_count: buildingCount,
      user_count: userCount,
      role_counts,
      building_status_counts,
      org_admins: orgAdmins,
      recent_buildings: recentBuildings,
      recent_users: recentUsers,
      recent_logs: recentLogs
    });
  } catch (error) {
    console.error('GetOrganization error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
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
        message: 'Không được sửa các trường: ' + illegal.join(', ') + '. Chỉ cho phép is_active và plan.'
      });
    }

    if (body.is_active === undefined && body.plan === undefined) {
      return res.status(400).json({ message: 'Cần gửi is_active hoặc plan để cập nhật.' });
    }

    const org = await Organization.findById(id);
    if (!org) {
      return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });
    }

    const changes = {};
    let logAction = 'UPDATE_ORGANIZATION';

    if (body.plan !== undefined) {
      const plan = String(body.plan).toUpperCase();
      if (!VALID_PLANS.includes(plan)) {
        return res.status(400).json({ message: 'plan phải là FREE, PRO hoặc ENTERPRISE.' });
      }
      if (org.plan !== plan) {
        changes.plan = { from: org.plan, to: plan };
        org.plan = plan;
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
      organization: org
    });
  } catch (error) {
    console.error('UpdateOrganization error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

module.exports = {
  listOrganizations,
  createWithAdmin,
  getOrganization,
  updateOrganization
};
