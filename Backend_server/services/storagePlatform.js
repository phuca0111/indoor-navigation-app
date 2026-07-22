const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const MIME_SIGNATURES = [
  { mime: 'image/png', test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) },
  { mime: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', test: (b) => b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii')) },
  { mime: 'image/webp', test: (b) => b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'application/pdf', test: (b) => b.length >= 5 && b.subarray(0, 5).toString('ascii') === '%PDF-' },
  { mime: 'video/mp4', test: (b) => b.length >= 12 && b.subarray(4, 8).toString('ascii') === 'ftyp' }
];

const EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4'
};

function storageError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function detectMime(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  return MIME_SIGNATURES.find((signature) => signature.test(buffer))?.mime || null;
}

function validateBuffer(buffer, claimedMime, options = {}) {
  const maxBytes = Number(options.maxBytes) || Number(process.env.STORAGE_MAX_BYTES) || 5 * 1024 * 1024;
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw storageError('File trống.', 'STORAGE_EMPTY');
  if (buffer.length > maxBytes) throw storageError(`File vượt giới hạn ${maxBytes} bytes.`, 'STORAGE_TOO_LARGE', 413);
  const mime = detectMime(buffer);
  if (!mime) throw storageError('Không nhận diện được định dạng file từ nội dung.', 'STORAGE_MAGIC_BYTES');
  const normalizedClaim = String(claimedMime || '').toLowerCase().replace('image/jpg', 'image/jpeg');
  if (normalizedClaim && normalizedClaim !== mime) {
    throw storageError('MIME khai báo không khớp nội dung file.', 'STORAGE_MIME_SPOOF');
  }
  const allowed = options.allowedMime || MIME_SIGNATURES.map((item) => item.mime);
  if (!allowed.includes(mime)) throw storageError('Định dạng file không được phép.', 'STORAGE_MIME');
  return {
    mime,
    size: buffer.length,
    checksum: crypto.createHash('sha256').update(buffer).digest('hex')
  };
}

function safeSegment(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'asset';
}

function assertSafeKey(key, allowedPrefix = '') {
  const normalized = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.length > 512 || normalized.includes('..') || normalized.includes('//')) {
    throw storageError('Object key không an toàn.', 'STORAGE_KEY');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(normalized)) {
    throw storageError('Object key chứa ký tự không hợp lệ.', 'STORAGE_KEY');
  }
  if (allowedPrefix && !normalized.startsWith(`${allowedPrefix.replace(/\/+$/, '')}/`)) {
    throw storageError('Object key nằm ngoài phạm vi cho phép.', 'STORAGE_KEY_FORBIDDEN', 403);
  }
  return normalized;
}

function buildObjectKey({ namespace = 'assets', owner = 'platform', name = 'asset', mime }) {
  const prefix = `${safeSegment(namespace)}/${safeSegment(owner)}`;
  return `${prefix}/${Date.now()}-${crypto.randomBytes(12).toString('hex')}-${safeSegment(path.parse(name).name)}${EXTENSIONS[mime] || '.bin'}`;
}

function localRoot() {
  const configured = process.env.STORAGE_LOCAL_ROOT || 'uploads';
  return path.isAbsolute(configured) ? configured : path.join(__dirname, '..', configured);
}

class LocalStorageAdapter {
  constructor(options = {}) {
    this.backend = 'local';
    this.root = options.root || localRoot();
  }

  async put({ key, buffer }) {
    const safeKey = assertSafeKey(key);
    const absolute = path.resolve(this.root, safeKey);
    if (!absolute.startsWith(path.resolve(this.root) + path.sep)) throw storageError('Object key không an toàn.', 'STORAGE_KEY');
    await fsp.mkdir(path.dirname(absolute), { recursive: true });
    await fsp.writeFile(absolute, buffer, { flag: 'wx' });
    return { key: safeKey, bucket: '', etag: '' };
  }

  async head({ key }) {
    try {
      const stat = await fsp.stat(path.resolve(this.root, assertSafeKey(key)));
      return { exists: stat.isFile(), size: stat.size, metadata: {} };
    } catch (error) {
      if (error.code === 'ENOENT') return { exists: false };
      throw error;
    }
  }

  async delete({ key }) {
    try {
      await fsp.unlink(path.resolve(this.root, assertSafeKey(key)));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async readPrefix({ key, bytes = 512 }) {
    const handle = await fsp.open(path.resolve(this.root, assertSafeKey(key)), 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const result = await handle.read(buffer, 0, bytes, 0);
      return buffer.subarray(0, result.bytesRead);
    } finally {
      await handle.close();
    }
  }

  async presignPut() {
    throw storageError('Local storage dùng multipart upload qua backend.', 'STORAGE_PRESIGN_UNSUPPORTED', 409);
  }

  publicUrl(key, req) {
    const base = String(process.env.STORAGE_PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const relative = `/uploads/${assertSafeKey(key)}`;
    return base ? `${base}${relative}` : (req ? `${req.protocol}://${req.get('host')}${relative}` : relative);
  }
}

class MinioStorageAdapter {
  constructor(options = {}) {
    const Minio = options.Minio || require('minio');
    this.backend = 'minio';
    this.bucket = options.bucket || process.env.MINIO_BUCKET || 'indoor-nav';
    const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = Number(process.env.MINIO_PORT) || 9000;
    const ssl = String(process.env.MINIO_USE_SSL).toLowerCase() === 'true';
    this.publicBase = String(process.env.MINIO_PUBLIC_URL || `${ssl ? 'https' : 'http'}://${endpoint}:${port}`)
      .replace(/\/$/, '');
    this.client = options.client || new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL: ssl,
      accessKey: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER,
      secretKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD
    });
  }

  async put({ key, buffer, mime, checksum }) {
    if (typeof this.client.bucketExists === 'function' &&
        !await this.client.bucketExists(this.bucket)) {
      await this.client.makeBucket(this.bucket);
    }
    await this.client.putObject(this.bucket, assertSafeKey(key), buffer, buffer.length, {
      'Content-Type': mime,
      'x-amz-meta-sha256': checksum
    });
    return { key, bucket: this.bucket };
  }

  async head({ key }) {
    try {
      const stat = await this.client.statObject(this.bucket, assertSafeKey(key));
      return { exists: true, size: Number(stat.size), etag: stat.etag, metadata: stat.metaData || {} };
    } catch (error) {
      if (error.code === 'NoSuchKey' || error.code === 'NotFound') return { exists: false };
      throw error;
    }
  }

  async delete({ key }) {
    await this.client.removeObject(this.bucket, assertSafeKey(key));
    return true;
  }

  async readPrefix({ key, bytes = 512 }) {
    const stream = await this.client.getPartialObject(this.bucket, assertSafeKey(key), 0, bytes);
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).subarray(0, bytes);
  }

  presignPut({ key, expiresSeconds }) {
    return this.client.presignedPutObject(this.bucket, assertSafeKey(key), expiresSeconds);
  }

  publicUrl(key) {
    return `${this.publicBase}/${this.bucket}/${assertSafeKey(key)}`;
  }
}

class S3StorageAdapter {
  constructor(options = {}) {
    const sdk = options.sdk || require('@aws-sdk/client-s3');
    this.sdk = sdk;
    this.backend = 's3';
    this.bucket = options.bucket || process.env.S3_BUCKET;
    this.region = process.env.S3_REGION || 'ap-southeast-1';
    if (!this.bucket) throw storageError('Thiếu S3_BUCKET.', 'STORAGE_S3_NOT_CONFIGURED', 503);
    this.client = options.client || new sdk.S3Client({
      region: this.region,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE).toLowerCase() === 'true'
    });
  }

  async put({ key, buffer, mime, checksum }) {
    await this.client.send(new this.sdk.PutObjectCommand({
      Bucket: this.bucket,
      Key: assertSafeKey(key),
      Body: buffer,
      ContentType: mime,
      Metadata: { sha256: checksum }
    }));
    return { key, bucket: this.bucket };
  }

  async head({ key }) {
    try {
      const result = await this.client.send(new this.sdk.HeadObjectCommand({
        Bucket: this.bucket,
        Key: assertSafeKey(key)
      }));
      return { exists: true, size: Number(result.ContentLength), etag: result.ETag, metadata: result.Metadata || {} };
    } catch (error) {
      if (error.$metadata?.httpStatusCode === 404 || error.name === 'NotFound') return { exists: false };
      throw error;
    }
  }

  async delete({ key }) {
    await this.client.send(new this.sdk.DeleteObjectCommand({ Bucket: this.bucket, Key: assertSafeKey(key) }));
    return true;
  }

  async readPrefix({ key, bytes = 512 }) {
    const result = await this.client.send(new this.sdk.GetObjectCommand({
      Bucket: this.bucket,
      Key: assertSafeKey(key),
      Range: `bytes=0-${bytes - 1}`
    }));
    if (result.Body?.transformToByteArray) return Buffer.from(await result.Body.transformToByteArray());
    const chunks = [];
    for await (const chunk of result.Body || []) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async presignPut({ key, expiresSeconds, mime }) {
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    return getSignedUrl(this.client, new this.sdk.PutObjectCommand({
      Bucket: this.bucket,
      Key: assertSafeKey(key),
      ContentType: mime
    }), { expiresIn: expiresSeconds });
  }

  publicUrl(key) {
    const configured = String(process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');
    return configured
      ? `${configured}/${assertSafeKey(key)}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${assertSafeKey(key)}`;
  }
}

function createStorageAdapter(backend = process.env.STORAGE_BACKEND || 'local', options = {}) {
  const selected = String(backend).trim().toLowerCase();
  if (selected === 'local') return new LocalStorageAdapter(options);
  if (selected === 'minio') return new MinioStorageAdapter(options);
  if (selected === 's3') return new S3StorageAdapter(options);
  throw storageError(`Storage backend không hỗ trợ: ${selected}`, 'STORAGE_BACKEND', 500);
}

module.exports = {
  LocalStorageAdapter,
  MinioStorageAdapter,
  S3StorageAdapter,
  createStorageAdapter,
  detectMime,
  validateBuffer,
  assertSafeKey,
  buildObjectKey,
  storageError
};
