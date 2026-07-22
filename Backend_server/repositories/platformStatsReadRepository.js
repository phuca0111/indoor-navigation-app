/**
 * Platform stats read repository — returns plain DTOs only (no Mongoose Query).
 */
const Organization = require('../models/Organization');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Draft = require('../models/Draft');
const MapVersion = require('../models/MapVersion');
const User = require('../models/User');
const OrganizationRegistration = require('../models/OrganizationRegistration');

async function countOrganizations(filter = {}) {
  return Organization.countDocuments(filter);
}

async function findOrganizationById(id) {
  if (!id) return null;
  const row = await Organization.findById(id).lean();
  return row || null;
}

async function getBuildingStats(orgFilter = {}) {
  const base = orgFilter || {};
  const activeQ = { ...base, is_active: { $ne: false } };
  const [totalActive, published, draft, inactive] = await Promise.all([
    Building.countDocuments(activeQ),
    Building.countDocuments({ ...activeQ, status: 'PUBLISHED' }),
    Building.countDocuments({ ...activeQ, status: 'DRAFT' }),
    Building.countDocuments({ ...base, is_active: false })
  ]);
  return { total_active: totalActive, published, draft, inactive };
}

async function getFloorStats(buildingFilter) {
  const filter = buildingFilter && Object.keys(buildingFilter).length ? buildingFilter : null;
  let buildingIds = [];
  let publishedBuildingIds = [];
  let draftBuildingIds = [];

  if (filter) {
    const buildings = await Building.find({
      ...filter,
      is_active: { $ne: false }
    }).select('_id status is_active').lean();
    buildingIds = buildings.map((b) => b._id);
    publishedBuildingIds = buildings
      .filter((b) => b.is_active !== false && b.status === 'PUBLISHED')
      .map((b) => b._id);
    draftBuildingIds = buildings
      .filter((b) => b.is_active !== false && b.status !== 'PUBLISHED')
      .map((b) => b._id);
    if (!buildingIds.length) {
      return {
        total: 0, published: 0, draft: 0, published_at: 0,
        in_published_buildings: 0, orphan: 0,
        current_maps: 0, draft_maps: 0, version_count: 0
      };
    }
  } else {
    const buildings = await Building.find({ is_active: { $ne: false } }).select('_id status').lean();
    buildingIds = buildings.map((b) => b._id);
    publishedBuildingIds = buildings.filter((b) => b.status === 'PUBLISHED').map((b) => b._id);
    draftBuildingIds = buildings.filter((b) => b.status !== 'PUBLISHED').map((b) => b._id);
  }

  const allBuildingIds = await Building.find({}).distinct('_id');
  const floorMatch = { building_id: { $in: buildingIds } };
  const [
    total,
    publishedAt,
    inPublishedBuildings,
    inDraftBuildings,
    orphanFloors,
    draftMaps,
    versionCount
  ] = await Promise.all([
    Floor.countDocuments(floorMatch),
    Floor.countDocuments({ ...floorMatch, published_at: { $ne: null } }),
    publishedBuildingIds.length
      ? Floor.countDocuments({ building_id: { $in: publishedBuildingIds } })
      : Promise.resolve(0),
    draftBuildingIds.length
      ? Floor.countDocuments({ building_id: { $in: draftBuildingIds } })
      : Promise.resolve(0),
    Floor.countDocuments({
      $or: [
        { building_id: null },
        { building_id: { $exists: false } },
        { building_id: { $nin: allBuildingIds } }
      ]
    }),
    Draft.countDocuments({ building_id: { $in: buildingIds } }),
    MapVersion.countDocuments({ building_id: { $in: buildingIds } })
  ]);

  return {
    total,
    published: inPublishedBuildings,
    draft: inDraftBuildings,
    published_at: publishedAt,
    in_published_buildings: inPublishedBuildings,
    orphan: orphanFloors,
    current_maps: publishedAt,
    draft_maps: draftMaps,
    version_count: versionCount
  };
}

async function countActiveUsersToday(orgFilter = {}) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return User.countDocuments({
    ...(orgFilter || {}),
    role: { $ne: 'SUPER_ADMIN' },
    last_login: { $gte: start, $lte: end }
  });
}

async function getUserStats(orgFilter = {}) {
  const base = { ...(orgFilter || {}), is_active: { $ne: false } };
  const [total, orgAdmin, buildingAdmin, inactive] = await Promise.all([
    User.countDocuments({ ...base, role: { $ne: 'SUPER_ADMIN' } }),
    User.countDocuments({ ...base, role: 'ORG_ADMIN' }),
    User.countDocuments({ ...base, role: 'BUILDING_ADMIN' }),
    User.countDocuments({ ...(orgFilter || {}), is_active: false, role: { $ne: 'SUPER_ADMIN' } })
  ]);
  return { total, org_admin: orgAdmin, building_admin: buildingAdmin, inactive };
}

async function findUserAssignedBuildings(userId) {
  if (!userId) return null;
  return User.findById(userId).select('assigned_buildings organization_id').lean();
}

async function countPendingRegistrations() {
  return OrganizationRegistration.countDocuments({ status: 'PENDING' });
}

module.exports = {
  countOrganizations,
  findOrganizationById,
  getBuildingStats,
  getFloorStats,
  countActiveUsersToday,
  getUserStats,
  findUserAssignedBuildings,
  countPendingRegistrations
};
