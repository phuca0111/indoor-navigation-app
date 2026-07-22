// ============================================
// Map Governance P4 — Community public search
// ============================================

const Building = require('../models/Building');
const Place = require('../models/Place');
const {
  communityPublicMongoFilter,
  isCommunitySearchable
} = require('../utils/mapVisibility');

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * GET /api/community/buildings?q=&lat=&lng=&radius_m=&limit=
 * Public — chỉ COMMUNITY/OFFICIAL + PUBLISHED.
 */
async function searchCommunityBuildings(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const lat = req.query.lat != null ? Number(req.query.lat) : null;
    const lng = req.query.lng != null ? Number(req.query.lng) : null;
    const radius = Number(req.query.radius_m) || 5000;

    const filter = communityPublicMongoFilter();
    if (q) {
      filter.$or = [
        { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { address: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
      ];
    }

    let buildings = await Building.find(filter)
      .select('name address gps_location activation_radius visibility status place_id total_floors description')
      .limit(limit * 3)
      .lean();

    buildings = buildings.filter(isCommunitySearchable);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      buildings = buildings
        .map((b) => ({
          ...b,
          distance_m: haversine(lat, lng, b.gps_location?.lat || 0, b.gps_location?.lng || 0)
        }))
        .filter((b) => b.distance_m <= radius)
        .sort((a, b) => a.distance_m - b.distance_m);
    }

    buildings = buildings.slice(0, limit);

    return res.status(200).json({
      total: buildings.length,
      buildings
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

/**
 * GET /api/community/places?q=&verified=&limit=
 * Public — Place ACTIVE (+ optional verified), kèm building COMMUNITY đếm.
 */
async function searchCommunityPlaces(req, res) {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const verifiedOnly = req.query.verified === '1' || req.query.verified === 'true';

    const filter = { status: 'ACTIVE' };
    if (verifiedOnly) filter.verified = true;
    if (q) {
      filter.$or = [
        { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { aliases: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { address: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
      ];
    }

    const places = await Place.find(filter)
      .select('name aliases latitude longitude address category verified verification_status')
      .limit(limit)
      .lean();

    const ids = places.map((p) => p._id);
    const counts = await Building.aggregate([
      {
        $match: {
          place_id: { $in: ids },
          status: 'PUBLISHED',
          is_active: { $ne: false },
          visibility: { $in: ['COMMUNITY', 'OFFICIAL'] }
        }
      },
      { $group: { _id: '$place_id', n: { $sum: 1 } } }
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));

    return res.status(200).json({
      total: places.length,
      places: places.map((p) => ({
        ...p,
        community_building_count: countMap[String(p._id)] || 0
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

/**
 * GET /api/community/hub — Super Admin: danh sách building cộng đồng + Place chờ xác minh
 */
async function communityHub(req, res) {
  try {
    const buildings = await Building.find(communityPublicMongoFilter())
      .select('name address gps_location visibility status place_id organization_id owner_user_id updatedAt')
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    const verificationQueue = await Place.find({
      status: 'ACTIVE',
      verification_status: 'PENDING'
    })
      .select('name verified verification_status verification_note latitude longitude category updatedAt')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({
      community_buildings: buildings,
      verification_queue: verificationQueue
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

module.exports = {
  searchCommunityBuildings,
  searchCommunityPlaces,
  communityHub
};
