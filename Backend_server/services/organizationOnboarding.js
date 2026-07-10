// ============================================
// FILE: organizationOnboarding.js
// MỤC ĐÍCH: Service dùng chung — tạo Organization + ORG_ADMIN (rollback thủ công nếu lỗi)
// Dùng cho: 2.7 (Manual), 2.8 (Registration approval), 2.9 (Self-service)
// ============================================

const Organization = require('../models/Organization');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const bcrypt = require('bcryptjs');
const { validateFullName, normalizeFullName } = require('../utils/fullNamePolicy');

function logActivity(data) {
  ActivityLog.create(data).catch(() => {});
}

// WHY: Tạo org + ORG_ADMIN atomic — rollback org nếu tạo user fail
// PARAMS: organizationName, slug, plan, adminName, adminEmail, adminPassword,
//         source ('MANUAL'|'REGISTRATION_APPROVAL'|'SELF_SERVICE'),
//         createdByUserId (Super Admin _id, null nếu self-service), ipAddress
// RETURN: { organization, adminUser } — KHÔNG trả password
async function createOrganizationWithAdmin({
  organizationName,
  slug,
  plan,
  adminName,
  adminEmail,
  adminPassword,
  adminPasswordHash,
  source,
  createdByUserId,
  ipAddress
}) {
  // Validate input
  if (!organizationName || !organizationName.trim()) {
    throw new Error('Tên tổ chức không được để trống.');
  }
  if (!slug || !slug.trim()) {
    throw new Error('Mã định danh không được để trống.');
  }
  const nameErrors = validateFullName(adminName);
  if (nameErrors.length) {
    throw new Error(nameErrors[0]);
  }
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error('Email quản trị viên không hợp lệ.');
  }
  if (!adminPasswordHash) {
    if (!adminPassword || adminPassword.length < 8) {
      throw new Error('Mật khẩu phải có ít nhất 8 ký tự.');
    }
  }

  const cleanSlug = slug.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(cleanSlug)) {
    throw new Error('Mã định danh chỉ chấp nhận chữ thường, số và dấu gạch ngang.');
  }

  const validPlans = ['FREE', 'PRO', 'ENTERPRISE'];
  const orgPlan = plan && validPlans.includes(plan) ? plan : 'FREE';

  const hashedPassword = adminPasswordHash || await bcrypt.hash(adminPassword, 10);

  // WHY: MongoDB standalone (local dev) không hỗ trợ transaction — tạo tuần tự + rollback thủ công
  const existingEmail = await User.findOne({ email: adminEmail.trim() }).select('_id').lean();
  if (existingEmail) {
    throw new Error('Email này đã được đăng ký rồi!');
  }

  let org = null;
  try {
    org = await Organization.create({
      name: organizationName.trim(),
      slug: cleanSlug,
      plan: orgPlan,
      is_active: true
    });
  } catch (error) {
    if (error.code === 11000) {
      const err = new Error('Slug đã tồn tại. Vui lòng chọn slug khác.');
      err.code = 11000;
      throw err;
    }
    throw error;
  }

  try {
    const adminUser = await User.create({
      email: adminEmail.trim(),
      password: hashedPassword,
      role: 'ORG_ADMIN',
      full_name: normalizeFullName(adminName),
      organization_id: org._id,
      is_active: true,
      assigned_buildings: [],
      created_by: createdByUserId || null
    });

    // Log (fire-and-forget, không ảnh hưởng response)
    logActivity({
      user_id: createdByUserId || adminUser._id,
      action: 'CREATE_ORG',
      target_type: 'organization',
      target_id: String(org._id),
      target: org.name,
      details: { slug: org.slug, plan: org.plan, source: source || 'MANUAL' },
      ip_address: ipAddress || '',
      organization_id: String(org._id)
    });

    logActivity({
      user_id: createdByUserId || adminUser._id,
      action: 'CREATE_USER',
      target_type: 'user',
      target_id: String(adminUser._id),
      target: adminUser.email,
      details: { role: 'ORG_ADMIN', source: source || 'MANUAL', organization_id: String(org._id) },
      ip_address: ipAddress || '',
      organization_id: String(org._id)
    });

    // Trả về data an toàn (không có password)
    return {
      organization: {
        _id: org._id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        is_active: org.is_active
      },
      adminUser: {
        _id: adminUser._id,
        email: adminUser.email,
        full_name: adminUser.full_name,
        role: adminUser.role,
        organization_id: adminUser.organization_id,
        is_active: adminUser.is_active
      }
    };
  } catch (error) {
    if (org?._id) {
      await Organization.deleteOne({ _id: org._id }).catch(() => {});
    }
    if (error.code === 11000) {
      const err = new Error('Email này đã được đăng ký rồi!');
      err.code = 11000;
      throw err;
    }
    throw error;
  }
}

module.exports = { createOrganizationWithAdmin };
