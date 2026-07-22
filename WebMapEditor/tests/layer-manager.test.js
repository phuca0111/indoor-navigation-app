import { describe, it, expect, beforeEach } from 'vitest';

import { createRequire } from 'node:module';



const require = createRequire(import.meta.url);

const LM = require('../core/layer-manager.js');

const DocumentModule = require('../core/document.js');



globalThis.EditorCore = globalThis.EditorCore || {};

globalThis.EditorCore.document = DocumentModule.document;

globalThis.EditorCore.eventBus = { emit: function () {} };



describe('LayerManager — Phase 1 skeleton', function () {

    beforeEach(function () {

        DocumentModule.document = DocumentModule.createDocument();

        globalThis.EditorCore.document = DocumentModule.document;

        LM.reset();

    });



    it('mặc định layer 0 (default)', function () {

        var layers = LM.getAll();

        expect(layers.length).toBe(1);

        expect(layers[0].id).toBe('default');

        expect(layers[0].name).toBe('0');

        expect(LM.getActiveLayerId()).toBe('default');

    });



    it('addLayer và setActiveLayer', function () {

        var added = LM.addLayer({ name: 'Tường' });

        expect(added.name).toBe('Tường');

        expect(LM.setActiveLayer(added.id)).toBe(true);

        expect(LM.getActiveLayer().id).toBe(added.id);

    });



    it('setVisible / setLocked', function () {

        LM.setVisible('default', false);

        LM.setLocked('default', true);

        var layer = LM.get('default');

        expect(layer.visible).toBe(false);

        expect(layer.locked).toBe(true);

        expect(LM.isActiveLayerLocked()).toBe(true);

    });



    it('không xóa layer default', function () {

        expect(LM.removeLayer('default')).toBe(false);

        expect(LM.getAll().length).toBe(1);

    });



    it('removeLayer chuyển object về default', function () {

        var doc = globalThis.EditorCore.document;

        doc.objects.push({ id: 'room-1', type: 'room', layerId: 'layer_x', data: {} });

        LM.reset([

            { id: 'default', name: '0', visible: true, locked: false },

            { id: 'layer_x', name: 'X', visible: true, locked: false }

        ]);

        LM.removeLayer('layer_x');

        expect(doc.objects[0].layerId).toBe('default');

    });



    it('syncToDocument cập nhật document.layers', function () {

        LM.addLayer({ name: 'Phòng' });

        LM.syncToDocument();

        expect(globalThis.EditorCore.document.layers.length).toBe(2);

    });



    it('assignObjectLayer và getObjectsOnLayer', function () {

        var doc = globalThis.EditorCore.document;

        doc.objects.push({ id: 'wall-1', type: 'wall', layerId: 'default', data: {} });

        var layer = LM.addLayer({ name: 'Walls' });

        LM.assignObjectLayer('wall-1', layer.id);

        expect(LM.getObjectsOnLayer(layer.id).length).toBe(1);

    });

});

describe('LayerManager — màu lớp + sắp xếp thứ tự', function () {
    beforeEach(function () {
        LM.reset([
            { id: 'default', name: '0', visible: true, locked: false, color: null },
            { id: 'a', name: 'A', visible: true, locked: false, color: null },
            { id: 'b', name: 'B', visible: true, locked: false, color: null }
        ]);
    });

    it('setColor gán màu và phản ánh trong getAll', function () {
        expect(LM.setColor('a', '#ff0000')).toBe(true);
        expect(LM.get('a').color).toBe('#ff0000');
    });

    it('setColor id không tồn tại → false', function () {
        expect(LM.setColor('zzz', '#fff')).toBe(false);
    });

    it('moveLayer xuống dưới đổi chỗ 2 lớp kề', function () {
        expect(LM.moveLayer('a', 1)).toBe(true);
        expect(LM.getAll().map(function (l) { return l.id; })).toEqual(['default', 'b', 'a']);
    });

    it('moveLayer lên trên đổi chỗ 2 lớp kề', function () {
        expect(LM.moveLayer('b', -1)).toBe(true);
        expect(LM.getAll().map(function (l) { return l.id; })).toEqual(['default', 'b', 'a']);
    });

    it('moveLayer tại biên → false, giữ nguyên thứ tự', function () {
        expect(LM.moveLayer('default', -1)).toBe(false);
        expect(LM.moveLayer('b', 1)).toBe(false);
        expect(LM.getAll().map(function (l) { return l.id; })).toEqual(['default', 'a', 'b']);
    });

    it('màu + thứ tự giữ qua reset (mô phỏng lưu/khôi phục snapshot)', function () {
        LM.setColor('a', '#00ff00');
        LM.moveLayer('a', 1);
        var snap = LM.getAll();
        LM.reset(snap);
        expect(LM.getAll().map(function (l) { return l.id; })).toEqual(['default', 'b', 'a']);
        expect(LM.get('a').color).toBe('#00ff00');
    });
});
