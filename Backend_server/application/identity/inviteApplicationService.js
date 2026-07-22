const crypto = require('crypto');
const identity = require('../../repositories/identityRepository');
const invites = require('../../repositories/inviteRepository');
const memberships = require('../../repositories/membershipRepository');
const joins = require('../../repositories/joinRequestRepository');
const activities = require('../../repositories/activityLogRepository');
const outbox = require('../../repositories/outboxRepository');
const { evaluateCreateUserQuota } = require('./identityQuotaPolicy');
const { revokeAll } = require('./sessionApplicationService');
const { runIdentityCommand } = require('./runIdentityCommand');
const {
  sendOrgInviteEmail,
  getPublicBaseUrl
} = require('../../services/mailService');

const INVITE_TTL_MS = Number(process.env.ORG_INVITE_TTL_MS) || 7 * 24 * 60 * 60 * 1000;

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw || '')).digest('hex');
}

function shouldExposeToken() {
  if (process.env.ORG_INVITE_TOKEN_IN_RESPONSE === 'true') return true;
  if (process.env.ORG_INVITE_TOKEN_IN_RESPONSE === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

async function createInvite(input, context) {
  const organizationId = context.principal.organizationId;
  if (!organizationId) {
    throw Object.assign(new Error('Tài khoản chưa được gán tổ chức.'), { status: 403 });
  }
  const organization = await identity.findOrganizationById(organizationId);
  if (!organization) throw Object.assign(new Error('Không tìm thấy tổ chức.'), { status: 404 });
  const email = String(input.email || '').trim().toLowerCase();
  const role = String(input.role || 'BUILDING_ADMIN').toUpperCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('Email lời mời không hợp lệ.'), { status: 400, code: 'INVALID_EMAIL' });
  }
  if (!['ORG_ADMIN', 'BUILDING_ADMIN'].includes(role)) {
    throw Object.assign(new Error('Role lời mời không hợp lệ.'), { status: 400, code: 'INVALID_ROLE' });
  }
  const existingUser = await identity.findUserByEmail(email);
  if (existingUser?.organization_id) {
    throw Object.assign(new Error('Người dùng đã thuộc một tổ chức.'), {
      status: 409,
      code: String(existingUser.organization_id) === String(organizationId)
        ? 'ALREADY_MEMBER'
        : 'USER_IN_OTHER_ORG'
    });
  }
  if (await invites.findPending(organizationId, email)) {
    throw Object.assign(new Error('Đã có lời mời đang chờ cho email này.'), {
      status: 409,
      code: 'INVITE_PENDING'
    });
  }
  const rawToken = crypto.randomBytes(32).toString('hex');
  const invite = await runIdentityCommand(async (session) => {
    const created = await invites.create({
      organization_id: organizationId,
      email,
      role,
      token_hash: hashToken(rawToken),
      expires_at: new Date(Date.now() + INVITE_TTL_MS),
      status: 'PENDING',
      invited_by: context.principal.userId,
      note: String(input.note || '').slice(0, 300)
    }, { session });
    await activities.recordActivity({
      user_id: context.principal.userId,
      action: 'MEMBER_INVITED',
      target_type: 'organization',
      target_id: String(organizationId),
      target: organization.name,
      details: { invite_id: String(created._id), email, role },
      ip_address: context.ipAddress,
      organization_id: organizationId
    }, { session });
    await outbox.append({
      type: 'IdentityMemberInvited',
      event_key: `identity-member-invited:${created._id}`,
      aggregate_type: 'OrganizationInvite',
      aggregate_id: created._id,
      organization_id: organizationId,
      actor_user_id: context.principal.userId,
      payload: { email, role, expires_at: created.expires_at }
    }, { session });
    return created;
  });
  let emailSent = false;
  try {
    await sendOrgInviteEmail({
      to: email,
      orgName: organization.name,
      role,
      acceptUrl: `${getPublicBaseUrl()}/admin/dashboard.html#accept-invite=${encodeURIComponent(rawToken)}`,
      expiresAt: invite.expires_at
    });
    emailSent = true;
  } catch (_) {
    // Outbox đã bền vững; relay có thể retry khi provider tạm lỗi.
  }
  return {
    invite,
    email_sent: emailSent,
    rawToken: shouldExposeToken() ? rawToken : undefined
  };
}

async function listInvites(principal, status) {
  if (!principal.organizationId) throw Object.assign(new Error('Tài khoản chưa được gán tổ chức.'), { status: 403 });
  return invites.list(principal.organizationId, String(status || 'PENDING').toUpperCase());
}

async function revokeInvite(principal, inviteId, context) {
  return runIdentityCommand(async (session) => {
    const invite = await invites.revokeOwned(inviteId, principal.organizationId, { session });
    if (!invite) throw Object.assign(new Error('Không tìm thấy lời mời đang chờ.'), { status: 404 });
    await activities.recordActivity({
      user_id: principal.userId,
      action: 'MEMBER_INVITE_REVOKED',
      target_type: 'organization',
      target_id: String(principal.organizationId),
      details: { invite_id: String(invite._id), email: invite.email },
      ip_address: context.ipAddress,
      organization_id: principal.organizationId
    }, { session });
    await outbox.append({
      type: 'IdentityMemberInviteRevoked',
      event_key: `identity-member-invite-revoked:${invite._id}`,
      aggregate_type: 'OrganizationInvite',
      aggregate_id: invite._id,
      organization_id: principal.organizationId,
      actor_user_id: principal.userId,
      payload: {}
    }, { session });
    return invite;
  });
}

async function findValid(rawToken) {
  const invite = await invites.findByTokenHash(hashToken(rawToken));
  if (!invite || invite.status !== 'PENDING') return null;
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    await invites.transitionByCompareAndSet(invite._id, 'PENDING', { status: 'EXPIRED' });
    return null;
  }
  return invite;
}

async function previewInvite(rawToken) {
  const invite = await findValid(rawToken);
  if (!invite) throw Object.assign(new Error('Lời mời không hợp lệ hoặc đã hết hạn.'), {
    status: 400,
    code: 'INVITE_INVALID'
  });
  const organization = await identity.findOrganizationById(invite.organization_id);
  return {
    email: invite.email,
    role: invite.role,
    expires_at: invite.expires_at,
    organization: organization
      ? { id: String(organization._id), name: organization.name, slug: organization.slug }
      : null
  };
}

async function acceptInvite(rawToken, userId, context) {
  const candidate = await findValid(rawToken);
  if (!candidate) throw Object.assign(new Error('Lời mời không hợp lệ hoặc đã hết hạn.'), {
    status: 400,
    code: 'INVITE_INVALID'
  });
  const user = await identity.findUserById(userId);
  const organization = await identity.findOrganizationById(candidate.organization_id);
  if (!user || String(user.email).toLowerCase() !== candidate.email) {
    throw Object.assign(new Error('Email đăng nhập không khớp lời mời.'), { status: 400, code: 'EMAIL_MISMATCH' });
  }
  if (user.role !== 'REGISTERED_USER' || user.organization_id) {
    throw Object.assign(new Error('Tài khoản không đủ điều kiện nhận lời mời.'), { status: 400, code: 'USER_NOT_ELIGIBLE' });
  }
  if (!organization || organization.is_active === false) {
    throw Object.assign(new Error('Tổ chức không khả dụng.'), { status: 400, code: 'ORG_INACTIVE' });
  }
  const quota = await evaluateCreateUserQuota(organization);
  if (quota?.ok === false) {
    throw Object.assign(new Error(quota.message), { status: 403, code: quota.code || 'QUOTA_EXCEEDED' });
  }
  return runIdentityCommand(async (session) => {
    const invite = await invites.transitionByCompareAndSet(candidate._id, 'PENDING', {
      status: 'ACCEPTED',
      accepted_by: user._id,
      accepted_at: new Date()
    }, { session });
    if (!invite) throw Object.assign(new Error('Lời mời đã được xử lý.'), { status: 409, code: 'INVITE_CONSUMED' });
    const updatedUser = await identity.updateUserById(user._id, {
      $set: { role: invite.role, organization_id: organization._id }
    }, { session });
    await memberships.upsertActive({
      organization_id: organization._id,
      user_id: user._id,
      role: invite.role,
      building_ids: [],
      created_by: invite.invited_by
    }, { session });
    await joins.cancelOtherPending(user._id, null, new Date(), { session });
    await revokeAll(user._id, {
      actorUserId: user._id,
      ipAddress: context.ipAddress
    }, 'SESSION_REVOKED', { session });
    await activities.recordActivity({
      user_id: user._id,
      action: 'MEMBER_INVITE_ACCEPTED',
      target_type: 'organization',
      target_id: String(organization._id),
      target: organization.name,
      details: { invite_id: String(invite._id), role: invite.role },
      ip_address: context.ipAddress,
      organization_id: organization._id
    }, { session });
    await outbox.append({
      type: 'IdentityMembershipChanged',
      event_key: `identity-membership-invite-accepted:${invite._id}`,
      aggregate_type: 'OrganizationMember',
      aggregate_id: user._id,
      organization_id: organization._id,
      actor_user_id: user._id,
      payload: { action: 'INVITE_ACCEPTED', role: invite.role }
    }, { session });
    return {
      user: {
        id: String(updatedUser._id),
        email: updatedUser.email,
        role: updatedUser.role,
        organization_id: String(organization._id)
      },
      organization: {
        id: String(organization._id),
        name: organization.name,
        slug: organization.slug
      },
      invite: { id: String(invite._id), role: invite.role, status: invite.status }
    };
  });
}

module.exports = {
  createInvite,
  listInvites,
  revokeInvite,
  previewInvite,
  acceptInvite
};
