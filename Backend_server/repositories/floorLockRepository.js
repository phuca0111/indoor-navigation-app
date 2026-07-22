const FloorEditLock = require('../models/FloorEditLock');

async function find(buildingId, floorNumber) {
  return FloorEditLock.findOne({ building_id: buildingId, floor_number: floorNumber });
}

async function remove(id) {
  return FloorEditLock.deleteOne({ _id: id });
}

async function acquire(input) {
  return FloorEditLock.findOneAndUpdate(
    {
      building_id: input.buildingId,
      floor_number: input.floorNumber,
      $or: [{ expires_at: { $lte: new Date() } }, { expires_at: { $exists: false } }]
    },
    {
      $set: {
        user_id: input.userId,
        user_email: input.email,
        session_id: input.sessionId,
        expires_at: input.expiresAt
      },
      $setOnInsert: {
        building_id: input.buildingId,
        floor_number: input.floorNumber
      },
      $inc: { fencing_token: 1 }
    },
    { upsert: true, returnDocument: 'after' }
  );
}

async function clearBuilding(buildingId) {
  return FloorEditLock.deleteMany({ building_id: buildingId });
}

module.exports = { find, remove, acquire, clearBuilding };
