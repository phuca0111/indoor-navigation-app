/**
 * Phase 4.6 — Thống kê platform / tổ chức cho dashboard
 */

const Organization = require('../models/Organization');
const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Draft = require('../models/Draft');
const MapVersion = require('../models/MapVersion');
const User = require('../models/User');
const OrganizationRegistration = require('../models/OrganizationRegistration');
const { getOrgQuotaSnapshot } = require('../utils/overQuotaLock');

async function getBuildingStats(orgFilter) {
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
        in_published_buildings: 0, orphan: 0
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

async function countActiveUsersToday(orgFilter) {
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

async function getUserStats(orgFilter) {
  const base = { ...(orgFilter || {}), is_active: { $ne: false } };
  const [total, orgAdmin, buildingAdmin, inactive] = await Promise.all([
    User.countDocuments({ ...base, role: { $ne: 'SUPER_ADMIN' } }),
    User.countDocuments({ ...base, role: 'ORG_ADMIN' }),
    User.countDocuments({ ...base, role: 'BUILDING_ADMIN' }),
    User.countDocuments({ ...(orgFilter || {}), is_active: false, role: { $ne: 'SUPER_ADMIN' } })
  ]);
  return { total, org_admin: orgAdmin, building_admin: buildingAdmin, inactive };
}

const getPlatformStats = async (req, res) => {
  try {
    const role = req.user?.role;

    if (role === 'SUPER_ADMIN') {
      const [orgTotal, orgActive, orgInactive, pendingRegs, pro, enterprise] = await Promise.all([
        Organization.countDocuments({}),
        Organization.countDocuments({ is_active: { $ne: false } }),
        Organization.countDocuments({ is_active: false }),
        OrganizationRegistration.countDocuments({ status: 'PENDING' }),
        Organization.countDocuments({ plan: 'PRO', is_active: { $ne: false } }),
        Organization.countDocuments({ plan: 'ENTERPRISE', is_active: { $ne: false } })
      ]);

      const [buildings, users, floors, activeUsersToday] = await Promise.all([
        getBuildingStats({}),
        getUserStats({}),
        getFloorStats(null),
        countActiveUsersToday({})
      ]);

      return res.status(200).json({
        scope: 'platform',
        organizations: {
          total: orgTotal,
          active: orgActive,
          inactive: orgInactive,
          paid: pro + enterprise,
          pro,
          enterprise
        },
        buildings,
        floors,
        users,
        active_users_today: activeUsersToday,
        registrations: { pending: pendingRegs }
      });
    }

    if (role === 'ORG_ADMIN') {
      const orgId = req.user.organization_id;
      if (!orgId) {
        return res.status(403).json({ message: 'Tài khoản ORG_ADMIN chưa được gán tổ chức.' });
      }

      const orgDoc = await Organization.findById(orgId);
      const orgFilter = { organization_id: orgId };

      const [buildings, users, floors, activeUsersToday, quota] = await Promise.all([
        getBuildingStats(orgFilter),
        getUserStats(orgFilter),
        getFloorStats(orgFilter),
        countActiveUsersToday(orgFilter),
        getOrgQuotaSnapshot(orgDoc)
      ]);
      const org = orgDoc ? orgDoc.toObject() : null;

      return res.status(200).json({
        scope: 'organization',
        organization: org
          ? {
            id: String(org._id),
            name: org.name,
            slug: org.slug,
            plan: org.plan || 'FREE',
            is_active: org.is_active !== false,
            billing_status: org.billing_status || 'ACTIVE',
            grace_ends_at: org.grace_ends_at || null
          }
          : { id: String(orgId) },
        buildings,
        floors,
        users,
        active_users_today: activeUsersToday,
        quota
      });
    }

    if (role === 'BUILDING_ADMIN') {
      const user = await User.findById(req.user.userId)
        .select('assigned_buildings organization_id')
        .lean();
      const assignedIds = (user?.assigned_buildings || []).map(String);
      const orgFilter = assignedIds.length
        ? { _id: { $in: assignedIds }, organization_id: user.organization_id }
        : { _id: null };

      const orgDoc = user?.organization_id
        ? await Organization.findById(user.organization_id)
        : null;

      const [buildings, floors, quota] = await Promise.all([
        getBuildingStats(orgFilter),
        getFloorStats(orgFilter),
        orgDoc ? getOrgQuotaSnapshot(orgDoc) : null
      ]);
      const org = orgDoc ? orgDoc.toObject() : null;

      return res.status(200).json({
        scope: 'assigned',
        organization: org
          ? {
            id: String(org._id),
            name: org.name,
            plan: org.plan || 'FREE',
            billing_status: org.billing_status || 'ACTIVE'
          }
          : null,
        buildings: {
          ...buildings,
          assigned: assignedIds.length
        },
        floors,
        quota
      });
    }

    return res.status(403).json({ message: 'Không có quyền xem thống kê.' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
};

module.exports = { getPlatformStats, getBuildingStats, getUserStats, getFloorStats, countActiveUsersToday };
