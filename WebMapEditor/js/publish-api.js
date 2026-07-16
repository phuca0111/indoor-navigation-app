// ============================================================
// PUBLISH-API.JS — WE4: Publish async v1 (202 + poll job)
// POST /api/v1/buildings/:id/floors/:floor/publish
// GET  /api/v1/publish-jobs/:jobId
// ============================================================

var PUBLISH_V1_PREFIX = '/api/v1';
var PUBLISH_POLL_INTERVAL_MS = 700;
var PUBLISH_POLL_MAX_MS = 90000;

function buildPublishUrl(buildingId, floor, suffix) {
    suffix = suffix || '';
    return PUBLISH_V1_PREFIX + '/buildings/' + encodeURIComponent(buildingId) +
        '/floors/' + encodeURIComponent(floor) + '/publish' + suffix;
}

function buildPublishJobUrl(jobId) {
    return PUBLISH_V1_PREFIX + '/publish-jobs/' + encodeURIComponent(jobId);
}

async function parseJsonResponse(resp) {
    try {
        return await resp.json();
    } catch (e) {
        return {};
    }
}

function stripMapDataForPublish(mapData) {
    if (typeof window !== 'undefined' && window.DraftApi &&
        typeof DraftApi.stripBase64BackgroundForServer === 'function') {
        return DraftApi.stripBase64BackgroundForServer(mapData);
    }
    if (!mapData || typeof mapData !== 'object') return mapData;
    var copy = Object.assign({}, mapData);
    if (typeof copy.background_image === 'string' &&
        /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(copy.background_image.trim())) {
        copy.background_image = '';
        copy._bgStrippedForServer = true;
    }
    return copy;
}

function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/**
 * POST validate (không tạo job)
 */
async function validatePublish(buildingId, floor, mapData, apiFetchFn) {
    if (!buildingId || floor == null || floor === '') {
        return { ok: false, skipped: true };
    }
    if (typeof apiFetchFn !== 'function') {
        return { ok: false, error: 'apiFetch không có' };
    }
    var body = stripMapDataForPublish(mapData);
    var resp = await apiFetchFn(buildPublishUrl(buildingId, floor, '/validate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_data: body })
    });
    var data = await parseJsonResponse(resp);
    if (resp.ok) return { ok: true, data: data, resp: resp };
    return {
        ok: false,
        status: resp.status,
        code: data.code,
        errors: data.errors || [],
        message: data.message,
        data: data,
        resp: resp
    };
}

/**
 * POST enqueue → kỳ vọng 202 + job_id
 * @param {object} options — { editSessionId }
 */
async function enqueuePublish(buildingId, floor, mapData, apiFetchFn, options) {
    options = options || {};
    if (!buildingId || floor == null || floor === '') {
        return { ok: false, skipped: true };
    }
    if (typeof apiFetchFn !== 'function') {
        return { ok: false, error: 'apiFetch không có' };
    }

    var bodyMap = stripMapDataForPublish(mapData);
    var sessionId = options.editSessionId || '';
    var headers = { 'Content-Type': 'application/json' };
    if (sessionId) headers['X-Edit-Session'] = sessionId;

    var payload = { map_data: bodyMap };
    if (sessionId) {
        payload.edit_session_id = sessionId;
        payload.session_id = sessionId;
    }

    var resp = await apiFetchFn(buildPublishUrl(buildingId, floor), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    });
    var data = await parseJsonResponse(resp);

    if (resp.status === 202 && data.job_id) {
        return {
            ok: true,
            accepted: true,
            jobId: String(data.job_id),
            status: data.status || 'QUEUED',
            data: data,
            bgStripped: !!bodyMap._bgStrippedForServer,
            resp: resp
        };
    }

    if (resp.status === 401) return { unauthorized: true, data: data, resp: resp };
    if (resp.status === 403) return { forbidden: true, data: data, message: data.message, resp: resp };
    if (resp.status === 409) {
        return {
            ok: false,
            conflict: true,
            status: 409,
            code: data.code || 'LOCK_HELD',
            holder: data.holder,
            message: data.message,
            data: data,
            resp: resp
        };
    }
    if (resp.status === 400) {
        return {
            ok: false,
            validateFailed: true,
            status: 400,
            code: data.code || 'VALIDATE_FAILED',
            errors: data.errors || [],
            message: data.message,
            data: data,
            resp: resp
        };
    }
    if (resp.status === 429) {
        return { ok: false, rateLimited: true, status: 429, message: data.message, data: data, resp: resp };
    }

    return { ok: false, status: resp.status, data: data, message: data.message, resp: resp };
}

/** GET job status */
async function fetchPublishJob(jobId, apiFetchFn) {
    if (!jobId) return { ok: false, skipped: true };
    if (typeof apiFetchFn !== 'function') {
        return { ok: false, error: 'apiFetch không có' };
    }
    var resp = await apiFetchFn(buildPublishJobUrl(jobId));
    var data = await parseJsonResponse(resp);
    if (!resp.ok) {
        return { ok: false, status: resp.status, data: data, message: data.message, resp: resp };
    }
    return {
        ok: true,
        jobId: String(data.job_id || jobId),
        status: data.status,
        version: data.version,
        error: data.error || null,
        finishedAt: data.finished_at,
        data: data,
        resp: resp
    };
}

/**
 * Poll đến SUCCESS / FAILED hoặc timeout
 * @param {function} [onProgress] — (status, jobRes) => void
 */
async function pollPublishJob(jobId, apiFetchFn, options) {
    options = options || {};
    var interval = options.intervalMs != null ? options.intervalMs : PUBLISH_POLL_INTERVAL_MS;
    var maxMs = options.maxMs != null ? options.maxMs : PUBLISH_POLL_MAX_MS;
    var onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
    var started = Date.now();
    var last = null;

    while (Date.now() - started < maxMs) {
        last = await fetchPublishJob(jobId, apiFetchFn);
        if (!last.ok) {
            if (last.status === 404) return last;
            // lỗi mạng tạm — thử lại
            await sleep(interval);
            continue;
        }
        if (onProgress) onProgress(last.status, last);
        if (last.status === 'SUCCESS' || last.status === 'FAILED') {
            return last;
        }
        await sleep(interval);
    }

    return {
        ok: false,
        timeout: true,
        status: last && last.status,
        jobId: jobId,
        message: 'Hết thời gian chờ xuất bản (job vẫn đang chạy).',
        last: last
    };
}

function statusLabelVi(status) {
    switch (status) {
        case 'QUEUED': return 'Đang xếp hàng xuất bản…';
        case 'RUNNING': return 'Đang xuất bản…';
        case 'SUCCESS': return 'Đã xuất bản';
        case 'FAILED': return 'Xuất bản thất bại';
        default: return status || '—';
    }
}

var PublishApi = {
    PUBLISH_V1_PREFIX: PUBLISH_V1_PREFIX,
    buildPublishUrl: buildPublishUrl,
    buildPublishJobUrl: buildPublishJobUrl,
    stripMapDataForPublish: stripMapDataForPublish,
    validatePublish: validatePublish,
    enqueuePublish: enqueuePublish,
    fetchPublishJob: fetchPublishJob,
    pollPublishJob: pollPublishJob,
    statusLabelVi: statusLabelVi
};

if (typeof window !== 'undefined') {
    window.PublishApi = PublishApi;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PublishApi;
}
