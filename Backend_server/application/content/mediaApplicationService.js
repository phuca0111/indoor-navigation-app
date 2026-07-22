const crypto = require('crypto');
const mediaRepository = require('../../repositories/mediaRepository');
const outboxRepository = require('../../repositories/outboxRepository');
const {
  createStorageAdapter,
  validateBuffer,
  buildObjectKey,
  assertSafeKey,
  detectMime
} = require('../../services/storagePlatform');
const { runContentCommand } = require('./runContentCommand');
const {
  putMapBackground,
  deleteByKey,
  getMaxBytes,
  getBackend
} = require('../../services/objectStorage');
const { assertBuildingCanUploadCad } = require('../../utils/overQuotaLock');

const ALLOWED_MIME = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'video/mp4'
];

function error(message, code, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function kindForMime(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

function quotaFilter(ownerId, organizationId) {
  return {
    status: { $in: ['PENDING', 'ACTIVE'] },
    backend: { $ne: 'external' },
    ...(organizationId ? { organization_id: organizationId } : { owner_id: ownerId })
  };
}

async function assertQuota({ ownerId, organizationId, incomingBytes }, options = {}) {
  const quota = Number(process.env.STORAGE_QUOTA_BYTES) || 500 * 1024 * 1024;
  const used = await mediaRepository.storageUsage(
    quotaFilter(ownerId, organizationId),
    options
  );
  if (used + incomingBytes > quota) {
    throw error('Đã vượt quota lưu trữ.', 'STORAGE_QUOTA_EXCEEDED', 413);
  }
  return { used, quota };
}

function mediaEvent(type, media, context) {
  return {
    type,
    event_key: `${type}:MEDIA:${media._id}:r${media.revision}`,
    aggregate_type: 'MEDIA',
    aggregate_id: String(media._id),
    organization_id: media.organization_id || null,
    actor_user_id: context.actorId,
    correlation_id: context.correlationId,
    payload: {
      resource_type: 'MEDIA',
      resource_id: String(media._id),
      revision: media.revision,
      deleted: media.status !== 'ACTIVE'
    }
  };
}

async function persistMedia(asset, input, context, session) {
  const media = await mediaRepository.createMedia({
    name: String(input.name || input.originalName || 'Media').trim(),
    url: asset.url,
    kind: input.kind || kindForMime(asset.mime),
    mime: asset.mime,
    size: asset.size,
    checksum: asset.checksum,
    alt: String(input.alt || '').trim(),
    storage_asset_id: asset._id,
    storage_backend: asset.backend,
    storage_bucket: asset.bucket,
    storage_key: asset.key,
    status: 'ACTIVE',
    created_by: context.actorId,
    organization_id: context.organizationId || null,
    revision: 1
  }, { session });
  await mediaRepository.updateAsset(
    asset._id,
    { status: { $in: ['PENDING', 'ACTIVE'] } },
    { $set: { status: 'ACTIVE', ref_count: 1 } },
    { session }
  );
  await mediaRepository.appendHistory({
    actorId: context.actorId,
    action: 'CREATE',
    resourceId: media._id,
    label: media.name,
    after: media,
    ip: context.ip,
    correlationId: context.correlationId,
    revision: 1
  }, { session });
  await outboxRepository.append(mediaEvent('MediaChanged', media, context), { session });
  return media;
}

async function uploadMedia(file, payload, context) {
  if (!file) throw error('Thiếu file upload.', 'STORAGE_NO_FILE');
  const verified = validateBuffer(file.buffer, file.mimetype, { allowedMime: ALLOWED_MIME });
  await assertQuota({
    ownerId: context.actorId,
    organizationId: context.organizationId,
    incomingBytes: verified.size
  });
  const backend = String(process.env.STORAGE_BACKEND || 'local').toLowerCase();
  const adapter = createStorageAdapter(backend);
  const owner = context.organizationId
    ? `org-${context.organizationId}`
    : `user-${context.actorId}`;
  const key = buildObjectKey({
    namespace: 'cms-media',
    owner,
    name: file.originalname,
    mime: verified.mime
  });
  const pending = await runContentCommand((session) => mediaRepository.createAsset({
    owner_id: context.actorId,
    organization_id: context.organizationId || null,
    backend,
    bucket: adapter.bucket || '',
    key,
    url: adapter.publicUrl(key, context.req),
    mime: verified.mime,
    size: verified.size,
    checksum: verified.checksum,
    status: 'PENDING',
    ref_count: 0,
    metadata: { saga: 'CMS_MEDIA_UPLOAD' }
  }, { session }));
  try {
    await adapter.put({ key, buffer: file.buffer, mime: verified.mime, checksum: verified.checksum });
    return await runContentCommand((session) => persistMedia(pending, {
      ...payload,
      originalName: file.originalname
    }, context, session));
  } catch (cause) {
    await mediaRepository.updateAsset(
      pending._id,
      { status: 'PENDING' },
      { $set: { status: 'FAILED', 'metadata.last_error': String(cause.message || cause) } }
    ).catch(() => {});
    throw cause;
  }
}

function validateUploadIntentInput(payload) {
  const size = Number(payload.size);
  const mime = String(payload.mime || '').toLowerCase();
  if (!ALLOWED_MIME.includes(mime) || !Number.isSafeInteger(size) || size < 1) {
    throw error('MIME hoặc kích thước upload không hợp lệ.', 'STORAGE_INTENT_INPUT');
  }
  const maxBytes = Number(process.env.STORAGE_MAX_BYTES) || 5 * 1024 * 1024;
  if (size > maxBytes) throw error(`File vượt giới hạn ${maxBytes} bytes.`, 'STORAGE_TOO_LARGE', 413);
  return { size, mime };
}

async function createUploadIntent(payload, context) {
  const backend = String(process.env.STORAGE_BACKEND || 'local').toLowerCase();
  if (!['minio', 's3'].includes(backend)) {
    throw error('Local storage dùng multipart upload qua backend.', 'STORAGE_LOCAL_MULTIPART', 409);
  }
  const { size, mime } = validateUploadIntentInput(payload);
  await assertQuota({
    ownerId: context.actorId,
    organizationId: context.organizationId,
    incomingBytes: size
  });
  const adapter = createStorageAdapter(backend);
  const owner = context.organizationId
    ? `org-${context.organizationId}`
    : `user-${context.actorId}`;
  const key = assertSafeKey(buildObjectKey({
    namespace: 'cms-media',
    owner,
    name: payload.name || 'asset',
    mime
  }), 'cms-media');
  const ttl = Math.min(900, Math.max(60, Number(process.env.STORAGE_INTENT_TTL_SECONDS) || 300));
  const token = crypto.randomBytes(32).toString('base64url');
  const intent = await mediaRepository.createIntent({
    token_hash: crypto.createHash('sha256').update(token).digest('hex'),
    owner_id: context.actorId,
    organization_id: context.organizationId || null,
    backend,
    bucket: adapter.bucket,
    key,
    expected_mime: mime,
    expected_size: size,
    expires_at: new Date(Date.now() + ttl * 1000)
  });
  return {
    intent_id: intent._id,
    token,
    key,
    upload_url: await adapter.presignPut({ key, mime, expiresSeconds: ttl }),
    expires_in: ttl
  };
}

async function completeUploadIntent(payload, context) {
  const now = new Date();
  const tokenHash = crypto.createHash('sha256').update(String(payload.token || '')).digest('hex');
  const intent = await mediaRepository.findIntent({
    _id: payload.intent_id,
    token_hash: tokenHash,
    owner_id: context.actorId,
    status: 'PENDING',
    expires_at: { $gt: now }
  });
  if (!intent) throw error('Upload intent không hợp lệ hoặc đã hết hạn.', 'STORAGE_INTENT_INVALID', 409);
  const claimed = await mediaRepository.updateIntent(
    intent._id,
    { status: 'PENDING', expires_at: { $gt: now } },
    { $set: { status: 'COMPLETING', claimed_at: now, last_error: '' } }
  );
  if (!claimed) throw error('Upload intent đang được hoàn tất hoặc đã sử dụng.', 'STORAGE_INTENT_CLAIMED', 409);
  const adapter = createStorageAdapter(intent.backend);
  try {
    const head = await adapter.head({ key: intent.key, bucket: intent.bucket });
    if (!head.exists || Number(head.size) !== intent.expected_size) {
      throw error('Object upload không tồn tại hoặc sai kích thước.', 'STORAGE_OBJECT_INVALID', 409);
    }
    const body = await adapter.readPrefix({
      key: intent.key,
      bucket: intent.bucket,
      bytes: intent.expected_size
    });
    if (body.length !== intent.expected_size || detectMime(body) !== intent.expected_mime) {
      throw error('Object upload có nội dung không khớp MIME intent.', 'STORAGE_MIME_SPOOF', 409);
    }
    const checksum = crypto.createHash('sha256').update(body).digest('hex');
    if (payload.checksum && String(payload.checksum).toLowerCase() !== checksum) {
      throw error('Checksum object không khớp yêu cầu hoàn tất.', 'STORAGE_CHECKSUM_MISMATCH', 409);
    }
    return await runContentCommand(async (session) => {
      const asset = await mediaRepository.createAsset({
        owner_id: context.actorId,
        organization_id: context.organizationId || null,
        backend: intent.backend,
        bucket: intent.bucket,
        key: intent.key,
        url: adapter.publicUrl(intent.key),
        mime: intent.expected_mime,
        size: intent.expected_size,
        checksum,
        status: 'PENDING',
        ref_count: 0,
        metadata: { saga: 'CMS_PRESIGNED_UPLOAD', intent_id: String(intent._id) }
      }, { session });
      const media = await persistMedia(asset, payload, context, session);
      const completed = await mediaRepository.updateIntent(
        intent._id,
        { status: 'COMPLETING' },
        { $set: { status: 'COMPLETED', completed_at: new Date() } },
        { session }
      );
      if (!completed) throw error('Upload intent mất quyền sở hữu.', 'STORAGE_INTENT_LOST', 409);
      return media;
    });
  } catch (cause) {
    await mediaRepository.updateIntent(
      intent._id,
      { status: 'COMPLETING' },
      { $set: { status: 'PENDING', claimed_at: null, last_error: String(cause.message || cause) } }
    ).catch(() => {});
    throw cause;
  }
}

async function createExternalMedia(payload, context) {
  const name = String(payload.name || '').trim();
  const url = String(payload.url || '').trim();
  if (!name || !url) throw error('Thiếu tên hoặc URL media.', 'MEDIA_INPUT');
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) {
    throw error('URL media phải dùng HTTP(S) hoặc /uploads/.', 'MEDIA_URL');
  }
  return runContentCommand(async (session) => {
    const asset = await mediaRepository.createAsset({
      owner_id: context.actorId,
      organization_id: context.organizationId || null,
      backend: 'external',
      url,
      mime: payload.mime || 'application/octet-stream',
      size: Number(payload.size) || 0,
      checksum: payload.checksum || '',
      status: 'PENDING',
      ref_count: 0
    }, { session });
    return persistMedia(asset, { ...payload, name }, context, session);
  });
}

async function listMedia(query = {}) {
  const includeDeleted = String(query.include_deleted) === 'true';
  const filter = includeDeleted ? {} : { status: { $nin: ['DELETED', 'PURGED'] } };
  if (query.kind) filter.kind = query.kind;
  if (query.q) {
    const escaped = String(query.q).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ name: new RegExp(escaped, 'i') }, { alt: new RegExp(escaped, 'i') }];
  }
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 24));
  const result = await mediaRepository.listMedia(filter, { skip: (page - 1) * limit, limit });
  return { ...result, page, limit, total_pages: Math.max(1, Math.ceil(result.total / limit)) };
}

async function deleteMedia(id, context) {
  return runContentCommand(async (session) => {
    const before = await mediaRepository.findMediaById(id, { session });
    if (!before) throw error('Không tìm thấy media.', 'MEDIA_NOT_FOUND', 404);
    if (before.status === 'DELETED') return { ok: true };
    const revision = Number(before.revision) + 1;
    const retentionUntil = new Date(
      Date.now() + (Number(process.env.STORAGE_RETENTION_DAYS) || 30) * 86400000
    );
    const after = await mediaRepository.updateMedia(
      id,
      { revision: before.revision, status: 'ACTIVE' },
      {
        $set: { status: 'DELETED', deleted_at: new Date(), retention_until: retentionUntil },
        $inc: { revision: 1 }
      },
      { session }
    );
    if (!after) throw error('Media đã bị thay đổi đồng thời.', 'MEDIA_CONFLICT', 409);
    if (before.storage_asset_id) {
      await mediaRepository.updateAsset(
        before.storage_asset_id,
        { status: 'ACTIVE' },
        {
          $set: { status: 'DELETED', deleted_at: new Date(), retention_until: retentionUntil },
          $inc: { ref_count: -1 }
        },
        { session }
      );
    }
    await mediaRepository.appendHistory({
      actorId: context.actorId,
      action: 'DELETE',
      resourceId: id,
      label: before.name,
      before,
      after,
      ip: context.ip,
      correlationId: context.correlationId,
      revision
    }, { session });
    await outboxRepository.append(mediaEvent('MediaChanged', after, context), { session });
    return { ok: true };
  });
}

async function purgeMedia(id, context) {
  const media = await mediaRepository.findMediaById(id);
  if (!media) throw error('Không tìm thấy media.', 'MEDIA_NOT_FOUND', 404);
  if (media.status !== 'DELETED' || !media.retention_until || media.retention_until > new Date()) {
    throw error('Media chưa đủ điều kiện purge.', 'MEDIA_RETENTION_ACTIVE', 409);
  }
  if (media.storage_asset_id) {
    const references = await mediaRepository.countMediaReferences(media.storage_asset_id, {
      excludeMediaId: media._id
    });
    const contentReferences = await mediaRepository.countContentReferences(media.url);
    if (references > 0 || contentReferences > 0) {
      throw error('Media vẫn còn được tham chiếu.', 'MEDIA_REFERENCED', 409);
    }
    const asset = await mediaRepository.findAssetById(media.storage_asset_id);
    if (asset?.key && asset.backend !== 'external') {
      await createStorageAdapter(asset.backend).delete({ key: asset.key, bucket: asset.bucket });
    }
  }
  return runContentCommand(async (session) => {
    const before = await mediaRepository.findMediaById(id, { session });
    const after = await mediaRepository.updateMedia(
      id,
      { revision: before.revision, status: 'DELETED' },
      { $set: { status: 'PURGED', purged_at: new Date() }, $inc: { revision: 1 } },
      { session }
    );
    if (!after) throw error('Media đã bị thay đổi đồng thời.', 'MEDIA_CONFLICT', 409);
    if (before.storage_asset_id) {
      await mediaRepository.updateAsset(
        before.storage_asset_id,
        { status: 'DELETED', ref_count: 0 },
        { $set: { status: 'PURGED', purged_at: new Date() } },
        { session }
      );
    }
    await mediaRepository.appendHistory({
      actorId: context.actorId,
      action: 'PURGE',
      resourceId: id,
      label: before.name,
      before,
      after,
      ip: context.ip,
      correlationId: context.correlationId,
      revision: after.revision
    }, { session });
    await outboxRepository.append(mediaEvent('MediaChanged', after, context), { session });
    return after;
  });
}

async function recoverStaleUploads(limit = 100) {
  const now = new Date();
  const staleBefore = new Date(Date.now() - (
    Number(process.env.STORAGE_COMPLETING_STALE_MS) || 10 * 60_000
  ));
  const intents = await mediaRepository.findStaleIntents(now, staleBefore, Math.min(500, limit));
  let expired = 0;
  let recovered = 0;
  for (const intent of intents) {
    if (intent.status === 'COMPLETING' && intent.expires_at > now) {
      const changed = await mediaRepository.updateIntent(
        intent._id,
        { status: 'COMPLETING', claimed_at: { $lte: staleBefore } },
        { $set: { status: 'PENDING', claimed_at: null, last_error: 'STALE_COMPLETING_RECOVERED' } }
      );
      if (changed) recovered += 1;
      continue;
    }
    const adapter = createStorageAdapter(intent.backend);
    await adapter.delete({ key: intent.key, bucket: intent.bucket }).catch(() => {});
    const changed = await mediaRepository.updateIntent(
      intent._id,
      { status: { $in: ['PENDING', 'COMPLETING'] } },
      { $set: { status: 'EXPIRED', last_error: 'INTENT_EXPIRED' } }
    );
    if (changed) expired += 1;
  }
  return { scanned: intents.length, recovered, expired };
}

async function reconcileAssets(limit = 100) {
  const candidates = await mediaRepository.findPurgeCandidates(new Date(), Math.min(500, limit));
  let purged = 0;
  for (const asset of candidates) {
    if (await mediaRepository.countMediaReferences(asset._id)) continue;
    const mediaRows = await mediaRepository.findMediaByAssetId(asset._id);
    let referenced = false;
    for (const media of mediaRows) {
      if (await mediaRepository.countContentReferences(media.url)) {
        referenced = true;
        break;
      }
    }
    if (referenced) continue;
    if (asset.key && asset.backend !== 'external') {
      await createStorageAdapter(asset.backend).delete({ key: asset.key, bucket: asset.bucket })
        .catch(() => {});
    }
    const updated = await mediaRepository.updateAsset(
      asset._id,
      { status: 'DELETED', ref_count: 0 },
      { $set: { status: 'PURGED', purged_at: new Date() } }
    );
    if (updated) purged += 1;
  }
  return { scanned: candidates.length, purged };
}

async function assertMapUploadAllowed(buildingId, floorNumber, actor) {
  const building = await mediaRepository.findBuildingForUpload(buildingId);
  if (!building) throw error('Không tìm thấy tòa nhà!', 'BUILDING_NOT_FOUND', 404);
  if (!Number.isInteger(floorNumber) ||
      floorNumber < 0 ||
      floorNumber >= Number(building.total_floors)) {
    throw error('Số tầng ngoài phạm vi tòa nhà.', 'FLOOR_OUT_OF_RANGE');
  }
  if (actor?.role !== 'SUPER_ADMIN' && building.organization_id) {
    const organization = await mediaRepository.findOrganizationForUpload(
      building.organization_id
    );
    const writable = await assertBuildingCanUploadCad(buildingId, organization);
    if (!writable.ok) throw error(writable.message, writable.code, 403);
  }
  return building;
}

async function uploadMapBackground({ buildingId, floorNumber, file, actor, req }) {
  const building = await assertMapUploadAllowed(buildingId, floorNumber, actor);
  if (!file) throw error('Thiếu file (field name: file).', 'STORAGE_NO_FILE');
  await assertQuota({
    ownerId: actor?._id || actor?.userId,
    organizationId: building.organization_id || null,
    incomingBytes: file.buffer.length
  });
  const result = await putMapBackground({
    buildingId,
    floorNumber,
    buffer: file.buffer,
    mime: file.mimetype,
    originalName: file.originalname,
    req
  });
  try {
    const asset = await mediaRepository.createAsset({
      owner_id: actor?._id || actor?.userId,
      organization_id: building.organization_id || null,
      backend: result.backend,
      bucket: result.bucket || '',
      key: result.key,
      url: result.url,
      mime: result.mime,
      size: result.bytes,
      checksum: result.checksum,
      status: 'ACTIVE',
      ref_count: 1,
      metadata: { type: 'map-background', building_id: buildingId, floor_number: floorNumber }
    });
    return { ...result, asset_id: asset._id, max_bytes: getMaxBytes() };
  } catch (cause) {
    await deleteByKey(result.key).catch(() => {});
    throw cause;
  }
}

async function deleteMapBackground({ buildingId, floorNumber, key, actor }) {
  await assertMapUploadAllowed(buildingId, floorNumber, actor);
  const normalizedKey = String(key || '').trim().replace(/\\/g, '/');
  if (!normalizedKey) throw error('Thiếu key.', 'STORAGE_KEY');
  if (!normalizedKey.startsWith(`map-backgrounds/${buildingId}/`)) {
    throw error('Key không thuộc tòa nhà này.', 'STORAGE_KEY_FORBIDDEN', 403);
  }
  const deleted = await deleteByKey(normalizedKey);
  if (deleted) {
    await mediaRepository.updateAssetByLocation(
      getBackend(),
      normalizedKey,
      {
        $set: {
          status: 'PURGED',
          ref_count: 0,
          deleted_at: new Date(),
          purged_at: new Date()
        }
      }
    );
  }
  return { deleted, backend: getBackend() };
}

module.exports = {
  assertQuota,
  uploadMedia,
  validateUploadIntentInput,
  createUploadIntent,
  completeUploadIntent,
  createExternalMedia,
  listMedia,
  deleteMedia,
  purgeMedia,
  recoverStaleUploads,
  reconcileAssets,
  uploadMapBackground,
  deleteMapBackground
};
