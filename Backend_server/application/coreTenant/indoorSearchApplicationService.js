/**
 * GĐ4 Indoor Search — tìm POI trong nhà từ ngữ cảnh ngoài trời.
 * Ví dụ: "ATM" → danh sách { building, floor, poi } đã PUBLISHED.
 */
const Building = require('../../models/Building');
const Floor = require('../../models/Floor');
const {
  POI_CATEGORIES,
  stripDiacritics,
  normalizePoiCategoryKey,
  poiCategorySearchText,
  getPoiCategory
} = require('../../utils/poiCatalog');

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

function safeRegex(value) {
  return new RegExp(String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/** Category keys có keyword/label chứa query (không dấu). */
function categoryKeysMatchingQuery(query) {
  const q = stripDiacritics(query);
  if (!q || q.length < 2) return [];
  return POI_CATEGORIES
    .filter((cat) => cat.key !== 'OTHER'
      && stripDiacritics(poiCategorySearchText(cat.key)).includes(q))
    .map((cat) => cat.key);
}

/**
 * Chấm điểm hit POI (unit-testable): cao hơn = xếp trước.
 * 0 = không khớp.
 */
function scoreIndoorPoiHit(query, poi) {
  const q = stripDiacritics(query);
  if (!q) return 0;
  const name = stripDiacritics(poi.name || '');
  const desc = stripDiacritics(poi.description || '');
  const tags = (Array.isArray(poi.search_tags) ? poi.search_tags : [])
    .map((t) => stripDiacritics(t)).join(' ');
  const typeKey = normalizePoiCategoryKey(poi.poi_type || poi.poiType || poi.type) || '';
  const typeText = stripDiacritics(poiCategorySearchText(typeKey) || typeKey);

  if (name === q) return 1000;
  if (name.startsWith(q)) return 800 + Math.min(q.length, 40);
  if (name.includes(q)) return 600 + Math.min(q.length, 40);
  if (tags.includes(q) || tags.split(' ').some((t) => t.startsWith(q))) return 500;
  if (desc.includes(q)) return 400;
  if (typeKey && (typeKey.toLowerCase() === q || typeText.includes(q))) return 350;
  return 0;
}

async function searchIndoorPois(input) {
  const query = String(input.query?.q || input.query?.query || '').trim().slice(0, 80);
  if (query.length < 2) {
    throw httpError(400, 'Từ khóa tìm kiếm phải có ít nhất 2 ký tự.', 'QUERY_TOO_SHORT');
  }
  const limit = Math.min(Math.max(parseInt(input.query?.limit, 10) || 30, 1), 50);
  const categoryFilter = normalizePoiCategoryKey(input.query?.category || '') || null;
  const regex = safeRegex(query);
  const catKeys = categoryKeysMatchingQuery(query);

  const buildings = await Building.find({
    is_active: { $ne: false },
    $or: [{ status: 'PUBLISHED' }, { workspace_status: 'PUBLISHED' }]
  })
    .select('name address place_id total_floors gps_location')
    .lean();
  if (!buildings.length) {
    return { status: 200, body: { query, total: 0, results: [] } };
  }

  const buildingIds = buildings.map((b) => b._id);
  const buildingById = new Map(buildings.map((b) => [String(b._id), b]));

  const floorOr = [
    { 'map_data.pois.name': regex },
    { 'map_data.pois.description': regex },
    { 'map_data.pois.search_tags': regex }
  ];
  if (catKeys.length) {
    floorOr.push({ 'map_data.pois.poi_type': { $in: catKeys } });
  }
  if (categoryFilter) {
    floorOr.push({ 'map_data.pois.poi_type': categoryFilter });
  }

  const floors = await Floor.find({
    building_id: { $in: buildingIds },
    $or: floorOr
  })
    .select('building_id floor_number floor_name published_at version map_data.pois')
    .limit(80)
    .lean();

  const queryNorm = stripDiacritics(query);
  const hits = [];
  for (const floor of floors) {
    // Chỉ lấy tầng đã publish (có published_at hoặc version > 0)
    if (!floor.published_at && !(Number(floor.version) > 0)) continue;
    const building = buildingById.get(String(floor.building_id));
    if (!building) continue;

    for (const poi of floor.map_data?.pois || []) {
      const typeKey = normalizePoiCategoryKey(poi.poi_type || poi.poiType || poi.type) || 'OTHER';
      if (categoryFilter && typeKey !== categoryFilter) continue;
      let score = scoreIndoorPoiHit(query, { ...poi, poi_type: typeKey });
      if (score === 0 && catKeys.includes(typeKey)) score = 300;
      if (score === 0) {
        const hay = `${poi.name || ''} ${poi.description || ''} ${(poi.search_tags || []).join(' ')}`;
        if (!regex.test(hay) && !stripDiacritics(hay).includes(queryNorm)) continue;
        score = 200;
      }
      const cat = getPoiCategory(typeKey);
      hits.push({
        score,
        building_id: String(building._id),
        building_name: building.name,
        place_id: building.place_id ? String(building.place_id) : null,
        address: building.address || '',
        total_floors: Number(building.total_floors) || 1,
        gps_location: building.gps_location || null,
        floor_number: floor.floor_number,
        floor_name: floor.floor_name || `Tầng ${floor.floor_number}`,
        poi_id: poi.id,
        poi_name: poi.name || 'POI',
        poi_type: typeKey,
        poi_type_label: cat?.label_vi || typeKey,
        description: poi.description || '',
        search_tags: Array.isArray(poi.search_tags) ? poi.search_tags : []
      });
    }
  }

  hits.sort((a, b) => b.score - a.score
    || String(a.building_name).localeCompare(String(b.building_name))
    || (a.floor_number - b.floor_number));

  const results = hits.slice(0, limit).map(({ score, ...rest }) => rest);
  return {
    status: 200,
    body: { query, total: results.length, results }
  };
}

module.exports = {
  searchIndoorPois,
  scoreIndoorPoiHit,
  categoryKeysMatchingQuery
};
