const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const identity = require('../../repositories/identityRepository');
const memberships = require('../../repositories/membershipRepository');
const activities = require('../../repositories/activityLogRepository');
const outbox = require('../../repositories/outboxRepository');
const { permissionsForRole } = require('../../utils/permissions');
const { annotateUsersQuotaLockForList } = require('../../utils/overQuotaLock');
const { verifyPassword } = require('./authApplicationService');
const { revokeAll } = require('./sessionApplicationService');
const { runIdentityCommand } = require('./runIdentityCommand');
const { TENANT_ROLES } = require('./EffectivePrincipal');

async function getMe(userId) {
  const user = await identity.getUserProfile(userId);
  if (!user) return null;
  if (user.organization_id && typeof user.organization_id === 'object') {
    user.organization = user.organization_id;
    user.organization_id = user.organization._id;
  }
  user.permissions = permissionsForRole(user.role);
  // My Maps: UI label END_USER; DB vẫn REGISTERED_USER
  user.display_role = user.role === 'REGISTERED_USER' ? 'END_USER' : user.role;
  user.display_role_label = user.role === 'REGISTERED_USER'
    ? 'Người dùng'
    : (user.role || '');
  return user;
}

async function listUsers(input, principal) {
  const filter = {};
  if (input.search) {
    filter.$or = ['email', 'full_name', 'phone'].map((field) => ({
      [field]: { $regex: input.search, $options: 'i' }
    }));
  }
  if (input.role) filter.role = input.role;
  if (input.is_active !== undefined) filter.is_active = input.is_active === 'true';
  if (principal.role === 'ORG_ADMIN') {
    filter.organization_id = principal.organizationId;
    filter.role = input.role || { $ne: 'SUPER_ADMIN' };
  }
  const users = await identity.listUsersForAdministration(filter, principal.userId);
  return annotateUsersQuotaLockForList(users);
}

async function getUser(userId, principal) {
  const user = await identity.getUserForAdministration(userId);
  if (!user) return null;
  if (principal.role !== 'SUPER_ADMIN' &&
      String(user.organization_id || '') !== String(principal.organizationId || '')) {
    throw Object.assign(new Error('Bạn chỉ được quản lý user trong tổ chức của mình.'), {
      status: 403,
      code: 'TENANT_SCOPE_VIOLATION'
    });
  }
  return user;
}

async function auditedUserMutation({
  userId,
  update,
  action,
  details,
  context,
  revokeReason = null
}) {
  return runIdentityCommand(async (session) => {
    const user = await identity.updateUserById(userId, update, { session, projection: '-password' });
    if (!user) throw Object.assign(new Error('Không tìm thấy tài khoản.'), { status: 404 });
    if (revokeReason) {
      await revokeAll(userId, {
        actorUserId: context.principal.userId,
        ipAddress: context.ipAddress
      }, revokeReason, { session });
    }
    await activities.recordActivity({
      user_id: context.principal.userId,
      action,
      target_type: 'user',
      target_id: String(userId),
      target: user.email,
      details,
      ip_address: context.ipAddress,
      organization_id: user.organization_id || undefined
    }, { session });
    await outbox.append({
      type: 'IdentityUserChanged',
      event_key: `identity-user-changed:${userId}:${crypto.randomUUID()}`,
      aggregate_type: 'User',
      aggregate_id: userId,
      organization_id: user.organization_id || null,
      actor_user_id: context.principal.userId,
      payload: { action, ...details }
    }, { session });
    return user;
  });
}

async function updateProfile(userId, update, context) {
  return auditedUserMutation({
    userId,
    update: { $set: update },
    action: 'UPDATE_PROFILE',
    details: { fields: Object.keys(update) },
    context
  });
}

async function changePassword(userId, currentPassword, newPassword, context) {
  const user = await identity.findUserById(userId);
  if (!user || !await verifyPassword(user, currentPassword)) return false;
  await auditedUserMutation({
    userId,
    update: { $set: { password: await bcrypt.hash(newPassword, 10) } },
    action: 'CHANGE_PASSWORD',
    details: { reason: 'SELF_SERVICE' },
    context,
    revokeReason: 'PASSWORD_CHANGED'
  });
  return true;
}

async function updateUser(userId, patch, context) {
  const oldUser = await getUser(userId, context.principal);
  if (!oldUser) throw Object.assign(new Error('Không tìm thấy tài khoản.'), { status: 404 });
  if (context.principal.userId === String(userId) && patch.is_active === false) {
    throw Object.assign(new Error('Bạn không thể tự khóa tài khoản chính mình.'), { status: 403 });
  }
  if (context.principal.userId === String(userId) &&
      oldUser.role === 'SUPER_ADMIN' &&
      patch.role && patch.role !== 'SUPER_ADMIN') {
    throw Object.assign(new Error('Super Admin không thể hạ role của chính mình.'), {
      status: 403,
      code: 'SELF_ROLE_REDUCTION_DENIED'
    });
  }
  if (context.principal.role === 'ORG_ADMIN') {
    if (patch.role && patch.role !== 'BUILDING_ADMIN') {
      throw Object.assign(new Error('Org Admin chỉ được gán role BUILDING_ADMIN.'), { status: 403 });
    }
    if (patch.organization_id !== undefined) {
      throw Object.assign(new Error('Org Admin không được thay đổi organization của user.'), { status: 403 });
    }
  }
  const organizationId = patch.organization_id !== undefined
    ? patch.organization_id
    : oldUser.organization_id;
  const role = patch.role || oldUser.role;
  const buildingIds = patch.assigned_buildings || oldUser.assigned_buildings || [];
  if (organizationId && patch.assigned_buildings !== undefined &&
      !await identity.buildingIdsBelongToOrganization(buildingIds, organizationId)) {
    throw Object.assign(new Error('Một số tòa nhà không thuộc organization của user.'), { status: 400 });
  }
  const securityChanged = ['role', 'is_active', 'organization_id', 'assigned_buildings']
    .some((field) => patch[field] !== undefined);
  return runIdentityCommand(async (session) => {
    const updated = await identity.updateUserById(userId, { $set: patch }, {
      session,
      projection: '-password'
    });
    const oldOrganizationId = oldUser.organization_id?._id || oldUser.organization_id;
    if (oldOrganizationId &&
        (!TENANT_ROLES.has(role) || String(oldOrganizationId) !== String(organizationId || ''))) {
      await memberships.leaveByUser(userId, oldOrganizationId, { session });
    }
    if (TENANT_ROLES.has(role) && organizationId) {
      await memberships.upsertActive({
        organization_id: organizationId,
        user_id: userId,
        role,
        building_ids: role === 'BUILDING_ADMIN' ? buildingIds : [],
        created_by: context.principal.userId
      }, { session });
    }
    if (securityChanged) {
      await revokeAll(userId, {
        actorUserId: context.principal.userId,
        ipAddress: context.ipAddress
      }, 'SESSION_REVOKED', { session });
    }
    await activities.recordActivity({
      user_id: context.principal.userId,
      action: patch.is_active === false
        ? 'DEACTIVATE_USER'
        : patch.is_active === true
          ? 'ACTIVATE_USER'
          : 'ADMIN_UPDATE_USER',
      target_type: 'user',
      target_id: String(userId),
      target: updated.email,
      details: { fields: Object.keys(patch) },
      ip_address: context.ipAddress,
      organization_id: updated.organization_id || undefined
    }, { session });
    await outbox.append({
      type: 'IdentityUserChanged',
      event_key: `identity-user-changed:${userId}:${crypto.randomUUID()}`,
      aggregate_type: 'User',
      aggregate_id: userId,
      organization_id: updated.organization_id || null,
      actor_user_id: context.principal.userId,
      payload: { fields: Object.keys(patch) }
    }, { session });
    return updated;
  });
}

async function deactivateUser(userId, context) {
  return updateUser(userId, { is_active: false }, context);
}

async function adminResetPassword(userId, requestedPassword, generate, context) {
  const user = await getUser(userId, context.principal);
  if (!user) throw Object.assign(new Error('Không tìm thấy tài khoản.'), { status: 404 });
  if (user.role === 'SUPER_ADMIN') {
    throw Object.assign(new Error('Không thể đặt lại mật khẩu Super Admin qua API này.'), { status: 403 });
  }
  const plain = generate
    ? crypto.randomBytes(9).toString('base64url').slice(0, 12)
    : String(requestedPassword || '').trim();
  if (plain.length < 8) {
    throw Object.assign(new Error('Mật khẩu mới phải có ít nhất 8 ký tự.'), { status: 400 });
  }
  await auditedUserMutation({
    userId,
    update: { $set: { password: await bcrypt.hash(plain, 10) } },
    action: 'ADMIN_RESET_PASSWORD',
    details: { generated: Boolean(generate) },
    context,
    revokeReason: 'PASSWORD_CHANGED'
  });
  return plain;
}

module.exports = {
  getMe,
  listUsers,
  getUser,
  updateProfile,
  changePassword,
  updateUser,
  deactivateUser,
  adminResetPassword
};
