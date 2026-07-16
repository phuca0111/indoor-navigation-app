// ============================================================
// DRAFT-API.JS — WE2: Draft API v1 helpers (browser + vitest)
// GET/PUT /api/v1/buildings/:id/floors/:floor/draft
// ============================================================

var DRAFT_V1_PREFIX = '/api/v1';

function buildDraftUrl(buildingId, floor) {
    return DRAFT_V1_PREFIX + '/buildings/' + encodeURIComponent(buildingId) +
        '/floors/' + encodeURIComponent(floor) + '/draft';
}

function isBase64DataUrl(value) {
    return typeof value === 'string' &&
        /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(value.trim());
}

/** Phase 2d: server từ chối Base64 trong background_image — bỏ trước khi PUT. */
function stripBase64BackgroundForServer(mapData) {
    if (!mapData || typeof mapData !== 'object') return mapData;
    var copy = Object.assign({}, mapData);
    if (isBase64DataUrl(copy.background_image)) {
        copy.background_image = '';
        copy._bgStrippedForServer = true;
    }
    return copy;
}

/** Draft mới tạo server có rooms/nodes/edges rỗng — chỉ coi là có nội dung khi thực sự có geometry. */
function isDraftPayloadMeaningful(payload) {
    if (!payload || typeof payload !== 'object') return false;

    var arrayKeys = [
        'rooms', 'walls', 'doors', 'pois', 'pathNodes', 'pathEdges',
        'lines', 'blocks', 'blockInserts', 'dimensions', 'qrs',
        'nodes', 'edges'
    ];
    for (var i = 0; i < arrayKeys.length; i++) {
        var k = arrayKeys[i];
        if (Array.isArray(payload[k]) && payload[k].length > 0) return true;
    }

    if (payload.background_image && String(payload.background_image).trim() !== '') {
        return true;
    }

    if (payload.mapName && String(payload.mapName).trim() !== '' &&
        String(payload.mapName).trim() !== 'Bản đồ mới') {
        return true;
    }

    return false;
}

async function parseJsonResponse(resp) {
    try {
        return await resp.json();
    } catch (e) {
        return {};
    }
}

/**
 * @param {string} buildingId
 * @param {string|number} floor
 * @param {function} apiFetchFn — apiFetch từ api.js (có auth)
 */
async function fetchDraft(buildingId, floor, apiFetchFn) {
    if (!buildingId || floor == null || floor === '') {
        return { ok: false, skipped: true };
    }
    if (typeof apiFetchFn !== 'function') {
        return { ok: false, error: 'apiFetch không có' };
    }

    var url = buildDraftUrl(buildingId, floor);
    var resp = await apiFetchFn(url);

    if (resp.status === 401) return { unauthorized: true, resp: resp };
    if (resp.status === 403) {
        var forbiddenData = await parseJsonResponse(resp);
        return { forbidden: true, data: forbiddenData, resp: resp };
    }
    if (!resp.ok) {
        var errData = await parseJsonResponse(resp);
        return { ok: false, status: resp.status, data: errData, resp: resp };
    }

    var data = await parseJsonResponse(resp);
    return {
        ok: true,
        payload: data.payload || null,
        version: data.version,
        updatedAt: data.updatedAt,
        updated_by: data.updated_by,
        resp: resp
    };
}

/**
 * @param {string} buildingId
 * @param {string|number} floor
 * @param {object} mapData
 * @param {function} apiFetchFn
 */
async function putDraft(buildingId, floor, mapData, apiFetchFn) {
    if (!buildingId || floor == null || floor === '') {
        return { ok: false, skipped: true };
    }
    if (typeof apiFetchFn !== 'function') {
        return { ok: false, error: 'apiFetch không có' };
    }

    var body = stripBase64BackgroundForServer(mapData);
    var url = buildDraftUrl(buildingId, floor);
    var resp = await apiFetchFn(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_data: body })
    });

    var data = await parseJsonResponse(resp);

    if (resp.status === 401) return { unauthorized: true, data: data, resp: resp };
    if (resp.status === 403) return { forbidden: true, data: data, resp: resp };
    if (!resp.ok) {
        return { ok: false, status: resp.status, data: data, resp: resp };
    }

    return {
        ok: true,
        version: data.version,
        updatedAt: data.updatedAt,
        message: data.message,
        bgStripped: !!body._bgStrippedForServer,
        resp: resp
    };
}

var DraftApi = {
    DRAFT_V1_PREFIX: DRAFT_V1_PREFIX,
    buildDraftUrl: buildDraftUrl,
    isBase64DataUrl: isBase64DataUrl,
    stripBase64BackgroundForServer: stripBase64BackgroundForServer,
    isDraftPayloadMeaningful: isDraftPayloadMeaningful,
    fetchDraft: fetchDraft,
    putDraft: putDraft
};

if (typeof window !== 'undefined') {
    window.DraftApi = DraftApi;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DraftApi;
}
