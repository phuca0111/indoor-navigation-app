const OrganizationMember = require('../models/OrganizationMember');
const Department = require('../models/Department');

function options(session, extra = {}) {
  return session ? { ...extra, session } : extra;
}

async function findMembership(userId, organizationId, { session } = {}) {
  let query = OrganizationMember.findOne({
    user_id: userId,
    organization_id: organizationId
  }).select('organization_id user_id role building_ids department_id status joined_at');
  if (session) query = query.session(session);
  return query.lean();
}

async function upsertActive(input, { session } = {}) {
  return OrganizationMember.findOneAndUpdate(
    { organization_id: input.organization_id, user_id: input.user_id },
    {
      $set: {
        role: input.role,
        department_id: input.department_id || null,
        building_ids: input.role === 'BUILDING_ADMIN' ? input.building_ids || [] : [],
        status: 'ACTIVE',
        created_by: input.created_by || null
      },
      $setOnInsert: { joined_at: input.joined_at || new Date() }
    },
    options(session, { new: true, upsert: true, runValidators: true })
  ).lean();
}

async function leaveOwned(memberId, organizationId, actorUserId, roleLimit, { session } = {}) {
  const filter = {
    _id: memberId,
    organization_id: organizationId,
    user_id: { $ne: actorUserId },
    status: { $ne: 'LEFT' }
  };
  if (roleLimit) filter.role = roleLimit;
  return OrganizationMember.findOneAndUpdate(
    filter,
    { $set: { status: 'LEFT' } },
    options(session, { new: true })
  ).lean();
}

async function leaveByUser(userId, organizationId, { session } = {}) {
  return OrganizationMember.findOneAndUpdate(
    { user_id: userId, organization_id: organizationId, status: { $ne: 'LEFT' } },
    { $set: { status: 'LEFT' } },
    options(session, { new: true })
  ).lean();
}

async function listActive(organizationId, { session } = {}) {
  let query = OrganizationMember.find({
    organization_id: organizationId,
    status: { $ne: 'LEFT' }
  })
    .populate('user_id', 'email full_name is_active')
    .populate('department_id', 'name code');
  if (session) query = query.session(session);
  return query.lean();
}

async function departmentBelongs(departmentId, organizationId, { session } = {}) {
  let query = Department.exists({ _id: departmentId, organization_id: organizationId });
  if (session) query = query.session(session);
  return Boolean(await query);
}

async function listDepartments(organizationId, { session } = {}) {
  let query = Department.find({
    organization_id: organizationId,
    is_active: { $ne: false }
  }).sort({ name: 1 });
  if (session) query = query.session(session);
  return query.lean();
}

async function createDepartment(input, { session } = {}) {
  const [created] = await Department.create([input], options(session));
  return typeof created.toObject === 'function' ? created.toObject() : created;
}

async function updateDepartment(departmentId, organizationId, update, { session } = {}) {
  return Department.findOneAndUpdate(
    { _id: departmentId, organization_id: organizationId },
    { $set: update },
    options(session, { new: true, runValidators: true })
  ).lean();
}

module.exports = {
  findMembership,
  upsertActive,
  leaveOwned,
  leaveByUser,
  listActive,
  departmentBelongs,
  listDepartments,
  createDepartment,
  updateDepartment
};
