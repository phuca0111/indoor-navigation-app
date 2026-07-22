const { createOrganizationForUser } = require('../organization/createOrganizationForUser');
const identity = require('../../repositories/identityRepository');
const { revokeAll, issueAuthSession } = require('./sessionApplicationService');
const { runIdentityCommand } = require('./runIdentityCommand');

async function upgradePersonalUser(input, context) {
  const currentUser = await identity.findUserById(input.userId);
  if (!currentUser) throw Object.assign(new Error('Không tìm thấy tài khoản.'), { status: 404 });
  if (currentUser.role !== 'REGISTERED_USER' || currentUser.organization_id) {
    throw Object.assign(new Error('Tài khoản đã thuộc một tổ chức.'), {
      status: 400,
      code: 'USER_NOT_ELIGIBLE'
    });
  }
  const result = await runIdentityCommand(async (session) => {
    const created = await createOrganizationForUser(input, { session });
    await revokeAll(input.userId, {
      actorUserId: input.userId,
      ipAddress: context.ipAddress
    }, 'SESSION_REVOKED', { session });
    return created;
  });
  const user = await identity.findUserById(input.userId);
  const authSession = await issueAuthSession(user, context);
  return { ...result, user, authSession };
}

module.exports = { upgradePersonalUser };
