// ============================================
// FILE: floorEditLock.js
// Phase 8 + Phase 2b — Floor edit lock
// Backend: redis (REDIS_URL) | memory (Jest/dev) | mongo (fallback legacy)
// ============================================

const floorLocks = require('../repositories/floorLockRepository');
const memoryStore = require('./floorLockMemoryStore');
const redisStore = require('./floorLockRedisStore');
const { getRedisUrl } = require('../utils/redisClient');

function getTtlSec() {
  const n = Number(process.env.FLOOR_EDIT_LOCK_TTL_SEC);
  return Number.isFinite(n) && n > 0 ? n : 120;
}

function ttlMs() {
  return getTtlSec() * 1000;
}

function resolveBackendName() {
  const forced = (process.env.FLOOR_LOCK_BACKEND || '').trim().toLowerCase();
  if (forced === 'redis' || forced === 'memory' || forced === 'mongo') return forced;
  if (getRedisUrl()) return 'redis';
  if (process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test') return 'memory';
  return 'mongo';
}

function getKvStore() {
  const name = resolveBackendName();
  if (name === 'redis') return redisStore;
  if (name === 'memory') return memoryStore;
  return null; // mongo path
}

function getBackendName() {
  return resolveBackendName();
}

function isExpired(lock) {
  if (!lock || !lock.expires_at) return true;
  return new Date(lock.expires_at).getTime() <= Date.now();
}

function holderPayload(lock) {
  if (!lock) return null;
  return {
    user_id: lock.user_id,
    user_email: lock.user_email || '',
    session_id: lock.session_id,
    expires_at: lock.expires_at,
    fencing_token: lock.fencing_token
  };
}

function deny(code, message, lock) {
  return {
    ok: false,
    code,
    message,
    holder: holderPayload(lock)
  };
}

function sameOwner(lock, userId, sessionId) {
  return (
    String(lock.user_id) === String(userId) &&
    String(lock.session_id) === String(sessionId)
  );
}

// ---------- KV (redis / memory) ----------

async function acquireKv(store, opts) {
  const {
    buildingId,
    floor,
    userId,
    email = '',
    sessionId,
    force = false,
    callerRole = null
  } = opts;

  const floorNum = Number(floor);
  const ttl = getTtlSec();
  const canForce = force && ['SUPER_ADMIN', 'ORG_ADMIN'].includes(callerRole);
  const payload = { user_id: userId, user_email: email, session_id: sessionId };

  let lock = await store.kvGet(buildingId, floorNum);

  if (lock) {
    if (sameOwner(lock, userId, sessionId)) {
      await store.kvExpire(buildingId, floorNum, ttl);
      lock = await store.kvGet(buildingId, floorNum);
      return { ok: true, lock, renewed: true };
    }

    if (String(lock.user_id) === String(userId) && String(lock.session_id) !== String(sessionId)) {
      if (!canForce && !force) {
        return deny('LOCK_OTHER_SESSION', 'Bạn đang giữ lock tầng này ở phiên khác.', lock);
      }
    } else if (String(lock.user_id) !== String(userId)) {
      if (!canForce) {
        return deny('LOCK_HELD', 'Tầng đang được người khác chỉnh sửa.', lock);
      }
    }

    lock = await store.kvSet(buildingId, floorNum, payload, ttl);
    return { ok: true, lock, forced: true };
  }

  lock = await store.kvSetNx(buildingId, floorNum, payload, ttl);
  if (!lock) {
    // race: ai đó vừa set
    lock = await store.kvGet(buildingId, floorNum);
    return deny('LOCK_HELD', 'Tầng đang được người khác chỉnh sửa.', lock);
  }
  return { ok: true, lock, created: true };
}

async function heartbeatKv(store, { buildingId, floor, userId, sessionId }) {
  const floorNum = Number(floor);
  if (store.kvCompareExpire) {
    const changed = await store.kvCompareExpire(
      buildingId,
      floorNum,
      userId,
      sessionId,
      getTtlSec()
    );
    if (changed === 1) {
      return { ok: true, lock: await store.kvGet(buildingId, floorNum) };
    }
    const current = await store.kvGet(buildingId, floorNum);
    return changed === 0
      ? deny('LOCK_NOT_HELD', 'Không có lock hợp lệ để heartbeat.')
      : deny('LOCK_NOT_OWNER', 'Bạn không sở hữu lock tầng này.', current);
  }
  const lock = await store.kvGet(buildingId, floorNum);
  if (!lock) return deny('LOCK_NOT_HELD', 'Không có lock hợp lệ để heartbeat.');
  if (!sameOwner(lock, userId, sessionId)) {
    return deny('LOCK_NOT_OWNER', 'Bạn không sở hữu lock tầng này.', lock);
  }
  await store.kvExpire(buildingId, floorNum, getTtlSec());
  const renewed = await store.kvGet(buildingId, floorNum);
  return { ok: true, lock: renewed };
}

async function releaseKv(store, { buildingId, floor, userId, sessionId, force = false, callerRole = null }) {
  const floorNum = Number(floor);
  const lock = await store.kvGet(buildingId, floorNum);
  if (!lock) return { ok: true, released: false };

  const isOwner = sameOwner(lock, userId, sessionId);
  const canForce = force && ['SUPER_ADMIN', 'ORG_ADMIN'].includes(callerRole);
  if (!isOwner && !canForce) {
    return deny('LOCK_NOT_OWNER', 'Bạn không sở hữu lock tầng này.', lock);
  }

  if (isOwner && store.kvCompareDel) {
    const deleted = await store.kvCompareDel(buildingId, floorNum, userId, sessionId);
    if (deleted === -1) {
      return deny(
        'LOCK_NOT_OWNER',
        'Lock đã đổi chủ trước khi release.',
        await store.kvGet(buildingId, floorNum)
      );
    }
    return { ok: true, released: deleted === 1 };
  }
  await store.kvDel(buildingId, floorNum);
  return { ok: true, released: true };
}

async function getStatusKv(store, buildingId, floor) {
  const lock = await store.kvGet(buildingId, Number(floor));
  if (!lock) return { held: false, lock: null };
  return { held: true, lock, holder: holderPayload(lock) };
}

// ---------- Mongo (legacy Phase 8) ----------

async function acquireMongo(opts) {
  const {
    buildingId,
    floor,
    userId,
    email = '',
    sessionId,
    force = false,
    callerRole = null
  } = opts || {};

  if (!buildingId || floor === undefined || floor === null || !userId || !sessionId) {
    return deny('LOCK_BAD_REQUEST', 'Thiếu buildingId, floor, userId hoặc session_id.');
  }

  const floorNum = Number(floor);
  const expiresAt = new Date(Date.now() + ttlMs());
  const canForce = force && ['SUPER_ADMIN', 'ORG_ADMIN'].includes(callerRole);

  let lock = await floorLocks.find(buildingId, floorNum);

  if (lock && isExpired(lock)) {
    await floorLocks.remove(lock._id);
    lock = null;
  }

  if (lock) {
    if (String(lock.session_id) === String(sessionId) && String(lock.user_id) === String(userId)) {
      lock.expires_at = expiresAt;
      lock.user_email = email || lock.user_email;
      await lock.save();
      return { ok: true, lock, renewed: true };
    }

    if (String(lock.user_id) === String(userId) && String(lock.session_id) !== String(sessionId)) {
      if (!canForce && !force) {
        return deny('LOCK_OTHER_SESSION', 'Bạn đang giữ lock tầng này ở phiên khác.', lock);
      }
    } else if (String(lock.user_id) !== String(userId)) {
      if (!canForce) {
        return deny('LOCK_HELD', 'Tầng đang được người khác chỉnh sửa.', lock);
      }
    }

    lock.user_id = userId;
    lock.user_email = email || '';
    lock.session_id = sessionId;
    lock.expires_at = expiresAt;
    lock.fencing_token = Number(lock.fencing_token || 0) + 1;
    await lock.save();
    return { ok: true, lock, forced: true };
  }

  lock = await floorLocks.acquire({
    buildingId,
    floorNumber: floorNum,
    userId,
    email: email || '',
    sessionId,
    expiresAt
  });

  return { ok: true, lock, created: true };
}

async function heartbeatMongo({ buildingId, floor, userId, sessionId }) {
  const floorNum = Number(floor);
  const lock = await floorLocks.find(buildingId, floorNum);

  if (!lock || isExpired(lock)) {
    if (lock) await floorLocks.remove(lock._id);
    return deny('LOCK_NOT_HELD', 'Không có lock hợp lệ để heartbeat.');
  }

  if (String(lock.user_id) !== String(userId) || String(lock.session_id) !== String(sessionId)) {
    return deny('LOCK_NOT_OWNER', 'Bạn không sở hữu lock tầng này.', lock);
  }

  lock.expires_at = new Date(Date.now() + ttlMs());
  await lock.save();
  return { ok: true, lock };
}

async function releaseMongo({ buildingId, floor, userId, sessionId, force = false, callerRole = null }) {
  const floorNum = Number(floor);
  const lock = await floorLocks.find(buildingId, floorNum);

  if (!lock || isExpired(lock)) {
    if (lock) await floorLocks.remove(lock._id);
    return { ok: true, released: false };
  }

  const isOwner =
    String(lock.user_id) === String(userId) &&
    String(lock.session_id) === String(sessionId);
  const canForce = force && ['SUPER_ADMIN', 'ORG_ADMIN'].includes(callerRole);

  if (!isOwner && !canForce) {
    return deny('LOCK_NOT_OWNER', 'Bạn không sở hữu lock tầng này.', lock);
  }

  await floorLocks.remove(lock._id);
  return { ok: true, released: true };
}

async function getStatusMongo(buildingId, floor) {
  const floorNum = Number(floor);
  const lock = await floorLocks.find(buildingId, floorNum);

  if (!lock || isExpired(lock)) {
    if (lock) await floorLocks.remove(lock._id);
    return { held: false, lock: null };
  }

  return { held: true, lock, holder: holderPayload(lock) };
}

// ---------- Public API ----------

/**
 * @param {{ buildingId, floor, userId, email, sessionId, force?, callerRole? }} opts
 */
async function acquire(opts) {
  const {
    buildingId,
    floor,
    userId,
    sessionId
  } = opts || {};

  if (!buildingId || floor === undefined || floor === null || !userId || !sessionId) {
    return deny('LOCK_BAD_REQUEST', 'Thiếu buildingId, floor, userId hoặc session_id.');
  }

  const store = getKvStore();
  if (store) {
    try {
      return await acquireKv(store, opts);
    } catch (e) {
      if (store.name === 'redis') {
        throw Object.assign(new Error('Dịch vụ khóa Redis tạm thời không khả dụng.'), {
          status: 503,
          code: 'LOCK_SERVICE_UNAVAILABLE',
          cause: e
        });
      }
      throw e;
    }
  }
  return acquireMongo(opts);
}

async function heartbeat(opts) {
  const store = getKvStore();
  if (store) {
    try {
      return await heartbeatKv(store, opts);
    } catch (e) {
      if (store.name === 'redis') {
        throw Object.assign(new Error('Dịch vụ khóa Redis tạm thời không khả dụng.'), {
          status: 503,
          code: 'LOCK_SERVICE_UNAVAILABLE',
          cause: e
        });
      }
      throw e;
    }
  }
  return heartbeatMongo(opts);
}

async function release(opts) {
  const store = getKvStore();
  if (store) {
    try {
      return await releaseKv(store, opts);
    } catch (e) {
      if (store.name === 'redis') {
        throw Object.assign(new Error('Dịch vụ khóa Redis tạm thời không khả dụng.'), {
          status: 503,
          code: 'LOCK_SERVICE_UNAVAILABLE',
          cause: e
        });
      }
      throw e;
    }
  }
  return releaseMongo(opts);
}

async function getStatus(buildingId, floor) {
  const store = getKvStore();
  if (store) {
    try {
      return await getStatusKv(store, buildingId, floor);
    } catch (e) {
      if (store.name === 'redis') {
        throw Object.assign(new Error('Dịch vụ khóa Redis tạm thời không khả dụng.'), {
          status: 503,
          code: 'LOCK_SERVICE_UNAVAILABLE',
          cause: e
        });
      }
      throw e;
    }
  }
  return getStatusMongo(buildingId, floor);
}

async function assertCanPublish(buildingId, floor, userId, sessionId) {
  const status = await getStatus(buildingId, floor);
  if (!status.held) {
    return { ok: true };
  }

  const lock = status.lock;
  const sameUser = String(lock.user_id) === String(userId);
  const sameSession = sessionId && String(lock.session_id) === String(sessionId);

  if (sameUser && (!sessionId || sameSession)) {
    return { ok: true, lock };
  }

  if (sameUser && sessionId && !sameSession) {
    return deny('LOCK_OTHER_SESSION', 'Tầng đang bị khóa bởi phiên khác của bạn.', lock);
  }

  return deny('LOCK_HELD', 'Tầng đang được người khác chỉnh sửa — không thể xuất bản.', lock);
}

async function assertLockOwner(buildingId, floor, userId, sessionId) {
  const status = await getStatus(buildingId, floor);
  if (!status.held) {
    return deny('LOCK_REQUIRED', 'Phải giữ khóa tầng trước khi lưu.');
  }
  if (!sessionId || !sameOwner(status.lock, userId, sessionId)) {
    return deny('LOCK_NOT_OWNER', 'Bạn không sở hữu khóa tầng này.', status.lock);
  }
  return { ok: true, lock: status.lock };
}

/** Dọn lock theo building (test) */
async function clearLocksForBuilding(buildingId) {
  const store = getKvStore();
  if (store?.kvClearBuilding) {
    await store.kvClearBuilding(buildingId);
  }
  await floorLocks.clearBuilding(buildingId);
}

module.exports = {
  getTtlSec,
  acquire,
  heartbeat,
  release,
  getStatus,
  assertCanPublish,
  assertLockOwner,
  isExpired,
  holderPayload,
  getBackendName,
  clearLocksForBuilding
};
