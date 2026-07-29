/**
 * P2.2 — Thống kê Quản trị bản đồ (tách khỏi moderation stats).
 * Đếm trạng thái Building / Floor / Draft / MapVersion, không đụng publish core.
 */
const Building = require('../../models/Building');
const Floor = require('../../models/Floor');
const Draft = require('../../models/Draft');
const MapVersion = require('../../models/MapVersion');

const VISIBILITIES = ['PRIVATE', 'UNLISTED', 'COMMUNITY', 'OFFICIAL'];

/** Gom số liệu thô thành payload API (unit-testable). */
function buildMapManagementStats(raw = {}) {
  const visibility = VISIBILITIES.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
  (Array.isArray(raw.visibilityRows) ? raw.visibilityRows : []).forEach((row) => {
    const key = String(row?._id || 'PRIVATE').toUpperCase();
    if (visibility[key] != null) visibility[key] += Number(row.count) || 0;
    else visibility.PRIVATE += Number(row.count) || 0;
  });

  const num = (value) => Number(value) || 0;

  return {
    buildings: {
      total: num(raw.buildingsTotal),
      published: num(raw.buildingsPublished),
      draft: num(raw.buildingsTotal) - num(raw.buildingsPublished),
      inactive: num(raw.buildingsInactive),
      without_place: num(raw.buildingsWithoutPlace)
    },
    visibility,
    floors: {
      total: num(raw.floorsTotal),
      published: num(raw.floorsPublished),
      unpublished: num(raw.floorsTotal) - num(raw.floorsPublished),
      with_draft: num(raw.draftsOpen)
    },
    versions: {
      total: num(raw.versionsTotal)
    },
    generated_at: new Date().toISOString()
  };
}

/** GET /api/map-management/stats */
async function getMapManagementStats() {
  const [
    buildingsTotal,
    buildingsPublished,
    buildingsInactive,
    buildingsWithoutPlace,
    visibilityRows,
    floorsTotal,
    floorsPublished,
    draftsOpen,
    versionsTotal
  ] = await Promise.all([
    Building.countDocuments({}),
    Building.countDocuments({ status: 'PUBLISHED' }),
    Building.countDocuments({ is_active: false }),
    Building.countDocuments({ place_id: null }),
    Building.aggregate([{ $group: { _id: '$visibility', count: { $sum: 1 } } }]),
    Floor.countDocuments({}),
    Floor.countDocuments({ published_at: { $ne: null } }),
    Draft.countDocuments({ deleted_at: null }),
    MapVersion.countDocuments({})
  ]);

  return {
    status: 200,
    body: buildMapManagementStats({
      buildingsTotal,
      buildingsPublished,
      buildingsInactive,
      buildingsWithoutPlace,
      visibilityRows,
      floorsTotal,
      floorsPublished,
      draftsOpen,
      versionsTotal
    })
  };
}

module.exports = { getMapManagementStats, buildMapManagementStats };
