const identity = require('../../repositories/identityRepository');
const joins = require('../../repositories/joinRequestRepository');
const memberships = require('../../repositories/membershipRepository');
const activities = require('../../repositories/activityLogRepository');
const outbox = require('../../repositories/outboxRepository');
const { evaluateCreateUserQuota } = require('./identityQuotaPolicy');
const { revokeAll } = require('./sessionApplicationService');
const { runIdentityCommand } = require('./runIdentityCommand');

async function requestJoin(input, context) {
  const principal = context.principal;
  if (principal.role !== 'REGISTERED_USER') {
    throw Object.assign(new Error('Chỉ tài khoản cá nhân mới được gửi yêu cầu tham gia tổ chức.'), { status: 403 });
  }
  const user = await identity.findUserById(principal.userId);
  if (!user) throw Object.assign(new Error('Không tìm thấy tài khoản.'), { status: 404 });
  if (user.organization_id) throw Object.assign(new Error('Tài khoản đã thuộc một tổ chức.'), { status: 400 });
  const organization = input.organization_id
    ? await identity.findOrganizationById(input.organization_id)
    : await identity.findOrganizationBySlug(input.slug);
  if (!organization) throw Object.assign(new Error('Không tìm thấy tổ chức. Kiểm tra lại mã tổ chức (slug).'), { status: 404 });
  if (organization.is_active === false) throw Object.assign(new Error('Tổ chức đang bị tạm dừng, không thể tham gia.'), { status: 400 });
  if (await joins.findPending(user._id, organization._id)) {
    throw Object.assign(new Error('Bạn đã gửi yêu cầu tham gia tổ chức này và đang chờ duyệt.'), { status: 409 });
  }
  return runIdentityCommand(async (session) => {
    const request = await joins.create({
      user_id: user._id,
      organization_id: organization._id,
      message: String(input.message || '').slice(0, 500),
      status: 'PENDING'
    }, { session });
    await activities.recordActivity({
      user_id: user._id,
      action: 'JOIN_ORG_REQUEST',
      target_type: 'organization',
      target_id: String(organization._id),
      target: organization.name,
      details: { request_id: String(request._id), slug: organization.slug },
      ip_address: context.ipAddress,
      organization_id: organization._id
    }, { session });
    await outbox.append({
      type: 'IdentityJoinRequested',
      event_key: `identity-join-requested:${request._id}`,
      aggregate_type: 'OrganizationJoinRequest',
      aggregate_id: request._id,
      organization_id: organization._id,
      actor_user_id: user._id,
      payload: {}
    }, { session });
    return { request, organization };
  });
}

async function listMine(userId) {
  return joins.listMine(userId);
}

async function listForOrganization(principal, status) {
  if (principal.role !== 'ORG_ADMIN' || !principal.organizationId) {
    throw Object.assign(new Error('Chỉ ORG_ADMIN được xem yêu cầu tham gia.'), { status: 403 });
  }
  return joins.listForOrganization(
    principal.organizationId,
    String(status || 'PENDING').toUpperCase()
  );
}

async function decide(requestId, decision, context) {
  const principal = context.principal;
  if (principal.role !== 'ORG_ADMIN') {
    throw Object.assign(new Error('Chỉ ORG_ADMIN được xử lý yêu cầu.'), { status: 403 });
  }
  const request = await joins.findById(requestId);
  if (!request) throw Object.assign(new Error('Không tìm thấy yêu cầu.'), { status: 404 });
  if (String(request.organization_id) !== String(principal.organizationId)) {
    throw Object.assign(new Error('Yêu cầu không thuộc tổ chức của bạn.'), { status: 403 });
  }
  if (request.status !== 'PENDING') {
    throw Object.assign(new Error('Yêu cầu đã được xử lý trước đó.'), { status: 409, code: 'JOIN_ALREADY_DECIDED' });
  }
  const organization = await identity.findOrganizationById(request.organization_id);
  const user = await identity.findUserById(request.user_id);
  if (decision === 'APPROVED') {
    if (!organization || organization.is_active === false) {
      throw Object.assign(new Error('Tổ chức không khả dụng.'), { status: 400 });
    }
    if (!user || user.role !== 'REGISTERED_USER' || user.organization_id) {
      throw Object.assign(new Error('Người dùng không còn đủ điều kiện.'), {
        status: 400,
        code: 'USER_NOT_ELIGIBLE'
      });
    }
    const quota = await evaluateCreateUserQuota(organization);
    if (quota?.ok === false) {
      throw Object.assign(new Error(quota.message), { status: 403, code: quota.code });
    }
  }
  return runIdentityCommand(async (session) => {
    const decided = await joins.transitionByCompareAndSet(requestId, principal.organizationId, {
      status: decision,
      decided_by: principal.userId,
      decided_at: new Date()
    }, { session });
    if (!decided) throw Object.assign(new Error('Yêu cầu đã được xử lý.'), { status: 409 });
    let updatedUser = user;
    if (decision === 'APPROVED') {
      updatedUser = await identity.updateUserById(user._id, {
        $set: { role: 'BUILDING_ADMIN', organization_id: organization._id }
      }, { session });
      await memberships.upsertActive({
        organization_id: organization._id,
        user_id: user._id,
        role: 'BUILDING_ADMIN',
        building_ids: [],
        created_by: principal.userId
      }, { session });
      await joins.cancelOtherPending(user._id, decided._id, new Date(), { session });
      await revokeAll(user._id, {
        actorUserId: principal.userId,
        ipAddress: context.ipAddress
      }, 'SESSION_REVOKED', { session });
    }
    const action = decision === 'APPROVED' ? 'JOIN_ORG_APPROVE' : 'JOIN_ORG_REJECT';
    await activities.recordActivity({
      user_id: principal.userId,
      action,
      target_type: 'user',
      target_id: String(request.user_id),
      target: user?.email || String(request.user_id),
      details: { request_id: String(request._id) },
      ip_address: context.ipAddress,
      organization_id: principal.organizationId
    }, { session });
    await outbox.append({
      type: 'IdentityJoinDecided',
      event_key: `identity-join-decided:${request._id}`,
      aggregate_type: 'OrganizationJoinRequest',
      aggregate_id: request._id,
      organization_id: principal.organizationId,
      actor_user_id: principal.userId,
      payload: { decision }
    }, { session });
    return { request: decided, user: updatedUser };
  });
}

module.exports = { requestJoin, listMine, listForOrganization, decide };
