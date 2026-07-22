const MapVersion = require('../models/MapVersion');

async function append(input, { session } = {}) {
  const [created] = await MapVersion.create([input], session ? { session } : undefined);
  return created.toObject();
}

async function findSnapshot(buildingId, floorNumber, version, { session } = {}) {
  return MapVersion.findOne({
    building_id: buildingId,
    floor_number: { $in: [Number(floorNumber), String(Number(floorNumber))] },
    version: Number(version)
  }).session(session || null).lean();
}

async function list(buildingId, floorNumber) {
  return MapVersion.find({
    building_id: buildingId,
    floor_number: { $in: [Number(floorNumber), String(Number(floorNumber))] }
  }).sort({ version: -1 }).populate('published_by', 'email').lean();
}

async function trimOldest(buildingId, floorNumber, maxKeep) {
  const old = await MapVersion.find({
    building_id: buildingId,
    floor_number: { $in: [Number(floorNumber), String(Number(floorNumber))] }
  }).sort({ version: -1 }).skip(maxKeep).select('_id version').lean();
  if (!old.length) return { deleted: 0, deletedVersions: [] };
  const result = await MapVersion.deleteMany({ _id: { $in: old.map((row) => row._id) } });
  return { deleted: result.deletedCount || 0, deletedVersions: old.map((row) => row.version) };
}

module.exports = { append, findSnapshot, list, trimOldest };
