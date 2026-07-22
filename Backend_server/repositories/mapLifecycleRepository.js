const Building = require('../models/Building');
const Floor = require('../models/Floor');
const Organization = require('../models/Organization');
const User = require('../models/User');
const QrCode = require('../models/QrCode');

function plain(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function findBuilding(buildingId, { session } = {}) {
  return Building.findById(buildingId)
    .select('organization_id owner_user_id total_floors is_active status')
    .session(session || null)
    .lean();
}

async function listBuildingIdsForOrganization(organizationId) {
  return Building.find({ organization_id: organizationId }).select('_id').lean();
}

async function findOrganization(organizationId, { session } = {}) {
  return Organization.findById(organizationId).session(session || null).lean();
}

async function updatePublishPermit(organizationId, changes, { session } = {}) {
  return Organization.findByIdAndUpdate(
    organizationId,
    { $set: changes },
    { new: true, session: session || undefined }
  ).lean();
}

async function findActor(userId, { session } = {}) {
  return User.findById(userId)
    .select('email is_active role organization_id assigned_buildings plan plan_expires_at')
    .session(session || null)
    .lean();
}

async function findPublishedFloor(buildingId, floorNumber, { session } = {}) {
  return Floor.findOne({ building_id: buildingId, floor_number: floorNumber })
    .session(session || null)
    .lean();
}

async function publishFloor(input, { session } = {}) {
  const current = await findPublishedFloor(input.buildingId, input.floorNumber, { session });
  const version = Number(current?.version || 0) + 1;
  const floor = await Floor.findOneAndUpdate(
    { building_id: input.buildingId, floor_number: input.floorNumber },
    {
      $set: {
        map_data: input.mapData,
        published_at: input.publishedAt,
        last_modified_by: input.userId,
        floor_name: current?.floor_name || `Tầng ${input.floorNumber}`
      },
      $setOnInsert: { building_id: input.buildingId, floor_number: input.floorNumber },
      $inc: { version: 1 }
    },
    { new: true, upsert: true, session: session || undefined }
  );
  return { floor: plain(floor), before: current, created: !current, version };
}

async function replacePublishedFloor(input, { session } = {}) {
  return Floor.findOneAndUpdate(
    {
      building_id: input.buildingId,
      floor_number: input.floorNumber,
      version: input.expectedVersion
    },
    {
      $set: {
        map_data: input.mapData,
        published_at: input.publishedAt,
        last_modified_by: input.userId
      },
      $inc: { version: 1 }
    },
    { new: true, session: session || undefined }
  ).lean();
}

async function markBuildingPublished(buildingId, { session } = {}) {
  return Building.findByIdAndUpdate(
    buildingId,
    { $set: { status: 'PUBLISHED' } },
    { new: true, session: session || undefined }
  ).select('organization_id').lean();
}

async function syncQrAnchors(input, { session } = {}) {
  for (const anchor of input.mapData?.qr_anchors || []) {
    const qrId = anchor.qr_id || anchor.serial || anchor.qr_code;
    if (!qrId) continue;
    const x = Math.round(anchor.x || 0);
    const y = Math.round(anchor.y || 0);
    const qrCode = anchor.qr_code ||
      `MAP_NAV|${input.buildingId}|${input.floorNumber}|${x}|${y}|${qrId}`;
    await QrCode.updateOne(
      { qr_code: qrCode },
      {
        $set: {
          building_id: input.buildingId,
          floor_number: input.floorNumber,
          x,
          y,
          node_id: anchor.node_id || '',
          label: anchor.label || anchor.room_name || ''
        }
      },
      { upsert: true, session: session || undefined }
    );
  }
}

async function personalQuotaSnapshot(building, floorNumber, { session } = {}) {
  if (!building?.owner_user_id || building.organization_id) return null;
  const ownerBuildingIds = await Building.find({ owner_user_id: building.owner_user_id })
    .session(session || null)
    .distinct('_id');
  const [publishedMaps, qrCount, floorExists] = await Promise.all([
    Floor.countDocuments({ building_id: { $in: ownerBuildingIds } }).session(session || null),
    QrCode.countDocuments({
      building_id: { $in: ownerBuildingIds },
      $nor: [{ building_id: building._id, floor_number: floorNumber }]
    }).session(session || null),
    Floor.exists({ building_id: building._id, floor_number: floorNumber }).session(session || null)
  ]);
  return { publishedMaps, qrCount, floorExists: Boolean(floorExists) };
}

module.exports = {
  findBuilding,
  listBuildingIdsForOrganization,
  findOrganization,
  updatePublishPermit,
  findActor,
  findPublishedFloor,
  publishFloor,
  replacePublishedFloor,
  markBuildingPublished,
  syncQrAnchors,
  personalQuotaSnapshot
};
