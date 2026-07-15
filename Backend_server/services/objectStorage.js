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
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

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
  const base =
    (process.env.STORAGE_PUBLIC_BASE_URL || '').replace(/\/$/, '') ||
    (req
      ? `${req.protocol}://${req.get('host')}`
      : '');
  const rel = key.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!base) return `/uploads/${rel}`;
  return `${base}/uploads/${rel}`;
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
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
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error('File trống.');
    err.code = 'STORAGE_EMPTY';
    err.status = 400;
    throw err;
  }
  if (buffer.length > getMaxBytes()) {
    const err = new Error(`File vượt giới hạn ${getMaxBytes()} bytes.`);
    err.code = 'STORAGE_TOO_LARGE';
    err.status = 413;
    throw err;
  }
  if (!isAllowedMime(mime)) {
    const err = new Error('Chỉ chấp nhận PNG/JPEG/WebP/GIF.');
    err.code = 'STORAGE_MIME';
    err.status = 400;
    throw err;
  }

  const backend = getBackend();
  if (backend === 's3' || backend === 'minio') {
    const err = new Error(
      'STORAGE_BACKEND=s3/minio chưa cấu hình credentials. Dùng local hoặc set env S3 sau.'
    );
    err.code = 'STORAGE_S3_NOT_CONFIGURED';
    err.status = 501;
    throw err;
  }

  const ext = EXT_BY_MIME[String(mime).toLowerCase()] || path.extname(originalName) || '.bin';
  const id = crypto.randomBytes(8).toString('hex');
  const key = path
    .join('map-backgrounds', String(buildingId), `floor-${floorNumber}-${id}${ext}`)
    .replace(/\\/g, '/');

  const abs = path.join(getLocalRoot(), key);
  await ensureDir(path.dirname(abs));
  await fsp.writeFile(abs, buffer);

  return {
    key,
    url: publicUrlForKey(key, req),
    bytes: buffer.length,
    mime: String(mime).toLowerCase(),
    backend: 'local'
  };
}

async function deleteByKey(key) {
  if (!key || key.includes('..')) return false;
  const abs = path.join(getLocalRoot(), key);
  try {
    await fsp.unlink(abs);
    return true;
  } catch {
    return false;
  }
}

function fileExists(key) {
  if (!key || key.includes('..')) return false;
  return fs.existsSync(path.join(getLocalRoot(), key));
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
