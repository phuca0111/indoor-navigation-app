const CURRENT_SCHEMA_VERSION = 1;

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

/** Chuẩn hóa additive: không xóa field lạ để editor có thể round-trip qua API. */
function normalizeMapData(input) {
  const map = clone(input) || {};
  if (map.schema_version == null) map.schema_version = CURRENT_SCHEMA_VERSION;
  for (const key of ['rooms', 'doors', 'pois', 'nodes', 'edges', 'walls', 'qr_anchors']) {
    if (!Array.isArray(map[key])) map[key] = [];
  }
  map.pois = map.pois.map((poi) => {
    const out = { ...poi };
    if (!out.poi_type) out.poi_type = POI_TYPE_MAP[out.type] || 'OTHER';
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
