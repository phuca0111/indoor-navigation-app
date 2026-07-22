const User = require('../models/User');
const Organization = require('../models/Organization');
const Building = require('../models/Building');

function options(session, extra = {}) {
  return session ? { ...extra, session } : extra;
}

function dto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function findUserById(userId, { session, includeSecrets = false } = {}) {
  let query = User.findById(userId);
  if (includeSecrets) {
    query = query.select('+password_reset_token_hash +password_reset_expires +two_factor.recovery_code_hashes');
  }
  if (session) query = query.session(session);
  return dto(await query.lean());
}

async function findUserByEmail(email, { session, includeSecrets = false } = {}) {
  let query = User.findOne({ email: String(email || '').trim().toLowerCase() });
  if (includeSecrets) {
    query = query.select('+password_reset_token_hash +password_reset_expires +two_factor.recovery_code_hashes');
  }
  if (session) query = query.session(session);
  return dto(await query.lean());
}

async function findUserByGoogleId(googleId, { session } = {}) {
  let query = User.findOne({ google_id: googleId });
  if (session) query = query.session(session);
  return dto(await query.lean());
}

async function findUserByValidResetHash(tokenHash, now, { session } = {}) {
  let query = User.findOne({
    password_reset_token_hash: tokenHash,
    password_reset_expires: { $gt: now }
  }).select('+password_reset_token_hash +password_reset_expires');
  if (session) query = query.session(session);
  return dto(await query.lean());
}

async function createUser(input, { session } = {}) {
  const [created] = await User.create([input], options(session));
  return dto(created);
}

async function updateUserById(userId, update, { session, projection } = {}) {
  let query = User.findByIdAndUpdate(userId, update, {
    new: true,
    runValidators: true,
    ...options(session)
  });
  if (projection) query = query.select(projection);
  return dto(await query.lean());
}

async function compareAndUpdateUser(userId, expected, update, { session } = {}) {
  const result = await User.updateOne({ _id: userId, ...expected }, update, options(session));
  return Number(result.modifiedCount || 0) === 1;
}

async function incrementSessionVersion(userId, { session } = {}) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { session_version: 1 } },
    { new: true, ...options(session) }
  ).select('session_version').lean();
  return user ? Number(user.session_version) || 0 : null;
}

async function recordLogin(userId, now, { session } = {}) {
  await User.updateOne({ _id: userId }, { $set: { last_login: now } }, options(session));
}

async function findOrganizationById(organizationId, { session } = {}) {
  let query = Organization.findById(organizationId);
  if (session) query = query.session(session);
  return dto(await query.lean());
}

async function findOrganizationBySlug(slug, { session } = {}) {
  let query = Organization.findOne({ slug: String(slug || '').trim().toLowerCase() });
  if (session) query = query.session(session);
  return dto(await query.lean());
}

async function buildingIdsBelongToOrganization(buildingIds, organizationId, { session } = {}) {
  const unique = [...new Set((buildingIds || []).map(String))];
  if (!unique.length) return true;
  let query = Building.countDocuments({ _id: { $in: unique }, organization_id: organizationId });
  if (session) query = query.session(session);
  return await query === unique.length;
}

async function getUserProfile(userId, { session } = {}) {
  let query = User.findById(userId)
    .select('-password')
    .populate(
      'organization_id',
      'name slug is_active plan billing_status grace_ends_at plan_started_at plan_expires_at contact_phone contact_address'
    );
  if (session) query = query.session(session);
  return query.lean();
}

async function listUsersForAdministration(filter, excludedUserId, { session } = {}) {
  let query = User.find({ ...filter, _id: { $ne: excludedUserId } })
    .populate('assigned_buildings', 'name address')
    .select('-password');
  if (session) query = query.session(session);
  return query.lean();
}

async function getUserForAdministration(userId, { session } = {}) {
  let query = User.findById(userId)
    .populate('assigned_buildings', 'name address')
    .select('-password');
  if (session) query = query.session(session);
  return query.lean();
}

async function listActiveTenantUsersInQuotaOrder(organizationId, { session } = {}) {
  let query = User.find({
    organization_id: organizationId,
    is_active: { $ne: false },
    role: { $in: ['ORG_ADMIN', 'BUILDING_ADMIN'] }
  }).sort({ role: -1, createdAt: 1, _id: 1 }).select('_id role');
  if (session) query = query.session(session);
  return query.lean();
}

module.exports = {
  findUserById,
  findUserByEmail,
  findUserByGoogleId,
  findUserByValidResetHash,
  createUser,
  updateUserById,
  compareAndUpdateUser,
  incrementSessionVersion,
  recordLogin,
  findOrganizationById,
  findOrganizationBySlug,
  buildingIdsBelongToOrganization,
  getUserProfile,
  listUsersForAdministration,
  getUserForAdministration,
  listActiveTenantUsersInQuotaOrder
};
