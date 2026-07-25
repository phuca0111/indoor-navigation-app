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
    // Ưu tiên key khác OTHER: map cũ hay bị đóng dấu poi_type="OTHER" dù
    // tên/label là "Thang máy" → không được dừng sớm ở OTHER.
    // Thứ tự: poiType (editor) → poi_type cũ → label type → tên POI.
    const resolved = [out.poiType, out.poi_type, out.type, out.name]
      .map(normalizePoiCategoryKey)
      .find((key) => key && key !== 'OTHER');
    out.poi_type = resolved || 'OTHER';
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
