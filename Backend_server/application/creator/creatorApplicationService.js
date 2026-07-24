/**
 * Creator Platform — funnel + usage thật từ Place views / Hub favorites / reviews.
 */
const mongoose = require('mongoose');
const Building = require('../../models/Building');
const Place = require('../../models/Place');
const UserFavorite = require('../../models/UserFavorite');
const PlaceReview = require('../../models/PlaceReview');
const PlaceFollow = require('../../models/PlaceFollow');
const IndoorWorkspace = require('../../models/IndoorWorkspace');
const UserHistory = require('../../models/UserHistory');

async function getCreatorStats(userId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    const err = new Error('userId không hợp lệ.');
    err.status = 400;
    throw err;
  }

  const buildings = await Building.find({
    created_by: userId,
    is_active: { $ne: false }
  })
    .select('_id place_id name status workspace_status')
    .lean()
    .catch(() => []);

  let workspaces = [];
  try {
    workspaces = await IndoorWorkspace.find({
      $or: [{ owner_user_id: userId }, { created_by: userId }]
    })
      .select('_id building_id place_id name workspace_status')
      .lean();
  } catch (_) {
    workspaces = [];
  }

  const placeIds = [
    ...new Set(
      [...buildings, ...workspaces]
        .map((b) => b.place_id)
        .filter(Boolean)
        .map(String)
    )
  ];

  const oidPlaces = placeIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const [favCount, reviewAgg, followCount, placeViews, historyUsage] = await Promise.all([
    oidPlaces.length
      ? UserFavorite.countDocuments({ place_id: { $in: oidPlaces } })
      : 0,
    oidPlaces.length
      ? PlaceReview.aggregate([
        { $match: { place_id: { $in: oidPlaces }, is_active: { $ne: false } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avg: { $avg: '$rating' }
          }
        }
      ])
      : [],
    oidPlaces.length
      ? PlaceFollow.countDocuments({ place_id: { $in: oidPlaces } })
      : 0,
    oidPlaces.length
      ? Place.aggregate([
        { $match: { _id: { $in: oidPlaces } } },
        { $group: { _id: null, views: { $sum: { $ifNull: ['$view_count', 0] } } } }
      ])
      : [],
    oidPlaces.length
      ? UserHistory.countDocuments({
        place_id: { $in: oidPlaces },
        type: { $in: ['VIEW_PLACE', 'VIEW_INDOOR', 'OPEN_WORKSPACE', 'FAVORITE_PLACE'] }
      }).catch(() => 0)
      : 0
  ]);

  const published = buildings.filter(
    (b) => b.workspace_status === 'PUBLISHED' || b.status === 'PUBLISHED'
  ).length;

  const views = placeViews[0]?.views || 0;

  return {
    funnel: {
      workspaces: workspaces.length || buildings.length,
      indoor_buildings: buildings.length,
      published,
      places_linked: placeIds.length
    },
    stats: {
      views,
      downloads: null,
      usage: historyUsage,
      followers: followCount,
      favorites: favCount,
      rating_count: reviewAgg[0]?.count || 0,
      rating_avg: reviewAgg[0]?.avg != null
        ? Math.round(reviewAgg[0].avg * 10) / 10
        : null
    },
    placeholders: {
      downloads: 'Chưa có export asset download counter.'
    },
    note: 'Creator stats: views = Place.view_count; usage = Hub history VIEW_PLACE/VIEW_INDOOR/OPEN_WORKSPACE/FAVORITE trên Place của bạn.'
  };
}

module.exports = { getCreatorStats };
