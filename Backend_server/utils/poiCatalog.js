// ============================================================
// POI CATALOG — nguồn sự thật duy nhất cho loại POI (GĐ1 POI Platform)
// Dùng chung: publish contract (mapContract), search (searchProvider),
// API GET /api/poi-categories (Editor / Android / Building Explorer).
// Key phải khớp `poiTypes[].key` trong WebMapEditor/js/pois.js
// và mapping PoiCategory.fromTypeString phía Android.
// ============================================================

/** Bỏ dấu + lowercase để so khớp "Thang máy"/"thang may" ổn định. */
function stripDiacritics(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

const POI_CATEGORIES = Object.freeze([
  { key: 'TOILET', label_vi: 'Nhà vệ sinh', label_en: 'Restroom', icon: '🚻', color: '#3498db', keywords: ['wc', 'toilet', 'restroom', 'nha ve sinh', 've sinh'] },
  { key: 'ELEVATOR', label_vi: 'Thang máy', label_en: 'Elevator', icon: '🛗', color: '#9b59b6', keywords: ['thang may', 'elevator', 'lift'] },
  { key: 'ESCALATOR', label_vi: 'Thang cuốn', label_en: 'Escalator', icon: '↗️', color: '#9b59b6', keywords: ['thang cuon', 'escalator'] },
  { key: 'STAIRS', label_vi: 'Cầu thang', label_en: 'Stairs', icon: '🪜', color: '#9b59b6', keywords: ['cau thang', 'thang bo', 'stairs'] },
  { key: 'ATM', label_vi: 'Máy ATM', label_en: 'ATM', icon: '🏧', color: '#27ae60', keywords: ['atm', 'rut tien', 'may atm', 'cay atm'] },
  { key: 'RECEPTION', label_vi: 'Quầy lễ tân', label_en: 'Reception', icon: '💁', color: '#e67e22', keywords: ['le tan', 'quay le tan', 'reception'] },
  // EXIT metadata (Web/Android): exit_role = final|internal, is_final_exit — cửa ra ngoài cuối khi sơ tán
  { key: 'EXIT', label_vi: 'Lối ra', label_en: 'Exit', icon: '🚪', color: '#e74c3c', keywords: ['loi ra', 'cua ra', 'loi thoat', 'thoat hiem', 'exit'] },
  { key: 'ASSEMBLY_POINT', label_vi: 'Điểm tập trung', label_en: 'Assembly point', icon: '🏃', color: '#16a34a', keywords: ['diem tap trung', 'tap trung', 'assembly', 'assembly point', 'evacuation'] },
  { key: 'FOOD', label_vi: 'Nhà hàng', label_en: 'Food', icon: '🍽️', color: '#f97316', keywords: ['nha hang', 'do an', 'an uong', 'food', 'restaurant', 'food court'] },
  { key: 'CAFE', label_vi: 'Quán cà phê', label_en: 'Cafe', icon: '☕', color: '#92400e', keywords: ['ca phe', 'cafe', 'coffee', 'tra sua'] },
  { key: 'PARKING', label_vi: 'Bãi đỗ xe', label_en: 'Parking', icon: '🅿️', color: '#2563eb', keywords: ['bai do xe', 'gui xe', 'do xe', 'parking'] },
  { key: 'MEDICAL', label_vi: 'Phòng y tế', label_en: 'Medical', icon: '➕', color: '#dc2626', keywords: ['y te', 'phong y te', 'so cuu', 'medical', 'first aid'] },
  { key: 'PHARMACY', label_vi: 'Nhà thuốc', label_en: 'Pharmacy', icon: '💊', color: '#dc2626', keywords: ['nha thuoc', 'thuoc', 'pharmacy'] },
  { key: 'SECURITY', label_vi: 'Phòng bảo vệ', label_en: 'Security', icon: '🛡️', color: '#475569', keywords: ['bao ve', 'an ninh', 'security'] },
  { key: 'INFO', label_vi: 'Quầy thông tin', label_en: 'Information', icon: 'ℹ️', color: '#0ea5e9', keywords: ['thong tin', 'huong dan', 'info', 'information'] },
  { key: 'WAITING', label_vi: 'Khu vực chờ', label_en: 'Waiting area', icon: '🪑', color: '#14b8a6', keywords: ['khu vuc cho', 'ghe cho', 'waiting'] },
  { key: 'VENDING', label_vi: 'Máy bán hàng', label_en: 'Vending machine', icon: '🥤', color: '#8b5cf6', keywords: ['may ban hang', 'ban hang tu dong', 'vending'] },
  { key: 'FIRE_EXTINGUISHER', label_vi: 'Bình chữa cháy', label_en: 'Fire extinguisher', icon: '🧯', color: '#ef4444', keywords: ['binh chua chay', 'chua chay', 'pccc', 'fire extinguisher'] },
  { key: 'OTHER', label_vi: 'Khác', label_en: 'Other', icon: '📍', color: '#95a5a6', keywords: [] }
]);

const CATEGORY_BY_KEY = new Map(POI_CATEGORIES.map((c) => [c.key, c]));

/** Alias legacy → key chuẩn (poi_type cũ / label editor cũ). */
const ALIAS_TO_KEY = new Map([
  ['diem moc', 'INFO'],
  ['lift', 'ELEVATOR'],
  ['restroom', 'TOILET'],
  ['wc', 'TOILET'],
  ['do an', 'FOOD']
]);

// Index label + keyword (không dấu) → key để normalize input tự do từ editor cũ.
for (const cat of POI_CATEGORIES) {
  ALIAS_TO_KEY.set(stripDiacritics(cat.label_vi), cat.key);
  ALIAS_TO_KEY.set(stripDiacritics(cat.label_en), cat.key);
  for (const kw of cat.keywords) {
    if (!ALIAS_TO_KEY.has(kw)) ALIAS_TO_KEY.set(kw, cat.key);
  }
}

/**
 * Chuẩn hóa mọi input (key, poi_type cũ, label tiếng Việt có/không dấu)
 * về key catalog. Không khớp → null (caller tự fallback OTHER).
 */
function normalizePoiCategoryKey(raw) {
  if (raw == null || raw === '') return null;
  const upper = String(raw).trim().toUpperCase();
  if (CATEGORY_BY_KEY.has(upper)) return upper;
  return ALIAS_TO_KEY.get(stripDiacritics(raw)) || null;
}

function getPoiCategory(key) {
  return CATEGORY_BY_KEY.get(String(key || '').toUpperCase()) || null;
}

/** Chuỗi phục vụ search: label VI/EN + keywords của category. */
function poiCategorySearchText(key) {
  const cat = getPoiCategory(key);
  if (!cat) return '';
  return [cat.label_vi, cat.label_en, ...cat.keywords].join(' ');
}

module.exports = {
  POI_CATEGORIES,
  POI_CATEGORY_KEYS: POI_CATEGORIES.map((c) => c.key),
  stripDiacritics,
  normalizePoiCategoryKey,
  getPoiCategory,
  poiCategorySearchText
};
