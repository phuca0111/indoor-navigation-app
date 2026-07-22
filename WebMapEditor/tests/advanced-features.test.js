import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Constraints = require('../core/constraint-engine.js');
const XRef = require('../core/xref-manager.js');
const Marketplace = require('../core/plugin-marketplace.js');
const Twin = require('../core/digital-twin.js');
const Blocks = require('../core/block-manager.js');

describe('ConstraintEngine MVP', function () {
    it('giải horizontal, vertical và fixed distance', function () {
        var line = { id: 1, points: [{ x: 0, y: 0 }, { x: 3, y: 4 }] };
        expect(Constraints.apply(line, {
            type: 'distance', objectId: 1, a: 0, b: 1, value: 10
        })).toBe(true);
        expect(Math.hypot(line.points[1].x, line.points[1].y)).toBeCloseTo(10, 6);
        Constraints.apply(line, { type: 'horizontal', objectId: 1, a: 0, b: 1 });
        expect(line.points[1].y).toBe(0);
        Constraints.apply(line, { type: 'vertical', objectId: 1, a: 0, b: 1 });
        expect(line.points[1].x).toBe(0);
    });

    it('solve bỏ constraint lỗi và áp theo object id/type', function () {
        var wall = { id: 'w1', points: [{ x: 1, y: 2 }, { x: 7, y: 9 }] };
        var result = Constraints.solve([{ type: 'wall', data: wall }], [
            { type: 'horizontal', objectType: 'wall', objectId: 'w1', a: 0, b: 1 },
            { type: 'unknown', objectType: 'wall', objectId: 'w1' }
        ], 1);
        expect(result.constraints).toHaveLength(1);
        expect(result.applied).toBe(1);
        expect(wall.points[1].y).toBe(2);
    });

    it('giải parallel, perpendicular và equalLength giữa hai đối tượng', function () {
        var source = { id: 'a', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
        var target = { id: 'b', points: [{ x: 20, y: 20 }, { x: 23, y: 24 }] };
        var refs = [{ type: 'line', data: source }, { type: 'line', data: target }];
        var base = {
            objectType: 'line', objectId: 'a', a: 0, b: 1,
            otherObjectType: 'line', otherObjectId: 'b', c: 0, d: 1
        };
        Constraints.solve(refs, [Object.assign({ type: 'parallel' }, base)], 1);
        expect(target.points[1].y).toBeCloseTo(20, 6);
        expect(Math.hypot(target.points[1].x - 20, target.points[1].y - 20)).toBeCloseTo(5, 6);

        target.points[1] = { x: 23, y: 24 };
        Constraints.solve(refs, [Object.assign({ type: 'perpendicular' }, base)], 1);
        expect(target.points[1].x).toBeCloseTo(20, 6);
        expect(target.points[1].y).toBeCloseTo(25, 6);

        target.points[1] = { x: 23, y: 24 };
        Constraints.solve(refs, [Object.assign({ type: 'equalLength' }, base)], 1);
        expect(Math.hypot(target.points[1].x - 20, target.points[1].y - 20)).toBeCloseTo(10, 6);
    });

    it('phát hiện fixed point, distance và orientation xung đột', function () {
        var constraints = [
            { id: 'f1', type: 'fixedPoint', objectId: 1, a: 0, x: 0, y: 0 },
            { id: 'f2', type: 'fixedPoint', objectId: 1, a: 0, x: 1, y: 0 },
            { id: 'd1', type: 'distance', objectId: 1, a: 0, b: 1, value: 10 },
            { id: 'd2', type: 'distance', objectId: 1, a: 0, b: 1, value: 20 },
            { id: 'h1', type: 'horizontal', objectId: 2, a: 0, b: 1 },
            { id: 'v1', type: 'vertical', objectId: 2, a: 0, b: 1 }
        ];
        var conflicts = Constraints.detectConflicts(constraints);
        expect(conflicts.map(function (item) { return item.code; })).toEqual([
            'CONFLICT_FIXED_POINT', 'CONFLICT_DISTANCE', 'CONFLICT_ORIENTATION'
        ]);
        var graph = Constraints.buildGraph(constraints);
        expect(graph.nodes).toContain('line:1');
        expect(graph.edges).toHaveLength(6);
    });
});

describe('XRefManager MVP', function () {
    it('resolve snapshot ở chế độ khóa với transform', function () {
        var ref = XRef.normalize({
            id: 'x1', name: 'Tầng mẫu', x: 100, y: 50, scale: 2, rotation: 90,
            snapshot: { lines: [{ id: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }] }
        });
        var entities = XRef.resolve(ref);
        expect(entities).toHaveLength(1);
        expect(entities[0].data._xrefLocked).toBe(true);
        expect(entities[0].data.points[1].x).toBeCloseTo(100, 6);
        expect(entities[0].data.points[1].y).toBeCloseTo(70, 6);
    });

    it('store hỗ trợ unload/load và refresh có version/checksum', async function () {
        var store = XRef.createStore([], { currentProjectId: 'p-main' });
        var attached = store.attach({
            id: 'x2', name: 'Tầng server',
            source: { type: 'project', projectId: 'p-child', version: 1 },
            snapshot: { lines: [{ id: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }] }
        });
        expect(attached.ok).toBe(true);
        expect(store.unload('x2')).toBe(true);
        expect(XRef.resolve(store.get('x2'))).toHaveLength(0);
        expect(store.load('x2')).toBe(true);
        var refreshed = await store.refresh('x2', async function () {
            return {
                version: 7,
                snapshot: { lines: [{ id: 2, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }] }
            };
        });
        expect(refreshed.ok).toBe(true);
        expect(refreshed.ref.version).toBe(7);
        expect(refreshed.ref.checksum).toMatch(/^[0-9a-f]{8}$/);
    });

    it('chặn vòng tham chiếu cross-project và snapshot vượt giới hạn', function () {
        var cycles = XRef.detectReferenceCycles([{
            id: 'cycle', name: 'Cycle',
            source: { type: 'project', projectId: 'p-child' },
            dependencies: ['p-main'],
            snapshot: {}
        }], 'p-main');
        expect(cycles.length).toBeGreaterThan(0);
        expect(XRef.validateSnapshot({ lines: [{}, {}] }, 1)).toMatchObject({
            ok: false, error: 'ENTITY_LIMIT_EXCEEDED', count: 2
        });
        var store = XRef.createStore([], { currentProjectId: 'p-main' });
        expect(store.attach({
            id: 'cycle', name: 'Cycle',
            source: { type: 'project', projectId: 'p-child' },
            dependencies: ['p-main'],
            snapshot: {}
        }).error).toBe('XREF_CYCLE');
    });
});

describe('PluginMarketplace MVP', function () {
    it('cài ở trạng thái tắt, bật và serialize', function () {
        var store = Marketplace.createStore();
        var installed = store.install({
            id: 'indoor.validator', name: 'Indoor Validator',
            version: '1.2.0', permissions: ['validators']
        });
        expect(installed.ok).toBe(true);
        expect(store.get('indoor.validator').enabled).toBe(false);
        expect(store.enable('indoor.validator')).toBe(true);
        expect(store.serialize()[0].enabled).toBe(true);
    });

    it('từ chối manifest id hoặc permission không an toàn', function () {
        expect(Marketplace.normalizeManifest({ id: '../bad', permissions: [] })).toBeNull();
        expect(Marketplace.normalizeManifest({ id: 'bad', permissions: ['network'] })).toBeNull();
    });
});

describe('DigitalTwin MVP', function () {
    it('nhận telemetry mới, bỏ event cũ và phân loại cảnh báo', function () {
        var binding = Twin.createBinding({
            entityId: 7, sensorId: 'temp-7', metric: 'temperature',
            warningAbove: 30, criticalAbove: 40, staleAfterMs: 60000
        });
        var first = Twin.ingest(binding, {
            sensorId: 'temp-7', value: 35, timestamp: '2026-07-21T07:00:00.000Z', unit: 'C'
        });
        expect(first.accepted).toBe(true);
        expect(Twin.status(first.binding, new Date('2026-07-21T07:00:30.000Z').getTime())).toBe('warning');
        var old = Twin.ingest(first.binding, {
            sensorId: 'temp-7', value: 20, timestamp: '2026-07-21T06:59:00.000Z'
        });
        expect(old.outdated).toBe(true);
        expect(Twin.status(first.binding, new Date('2026-07-21T07:02:00.000Z').getTime())).toBe('stale');
    });

    it('telemetry store giới hạn lịch sử, analytics và stale sweep', function () {
        var store = Twin.createTelemetryStore([{
            id: 'binding-1', entityId: 7, sensorId: 'temp-7',
            staleAfterMs: 1000
        }], { maxHistory: 2 });
        var events = 0;
        store.subscribe(function () { events++; });
        [
            { value: 20, timestamp: '2026-07-21T07:00:00.000Z' },
            { value: 30, timestamp: '2026-07-21T07:00:01.000Z' },
            { value: 40, timestamp: '2026-07-21T07:00:02.000Z' }
        ].forEach(function (item) {
            store.ingestEvent(Object.assign({ sensorId: 'temp-7', unit: 'C' }, item));
        });
        expect(events).toBe(3);
        expect(store.getHistory('temp-7').map(function (item) { return item.value; })).toEqual([30, 40]);
        expect(store.analytics('temp-7')).toEqual({ count: 2, min: 30, max: 40, average: 35 });
        expect(store.staleBindings(new Date('2026-07-21T07:00:04.000Z').getTime())).toHaveLength(1);
    });

    it('realtime client chỉ nhận URL an toàn và parse message JSON', function () {
        var sockets = [];
        function FakeSocket(url) {
            this.url = url;
            this.close = function () {};
            sockets.push(this);
        }
        var received = [];
        var client = Twin.createRealtimeClient({
            url: 'wss://iot.example.test/events',
            WebSocketCtor: FakeSocket,
            onEvent: function (event) { received.push(event); }
        });
        expect(client.connect().ok).toBe(true);
        sockets[0].onmessage({ data: '{"sensorId":"temp-7","value":31}' });
        expect(received[0]).toEqual({ sensorId: 'temp-7', value: 31 });
        client.close();
        expect(Twin.createRealtimeClient({
            url: 'ws://public.example.test/events',
            WebSocketCtor: FakeSocket
        }).connect().error).toBe('UNSAFE_REALTIME_URL');
    });
});

describe('Dynamic Block MVP', function () {
    it('stretch X/Y và visibility thay đổi geometry insert', function () {
        var def = Blocks.createDefinition('Door dynamic', [{
            type: 'line',
            data: { id: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 5 }] }
        }], {
            id: 'dynamic-door',
            baseX: 0,
            baseY: 0,
            dynamicParameters: [
                { name: 'width', type: 'stretchX', defaultValue: 1, min: 0.5, max: 4 },
                { name: 'height', type: 'stretchY', defaultValue: 1, min: 0.5, max: 4 },
                { name: 'state', type: 'visibility', defaultValue: 'open', states: ['open', 'closed'] }
            ]
        });
        var insert = Blocks.createInsert(def.id, 100, 200, { def: def });
        expect(Blocks.setDynamicValue(def, insert, 'width', 2)).toBe(true);
        expect(Blocks.setDynamicValue(def, insert, 'height', 3)).toBe(true);
        var exploded = Blocks.explodeInsert(def, insert);
        expect(exploded[0].data.points[1]).toEqual({ x: 120, y: 215 });
        expect(Blocks.setDynamicValue(def, insert, 'state', 'invalid')).toBe(false);
    });

    it('hỗ trợ flip, lookup table và action evaluation', function () {
        var def = Blocks.createDefinition('Dynamic lookup', [{
            type: 'line',
            data: { id: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 5 }] }
        }], {
            id: 'dynamic-lookup',
            baseX: 0,
            baseY: 0,
            dynamicParameters: [
                { name: 'width', type: 'stretchX', defaultValue: 1, min: 0.5, max: 4 },
                { name: 'flip', type: 'flipX', defaultValue: false },
                {
                    name: 'size', type: 'lookup', defaultValue: 'S',
                    table: { S: { width: 1 }, L: { width: 3 } }
                },
                { name: 'state', type: 'visibility', defaultValue: 'open', states: ['open', 'closed'] }
            ],
            dynamicActions: [{
                when: { parameter: 'flip', equals: true },
                set: { state: 'closed' }
            }]
        });
        var insert = Blocks.createInsert(def.id, 100, 200, { def: def });
        expect(Blocks.setDynamicValue(def, insert, 'size', 'L')).toBe(true);
        expect(insert.dynamicValues.width).toBe(3);
        expect(Blocks.setDynamicValue(def, insert, 'flip', true)).toBe(true);
        expect(insert.dynamicValues.state).toBe('closed');
        var exploded = Blocks.explodeInsert(def, insert);
        expect(exploded[0].data.points[1]).toEqual({ x: 70, y: 205 });
    });

    it('action evaluation giới hạn vòng lặp khi rule dao động', function () {
        var def = {
            dynamicParameters: [
                { name: 'a', type: 'flipX', defaultValue: false },
                { name: 'b', type: 'flipY', defaultValue: false }
            ],
            dynamicActions: [
                { when: { parameter: 'a', equals: true }, set: { b: true } },
                { when: { parameter: 'b', equals: true }, set: { a: true } }
            ]
        };
        var insert = { dynamicValues: { a: true, b: false } };
        var result = Blocks.evaluateDynamicActions(def, insert, 4);
        expect(result.cyclic).toBe(false);
        expect(insert.dynamicValues).toEqual({ a: true, b: true });

        def.dynamicActions = [
            { when: { parameter: 'a', equals: true }, set: { b: true } },
            { when: { parameter: 'b', equals: true }, set: { a: false } },
            { when: { parameter: 'a', equals: false }, set: { b: false } },
            { when: { parameter: 'b', equals: false }, set: { a: true } }
        ];
        insert.dynamicValues = { a: true, b: false };
        result = Blocks.evaluateDynamicActions(def, insert, 4);
        expect(result.cyclic).toBe(true);
    });
});
