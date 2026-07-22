const QrCode = require('../models/QrCode');

async function syncFloorAnchors(input, { session } = {}) {
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

async function countOutsideFloor(buildingIds, buildingId, floorNumber, { session } = {}) {
  return QrCode.countDocuments({
    building_id: { $in: buildingIds },
    $nor: [{ building_id: buildingId, floor_number: floorNumber }]
  }).session(session || null);
}

module.exports = { syncFloorAnchors, countOutsideFloor };
