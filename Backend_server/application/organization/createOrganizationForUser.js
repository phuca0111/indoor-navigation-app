const organizationRepository = require('../../repositories/organizationOnboardingRepository');
const membershipRepository = require('../../repositories/membershipRepository');
const activityLogRepository = require('../../repositories/activityLogRepository');
const eventBus = require('../../shared/events/eventBus');
const { getPlanPeriodDays } = require('../../config/planPricing');
const { isPaidPlan } = require('../../services/planCatalog');
const { runBillingCommand } = require('../billing/runBillingCommand');

function slugBase(name, requestedSlug) {
  return String(requestedSlug || name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';
}

async function uniqueSlug(name, requestedSlug, session) {
  const base = slugBase(name, requestedSlug);
  let candidate = base;
  for (let attempt = 0; attempt <= 50; attempt += 1) {
    if (!(await organizationRepository.slugExists(candidate, { session }))) {
      return candidate;
    }
    candidate = `${base}-${attempt + 1}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function createOrganizationForUser(input, options = {}) {
  const name = String(input.name || '').trim();
  if (name.length < 2) {
    throw Object.assign(
      new Error('Tên tổ chức phải có ít nhất 2 ký tự.'),
      { status: 400 }
    );
  }
  let plan = String(input.plan || 'BUSINESS').toUpperCase();
  if (!['BUSINESS', 'ENTERPRISE', 'PRO', 'FREE'].includes(plan)) {
    plan = 'BUSINESS';
  }

  return runBillingCommand(async (session) => {
    const slug = await uniqueSlug(name, input.slug, session);
    const organizationData = {
      name,
      slug,
      plan,
      is_active: true
    };
    if (input.activatePaid && isPaidPlan(plan)) {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + (getPlanPeriodDays(plan) || 30));
      Object.assign(organizationData, {
        plan_started_at: now,
        plan_expires_at: end,
        billing_status: 'ACTIVE'
      });
    }

    const organization = await organizationRepository.createOrganization(
      organizationData,
      { session }
    );
    const user = await organizationRepository.promoteUserToOrganizationAdmin(
      input.userId,
      organization._id,
      { session }
    );
    await membershipRepository.upsertActive({
      organization_id: organization._id,
      user_id: user._id,
      role: 'ORG_ADMIN',
      building_ids: [],
      created_by: user._id
    }, { session });
    const migration = await organizationRepository.migratePersonalBuildings(
      input.userId,
      organization._id,
      { session }
    );
    const migratedCount = migration.modifiedCount || 0;

    await activityLogRepository.recordActivity({
      user_id: input.userId,
      action: 'CREATE_ORG',
      target_type: 'organization',
      target_id: String(organization._id),
      target: organization.name,
      details: {
        slug: organization.slug,
        plan: organization.plan,
        source: input.source || 'SELF_UPGRADE',
        migrated_buildings: migratedCount
      },
      ip_address: input.ip || '',
      organization_id: organization._id
    }, { session });
    await eventBus.publish({
      type: 'OrganizationCreated',
      event_key: `organization-created:${organization._id}`,
      aggregate_type: 'Organization',
      aggregate_id: organization._id,
      organization_id: organization._id,
      actor_user_id: input.userId,
      payload: {
        organization_id: String(organization._id),
        plan,
        source: input.source || 'SELF_UPGRADE'
      }
    }, { session });

    return { org: organization, user, migratedCount };
  }, options);
}

module.exports = { createOrganizationForUser, slugBase, uniqueSlug };
