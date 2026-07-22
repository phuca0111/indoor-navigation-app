const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  validateBuffer,
  assertSafeKey,
  LocalStorageAdapter,
  MinioStorageAdapter,
  S3StorageAdapter,
  OpenSearchProvider
} = (() => ({
  ...require('../../services/storagePlatform'),
  ...require('../../services/searchProvider')
}))();

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const { validateUploadIntentInput } = require('../../services/websiteCmsService');
function errorCode(fn) {
  try {
    fn();
    return '';
  } catch (error) {
    return error.code;
  }
}

describe('content storage platform', () => {
  test('nhận diện magic bytes, checksum SHA-256 và không tin MIME khai báo', () => {
    const result = validateBuffer(PNG, 'image/png');
    expect(result.mime).toBe('image/png');
    expect(result.size).toBe(PNG.length);
    expect(result.checksum).toBe(crypto.createHash('sha256').update(PNG).digest('hex'));
    expect(errorCode(() => validateBuffer(PNG, 'image/jpeg'))).toBe('STORAGE_MIME_SPOOF');
  });

  test('chặn size vượt giới hạn và object key traversal', () => {
    expect(errorCode(() => validateBuffer(PNG, 'image/png', { maxBytes: 4 }))).toBe('STORAGE_TOO_LARGE');
    expect(errorCode(() => assertSafeKey('../secret'))).toBe('STORAGE_KEY');
    expect(errorCode(() => assertSafeKey('other/a.png', 'cms-media'))).toBe('STORAGE_KEY_FORBIDDEN');
  });

  test('MinIO adapter tuân thủ put/head/delete/presign contract', async () => {
    const client = {
      putObject: jest.fn().mockResolvedValue(undefined),
      statObject: jest.fn().mockResolvedValue({
        size: PNG.length,
        etag: 'etag',
        metaData: { sha256: 'abc' }
      }),
      removeObject: jest.fn().mockResolvedValue(undefined),
      presignedPutObject: jest.fn().mockResolvedValue('https://minio/upload')
    };
    const adapter = new MinioStorageAdapter({ client, bucket: 'test' });
    await adapter.put({ key: 'cms-media/a.png', buffer: PNG, mime: 'image/png', checksum: 'abc' });
    await expect(adapter.head({ key: 'cms-media/a.png' })).resolves.toMatchObject({
      exists: true,
      size: PNG.length
    });
    await expect(adapter.presignPut({ key: 'cms-media/a.png', expiresSeconds: 60 }))
      .resolves.toBe('https://minio/upload');
    await expect(adapter.delete({ key: 'cms-media/a.png' })).resolves.toBe(true);
  });

  test('Local adapter tuân thủ put/head/delete và fail-closed presign', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-storage-'));
    const adapter = new LocalStorageAdapter({ root });
    try {
      await adapter.put({ key: 'cms-media/a.png', buffer: PNG });
      await expect(adapter.head({ key: 'cms-media/a.png' })).resolves.toMatchObject({
        exists: true,
        size: PNG.length
      });
      await expect(adapter.presignPut({ key: 'cms-media/a.png' })).rejects.toMatchObject({
        code: 'STORAGE_PRESIGN_UNSUPPORTED',
        status: 409
      });
      await expect(adapter.delete({ key: 'cms-media/a.png' })).resolves.toBe(true);
      await expect(adapter.head({ key: 'cms-media/a.png' })).resolves.toEqual({
        exists: false
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('S3 adapter dùng AWS command contract với client mock', async () => {
    class PutObjectCommand { constructor(input) { this.input = input; } }
    class HeadObjectCommand { constructor(input) { this.input = input; } }
    class DeleteObjectCommand { constructor(input) { this.input = input; } }
    class S3Client {}
    const client = {
      send: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ ContentLength: PNG.length, Metadata: { sha256: 'abc' } })
        .mockResolvedValueOnce({})
    };
    const adapter = new S3StorageAdapter({
      client,
      bucket: 'test',
      sdk: { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, S3Client }
    });
    await adapter.put({ key: 'cms-media/a.png', buffer: PNG, mime: 'image/png', checksum: 'abc' });
    await expect(adapter.head({ key: 'cms-media/a.png' })).resolves.toMatchObject({
      exists: true,
      size: PNG.length
    });
    await expect(adapter.delete({ key: 'cms-media/a.png' })).resolves.toBe(true);
  });

  test('presign intent chỉ nhận allowlist MIME và size hữu hạn', () => {
    expect(validateUploadIntentInput({ mime: 'image/png', size: 16 })).toEqual({
      mime: 'image/png',
      size: 16
    });
    expect(errorCode(() => validateUploadIntentInput({ mime: 'text/html', size: 16 })))
      .toBe('STORAGE_INTENT_INPUT');
    expect(errorCode(() => validateUploadIntentInput({ mime: 'image/png', size: Number.MAX_SAFE_INTEGER })))
      .toBe('STORAGE_TOO_LARGE');
  });

  test('OpenSearch giữ provider-ready fail closed khi chưa cấu hình', async () => {
    await expect(new OpenSearchProvider().search()).rejects.toMatchObject({
      code: 'OPENSEARCH_NOT_CONFIGURED',
      status: 503
    });
  });
});
