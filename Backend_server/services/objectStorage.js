// ============================================
// FILE: objectStorage.js
// Phase 2d — Object Storage (local filesystem → dễ chuyển S3/MinIO)
// Env:
//   STORAGE_BACKEND=local (default) | s3 (stub báo lỗi nếu chưa cấu hình)
//   STORAGE_LOCAL_ROOT=uploads (relative Backend_server)
//   STORAGE_PUBLIC_BASE_URL=http://localhost:5000  (optional; fallback từ request)
//   STORAGE_MAX_BYTES=5242880 (5MB)
// ============================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  createStorageAdapter,
  validateBuffer,
  assertSafeKey
} = require('./storagePlatform');

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif'
]);

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

function getBackend() {
  return (process.env.STORAGE_BACKEND || 'local').trim().toLowerCase();
}

function getMaxBytes() {
  const n = Number(process.env.STORAGE_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? n : 5 * 1024 * 1024;
}

function getLocalRoot() {
  const root = process.env.STORAGE_LOCAL_ROOT || 'uploads';
  return path.isAbsolute(root) ? root : path.join(__dirname, '..', root);
}

function isAllowedMime(mime) {
  return ALLOWED_MIME.has(String(mime || '').toLowerCase());
}

function isBase64DataUrl(value) {
  if (typeof value !== 'string') return false;
  return /^data:image\/[a-z0-9+.-]+;base64,/i.test(value.trim());
}

function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return /^https?:\/\//i.test(v) || v.startsWith('/uploads/');
}

/**
 * Reject large base64 backgrounds in map_data (Phase 2d DoD).
 * Empty string / missing / http(s) / /uploads/... = OK.
 */
function assertNoBase64Background(map_data) {
  const bg = map_data?.background_image;
  if (bg == null || bg === '') {
    return { ok: true };
  }
  if (isBase64DataUrl(bg)) {
    return {
      ok: false,
      code: 'BG_BASE64_FORBIDDEN',
      message:
        'Không lưu ảnh nền Base64 trong map. Upload qua Storage API rồi gắn URL.',
      path: 'background_image'
    };
  }
  if (typeof bg === 'string' && bg.length > 2048 && !isHttpUrl(bg)) {
    return {
      ok: false,
      code: 'BG_TOO_LARGE',
      message: 'background_image quá dài — dùng URL Storage.',
      path: 'background_image'
    };
  }
  return { ok: true };
}

function publicUrlForKey(key, req) {
  return createStorageAdapter('local', { root: getLocalRoot() }).publicUrl(key, req);
}

/**
 * Lưu buffer ảnh nền map.
 * @returns {{ key, url, bytes, mime, backend }}
 */
async function putMapBackground({
  buildingId,
  floorNumber,
  buffer,
  mime,
  originalName = '',
  req = null
}) {
  const verified = validateBuffer(buffer, mime, {
    maxBytes: getMaxBytes(),
    allowedMime: Array.from(ALLOWED_MIME).map((value) => value.replace('image/jpg', 'image/jpeg'))
  });
  mime = verified.mime;

  const backend = getBackend();
  const ext = EXT_BY_MIME[String(mime).toLowerCase()] || path.extname(originalName) || '.bin';
  const id = crypto.randomBytes(8).toString('hex');
  const key = path
    .join('map-backgrounds', String(buildingId), `floor-${floorNumber}-${id}${ext}`)
    .replace(/\\/g, '/');

  const adapter = createStorageAdapter(backend, backend === 'local'
    ? { root: getLocalRoot() }
    : {});
  const result = await adapter.put({
    key,
    buffer,
    mime,
    checksum: verified.checksum
  });
  return {
    ...result,
    url: adapter.publicUrl(key, req),
    bytes: buffer.length,
    mime,
    checksum: verified.checksum,
    backend
  };
}

async function deleteByKey(key) {
  try {
    key = assertSafeKey(key);
  } catch {
    return false;
  }
  const backend = getBackend();
  return createStorageAdapter(
    backend,
    backend === 'local' ? { root: getLocalRoot() } : {}
  ).delete({ key });
}

function fileExists(key) {
  try {
    key = assertSafeKey(key);
  } catch {
    return false;
  }
  return getBackend() === 'local' && fs.existsSync(path.join(getLocalRoot(), key));
}

module.exports = {
  getBackend,
  getMaxBytes,
  getLocalRoot,
  isAllowedMime,
  isBase64DataUrl,
  isHttpUrl,
  assertNoBase64Background,
  publicUrlForKey,
  putMapBackground,
  deleteByKey,
  fileExists,
  ALLOWED_MIME
};
