import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Region = require('../core/region-tool.js');

describe('RegionTool', function () {
    it('chấp nhận polyline có cờ closed', function () {
        var out = Region.createRegionData({
            id: 7,
            closed: true,
            layerId: 'A-WALL',
            points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }]
        });
        expect(out.ok).toBe(true);
        expect(out.points).toHaveLength(3);
        expect(out.layerId).toBe('A-WALL');
        expect(out.sourceId).toBe(7);
    });

    it('loại điểm cuối trùng điểm đầu', function () {
        var out = Region.normalizeClosedPolyline({
            points: [
                { x: 0, y: 0 }, { x: 10, y: 0 },
                { x: 10, y: 10 }, { x: 0, y: 0 }
            ]
        });
        expect(out.ok).toBe(true);
        expect(out.points).toHaveLength(3);
    });

    it('từ chối polyline mở', function () {
        var out = Region.createRegionData({
            points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
        });
        expect(out.ok).toBe(false);
        expect(out.code).toBe('REGION_NOT_CLOSED');
    });

    it('từ chối ít điểm hoặc tọa độ lỗi', function () {
        expect(Region.createRegionData({
            closed: true,
            points: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
        }).code).toBe('REGION_TOO_FEW_POINTS');
        expect(Region.createRegionData({
            closed: true,
            points: [{ x: 0, y: 0 }, { x: 'x', y: 1 }, { x: 2, y: 2 }]
        }).code).toBe('REGION_INVALID_POINT');
    });
});
