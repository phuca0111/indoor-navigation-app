import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Document } = require('../core/document.js');
const {
    buildPublishPayloadFromDocument,
    assertPublishSchema
} = require('../core/map-adapter.js');
const { validateMapData } = require('../core/validation-engine.js');

/**
 * Mô phỏng LegacyBridge.buildPublishPayloadFromEditor (browser-only IIFE).
 */
function buildPublishPayloadFromEditorMock(legacyState) {
    const doc = new Document();
    doc.fromLegacyState(legacyState);
    return buildPublishPayloadFromDocument(doc);
}

describe('Export Pipeline — PHASE0_STABLE path', function () {
    it('Document → adapter → schema + validation pass', function () {
        const mapData = buildPublishPayloadFromEditorMock({
            mapName: 'Test',
            scaleRatio: 0.5,
            mapBearingOffset: 0,
            backgroundImage: '',
            rooms: [{ id: 1, name: 'P1', shape: 'rect', x: 0, y: 0, width: 80, height: 80 }],
            doors: [],
            pois: [],
            pathNodes: [
                { id: 1, x: 10, y: 10, neighbors: [2], nodeType: 'normal' },
                { id: 2, x: 50, y: 10, neighbors: [1], nodeType: 'normal' }
            ],
            pathEdges: [{ from: 1, to: 2, distance: 0 }],
            walls: [],
            qrs: [{ id: 1, serial: 'QR-001', name: 'Lobby', x: 10, y: 10, node_id: 1 }]
        });

        expect(assertPublishSchema(mapData)).toBe(true);
        const validation = validateMapData(mapData);
        expect(validation.ok).toBe(true);
        expect(mapData.scale_ratio).toBe(0.5);
        expect(mapData.qr_anchors[0].node_id).toBe(1);
    });
});
