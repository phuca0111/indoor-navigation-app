// ============================================
// FILE: draftService.js
// MỤC ĐÍCH: Business logic cho Draft API
// Pattern: Service layer — không chứa HTTP logic
// ============================================

const Draft = require('../models/Draft');

async function getByFloor(buildingId, floorNumber) {
  return Draft.findOne({
    building_id: buildingId,
    floor_number: floorNumber
  }).lean();
}

async function loadOrCreate(buildingId, floorNumber, userId) {
  let draft = await getByFloor(buildingId, floorNumber);
  if (!draft) {
    draft = await Draft.create({
      building_id: buildingId,
      floor_number: floorNumber,
      payload: { rooms: [], nodes: [], edges: [] },
      version: 1,
      created_by: userId,
      updated_by: userId
    });
  }
  return draft;
}

async function save(buildingId, floorNumber, payload, userId) {
  // Upsert: field version thiếu → $inc = 1; lần sau ++version
  const draft = await Draft.findOneAndUpdate(
    { building_id: buildingId, floor_number: floorNumber },
    {
      $set: {
        payload,
        updated_by: userId
      },
      $setOnInsert: {
        created_by: userId
      },
      $inc: { version: 1 }
    },
    { new: true, upsert: true }
  );
  return draft;
}

module.exports = {
  getByFloor,
  loadOrCreate,
  save
};
