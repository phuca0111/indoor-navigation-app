const Building = require('../models/Building');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Floor = require('../models/Floor');
const Draft = require('../models/Draft');
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
    .select('_id floor_number floor_name version published_at map_data.rooms map_data.pois map_data.nodes')
    .session(session || null)
    .lean();
}

async function upsertFloorName(buildingId, floorNumber, floorName, userId, { session } = {}) {
  const name = String(floorName || '').trim();
  return Floor.findOneAndUpdate(
    { building_id: buildingId, floor_number: floorNumber },
    {
      $set: {
        floor_name: name,
        last_modified_by: userId || null
      },
      $setOnInsert: {
        building_id: buildingId,
        floor_number: floorNumber,
        version: 0,
        published_at: null
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      session: session || undefined
    }
  ).lean();
}

/** F8 — bật/tắt hiển thị public cho một tầng. */
async function updateFloorVisibility(buildingId, floorNumber, isVisible, userId, { session } = {}) {
  return Floor.findOneAndUpdate(
    { building_id: buildingId, floor_number: floorNumber },
    {
      $set: {
        is_visible: Boolean(isVisible),
        last_modified_by: userId || null
      },
      $setOnInsert: {
        building_id: buildingId,
        floor_number: floorNumber,
        version: 0,
        published_at: null,
        floor_name: ''
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      session: session || undefined
    }
  ).lean();
}

/** F9 — gán display_order theo thứ tự UI (index trong order[]). */
async function updateFloorDisplayOrders(buildingId, order, userId, { session } = {}) {
  const ops = order.map((floorNumber, index) => ({
    updateOne: {
      filter: { building_id: buildingId, floor_number: floorNumber },
      update: {
        $set: {
          display_order: index,
          last_modified_by: userId || null
        },
        $setOnInsert: {
          building_id: buildingId,
          floor_number: floorNumber,
          version: 0,
          published_at: null,
          floor_name: ''
        }
      },
      upsert: true
    }
  }));
  if (!ops.length) return;
  await Floor.bulkWrite(ops, { session: session || undefined });
}

/** F6 — đọc đủ map_data + tên tầng để nhân bản. */
async function findFloorMapData(buildingId, floorNumber, { session } = {}) {
  return Floor.findOne({ building_id: buildingId, floor_number: floorNumber })
    .select('_id floor_number floor_name version published_at map_data')
    .session(session || null)
    .lean();
}

/** F6 — bản nháp đang hoạt động của tầng nguồn (fallback khi tầng chưa publish). */
async function findActiveDraft(buildingId, floorNumber, { session } = {}) {
  return Draft.findOne({ building_id: buildingId, floor_number: floorNumber, deleted_at: null })
    .session(session || null)
    .lean();
}

/** F6 — tạo Draft mới cho tầng đích (đã đảm bảo tầng đích chưa có draft). */
async function createFloorDraft(input, { session } = {}) {
  const [created] = await Draft.create([{
    building_id: input.buildingId,
    floor_number: input.floorNumber,
    payload: input.payload,
    payload_fingerprint: input.fingerprint || '',
    version: 1,
    created_by: input.userId || null,
    updated_by: input.userId || null
  }], session ? { session } : undefined);
  return dto(created);
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
  upsertFloorName,
  updateFloorVisibility,
  updateFloorDisplayOrders,
  findFloorMapData,
  findActiveDraft,
  createFloorDraft,
  findPlaceForAttachment
};
