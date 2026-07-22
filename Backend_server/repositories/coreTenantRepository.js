const Building = require('../models/Building');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Floor = require('../models/Floor');
const Place = require('../models/Place');

function dto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

function tenantFilter(scope) {
  if (scope?.kind === 'SYSTEM') return {};
  if (scope?.kind === 'ORGANIZATION' && scope.organizationId) {
    return { organization_id: scope.organizationId };
  }
  if (scope?.kind === 'PERSONAL' && scope.userId) {
    return { owner_user_id: scope.userId, organization_id: null };
  }
  throw Object.assign(new Error('Thiếu tenant scope hợp lệ.'), {
    status: 403,
    code: 'TENANT_SCOPE_REQUIRED'
  });
}

async function findOrganizationById(id, scope, { session } = {}) {
  const filter = { _id: id };
  if (scope?.kind !== 'SYSTEM') {
    if (scope?.kind !== 'ORGANIZATION' || !scope.organizationId) {
      tenantFilter(scope);
    }
    filter._id = scope.organizationId;
    if (String(id) !== String(scope.organizationId)) return null;
  }
  return Organization.findOne(filter).session(session || null).lean();
}

async function updateOrganization(id, changes, scope, { session } = {}) {
  const current = await findOrganizationById(id, scope, { session });
  if (!current) return null;
  return Organization.findOneAndUpdate(
    { _id: current._id },
    { $set: changes },
    { new: true, session: session || undefined }
  ).lean();
}

async function findUserScope(userId, { session } = {}) {
  return User.findById(userId)
    .select('organization_id assigned_buildings plan role is_active')
    .session(session || null)
    .lean();
}

async function userEmailExists(email, { session } = {}) {
  const query = User.exists({ email });
  return Boolean(await (session ? query.session(session) : query));
}

async function createOrganizationAdmin(input, { session } = {}) {
  const [created] = await User.create([input], session ? { session } : undefined);
  const value = dto(created);
  if (value) delete value.password;
  return value;
}

async function findBuildingById(id, scope, { session } = {}) {
  return Building.findOne({ _id: id, ...tenantFilter(scope) })
    .session(session || null)
    .lean();
}

async function createBuilding(input, scope, { session } = {}) {
  const filter = tenantFilter(scope);
  const data = { ...input };
  if (scope.kind === 'ORGANIZATION') {
    data.organization_id = filter.organization_id;
    data.owner_user_id = null;
  } else if (scope.kind === 'PERSONAL') {
    data.organization_id = null;
    data.owner_user_id = filter.owner_user_id;
  } else if (!data.organization_id && !data.owner_user_id) {
    throw Object.assign(new Error('System scope phải chỉ định chủ sở hữu building.'), {
      status: 400,
      code: 'BUILDING_OWNER_REQUIRED'
    });
  }
  const [created] = await Building.create([data], session ? { session } : undefined);
  return dto(created);
}

async function updateBuilding(id, changes, scope, { session } = {}) {
  return Building.findOneAndUpdate(
    { _id: id, ...tenantFilter(scope) },
    { $set: changes },
    { new: true, session: session || undefined }
  ).lean();
}

async function findFloorAt(buildingId, floorNumber, scope, { session } = {}) {
  const building = await findBuildingById(buildingId, scope, { session });
  if (!building) return null;
  return Floor.findOne({ building_id: building._id, floor_number: floorNumber })
    .select('_id floor_number version published_at')
    .session(session || null)
    .lean();
}

async function findPlaceForAttachment(placeId, { session } = {}) {
  return Place.findById(placeId)
    .select('_id status')
    .session(session || null)
    .lean();
}

module.exports = {
  tenantFilter,
  findOrganizationById,
  updateOrganization,
  findUserScope,
  userEmailExists,
  createOrganizationAdmin,
  findBuildingById,
  createBuilding,
  updateBuilding,
  findFloorAt,
  findPlaceForAttachment
};
