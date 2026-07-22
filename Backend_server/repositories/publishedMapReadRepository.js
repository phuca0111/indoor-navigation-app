const Building = require('../models/Building');
const Organization = require('../models/Organization');
const Floor = require('../models/Floor');

async function findBuildingForPublishedMap(buildingId) {
  return Building.findOne({
    _id: buildingId,
    status: 'PUBLISHED',
    is_active: { $ne: false }
  })
    .select('_id status is_active organization_id total_floors')
    .lean();
}

async function findOrganizationProjection(organizationId) {
  if (!organizationId) return null;
  return Organization.findById(organizationId)
    .select('_id is_active plan billing_status grace_ends_at plan_expires_at')
    .lean();
}

async function findPublishedFloor(buildingId, floorNumber) {
  const building = await findBuildingForPublishedMap(buildingId);
  if (!building) return null;
  return Floor.findOne({
    building_id: building._id,
    floor_number: { $in: [floorNumber, String(floorNumber)] },
    published_at: { $ne: null }
  })
    .select('-draft_map_data -draft_updated_at -draft_updated_by')
    .lean();
}

async function findBuildingForActor(buildingId, actor) {
  if (!actor) return findBuildingForPublishedMap(buildingId);
  const filter = { _id: buildingId };
  if (actor.role === 'ORG_ADMIN') {
    if (!actor.organization_id) return null;
    filter.organization_id = actor.organization_id;
  } else if (actor.role === 'REGISTERED_USER') {
    filter.owner_user_id = actor.userId;
    filter.organization_id = null;
  } else if (actor.role === 'BUILDING_ADMIN') {
    filter._id = { $in: actor.assigned_buildings || [], $eq: buildingId };
    if (actor.organization_id) filter.organization_id = actor.organization_id;
  } else if (actor.role !== 'SUPER_ADMIN') {
    return null;
  }
  return Building.findOne(filter)
    .select('_id status is_active organization_id owner_user_id total_floors')
    .lean();
}

async function findFloorForActor(buildingId, floorNumber, actor) {
  const building = await findBuildingForActor(buildingId, actor);
  if (!building) return null;
  const filter = {
    building_id: building._id,
    floor_number: { $in: [floorNumber, String(floorNumber)] }
  };
  if (!actor) filter.published_at = { $ne: null };
  const query = Floor.findOne(filter);
  if (!actor) query.select('-draft_map_data -draft_updated_at -draft_updated_by');
  return query.lean();
}

async function listPublishedFloors(buildingId) {
  const building = await findBuildingForPublishedMap(buildingId);
  if (!building) return null;
  const floors = await Floor.find({
    building_id: building._id,
    published_at: { $ne: null }
  })
    .select('-draft_map_data -draft_updated_at -draft_updated_by')
    .sort({ floor_number: 1 })
    .lean();
  return { building, floors };
}

module.exports = {
  findBuildingForPublishedMap,
  findBuildingForActor,
  findOrganizationProjection,
  findPublishedFloor,
  findFloorForActor,
  listPublishedFloors
};
