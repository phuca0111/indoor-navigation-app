// ============================================
// FILE: orgRegistrationController.js
// MỤC ĐÍCH: Đăng ký tổ chức công khai + Super Admin duyệt/từ chối (task 2.8)
// ============================================

const bcrypt = require('bcryptjs');
const OrganizationRegistration = require('../models/OrganizationRegistration');
const Organization = require('../models/Organization');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { createOrganizationWithAdmin } = require('../services/organizationOnboarding');
const { validatePasswordStrength } = require('../utils/passwordPolicy');

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'org';
}

function logActivity(data) {
  ActivityLog.create(data).catch(() => {});
}

async function submitPublicRegistration(req, res) {
  try {
    const organizationName = (req.body.organizationName || req.body.organization_name || '').trim();
    let slug = (req.body.slug || '').trim().toLowerCase();
    const contactName = (req.body.contactName || req.body.contact_name || req.body.adminName || '').trim();
    const contactEmail = (req.body.contactEmail || req.body.contact_email || req.body.adminEmail || '').trim().toLowerCase();
    const contactPhone = (req.body.contactPhone || req.body.contact_phone || req.body.phone || '').trim();
    const password = req.body.password || req.body.adminPassword || '';

    if (!organizationName) {
      return res.status(400).json({ message: 'Tên tổ chức không được để trống.' });
    }
    if (!contactName) {
      return res.status(400).json({ message: 'Họ tên người đại diện không được để trống.' });
    }
    if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return res.status(400).json({ message: 'Email không hợp lệ.' });
    }
    const passwordErrors = validatePasswordStrength(password);
    if (passwordErrors.length) {
      return res.status(400).json({ message: passwordErrors[0], errors: passwordErrors });
    }

    if (!slug) slug = slugify(organizationName);
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ message: 'Mã định danh chỉ chấp nhận chữ thường, số và dấu gạch ngang.' });
    }

    const [orgExists, userExists, pendingEmail, pendingSlug] = await Promise.all([
      Organization.exists({ slug }),
      User.exists({ email: contactEmail }),
      OrganizationRegistration.exists({ contact_email: contactEmail, status: 'PENDING' }),
      OrganizationRegistration.exists({ slug, status: 'PENDING' })
    ]);

    if (orgExists) {
      return res.status(400).json({ message: 'Mã định danh đã được sử dụng bởi tổ chức khác.' });
    }
    if (userExists) {
      return res.status(400).json({ message: 'Email này đã được đăng ký trong hệ thống.' });
    }
    if (pendingEmail) {
      return res.status(400).json({ message: 'Email này đang có hồ sơ chờ duyệt.' });
    }
    if (pendingSlug) {
      return res.status(400).json({ message: 'Mã định danh này đang có hồ sơ chờ duyệt.' });
    }

    const adminPasswordHash = await bcrypt.hash(password, 10);
    const reg = await OrganizationRegistration.create({
      organization_name: organizationName,
      slug,
      plan: 'FREE',
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      admin_password_hash: adminPasswordHash,
      status: 'PENDING',
      source: 'REGISTRATION',
      ip_address: req.ip || req.connection?.remoteAddress || ''
    });

    res.status(201).json({
      message: 'Đã gửi hồ sơ đăng ký. Vui lòng chờ Super Admin duyệt.',
      registration_id: reg._id,
      status: reg.status
    });
  } catch (error) {
    console.error('submitPublicRegistration error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Hồ sơ trùng email hoặc mã định danh.' });
    }
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

async function submitSelfServiceTrial(req, res) {
  try {
    const organizationName = (req.body.organizationName || req.body.organization_name || '').trim();
    let slug = (req.body.slug || '').trim().toLowerCase();
    const contactName = (req.body.contactName || req.body.contact_name || req.body.adminName || '').trim();
    const contactEmail = (req.body.contactEmail || req.body.contact_email || req.body.adminEmail || '').trim().toLowerCase();
    const contactPhone = (req.body.contactPhone || req.body.contact_phone || req.body.phone || '').trim();
    const password = req.body.password || req.body.adminPassword || '';

    if (!organizationName) {
      return res.status(400).json({ message: 'Tên tổ chức không được để trống.' });
    }
    if (!contactName) {
      return res.status(400).json({ message: 'Họ tên người đại diện không được để trống.' });
    }
    if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return res.status(400).json({ message: 'Email không hợp lệ.' });
    }
    const passwordErrors = validatePasswordStrength(password);
    if (passwordErrors.length) {
      return res.status(400).json({ message: passwordErrors[0], errors: passwordErrors });
    }

    if (!slug) slug = slugify(organizationName);
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ message: 'Mã định danh chỉ chấp nhận chữ thường, số và dấu gạch ngang.' });
    }

    const [orgExists, userExists, pendingEmail, pendingSlug] = await Promise.all([
      Organization.exists({ slug }),
      User.exists({ email: contactEmail }),
      OrganizationRegistration.exists({ contact_email: contactEmail, status: 'PENDING' }),
      OrganizationRegistration.exists({ slug, status: 'PENDING' })
    ]);

    if (orgExists) {
      return res.status(400).json({ message: 'Mã định danh đã được sử dụng bởi tổ chức khác.' });
    }
    if (userExists) {
      return res.status(400).json({ message: 'Email này đã được đăng ký trong hệ thống.' });
    }
    if (pendingEmail) {
      return res.status(400).json({ message: 'Email này đang có hồ sơ chờ duyệt.' });
    }
    if (pendingSlug) {
      return res.status(400).json({ message: 'Mã định danh này đang có hồ sơ chờ duyệt.' });
    }

    const adminPasswordHash = await bcrypt.hash(password, 10);
    const result = await createOrganizationWithAdmin({
      organizationName,
      slug,
      plan: 'FREE',
      adminName: contactName,
      adminEmail: contactEmail,
      adminPasswordHash,
      source: 'SELF_SERVICE',
      createdByUserId: null,
      ipAddress: req.ip || req.connection?.remoteAddress || ''
    });

    await OrganizationRegistration.create({
      organization_name: organizationName,
      slug,
      plan: 'FREE',
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      admin_password_hash: adminPasswordHash,
      status: 'APPROVED',
      reviewed_at: new Date(),
      organization_id: result.organization._id,
      admin_user_id: result.adminUser._id,
      source: 'SELF_SERVICE',
      ip_address: req.ip || req.connection?.remoteAddress || ''
    });

    res.status(201).json({
      message: 'Đăng ký trial thành công! Bạn có thể đăng nhập ngay.',
      organization: result.organization,
      adminUser: { email: result.adminUser.email, full_name: result.adminUser.full_name },
      login_url: '/login'
    });
  } catch (error) {
    console.error('submitSelfServiceTrial error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: error.message || 'Email hoặc mã định danh đã tồn tại.' });
    }
    res.status(400).json({ message: error.message || 'Không thể đăng ký trial.' });
  }
}

async function listRegistrations(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được xem hồ sơ đăng ký.' });
    }

    const query = {};
    if (req.query.status) query.status = req.query.status;

    const items = await OrganizationRegistration.find(query)
      .sort({ createdAt: -1 })
      .select('-admin_password_hash')
      .lean();

    res.status(200).json(items);
  } catch (error) {
    console.error('listRegistrations error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

async function approveRegistration(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được duyệt hồ sơ.' });
    }

    const reg = await OrganizationRegistration.findById(req.params.id);
    if (!reg) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ đăng ký.' });
    }
    if (reg.status !== 'PENDING') {
      return res.status(400).json({ message: 'Hồ sơ không ở trạng thái chờ duyệt.' });
    }

    const result = await createOrganizationWithAdmin({
      organizationName: reg.organization_name,
      slug: reg.slug,
      plan: reg.plan,
      adminName: reg.contact_name,
      adminEmail: reg.contact_email,
      adminPasswordHash: reg.admin_password_hash,
      source: 'REGISTRATION_APPROVAL',
      createdByUserId: req.user.userId,
      ipAddress: req.ip || ''
    });

    reg.status = 'APPROVED';
    reg.reviewed_by = req.user.userId;
    reg.reviewed_at = new Date();
    reg.organization_id = result.organization._id;
    reg.admin_user_id = result.adminUser._id;
    await reg.save();

    logActivity({
      user_id: req.user.userId,
      action: 'APPROVE_ORG_REGISTRATION',
      target_type: 'organization_registration',
      target_id: String(reg._id),
      target: reg.organization_name,
      details: {
        organization_id: String(result.organization._id),
        admin_email: result.adminUser.email
      },
      ip_address: req.ip || '',
      organization_id: String(result.organization._id)
    });

    res.status(200).json({
      message: 'Đã duyệt hồ sơ và tạo tổ chức thành công.',
      organization: result.organization,
      adminUser: result.adminUser
    });
  } catch (error) {
    console.error('approveRegistration error:', error);
    res.status(400).json({ message: error.message || 'Không thể duyệt hồ sơ.' });
  }
}

async function rejectRegistration(req, res) {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được từ chối hồ sơ.' });
    }

    const reg = await OrganizationRegistration.findById(req.params.id);
    if (!reg) {
      return res.status(404).json({ message: 'Không tìm thấy hồ sơ đăng ký.' });
    }
    if (reg.status !== 'PENDING') {
      return res.status(400).json({ message: 'Hồ sơ không ở trạng thái chờ duyệt.' });
    }

    const reason = (req.body.reason || req.body.reject_reason || '').trim();
    if (!reason) {
      return res.status(400).json({ message: 'Vui lòng nhập lý do từ chối.' });
    }

    reg.status = 'REJECTED';
    reg.reject_reason = reason;
    reg.reviewed_by = req.user.userId;
    reg.reviewed_at = new Date();
    await reg.save();

    logActivity({
      user_id: req.user.userId,
      action: 'REJECT_ORG_REGISTRATION',
      target_type: 'organization_registration',
      target_id: String(reg._id),
      target: reg.organization_name,
      details: { reason },
      ip_address: req.ip || ''
    });

    res.status(200).json({ message: 'Đã từ chối hồ sơ đăng ký.', registration: reg });
  } catch (error) {
    console.error('rejectRegistration error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

module.exports = {
  submitPublicRegistration,
  submitSelfServiceTrial,
  listRegistrations,
  approveRegistration,
  rejectRegistration
};
