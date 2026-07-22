import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Pois = require('../js/pois.js');

describe('POI types và kích thước', function () {
    it('giữ nguyên index dữ liệu cũ và bổ sung loại mới', function () {
        expect(Pois.poiTypes[0].key).toBe('TOILET');
        expect(Pois.poiTypes[7].key).toBe('OTHER');
        expect(Pois.poiTypes.some(function (item) { return item.key === 'PARKING'; })).toBe(true);
        expect(Pois.poiTypes.some(function (item) { return item.key === 'MEDICAL'; })).toBe(true);
        expect(Pois.poiTypes.some(function (item) { return item.key === 'FIRE_EXTINGUISHER'; })).toBe(true);
    });

    it('giới hạn kích thước từ 12 đến 96 px và mặc định 24 px', function () {
        expect(Pois.normalizePoiSize(undefined)).toBe(24);
        expect(Pois.normalizePoiSize(4)).toBe(12);
        expect(Pois.normalizePoiSize(64)).toBe(64);
        expect(Pois.normalizePoiSize(120)).toBe(96);
    });

    it('ưu tiên mã loại ổn định và vẫn đọc typeIndex cũ', function () {
        expect(Pois.getPoiTypeInfo({ poiType: 'MEDICAL', typeIndex: 0 }).key).toBe('MEDICAL');
        expect(Pois.getPoiTypeInfo({ typeIndex: 1 }).key).toBe('ELEVATOR');
        expect(Pois.getPoiTypeInfo({ typeIndex: 999 }).key).toBe('OTHER');
    });
});
