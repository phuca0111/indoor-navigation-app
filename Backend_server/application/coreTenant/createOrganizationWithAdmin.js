const bcrypt = require('bcryptjs');
const organizationRepository = require('../../repositories/organizationOnboardingRepository');
const coreTenantRepository = require('../../repositories/coreTenantRepository');
const membershipRepository = require('../../repositories/membershipRepository');
const activities = require('../../repositories/activityLogRepository');
const eventBus = require('../../shared/events/eventBus');
const {
  validateFullName,
  normalizeFullName
} = require('../../utils/fullNamePolicy');
const { runCoreTenantCommand } = require('./runCoreTenantCommand');

function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

async function createOrganizationWithAdmin(input, options = {}) {
  const organizationName = String(input.organizationName || '').trim();
  const slug = String(input.slug || '').trim().toLowerCase();
  const adminEmail = String(input.adminEmail || '').trim();
  if (!organizationName) invalid('Tên tổ chức không được để trống.');
  if (!slug) invalid('Mã định danh không được để trống.');
  if (!/^[a-z0-9-]+$/.test(slug)) {
    invalid('Mã định danh chỉ chấp nhận chữ thường, số và dấu gạch ngang.');
  }
  const nameErrors = validateFullName(input.adminName);
  if (nameErrors.length) invalid(nameErrors[0]);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    invalid('Email quản trị viên không hợp lệ.');
  }
  if (!input.adminPasswordHash && String(input.adminPassword || '').length < 8) {
    invalid('Mật khẩu phải có ít nhất 8 ký tự.');
  }
  const validPlans = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];
  const plan = validPlans.includes(input.plan) ? input.plan : 'FREE';
  const password = input.adminPasswordHash ||
    await bcrypt.hash(input.adminPassword, 10);

  return runCoreTenantCommand(async (session) => {
    if (await organizationRepository.slugExists(slug, { session })) {
      throw Object.assign(
        new Error('Slug đã tồn tại. Vui lòng chọn slug khác.'),
        { status: 409, code: 11000 }
      );
    }
    if (await coreTenantRepository.userEmailExists(adminEmail, { session })) {
      throw Object.assign(
        new Error('Email này đã được đăng ký rồi!'),
        { status: 409, code: 11000 }
      );
    }
    const organization = await organizationRepository.createOrganization({
      name: organizationName,
      slug,
      plan,
      is_active: true
    }, { session });
    const adminUser = await coreTenantRepository.createOrganizationAdmin({
      email: adminEmail,
      password,
      role: 'ORG_ADMIN',
      full_name: normalizeFullName(input.adminName),
      organization_id: organization._id,
      is_active: true,
      assigned_buildings: [],
      created_by: input.createdByUserId || null
    }, { session });
    await membershipRepository.upsertActive({
      organization_id: organization._id,
      user_id: adminUser._id,
      role: 'ORG_ADMIN',
      building_ids: [],
      created_by: input.createdByUserId || adminUser._id
    }, { session });

    const actorId = input.createdByUserId || adminUser._id;
    await activities.recordActivity({
      user_id: actorId,
      action: 'CREATE_ORG',
      target_type: 'organization',
      target_id: String(organization._id),
      target: organization.name,
      details: { slug, plan, source: input.source || 'MANUAL' },
      ip_address: input.ipAddress || '',
      organization_id: organization._id
    }, { session });
    await activities.recordActivity({
      user_id: actorId,
      action: 'CREATE_USER',
      target_type: 'user',
      target_id: String(adminUser._id),
      target: adminUser.email,
      details: {
        role: 'ORG_ADMIN',
        source: input.source || 'MANUAL',
        organization_id: String(organization._id)
      },
      ip_address: input.ipAddress || '',
      organization_id: organization._id
    }, { session });
    await eventBus.publish({
      type: 'OrganizationCreated',
      event_key: `organization-created:${organization._id}`,
      aggregate_type: 'Organization',
      aggregate_id: organization._id,
      organization_id: organization._id,
      actor_user_id: actorId,
      payload: {
        organization_id: String(organization._id),
        admin_user_id: String(adminUser._id),
        plan,
        source: input.source || 'MANUAL'
      }
    }, { session });

    return { organization, adminUser };
  }, options);
}

module.exports = { createOrganizationWithAdmin };
