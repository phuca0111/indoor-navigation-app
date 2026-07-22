const OrganizationInvite = require('../models/OrganizationInvite');

function options(session, extra = {}) {
  return session ? { ...extra, session } : extra;
}

async function findPending(organizationId, email, { session } = {}) {
  let query = OrganizationInvite.findOne({
    organization_id: organizationId,
    email,
    status: 'PENDING'
  });
  if (session) query = query.session(session);
  return query.lean();
}

async function create(input, { session } = {}) {
  const [created] = await OrganizationInvite.create([input], options(session));
  return typeof created.toObject === 'function' ? created.toObject() : created;
}

async function list(organizationId, status, { session } = {}) {
  const filter = { organization_id: organizationId };
  if (status && status !== 'ALL') filter.status = status;
  let query = OrganizationInvite.find(filter)
    .sort({ createdAt: -1 })
    .populate('invited_by', 'email full_name')
    .populate('accepted_by', 'email full_name');
  if (session) query = query.session(session);
  return query.lean();
}

async function findByTokenHash(tokenHash, { session } = {}) {
  let query = OrganizationInvite.findOne({ token_hash: tokenHash }).select('+token_hash');
  if (session) query = query.session(session);
  return query.lean();
}

async function transitionByCompareAndSet(inviteId, expectedStatus, update, { session } = {}) {
  return OrganizationInvite.findOneAndUpdate(
    { _id: inviteId, status: expectedStatus },
    { $set: update },
    options(session, { new: true })
  ).lean();
}

async function revokeOwned(inviteId, organizationId, { session } = {}) {
  return OrganizationInvite.findOneAndUpdate(
    { _id: inviteId, organization_id: organizationId, status: 'PENDING' },
    { $set: { status: 'REVOKED' } },
    options(session, { new: true })
  ).lean();
}

module.exports = {
  findPending,
  create,
  list,
  findByTokenHash,
  transitionByCompareAndSet,
  revokeOwned
};
