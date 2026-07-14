// Phase 8 — Floor edit lock (advisory soft lock, TTL Mongo)
const FloorEditLock = require('../models/FloorEditLock');

function getTtlSec() {
  const n = Number(process.env.FLOOR_EDIT_LOCK_TTL_SEC);
  return Number.isFinite(n) && n > 0 ? n : 120;
}

function ttlMs() {
  return getTtlSec() * 1000;
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
    expires_at: lock.expires_at
  };
}

function deny(code, message, lock) {
  const err = {
    ok: false,
    code,
    message,
    holder: holderPayload(lock)
  };
  return err;
}

/**
 * @param {{ buildingId, floor, userId, email, sessionId, force?, callerRole? }} opts
 */
async function acquire(opts) {
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
  const now = new Date();
  const expiresAt = new Date(Date.now() + ttlMs());
  const canForce = force && ['SUPER_ADMIN', 'ORG_ADMIN'].includes(callerRole);

  let lock = await FloorEditLock.findOne({
    building_id: buildingId,
    floor_number: floorNum
  });

  if (lock && isExpired(lock)) {
    await FloorEditLock.deleteOne({ _id: lock._id });
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
      // force: cướp quyền cùng user (hoặc admin)
    } else if (String(lock.user_id) !== String(userId)) {
      if (!canForce) {
        return deny('LOCK_HELD', 'Tầng đang được người khác chỉnh sửa.', lock);
      }
    }

    lock.user_id = userId;
    lock.user_email = email || '';
    lock.session_id = sessionId;
    lock.expires_at = expiresAt;
    await lock.save();
    return { ok: true, lock, forced: true };
  }

  lock = await FloorEditLock.findOneAndUpdate(
    { building_id: buildingId, floor_number: floorNum },
    {
      $set: {
        user_id: userId,
        user_email: email || '',
        session_id: sessionId,
        expires_at: expiresAt
      },
      $setOnInsert: {
        building_id: buildingId,
        floor_number: floorNum
      }
    },
    { upsert: true, returnDocument: 'after' }
  );

  return { ok: true, lock, created: true };
}

async function heartbeat({ buildingId, floor, userId, sessionId }) {
  const floorNum = Number(floor);
  const lock = await FloorEditLock.findOne({
    building_id: buildingId,
    floor_number: floorNum
  });

  if (!lock || isExpired(lock)) {
    if (lock) await FloorEditLock.deleteOne({ _id: lock._id });
    return deny('LOCK_NOT_HELD', 'Không có lock hợp lệ để heartbeat.');
  }

  if (String(lock.user_id) !== String(userId) || String(lock.session_id) !== String(sessionId)) {
    return deny('LOCK_NOT_OWNER', 'Bạn không sở hữu lock tầng này.', lock);
  }

  lock.expires_at = new Date(Date.now() + ttlMs());
  await lock.save();
  return { ok: true, lock };
}

async function release({ buildingId, floor, userId, sessionId, force = false, callerRole = null }) {
  const floorNum = Number(floor);
  const lock = await FloorEditLock.findOne({
    building_id: buildingId,
    floor_number: floorNum
  });

  if (!lock || isExpired(lock)) {
    if (lock) await FloorEditLock.deleteOne({ _id: lock._id });
    return { ok: true, released: false };
  }

  const isOwner =
    String(lock.user_id) === String(userId) &&
    String(lock.session_id) === String(sessionId);
  const canForce = force && ['SUPER_ADMIN', 'ORG_ADMIN'].includes(callerRole);

  if (!isOwner && !canForce) {
    return deny('LOCK_NOT_OWNER', 'Bạn không sở hữu lock tầng này.', lock);
  }

  await FloorEditLock.deleteOne({ _id: lock._id });
  return { ok: true, released: true };
}

async function getStatus(buildingId, floor) {
  const floorNum = Number(floor);
  const lock = await FloorEditLock.findOne({
    building_id: buildingId,
    floor_number: floorNum
  });

  if (!lock || isExpired(lock)) {
    if (lock) await FloorEditLock.deleteOne({ _id: lock._id });
    return { held: false, lock: null };
  }

  return { held: true, lock, holder: holderPayload(lock) };
}

/**
 * Soft lock: chỉ chặn publish khi người khác (khác user hoặc khác session) đang giữ.
 * Không có lock → cho phép publish.
 */
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

module.exports = {
  getTtlSec,
  acquire,
  heartbeat,
  release,
  getStatus,
  assertCanPublish,
  isExpired,
  holderPayload
};
