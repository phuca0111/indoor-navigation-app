// ============================================================
// DOCUMENT.JS — Single source of truth (Phase 0 skeleton)
// Hiện sync với mảng global legacy; Phase 1+ dùng objects[] đầy đủ
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EditorCore = root.EditorCore || {};
        Object.assign(root.EditorCore, factory());
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var OBJECT_TYPES = ['room', 'door', 'poi', 'wall', 'pathNode', 'pathEdge', 'qr'];

    function Document() {
        this.version = 1;
        this.metadata = {
            mapName: 'Bản đồ mới',
            scaleRatio: 0.5,
            mapBearingOffset: 0,
            backgroundImage: ''
        };
        this.layers = [{ id: 'default', name: '0', visible: true, locked: false }];
        this.objects = [];
    }

    Document.prototype.clear = function () {
        this.objects = [];
    };

    Document.prototype.fromLegacyState = function (state) {
        if (!state) return this;
        this.metadata.mapName = state.mapName || 'Bản đồ mới';
        this.metadata.scaleRatio = state.scaleRatio != null ? state.scaleRatio : 0.5;
        this.metadata.mapBearingOffset = state.mapBearingOffset || 0;
        this.metadata.backgroundImage = state.backgroundImage || '';
        this.objects = [];

        var self = this;
        (state.rooms || []).forEach(function (r) {
            self.objects.push({ id: 'room-' + r.id, type: 'room', layerId: 'default', data: r });
        });
        (state.doors || []).forEach(function (d) {
            self.objects.push({ id: 'door-' + d.id, type: 'door', layerId: 'default', data: d });
        });
        (state.pois || []).forEach(function (p) {
            self.objects.push({ id: 'poi-' + p.id, type: 'poi', layerId: 'default', data: p });
        });
        (state.walls || []).forEach(function (w) {
            self.objects.push({ id: 'wall-' + w.id, type: 'wall', layerId: 'default', data: w });
        });
        (state.pathNodes || []).forEach(function (n) {
            self.objects.push({ id: 'node-' + n.id, type: 'pathNode', layerId: 'default', data: n });
        });
        (state.pathEdges || []).forEach(function (e) {
            self.objects.push({
                id: 'edge-' + e.from + '-' + e.to,
                type: 'pathEdge',
                layerId: 'default',
                data: e
            });
        });
        (state.qrs || []).forEach(function (q) {
            self.objects.push({ id: 'qr-' + q.id, type: 'qr', layerId: 'default', data: q });
        });
        return this;
    };

    Document.prototype.toLegacyCollections = function () {
        var out = {
            rooms: [],
            doors: [],
            pois: [],
            walls: [],
            pathNodes: [],
            pathEdges: [],
            qrs: []
        };
        this.objects.forEach(function (obj) {
            if (!obj || !obj.type) return;
            switch (obj.type) {
                case 'room': out.rooms.push(obj.data); break;
                case 'door': out.doors.push(obj.data); break;
                case 'poi': out.pois.push(obj.data); break;
                case 'wall': out.walls.push(obj.data); break;
                case 'pathNode': out.pathNodes.push(obj.data); break;
                case 'pathEdge': out.pathEdges.push(obj.data); break;
                case 'qr': out.qrs.push(obj.data); break;
            }
        });
        return out;
    };

    Document.prototype.getObjectCount = function () {
        return this.objects.length;
    };

    Document.prototype.toJSON = function () {
        return {
            version: this.version,
            metadata: Object.assign({}, this.metadata),
            layers: (this.layers || []).map(function (l) { return Object.assign({}, l); }),
            objects: (this.objects || []).map(function (o) {
                return Object.assign({}, o, {
                    data: o.data ? Object.assign({}, o.data) : o.data
                });
            })
        };
    };

    Document.prototype.fromJSON = function (json) {
        if (!json || typeof json !== 'object') return this;
        this.version = json.version || 1;
        this.metadata = Object.assign({}, json.metadata || {});
        this.layers = (json.layers || []).map(function (l) { return Object.assign({}, l); });
        this.objects = (json.objects || []).map(function (o) { return Object.assign({}, o); });
        return this;
    };

    function createDocument() {
        return new Document();
    }

    var singleton = createDocument();

    function toJSON() {
        return singleton.toJSON();
    }

    function fromJSON(json) {
        singleton.fromJSON(json);
        return singleton;
    }

    return {
        Document: Document,
        createDocument: createDocument,
        OBJECT_TYPES: OBJECT_TYPES,
        document: singleton,
        toJSON: toJSON,
        fromJSON: fromJSON
    };
});
