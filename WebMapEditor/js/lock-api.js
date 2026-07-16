// ============================================================
// LOCK-API.JS — WE3: Floor lock API v1 helpers (browser)
// GET/POST /api/v1/buildings/:id/floors/:floor/lock
// ============================================================

var LOCK_V1_PREFIX = '/api/v1';

function buildLockUrl(buildingId, floor, suffix) {
    suffix = suffix || '';
    return LOCK_V1_PREFIX + '/buildings/' + encodeURIComponent(buildingId) +
        '/floors/' + encodeURIComponent(floor) + '/lock' + suffix;
}

async function parseJsonResponse(resp) {
    try {
        return await resp.json();
    } catch (e) {
        return {};
    }
}

function formatHolder(holder) {
    if (!holder) return 'người khác';
    return holder.user_email || holder.email || holder.full_name || holder.name || 'người khác';
}

/**
 * POST acquire / renew lock
 * @param {function} apiFetchFn — apiFetch từ api.js (có auth)
 */
async function acquireLock(buildingId, floor, sessionId, force, apiFetchFn) {
    if (!buildingId || floor == null || floor === '') {
        return { ok: false, skipped: true };
    }
    if (!sessionId) {
        return { ok: false, error: 'Thiếu session_id' };
    }
    if (typeof apiFetchFn !== 'function') {
        return { ok: false, error: 'apiFetch không có' };
    }

    var resp = await apiFetchFn(buildLockUrl(buildingId, floor), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, force: !!force })
    });
    var data = await parseJsonResponse(resp);

    if (resp.status === 401) return { unauthorized: true, data: data, resp: resp };
    if (resp.status === 403) return { forbidden: true, data: data, resp: resp };
    if (resp.ok) {
        return {
            ok: true,
            renewed: !!(data.message && String(data.message).indexOf('Gia hạn') >= 0),
            lock: data.lock || null,
            ttl_sec: data.ttl_sec,
            data: data,
            resp: resp
        };
    }
    if (resp.status === 409) {
        return {
            ok: false,
            conflict: true,
            status: 409,
            code: data.code || 'LOCK_HELD',
            holder: data.holder || null,
            message: data.message,
            data: data,
            resp: resp
        };
    }
    return { ok: false, status: resp.status, data: data, resp: resp };
}

/** POST heartbeat — gia hạn TTL */
async function heartbeatLock(buildingId, floor, sessionId, apiFetchFn) {
    if (!buildingId || floor == null || floor === '' || !sessionId) {
        return { ok: false, skipped: true };
    }
    if (typeof apiFetchFn !== 'function') {
        return { ok: false, error: 'apiFetch không có' };
    }

    var resp = await apiFetchFn(buildLockUrl(buildingId, floor, '/heartbeat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
    });
    var data = await parseJsonResponse(resp);

    if (resp.ok) {
        return { ok: true, expires_at: data.expires_at, data: data, resp: resp };
    }
    if (resp.status === 409) {
        return {
            ok: false,
            conflict: true,
            status: 409,
            code: data.code || 'LOCK_HELD',
            holder: data.holder || null,
            message: data.message,
            data: data,
            resp: resp
        };
    }
    return { ok: false, status: resp.status, data: data, resp: resp };
}

/** POST release */
async function releaseLock(buildingId, floor, sessionId, apiFetchFn, options) {
    options = options || {};
    if (!buildingId || floor == null || floor === '') {
        return { ok: false, skipped: true };
    }
    if (typeof apiFetchFn !== 'function') {
        return { ok: false, error: 'apiFetch không có' };
    }

    var body = { session_id: sessionId || '' };
    if (options.force) body.force = true;

    var resp = await apiFetchFn(buildLockUrl(buildingId, floor, '/release'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    var data = await parseJsonResponse(resp);

    if (resp.ok) {
        return { ok: true, released: !!data.released, data: data, resp: resp };
    }
    return { ok: false, status: resp.status, data: data, resp: resp };
}

/** GET lock status (không acquire) */
async function fetchLockStatus(buildingId, floor, apiFetchFn) {
    if (!buildingId || floor == null || floor === '') {
        return { ok: false, skipped: true };
    }
    if (typeof apiFetchFn !== 'function') {
        return { ok: false, error: 'apiFetch không có' };
    }

    var resp = await apiFetchFn(buildLockUrl(buildingId, floor));
    var data = await parseJsonResponse(resp);

    if (!resp.ok) {
        return { ok: false, status: resp.status, data: data, resp: resp };
    }
    return {
        ok: true,
        held: !!data.held,
        holder: data.holder || (data.lock && {
            user_email: data.lock.user_email,
            user_id: data.lock.user_id
        }) || null,
        lock: data.lock || null,
        data: data,
        resp: resp
    };
}

var LockApi = {
    LOCK_V1_PREFIX: LOCK_V1_PREFIX,
    buildLockUrl: buildLockUrl,
    formatHolder: formatHolder,
    acquireLock: acquireLock,
    heartbeatLock: heartbeatLock,
    releaseLock: releaseLock,
    fetchLockStatus: fetchLockStatus
};

if (typeof window !== 'undefined') {
    window.LockApi = LockApi;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LockApi;
}
