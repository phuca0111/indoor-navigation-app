/**
 * GĐ2 Building Explorer — tóm tắt tòa nhà kiểu Google Maps (trước Enter Indoor).
 * Public chỉ với building PUBLISHED + is_active.
 */
const Building = require('../../models/Building');
const Floor = require('../../models/Floor');
const Place = require('../../models/Place');
const PlaceReview = require('../../models/PlaceReview');
const User = require('../../models/User');
const { countMapElements } = require('../../utils/mapSnapshot');

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

/** Cộng dồn rooms/pois từ danh sách floor lean (unit-testable). */
function aggregateFloorStats(floors) {
  const list = Array.isArray(floors) ? floors : [];
  let rooms = 0;
  let pois = 0;
  let floorsWithMap = 0;
  let lastPublishedAt = null;
  for (const floor of list) {
    const counts = countMapElements(floor?.map_data);
    rooms += counts.rooms_count;
    pois += counts.pois_count;
    const hasContent = counts.rooms_count + counts.pois_count + counts.nodes_count > 0
      || floor?.published_at
      || Number(floor?.version) > 0;
    if (hasContent) floorsWithMap += 1;
    if (floor?.published_at) {
      const t = new Date(floor.published_at);
      if (!Number.isNaN(t.getTime()) && (!lastPublishedAt || t > lastPublishedAt)) {
        lastPublishedAt = t;
      }
    }
  }
  return {
    floors_with_map: floorsWithMap,
    rooms_count: rooms,
    pois_count: pois,
    last_published_at: lastPublishedAt
  };
}

async function getBuildingExplorer(input) {
  const buildingId = String(input.params?.id || '').trim();
  if (!buildingId) throw httpError(400, 'Thiếu building id.');

  const building = await Building.findById(buildingId)
    .select('name address description status workspace_status total_floors place_id created_by owner_user_id organization_id is_active updatedAt createdAt gps_location')
    .lean();
  if (!building || building.is_active === false) {
    throw httpError(404, 'Không tìm thấy tòa nhà.');
  }
  const published = building.status === 'PUBLISHED'
    || String(building.workspace_status || '').toUpperCase() === 'PUBLISHED';
  if (!published) {
    throw httpError(404, 'Tòa nhà chưa xuất bản công khai.', 'BUILDING_NOT_PUBLIC');
  }

  const floors = await Floor.find({ building_id: building._id })
    .select('floor_number floor_name version published_at map_data.rooms map_data.pois map_data.nodes')
    .lean();
  const stats = aggregateFloorStats(floors);

  let place = null;
  let ratingAvg = null;
  let ratingCount = 0;
  if (building.place_id) {
    place = await Place.findById(building.place_id)
      .select('name slug category address description verified verification_status')
      .lean();
    const reviewAgg = await PlaceReview.aggregate([
      { $match: { place_id: building.place_id, is_active: { $ne: false } } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    if (reviewAgg[0]) {
      ratingAvg = Math.round(reviewAgg[0].avg * 10) / 10;
      ratingCount = reviewAgg[0].count;
    }
  }

  const creatorId = building.owner_user_id || building.created_by;
  let creator = null;
  if (creatorId) {
    const user = await User.findById(creatorId).select('full_name email').lean();
    if (user) {
      creator = {
        id: String(user._id),
        full_name: user.full_name || user.email || 'Creator'
      };
    }
  }

  const updatedAt = stats.last_published_at || building.updatedAt || building.createdAt || null;

  return {
    status: 200,
    body: {
      building_id: String(building._id),
      name: building.name,
      address: building.address || place?.address || '',
      description: building.description || place?.description || '',
      category: place?.category || null,
      place_id: building.place_id ? String(building.place_id) : null,
      place_slug: place?.slug || null,
      place_name: place?.name || null,
      verified: Boolean(place?.verified),
      gps_location: building.gps_location || null,
      total_floors: Number(building.total_floors) || 1,
      floors_with_map: stats.floors_with_map,
      rooms_count: stats.rooms_count,
      pois_count: stats.pois_count,
      rating_avg: ratingAvg,
      rating_count: ratingCount,
      creator,
      updated_at: updatedAt ? new Date(updatedAt).toISOString() : null,
      has_published_indoor: stats.floors_with_map > 0 || stats.pois_count > 0 || stats.rooms_count > 0
    }
  };
}

module.exports = {
  getBuildingExplorer,
  aggregateFloorStats
};
