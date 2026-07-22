// ============================================================
// VALIDATION-ENGINE.JS — Pre-publish rules (Phần 5.12)
// Input: map_data JSON (sau Map Adapter / inline publish)
// Config: config/validation.json → EditorCore.ValidationConfig
// ============================================================
(function (root, factory) {
    var getValidationConfig = function () { return null; };
    if (typeof module === 'object' && module.exports) {
        try {
            var cfgMod = require('./validation-config.js');
            getValidationConfig = function () { return cfgMod; };
        } catch (e) { /* optional in isolation */ }
        module.exports = factory(getValidationConfig);
    } else {
        getValidationConfig = function () {
            return root.EditorCore && root.EditorCore.ValidationConfig;
        };
        root.EditorCore = root.EditorCore || {};
        Object.assign(root.EditorCore, factory(getValidationConfig));
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (getValidationConfig) {
    'use strict';

    var FALLBACK_WARNINGS = {
        GRAPH_DISCONNECTED: true,
        QR_NO_NODE: true,
        POI_OUTSIDE_ROOM: true,
        DOOR_OFF_WALL: true,
        WALL_OVERLAP: true,
        NODE_NEIGHBOR_MISSING: true,
        QR_NODE_MISSING: true
    };

    function fallbackConfig() {
        return {
            getRule: function (code) {
                return {
                    enabled: true,
                    severity: FALLBACK_WARNINGS[code] ? 'warning' : 'error'
                };
            },
            getThreshold: function (key, fb) {
                if (key === 'polygonMinVertices') return 3;
                return fb;
            }
        };
    }

    function configApi() {
        var cfg = getValidationConfig();
        return cfg || fallbackConfig();
    }

    function issue(level, code, message, meta) {
        return { level: level, code: code, message: message, meta: meta || {} };
    }

    function addFinding(errors, warnings, code, message, meta) {
        var rule = configApi().getRule(code);
        if (!rule.enabled) return;
        var level = rule.severity === 'warning' ? 'warning' : 'error';
        var item = issue(level, code, message, meta);
        if (level === 'warning') warnings.push(item);
        else errors.push(item);
    }

    function collectIds(items, field) {
        var seen = {};
        var dups = [];
        (items || []).forEach(function (item) {
            var id = item[field];
            if (id == null) return;
            var key = String(id);
            if (seen[key]) dups.push(key);
            else seen[key] = true;
        });
        return dups;
    }

    function buildAdjacency(nodes, edges) {
        var adj = {};
        (nodes || []).forEach(function (n) {
            adj[String(n.id)] = [];
        });
        (edges || []).forEach(function (e) {
            var a = String(e.source);
            var b = String(e.target);
            if (!adj[a]) adj[a] = [];
            if (!adj[b]) adj[b] = [];
            if (adj[a].indexOf(b) === -1) adj[a].push(b);
            if (adj[b].indexOf(a) === -1) adj[b].push(a);
        });
        (nodes || []).forEach(function (n) {
            var id = String(n.id);
            (n.neighbors || []).forEach(function (nid) {
                var s = String(nid);
                if (adj[id].indexOf(s) === -1) adj[id].push(s);
            });
        });
        return adj;
    }

    function isPointInRect(px, py, room) {
        return px >= room.x && px <= room.x + room.width &&
            py >= room.y && py <= room.y + room.height;
    }

    function graphComponents(adj) {
        var keys = Object.keys(adj);
        if (!keys.length) return 0;
        var visited = {};
        var count = 0;
        keys.forEach(function (start) {
            if (visited[start]) return;
            count++;
            var stack = [start];
            visited[start] = true;
            while (stack.length) {
                var cur = stack.pop();
                (adj[cur] || []).forEach(function (next) {
                    if (!visited[next]) {
                        visited[next] = true;
                        stack.push(next);
                    }
                });
            }
        });
        return count;
    }

    function pointInPolygon(px, py, pts) {
        if (!pts || pts.length < 3) return false;
        var inside = false;
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            var xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
            var hit = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-12) + xi);
            if (hit) inside = !inside;
        }
        return inside;
    }

    function pointInRoom(px, py, room) {
        if (!room || px == null || py == null) return false;
        if (room.shape === 'polygon' && room.points) return pointInPolygon(px, py, room.points);
        if (room.shape === 'circle' && room.cx != null) {
            var dx = px - room.cx, dy = py - room.cy, r = room.radius || 0;
            return (dx * dx + dy * dy) <= r * r;
        }
        if (room.width != null && room.height != null) return isPointInRect(px, py, room);
        return false;
    }

    function distPointSeg(px, py, ax, ay, bx, by) {
        var vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
        var len2 = vx * vx + vy * vy;
        var t = len2 > 1e-12 ? (wx * vx + wy * vy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        var cx = ax + t * vx, cy = ay + t * vy;
        return Math.hypot(px - cx, py - cy);
    }

    function roomEdges(room) {
        var segs = [];
        if (!room) return segs;
        if (room.shape === 'polygon' && room.points && room.points.length >= 2) {
            var p = room.points;
            for (var i = 0; i < p.length; i++) {
                var q = (i + 1) % p.length;
                segs.push([p[i].x, p[i].y, p[q].x, p[q].y]);
            }
        } else if (room.shape !== 'circle' && room.width != null && room.height != null) {
            var x0 = room.x, y0 = room.y, x1 = room.x + room.width, y1 = room.y + room.height;
            segs.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
        }
        return segs;
    }

    function wallSegments(walls) {
        var segs = [];
        (walls || []).forEach(function (w) {
            var pts = (w && w.points) || [];
            for (var i = 0; i < pts.length - 1; i++) {
                segs.push([pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y]);
            }
        });
        return segs;
    }

    // 2 đoạn cùng phương + trùng phủ nhau > minPx
    function segmentsOverlap(s1, s2, minPx) {
        var ax = s1[0], ay = s1[1], bx = s1[2], by = s1[3];
        var v1x = bx - ax, v1y = by - ay;
        var len1 = Math.hypot(v1x, v1y);
        if (len1 < 1e-9) return false;
        var ux = v1x / len1, uy = v1y / len1;
        var cx = s2[0], cy = s2[1], dx = s2[2], dy = s2[3];
        var v2x = dx - cx, v2y = dy - cy;
        var cross = ux * v2y - uy * v2x;
        if (Math.abs(cross) > 1e-6 * Math.max(1, Math.hypot(v2x, v2y))) return false; // không song song
        var perp = Math.abs((cx - ax) * uy - (cy - ay) * ux);
        if (perp > 0.5) return false; // không trùng phương (tol 0.5px)
        var tc = (cx - ax) * ux + (cy - ay) * uy;
        var td = (dx - ax) * ux + (dy - ay) * uy;
        var lo = Math.max(0, Math.min(tc, td));
        var hi = Math.min(len1, Math.max(tc, td));
        return (hi - lo) > minPx;
    }

    /**
     * @param {object} mapData — schema Phần 17.1
     * @returns {{ ok: boolean, errors: array, warnings: array }}
     */
    function validateMapData(mapData) {
        var errors = [];
        var warnings = [];

        if (!mapData || typeof mapData !== 'object') {
            addFinding(errors, warnings, 'MAP_DATA_MISSING', 'Không có dữ liệu bản đồ để xuất bản.');
            return { ok: errors.length === 0, errors: errors, warnings: warnings };
        }

        var scale = mapData.scale_ratio;
        if (!Number.isFinite(scale) || scale <= 0) {
            addFinding(errors, warnings, 'SCALE_INVALID', 'Tỷ lệ scale_ratio phải > 0 (Cấu hình → Tỷ lệ mét/ô).');
        }

        collectIds(mapData.rooms, 'id').forEach(function (id) {
            addFinding(errors, warnings, 'DUPLICATE_ROOM_ID', 'Trùng ID phòng: ' + id, { roomId: id });
        });
        collectIds(mapData.doors, 'id').forEach(function (id) {
            addFinding(errors, warnings, 'DUPLICATE_DOOR_ID', 'Trùng ID cửa: ' + id, { doorId: id });
        });
        collectIds(mapData.nodes, 'id').forEach(function (id) {
            addFinding(errors, warnings, 'DUPLICATE_NODE_ID', 'Trùng ID node: ' + id, { nodeId: id });
        });
        collectIds(mapData.walls, 'id').forEach(function (id) {
            addFinding(errors, warnings, 'DUPLICATE_WALL_ID', 'Trùng ID tường: ' + id, { wallId: id });
        });

        var minVertices = configApi().getThreshold('polygonMinVertices', 3);
        (mapData.rooms || []).forEach(function (room) {
            if (room.shape === 'polygon') {
                var pts = room.points || [];
                if (pts.length < minVertices) {
                    addFinding(errors, warnings, 'ROOM_NOT_CLOSED',
                        'Phòng "' + (room.name || room.id) + '" đa giác cần ít nhất ' + minVertices + ' đỉnh.',
                        { roomId: room.id });
                }
            }
        });

        var adj = buildAdjacency(mapData.nodes, mapData.edges);
        (mapData.nodes || []).forEach(function (node) {
            var id = String(node.id);
            var degree = (adj[id] || []).length;
            if (degree === 0) {
                addFinding(errors, warnings, 'NODE_ISOLATED',
                    'Node #' + id + ' không nối với node nào (cô lập).', { nodeId: node.id });
            }
        });

        if ((mapData.nodes || []).length > 1) {
            var components = graphComponents(adj);
            if (components > 1) {
                addFinding(errors, warnings, 'GRAPH_DISCONNECTED',
                    'Đồ thị đường đi có ' + components + ' mảnh rời — A* có thể không tìm được đường giữa các vùng.',
                    { components: components });
            }
        }

        (mapData.qr_anchors || []).forEach(function (qr) {
            if (qr.node_id == null || qr.node_id === '') {
                addFinding(errors, warnings, 'QR_NO_NODE',
                    'QR "' + (qr.qr_id || '?') + '" chưa gán Node — TPF Android có thể không khởi tạo đúng.',
                    { qrId: qr.qr_id });
            }
        });

        (mapData.pois || []).forEach(function (poi) {
            var inside = (mapData.rooms || []).some(function (room) {
                return pointInRoom(poi.x, poi.y, room);
            });
            if (!inside && (mapData.rooms || []).length > 0) {
                addFinding(errors, warnings, 'POI_OUTSIDE_ROOM',
                    'POI "' + (poi.name || poi.id) + '" có thể nằm ngoài phòng.',
                    { poiId: poi.id });
            }
        });

        // Rule 2 — Cửa không nằm trên tường/cạnh phòng nào
        var attachSegs = wallSegments(mapData.walls);
        (mapData.rooms || []).forEach(function (room) {
            attachSegs = attachSegs.concat(roomEdges(room));
        });
        if (attachSegs.length) {
            var maxDoorDist = configApi().getThreshold('doorWallMaxDistPx', 20);
            (mapData.doors || []).forEach(function (door) {
                if (door.x == null || door.y == null) return;
                var min = Infinity;
                for (var i = 0; i < attachSegs.length; i++) {
                    var s = attachSegs[i];
                    var d = distPointSeg(door.x, door.y, s[0], s[1], s[2], s[3]);
                    if (d < min) min = d;
                    if (min <= maxDoorDist) break;
                }
                if (min > maxDoorDist) {
                    addFinding(errors, warnings, 'DOOR_OFF_WALL',
                        'Cửa "' + (door.name || door.id) + '" không nằm trên tường/cạnh phòng nào.',
                        { doorId: door.id, distance: Math.round(min) });
                }
            });
        }

        // Rule 5 — Tường chồng lấn (cùng phương + trùng phủ)
        var wsegs = wallSegments(mapData.walls);
        var overlapPairs = 0;
        var overlapMin = configApi().getThreshold('wallOverlapMinPx', 4);
        for (var oi = 0; oi < wsegs.length; oi++) {
            for (var oj = oi + 1; oj < wsegs.length; oj++) {
                if (segmentsOverlap(wsegs[oi], wsegs[oj], overlapMin)) overlapPairs++;
            }
        }
        if (overlapPairs > 0) {
            addFinding(errors, warnings, 'WALL_OVERLAP',
                'Có ' + overlapPairs + ' cặp đoạn tường chồng lấn — nên gộp/xóa để bản vẽ sạch.',
                { pairs: overlapPairs });
        }

        // Integrity — tham chiếu node không tồn tại (edge / neighbor / QR)
        var nodeIds = {};
        (mapData.nodes || []).forEach(function (n) { if (n.id != null) nodeIds[String(n.id)] = true; });
        (mapData.edges || []).forEach(function (e) {
            ['source', 'target'].forEach(function (k) {
                if (e[k] != null && !nodeIds[String(e[k])]) {
                    addFinding(errors, warnings, 'EDGE_DANGLING',
                        'Cạnh đường đi trỏ tới node không tồn tại: ' + e[k] + '.',
                        { edge: e, missing: e[k] });
                }
            });
        });
        (mapData.nodes || []).forEach(function (n) {
            (n.neighbors || []).forEach(function (nid) {
                if (!nodeIds[String(nid)]) {
                    addFinding(errors, warnings, 'NODE_NEIGHBOR_MISSING',
                        'Node #' + n.id + ' tham chiếu neighbor không tồn tại: ' + nid + '.',
                        { nodeId: n.id, missing: nid });
                }
            });
        });
        (mapData.qr_anchors || []).forEach(function (qr) {
            if (qr.node_id != null && qr.node_id !== '' && !nodeIds[String(qr.node_id)]) {
                addFinding(errors, warnings, 'QR_NODE_MISSING',
                    'QR "' + (qr.qr_id || '?') + '" gán Node #' + qr.node_id + ' không tồn tại.',
                    { qrId: qr.qr_id, missing: qr.node_id });
            }
        });

        return {
            ok: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    }

    return {
        validateMapData: validateMapData
    };
});
