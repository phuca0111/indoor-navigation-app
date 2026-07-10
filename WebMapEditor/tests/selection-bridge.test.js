import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../core/event-bus.js');
const Selection = require('../core/selection-manager.js');
const EventBus = globalThis.EditorCore.eventBus;
const Bridge = require('../core/selection-bridge.js');

describe('SelectionBridge — legacy ↔ SelectionManager', function () {
    var legacyApplied;

    beforeEach(function () {
        globalThis.rooms = [{ id: 1, name: 'Phòng A', shape: 'rect', x: 0, y: 0, width: 100, height: 80 }];
        globalThis.walls = [{ id: 10, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
        globalThis.lines = [{ id: 20, points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] }];
        globalThis.doors = [];
        globalThis.pois = [];
        globalThis.qrs = [];
        globalThis.pathNodes = [];

        globalThis.EditorCore = globalThis.EditorCore || {};
        globalThis.EditorCore.eventBus = EventBus;
        globalThis.EditorCore.SelectionManager = Selection;
        Selection.init({ eventBus: EventBus });
        legacyApplied = null;

        Bridge.init({
            eventBus: EventBus,
            onLegacySelectionApplied: function (type, data) {
                legacyApplied = { type: type, data: data };
            }
        });
    });

    it('resolveLegacyObject tìm đúng phòng theo id', function () {
        var room = Bridge.resolveLegacyObject({ id: 1, type: 'room' });
        expect(room).not.toBeNull();
        expect(room.name).toBe('Phòng A');
    });

    it('resolveLegacyObject tìm tường và đoạn thẳng', function () {
        var wall = Bridge.resolveLegacyObject({ id: 10, type: 'wall' });
        var line = Bridge.resolveLegacyObject({ id: 20, type: 'line' });
        expect(wall.points).toHaveLength(2);
        expect(line.points).toHaveLength(2);
    });

    it('refFromLegacy map selectedObject → ref', function () {
        var ref = Bridge.refFromLegacy({ type: 'wall', data: { id: 10 } }, null);
        expect(ref).toEqual({ id: 10, type: 'wall' });
    });

    it('syncToSelectionManager cập nhật SelectionManager', function () {
        Bridge.syncToSelectionManager({ type: 'line', data: { id: 20 } }, null);
        expect(Selection.getPrimary()).toEqual({ id: 20, type: 'line' });
        expect(Selection.isSelected({ id: 20, type: 'line' })).toBe(true);
    });

    it('selection:changed từ manager → callback legacy', function () {
        Selection.select({ id: 1, type: 'room' });
        expect(legacyApplied).not.toBeNull();
        expect(legacyApplied.type).toBe('room');
        expect(legacyApplied.data.name).toBe('Phòng A');
    });

    it('clear manager → callback legacy null', function () {
        Selection.select({ id: 10, type: 'wall' });
        Selection.clear();
        expect(legacyApplied.type).toBeNull();
        expect(legacyApplied.data).toBeNull();
    });
});
