const crypto = require('crypto');
const identity = require('../../repositories/identityRepository');
const memberships = require('../../repositories/membershipRepository');
const activities = require('../../repositories/activityLogRepository');
const outbox = require('../../repositories/outboxRepository');
const { legacyMemberFromUser } = require('../../services/organizationMembership');
const { revokeAll } = require('./sessionApplicationService');
const { runIdentityCommand } = require('./runIdentityCommand');

function assertScope(principal, organizationId) {
  if (principal.role !== 'SUPER_ADMIN' &&
      (principal.role !== 'ORG_ADMIN' ||
       String(principal.organizationId || '') !== String(organizationId))) {
    throw Object.assign(new Error('Bạn không có quyền quản lý tổ chức này.'), {
      status: 403,
      code: 'TENANT_SCOPE_VIOLATION'
    });
  }
}

async function listMembers(organizationId, principal) {
  assertScope(principal, organizationId);
  const members = await memberships.listActive(organizationId);
  if (String(process.env.IDENTITY_MEMBERSHIP_READ_SOURCE || 'prefer-member') === 'member') {
    return members.map((member) => ({ ...member, source: 'organization_member' }));
  }
  const legacyUsers = await identity.listUsersForAdministration({
    organization_id: organizationId,
    role: { $in: ['ORG_ADMIN', 'BUILDING_ADMIN'] }
  }, null);
  const existing = new Set(members.map((member) => String(member.user_id?._id || member.user_id)));
  return [
    ...members.map((member) => ({ ...member, source: 'organization_member' })),
    ...legacyUsers
      .filter((user) => !existing.has(String(user._id)))
      .map((user) => ({ ...legacyMemberFromUser(user), user_id: user }))
  ];
}

async function upsertMember(organizationId, input, context) {
  assertScope(context.principal, organizationId);
  if (context.principal.role === 'ORG_ADMIN' && input.role !== 'BUILDING_ADMIN') {
    throw Object.assign(new Error('Org Admin chỉ được quản lý Building Admin.'), { status: 403 });
  }
  const user = await identity.findUserById(input.user_id);
  if (!user) throw Object.assign(new Error('Không tìm thấy người dùng.'), { status: 404 });
  if (user.organization_id && String(user.organization_id) !== String(organizationId)) {
    throw Object.assign(new Error('Người dùng đang thuộc tổ chức khác.'), { status: 409 });
  }
  if (input.department_id &&
      !await memberships.departmentBelongs(input.department_id, organizationId)) {
    throw Object.assign(new Error('Department không thuộc tổ chức.'), { status: 400 });
  }
  const buildingIds = Array.isArray(input.building_ids) ? input.building_ids : [];
  if (!await identity.buildingIdsBelongToOrganization(buildingIds, organizationId)) {
    throw Object.assign(new Error('Building không thuộc tổ chức.'), { status: 400 });
  }
  return runIdentityCommand(async (session) => {
    const member = await memberships.upsertActive({
      organization_id: organizationId,
      user_id: user._id,
      role: input.role,
      department_id: input.department_id,
      building_ids: buildingIds,
      created_by: context.principal.userId
    }, { session });
    await identity.updateUserById(user._id, {
      $set: {
        organization_id: organizationId,
        role: input.role,
        assigned_buildings: input.role === 'BUILDING_ADMIN' ? buildingIds : []
      }
    }, { session });
    await revokeAll(user._id, {
      actorUserId: context.principal.userId,
      ipAddress: context.ipAddress
    }, 'SESSION_REVOKED', { session });
    await recordMembershipChange('MEMBER_UPDATED', member, context, session);
    return member;
  });
}

async function removeMember(organizationId, memberId, context) {
  assertScope(context.principal, organizationId);
  return runIdentityCommand(async (session) => {
    const member = await memberships.leaveOwned(
      memberId,
      organizationId,
      context.principal.userId,
      context.principal.role === 'ORG_ADMIN' ? 'BUILDING_ADMIN' : null,
      { session }
    );
    if (!member) return null;
    await identity.updateUserById(member.user_id, {
      $set: {
        organization_id: null,
        role: 'REGISTERED_USER',
        assigned_buildings: []
      }
    }, { session });
    await revokeAll(member.user_id, {
      actorUserId: context.principal.userId,
      ipAddress: context.ipAddress
    }, 'SESSION_REVOKED', { session });
    await recordMembershipChange('MEMBER_REMOVED', member, context, session);
    return member;
  });
}

async function recordMembershipChange(action, member, context, session) {
  await activities.recordActivity({
    user_id: context.principal.userId,
    action,
    target_type: 'user',
    target_id: String(member.user_id),
    details: { role: member.role, member_id: String(member._id) },
    ip_address: context.ipAddress,
    organization_id: member.organization_id
  }, { session });
  await outbox.append({
    type: 'IdentityMembershipChanged',
    event_key: `identity-membership-changed:${member._id}:${crypto.randomUUID()}`,
    aggregate_type: 'OrganizationMember',
    aggregate_id: member._id,
    organization_id: member.organization_id,
    actor_user_id: context.principal.userId,
    payload: { action, user_id: String(member.user_id), role: member.role }
  }, { session });
}

async function listDepartments(organizationId, principal) {
  assertScope(principal, organizationId);
  return memberships.listDepartments(organizationId);
}

async function createDepartment(organizationId, input, context) {
  assertScope(context.principal, organizationId);
  return runIdentityCommand(async (session) => {
    const department = await memberships.createDepartment({
      organization_id: organizationId,
      name: input.name,
      code: input.code,
      description: input.description,
      created_by: context.principal.userId
    }, { session });
    await outbox.append({
      type: 'IdentityDepartmentChanged',
      event_key: `identity-department-created:${department._id}`,
      aggregate_type: 'Department',
      aggregate_id: department._id,
      organization_id: organizationId,
      actor_user_id: context.principal.userId,
      payload: { action: 'CREATED' }
    }, { session });
    return department;
  });
}

async function updateDepartment(organizationId, departmentId, update, context) {
  assertScope(context.principal, organizationId);
  return runIdentityCommand(async (session) => {
    const department = await memberships.updateDepartment(
      departmentId,
      organizationId,
      update,
      { session }
    );
    if (!department) return null;
    await outbox.append({
      type: 'IdentityDepartmentChanged',
      event_key: `identity-department-updated:${department._id}:${crypto.randomUUID()}`,
      aggregate_type: 'Department',
      aggregate_id: department._id,
      organization_id: organizationId,
      actor_user_id: context.principal.userId,
      payload: { action: 'UPDATED' }
    }, { session });
    return department;
  });
}

module.exports = {
  listMembers,
  upsertMember,
  removeMember,
  listDepartments,
  createDepartment,
  updateDepartment
};
