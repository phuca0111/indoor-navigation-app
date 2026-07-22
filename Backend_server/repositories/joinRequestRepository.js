const OrganizationJoinRequest = require('../models/OrganizationJoinRequest');

function options(session, extra = {}) {
  return session ? { ...extra, session } : extra;
}

async function findPending(userId, organizationId, { session } = {}) {
  let query = OrganizationJoinRequest.findOne({
    user_id: userId,
    organization_id: organizationId,
    status: 'PENDING'
  });
  if (session) query = query.session(session);
  return query.lean();
}

async function create(input, { session } = {}) {
  const [created] = await OrganizationJoinRequest.create([input], options(session));
  return typeof created.toObject === 'function' ? created.toObject() : created;
}

async function findById(requestId, { session } = {}) {
  let query = OrganizationJoinRequest.findById(requestId);
  if (session) query = query.session(session);
  return query.lean();
}

async function transitionByCompareAndSet(requestId, organizationId, update, { session } = {}) {
  return OrganizationJoinRequest.findOneAndUpdate(
    { _id: requestId, organization_id: organizationId, status: 'PENDING' },
    { $set: update },
    options(session, { new: true })
  ).lean();
}

async function cancelOtherPending(userId, excludedId, now, { session } = {}) {
  const result = await OrganizationJoinRequest.updateMany(
    { user_id: userId, status: 'PENDING', _id: { $ne: excludedId } },
    { $set: { status: 'CANCELLED', decided_at: now } },
    options(session)
  );
  return Number(result.modifiedCount || 0);
}

async function listMine(userId, { session } = {}) {
  let query = OrganizationJoinRequest.find({ user_id: userId })
    .sort({ createdAt: -1 })
    .populate('organization_id', 'name slug');
  if (session) query = query.session(session);
  return query.lean();
}

async function listForOrganization(organizationId, status, { session } = {}) {
  let query = OrganizationJoinRequest.find({ organization_id: organizationId, status })
    .sort({ createdAt: -1 })
    .populate('user_id', 'email full_name');
  if (session) query = query.session(session);
  return query.lean();
}

module.exports = {
  findPending,
  create,
  findById,
  transitionByCompareAndSet,
  cancelOtherPending,
  listMine,
  listForOrganization
};
