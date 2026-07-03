// ============================================
// FILE: organizationController.js
// MỤC ĐÍCH: Xử lý logic liên quan đến Organization
// ============================================

const Organization = require('../models/Organization');
const Building = require('../models/Building');
const User = require('../models/User');
const { createOrganizationWithAdmin } = require('../services/organizationOnboarding');

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

      const [buildingCounts, userCounts, orgAdmins] = await Promise.all([
        Building.aggregate([
          { $match: { organization_id: { $in: orgIds } } },
          { $group: { _id: '$organization_id', count: { $sum: 1 } } }
        ]),
        User.aggregate([
          { $match: { organization_id: { $in: orgIds } } },
          { $group: { _id: '$organization_id', count: { $sum: 1 } } }
        ]),
        User.find({ organization_id: { $in: orgIds }, role: 'ORG_ADMIN' })
          .select('organization_id email full_name')
          .lean()
      ]);

      const bMap = Object.fromEntries(buildingCounts.map(b => [String(b._id), b.count]));
      const uMap = Object.fromEntries(userCounts.map(u => [String(u._id), u.count]));
      const adminMap = {};
      orgAdmins.forEach(a => {
        const key = String(a.organization_id);
        if (!adminMap[key]) adminMap[key] = a;
      });

      orgs = orgs.map(org => ({
        ...org,
        building_count: bMap[String(org._id)] || 0,
        user_count: uMap[String(org._id)] || 0,
        org_admin: adminMap[String(org._id)] || null
      }));
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

module.exports = {
  listOrganizations,
  createWithAdmin
};
