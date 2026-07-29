const { normalizePoiCategoryKey } = require('../utils/poiCatalog');

const CURRENT_SCHEMA_VERSION = 1;

/** @deprecated dùng normalizePoiCategoryKey (poiCatalog). Giữ export cho tương thích. */
const POI_TYPE_MAP = Object.freeze({
  'Điểm mốc': 'INFO',
  'Nhà vệ sinh': 'TOILET',
  'Lối thoát': 'EXIT',
  'Thang máy': 'ELEVATOR',
  'Cầu thang': 'STAIRS',
  'Nhà thuốc': 'PHARMACY',
  ATM: 'ATM',
  'Đồ ăn': 'FOOD'
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** Tags tìm kiếm POI: mảng chuỗi ngắn, bỏ rỗng/trùng (nguồn: search_tags hoặc tags từ editor). */
function normalizeSearchTags(poi) {
  const raw = Array.isArray(poi.search_tags) ? poi.search_tags
    : Array.isArray(poi.tags) ? poi.tags : [];
  const tags = [...new Set(
    raw.map((t) => String(t || '').trim().slice(0, 60)).filter(Boolean)
  )];
  return tags.slice(0, 20);
}

/** Chuẩn hóa additive: không xóa field lạ để editor có thể round-trip qua API. */
function normalizeMapData(input) {
  const map = clone(input) || {};
  if (map.schema_version == null) map.schema_version = CURRENT_SCHEMA_VERSION;
  for (const key of ['rooms', 'doors', 'pois', 'nodes', 'edges', 'walls', 'qr_anchors']) {
    if (!Array.isArray(map[key])) map[key] = [];
  }
  map.pois = map.pois.map((poi) => {
    const out = { ...poi };
    // Ưu tiên label/tên cụ thể trước typeIndex: map cũ hay lệch index
    // (INFO/RECEPTION) dù name = "Nhà vệ sinh".
    const fromKey = normalizePoiCategoryKey(out.poiType) || normalizePoiCategoryKey(out.poi_type);
    const fromType = normalizePoiCategoryKey(out.type);
    const fromName = normalizePoiCategoryKey(out.name);
    const labeled = [fromKey, fromType, fromName].filter(Boolean);
    const specificLabeled = labeled.find((key) => key !== 'OTHER' && key !== 'INFO');
    out.poi_type = specificLabeled
      || labeled.find((key) => key !== 'OTHER')
      || 'OTHER';
    out.search_tags = normalizeSearchTags(out);
    return out;
  });
  return map;
}

function buildEditorRoundTripSnapshot(input) {
  const snapshot = normalizeMapData(input);
  delete snapshot.background_image;
  return snapshot;
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  POI_TYPE_MAP,
  normalizeMapData,
  buildEditorRoundTripSnapshot
};
