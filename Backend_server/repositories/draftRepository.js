const Draft = require('../models/Draft');
const Floor = require('../models/Floor');

function plain(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function findActive(buildingId, floorNumber, { session } = {}) {
  return Draft.findOne({ building_id: buildingId, floor_number: floorNumber, deleted_at: null })
    .session(session || null)
    .lean();
}

async function findLegacyFloorDraft(buildingId, floorNumber, { session } = {}) {
  return Floor.findOne({ building_id: buildingId, floor_number: floorNumber })
    .select('draft_map_data draft_updated_at draft_updated_by version')
    .session(session || null)
    .lean();
}

async function saveRevision(input, { session } = {}) {
  const filter = {
    building_id: input.buildingId,
    floor_number: input.floorNumber,
    deleted_at: null
  };
  if (input.expectedRevision !== null) filter.version = input.expectedRevision;
  let saved;
  if (input.expectedRevision === 0) {
    try {
      [saved] = await Draft.create([{
        building_id: input.buildingId,
        floor_number: input.floorNumber,
        payload: input.payload,
        payload_fingerprint: input.fingerprint,
        version: 1,
        created_by: input.userId,
        updated_by: input.userId
      }], session ? { session } : undefined);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return null;
    }
  } else {
    saved = await Draft.findOneAndUpdate(
      filter,
      {
        $set: {
          payload: input.payload,
          payload_fingerprint: input.fingerprint,
          updated_by: input.userId,
          deleted_at: null,
          purge_after: null
        },
        $setOnInsert: { created_by: input.userId },
        $inc: { version: 1 }
      },
      {
        new: true,
        upsert: input.expectedRevision === null,
        setDefaultsOnInsert: true,
        session: session || undefined
      }
    );
  }
  return plain(saved);
}

async function mirrorLegacyDraft(input, { session } = {}) {
  await Floor.updateOne(
    { building_id: input.buildingId, floor_number: input.floorNumber },
    {
      $set: {
        draft_map_data: input.payload,
        draft_updated_at: input.updatedAt,
        draft_updated_by: input.userId
      }
    },
    { session: session || undefined }
  );
}

async function softDelete(buildingId, floorNumber, userId, purgeAfter) {
  return Draft.findOneAndUpdate(
    { building_id: buildingId, floor_number: floorNumber, deleted_at: null },
    { $set: { deleted_at: new Date(), purge_after: purgeAfter, updated_by: userId } },
    { new: true }
  ).lean();
}

async function purgeExpired(now = new Date(), limit = 500) {
  const rows = await Draft.find({ deleted_at: { $ne: null }, purge_after: { $lte: now } })
    .select('_id').limit(Math.min(Number(limit) || 500, 5000)).lean();
  if (!rows.length) return 0;
  const result = await Draft.deleteMany({ _id: { $in: rows.map((row) => row._id) } });
  return result.deletedCount || 0;
}

module.exports = {
  findActive,
  findLegacyFloorDraft,
  saveRevision,
  mirrorLegacyDraft,
  softDelete,
  purgeExpired
};
