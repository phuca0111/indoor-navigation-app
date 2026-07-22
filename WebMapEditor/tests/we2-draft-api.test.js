import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DraftApi = require('../js/draft-api.js');

describe('WE2 — Draft API helpers', function () {
    it('buildDraftUrl đúng path v1', function () {
        expect(DraftApi.buildDraftUrl('b123', '0')).toBe(
            '/api/v1/buildings/b123/floors/0/draft'
        );
        expect(DraftApi.buildDraftUrl('id/with space', 2)).toBe(
            '/api/v1/buildings/id%2Fwith%20space/floors/2/draft'
        );
    });

    it('isBase64DataUrl nhận diện data URL', function () {
        expect(DraftApi.isBase64DataUrl('data:image/png;base64,abc')).toBe(true);
        expect(DraftApi.isBase64DataUrl('/uploads/bg.png')).toBe(false);
        expect(DraftApi.isBase64DataUrl('')).toBe(false);
    });

    it('stripBase64BackgroundForServer bỏ Base64, giữ URL', function () {
        var withB64 = {
            mapName: 'T1',
            background_image: 'data:image/png;base64,xx'
        };
        var stripped = DraftApi.stripBase64BackgroundForServer(withB64);
        expect(stripped.background_image).toBe('');
        expect(stripped._bgStrippedForServer).toBe(true);

        var withUrl = {
            mapName: 'T2',
            background_image: '/uploads/maps/bg.png'
        };
        var kept = DraftApi.stripBase64BackgroundForServer(withUrl);
        expect(kept.background_image).toBe('/uploads/maps/bg.png');
        expect(kept._bgStrippedForServer).toBeUndefined();
    });

    it('isDraftPayloadMeaningful — rỗng vs có geometry', function () {
        expect(DraftApi.isDraftPayloadMeaningful({ rooms: [], nodes: [], edges: [] })).toBe(false);
        expect(DraftApi.isDraftPayloadMeaningful({ rooms: [{ id: 1 }] })).toBe(true);
        expect(DraftApi.isDraftPayloadMeaningful({ walls: [{ id: 1, points: [] }] })).toBe(true);
        expect(DraftApi.isDraftPayloadMeaningful({ background_image: '/uploads/x.png' })).toBe(true);
        expect(DraftApi.isDraftPayloadMeaningful({ mapName: 'Bản đồ mới' })).toBe(false);
        expect(DraftApi.isDraftPayloadMeaningful({ mapName: 'Tầng 1 lobby' })).toBe(true);
    });
});

describe('WE2 — fetchDraft / putDraft', function () {
    it('fetchDraft trả payload khi 200', async function () {
        var mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async function () {
                return {
                    payload: { rooms: [{ id: 1 }] },
                    version: 3,
                    updatedAt: '2026-07-16T10:00:00.000Z'
                };
            }
        });

        var res = await DraftApi.fetchDraft('b1', 0, mockFetch);
        expect(mockFetch).toHaveBeenCalledWith('/api/v1/buildings/b1/floors/0/draft');
        expect(res.ok).toBe(true);
        expect(res.payload.rooms).toHaveLength(1);
        expect(res.version).toBe(3);
    });

    it('putDraft gửi map_data đã strip Base64', async function () {
        var mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async function () {
                return { message: 'OK', version: 4, updatedAt: '2026-07-16T11:00:00.000Z' };
            }
        });

        var res = await DraftApi.putDraft('b1', 1, {
            rooms: [],
            background_image: 'data:image/jpeg;base64,abc'
        }, mockFetch);

        expect(res.ok).toBe(true);
        expect(res.version).toBe(4);
        expect(res.bgStripped).toBe(true);

        var call = mockFetch.mock.calls[0];
        expect(call[0]).toBe('/api/v1/buildings/b1/floors/1/draft');
        expect(call[1].method).toBe('PUT');
        expect(call[1].headers['If-Match']).toBe('"draft-0"');
        var body = JSON.parse(call[1].body);
        expect(body.expected_version).toBe(0);
        expect(body.map_data.background_image).toBe('');
        expect(body.map_data._bgStrippedForServer).toBe(true);
    });

    it('ghi nhớ ETag và báo conflict 409 rõ', async function () {
        var fetchOk = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: function () { return '"draft-8"'; } },
            json: async function () {
                return { payload: { rooms: [] }, version: 8 };
            }
        });
        await DraftApi.fetchDraft('b-conflict', 2, fetchOk);
        expect(DraftApi.getDraftRevision('b-conflict', 2).etag).toBe('"draft-8"');

        var fetchConflict = vi.fn().mockResolvedValue({
            ok: false,
            status: 409,
            json: async function () {
                return {
                    code: 'DRAFT_CONFLICT',
                    message: 'Bản nháp đã đổi.',
                    current: { version: 9 }
                };
            }
        });
        var result = await DraftApi.putDraft('b-conflict', 2, { rooms: [] }, fetchConflict);
        expect(fetchConflict.mock.calls[0][1].headers['If-Match']).toBe('"draft-8"');
        expect(result).toMatchObject({
            ok: false,
            conflict: true,
            code: 'DRAFT_CONFLICT',
            current: { version: 9 }
        });
        expect(DraftApi.getDraftRevision('b-conflict', 2).version).toBe(9);
    });

    it('putDraft trả lỗi 400 từ server', async function () {
        var mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async function () {
                return { message: 'Thiếu map_data trong body.' };
            }
        });

        var res = await DraftApi.putDraft('b1', 0, null, mockFetch);
        expect(res.ok).toBe(false);
        expect(res.status).toBe(400);
    });
});
