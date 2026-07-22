// ============================================
// FILE: floorLockMemoryStore.js
// Phase 2b — In-memory lock (SET NX EX tương đương Redis)
// Dùng khi không có Redis (Jest / dev)
// ============================================

const store = new Map(); // key -> { payload, expiresAtMs }
const fences = new Map();

function lockKey(buildingId, floorNumber) {
  return `lock:floor:${buildingId}:${floorNumber}`;
}

function nowMs() {
  return Date.now();
}

function getEntry(key) {
  const e = store.get(key);
  if (!e) return null;
  if (e.expiresAtMs <= nowMs()) {
    store.delete(key);
    return null;
  }
  return e;
}

function parsePayload(e) {
  if (!e) return null;
  return { ...e.payload, expires_at: new Date(e.expiresAtMs) };
}

async function kvGet(buildingId, floorNumber) {
  const e = getEntry(lockKey(buildingId, floorNumber));
  return parsePayload(e);
}

/** SET key NX EX — trả payload nếu set được, null nếu đã bị giữ */
async function kvSetNx(buildingId, floorNumber, payload, ttlSec) {
  const key = lockKey(buildingId, floorNumber);
  if (getEntry(key)) return null;
  const expiresAtMs = nowMs() + ttlSec * 1000;
  const fencing_token = (fences.get(key) || 0) + 1;
  fences.set(key, fencing_token);
  const body = {
    building_id: String(buildingId),
    floor_number: Number(floorNumber),
    user_id: String(payload.user_id),
    user_email: payload.user_email || '',
    session_id: String(payload.session_id),
    fencing_token
  };
  store.set(key, { payload: body, expiresAtMs });
  return { ...body, expires_at: new Date(expiresAtMs) };
}

async function kvSet(buildingId, floorNumber, payload, ttlSec) {
  const key = lockKey(buildingId, floorNumber);
  const expiresAtMs = nowMs() + ttlSec * 1000;
  const fencing_token = (fences.get(key) || 0) + 1;
  fences.set(key, fencing_token);
  const body = {
    building_id: String(buildingId),
    floor_number: Number(floorNumber),
    user_id: String(payload.user_id),
    user_email: payload.user_email || '',
    session_id: String(payload.session_id),
    fencing_token
  };
  store.set(key, { payload: body, expiresAtMs });
  return { ...body, expires_at: new Date(expiresAtMs) };
}

async function kvExpire(buildingId, floorNumber, ttlSec) {
  const key = lockKey(buildingId, floorNumber);
  const e = getEntry(key);
  if (!e) return false;
  e.expiresAtMs = nowMs() + ttlSec * 1000;
  store.set(key, e);
  return true;
}

async function kvDel(buildingId, floorNumber) {
  return store.delete(lockKey(buildingId, floorNumber));
}

async function kvClearBuilding(buildingId) {
  const prefix = `lock:floor:${buildingId}:`;
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

function kvClearAll() {
  store.clear();
  fences.clear();
}

module.exports = {
  name: 'memory',
  kvGet,
  kvSetNx,
  kvSet,
  kvExpire,
  kvDel,
  kvClearBuilding,
  kvClearAll
};
