/**
 * Floor key: số 0 là falsy; chuỗi "0" thì truthy trong JS.
 * select.value luôn là string → "0" OK với if(value).
 * Cần cẩn thận khi floor là number 0 (setFloor(0) trước khi String()).
 */
import { describe, it, expect } from 'vitest';

function resolveFloorValue(selectValue, ctxFloor, fallback) {
    if (selectValue != null && String(selectValue) !== '') return String(selectValue);
    if (ctxFloor != null && String(ctxFloor) !== '') return String(ctxFloor);
    return fallback != null ? String(fallback) : '1';
}

function storageNamespace(userId, buildingId, floor) {
    var f = (floor != null && String(floor) !== '') ? String(floor) : '1';
    return [userId || 'anon', buildingId || 'default', f].join('_');
}

describe('Autosave floor key (tầng 0)', function () {
    it('select.value "0" (string) là truthy — if(value) vẫn OK', function () {
        expect(Boolean('0')).toBe(true);
        expect(('0' || '1')).toBe('0');
        expect(resolveFloorValue('0', '1', '1')).toBe('0');
    });

    it('number 0 là falsy — pattern || sẽ nhầm thành 1', function () {
        expect(Boolean(0)).toBe(false);
        expect((0 || '1')).toBe('1');
        expect(resolveFloorValue(0, null, '1')).toBe('0'); // đã String-safe
    });

    it('storageNamespace giữ _0 với string hoặc number', function () {
        expect(storageNamespace('u', 'b', '0')).toBe('u_b_0');
        expect(storageNamespace('u', 'b', 0)).toBe('u_b_0');
    });
});
