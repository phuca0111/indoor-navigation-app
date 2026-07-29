/**
 * Phase 3 — Emergency Resources (POI catalog + tag emergency_resource).
 */
const Floor = require('../../models/Floor');
const { normalizePoiCategoryKey } = require('../../utils/poiCatalog');
const { poiToSafeKind } = require('../../utils/navigationGraph');
const { httpError } = require('../../utils/navigationGraph');

const EMERGENCY_POI_TYPES = Object.freeze(['EXIT', 'ASSEMBLY_POINT', 'FIRE_EXTINGUISHER', 'MEDICAL', 'SECURITY', 'SAFETY']);
const EMERGENCY_TAG = 'emergency_resource';

function isEmergencyResource(poi) {
  const tags = Array.isArray(poi.search_tags)
    ? poi.search_tags
    : Array.isArray(poi.tags)
      ? poi.tags
      : [];
  if (tags.map((t) => String(t).toLowerCase()).includes(EMERGENCY_TAG)) return true;
  const key = normalizePoiCategoryKey(poi.poi_type || poi.poiType || poi.type);
  return EMERGENCY_POI_TYPES.includes(key);
}

function serializeResource(poi, floorNumber) {
  const poiType = normalizePoiCategoryKey(poi.poi_type || poi.poiType || poi.type);
  return {
    id: poi.id ?? poi._id ?? null,
    name: poi.name || '',
    poi_type: poiType,
    safe_kind: poiToSafeKind(poi),
    x: Number(poi.x) || 0,
    y: Number(poi.y) || 0,
    floor_number: floorNumber,
    tags: Array.isArray(poi.search_tags) ? poi.search_tags : poi.tags || [],
    emergency_resource: true
  };
}

async function loadPublishedFloors(buildingId, floorNumber) {
  const filter = { building_id: buildingId, published_at: { $ne: null } };
  if (floorNumber != null && Number.isFinite(Number(floorNumber))) {
    filter.floor_number = Number(floorNumber);
  }
  return Floor.find(filter).select('floor_number map_data published_at').lean();
}

async function listSafeResources(input = {}) {
  const buildingId = String(input.params?.buildingId || '').trim();
  if (!buildingId) throw httpError(400, 'Thiếu building id.', 'BUILDING_REQUIRED');

  const floorNumber = input.query?.floor != null ? Number(input.query.floor) : null;
  const kindFilter = String(input.query?.kinds || '').trim().toUpperCase();
  const kindsWanted = kindFilter
    ? new Set(kindFilter.split(',').map((s) => s.trim()).filter(Boolean))
    : null;

  const floors = await loadPublishedFloors(buildingId, floorNumber);
  const resources = [];

  for (const floor of floors) {
    const pois = floor.map_data?.pois || [];
    for (const poi of pois) {
      if (!isEmergencyResource(poi)) continue;
      const serialized = serializeResource(poi, floor.floor_number);
      if (kindsWanted && serialized.safe_kind && !kindsWanted.has(serialized.safe_kind)) continue;
      if (kindsWanted && !serialized.safe_kind && !kindsWanted.has(serialized.poi_type)) continue;
      resources.push(serialized);
    }
  }

  return {
    status: 200,
    body: {
      building_id: buildingId,
      floor_number: floorNumber,
      resources,
      count: resources.length
    }
  };
}

module.exports = {
  EMERGENCY_TAG,
  EMERGENCY_POI_TYPES,
  isEmergencyResource,
  serializeResource,
  listSafeResources
};
