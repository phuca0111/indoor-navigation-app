const repository = require('../../repositories/coreTenantRepository');
const activities = require('../../repositories/activityLogRepository');
const eventBus = require('../../shared/events/eventBus');
const legacy = require('../../services/legacyOrganizationHttpService');
const policy = require('./coreTenantPolicy');
const { runCoreTenantCommand } = require('./runCoreTenantCommand');
const { invokeLegacyHandler } = require('./legacyHttpAdapter');

function fail(status, message, code) {
  throw Object.assign(new Error(message), { status, code });
}

async function recordOrganizationMutation({
  organization,
  actor,
  action,
  changes,
  ip,
  session
}) {
  await activities.recordActivity({
    user_id: actor.userId,
    action,
    target_type: 'organization',
    target_id: String(organization._id),
    target: organization.name,
    details: { changes },
    ip_address: ip || '',
    organization_id: organization._id
  }, { session });
  await eventBus.publish({
    type: action === 'DEACTIVATE_ORGANIZATION'
      ? 'OrganizationDeactivated'
      : action === 'ACTIVATE_ORGANIZATION'
        ? 'OrganizationRestored'
        : 'OrganizationUpdated',
    event_key: `core-tenant:${action}:${organization._id}:${Date.now()}`,
    aggregate_type: 'Organization',
    aggregate_id: organization._id,
    organization_id: organization._id,
    actor_user_id: actor.userId,
    payload: { changes }
  }, { session });
}

async function updateOrganization(input, options = {}) {
  policy.systemScope(input.actor);
  const body = input.body || {};
  const billingFields = [
    'plan', 'billing_status', 'grace_ends_at',
    'plan_started_at', 'plan_expires_at'
  ];
  if (billingFields.some((field) => body[field] !== undefined)) {
    return invokeLegacyHandler(legacy.updateOrganization, input);
  }

  const blocked = ['name', 'slug', '_id', 'createdAt', 'updatedAt'];
  const illegal = blocked.filter((field) => body[field] !== undefined);
  if (illegal.length) {
    fail(400, `Không được sửa các trường: ${illegal.join(', ')}.`);
  }
  const allowed = ['is_active', 'contact_phone', 'contact_address'];
  const changes = {};
  allowed.forEach((field) => {
    if (body[field] !== undefined) {
      changes[field] = field === 'is_active'
        ? Boolean(body[field])
        : String(body[field] || '').trim();
    }
  });
  if (!Object.keys(changes).length) fail(400, 'Không có thay đổi nào.');

  const current = await repository.findOrganizationById(
    input.params.id,
    { kind: 'SYSTEM' }
  );
  if (!current) fail(404, 'Không tìm thấy tổ chức.');
  if (changes.is_active === false && current.slug === 'legacy') {
    fail(400, 'Không thể tạm dừng tổ chức legacy (dữ liệu mặc định).');
  }
  if (
    changes.is_active !== undefined &&
    changes.is_active === (current.is_active !== false) &&
    Object.keys(changes).length === 1
  ) {
    fail(400, changes.is_active
      ? 'Tổ chức đã đang hoạt động.'
      : 'Tổ chức đã được tạm dừng trước đó.');
  }

  const organization = await runCoreTenantCommand(async (session) => {
    const updated = await repository.updateOrganization(
      current._id,
      changes,
      { kind: 'SYSTEM' },
      { session }
    );
    const action = changes.is_active === false
      ? 'DEACTIVATE_ORGANIZATION'
      : changes.is_active === true
        ? 'ACTIVATE_ORGANIZATION'
        : 'UPDATE_ORGANIZATION';
    await recordOrganizationMutation({
      organization: updated,
      actor: input.actor,
      action,
      changes,
      ip: input.ip,
      session
    });
    return updated;
  }, options);

  return {
    status: 200,
    body: {
      message: 'Cập nhật tổ chức thành công!',
      organization
    }
  };
}

async function updateMyOrganizationContact(input, options = {}) {
  if (input.actor?.role !== 'ORG_ADMIN') {
    fail(403, 'Chỉ ORG_ADMIN được cập nhật hồ sơ tổ chức của mình.');
  }
  const actor = await repository.findUserScope(input.actor.userId);
  if (!actor?.organization_id) fail(403, 'Tài khoản chưa gắn tổ chức.');
  const changes = {};
  if (input.body.contact_phone !== undefined) {
    changes.contact_phone = String(input.body.contact_phone || '').trim();
  }
  if (input.body.contact_address !== undefined) {
    changes.contact_address = String(input.body.contact_address || '').trim();
  }
  if (!Object.keys(changes).length) {
    fail(400, 'Cần gửi contact_phone và/hoặc contact_address.');
  }
  const scope = {
    kind: 'ORGANIZATION',
    organizationId: actor.organization_id
  };
  const organization = await runCoreTenantCommand(async (session) => {
    const updated = await repository.updateOrganization(
      actor.organization_id,
      changes,
      scope,
      { session }
    );
    if (!updated) fail(404, 'Không tìm thấy tổ chức.');
    await recordOrganizationMutation({
      organization: updated,
      actor: input.actor,
      action: 'UPDATE_ORG_CONTACT',
      changes,
      ip: input.ip,
      session
    });
    return updated;
  }, options);
  return {
    status: 200,
    body: {
      message: 'Đã cập nhật hồ sơ tổ chức.',
      organization: {
        _id: organization._id,
        name: organization.name,
        contact_phone: organization.contact_phone,
        contact_address: organization.contact_address
      }
    }
  };
}

module.exports = { updateOrganization, updateMyOrganizationContact };
