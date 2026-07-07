// ============================================================
// VALIDATION-ENGINE.JS — Pre-publish rules (Phần 5.12)
// Input: map_data JSON (sau Map Adapter / inline publish)
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

    function issue(level, code, message, meta) {
        return { level: level, code: code, message: message, meta: meta || {} };
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
            if (adj[b].indexOf(a) === -1) adj[b].push(b);
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

    /**
     * @param {object} mapData — schema Phần 17.1
     * @returns {{ ok: boolean, errors: array, warnings: array }}
     */
    function validateMapData(mapData) {
        var errors = [];
        var warnings = [];
        if (!mapData || typeof mapData !== 'object') {
            errors.push(issue('error', 'MAP_DATA_MISSING', 'Không có dữ liệu bản đồ để xuất bản.'));
            return { ok: false, errors: errors, warnings: warnings };
        }

        var scale = mapData.scale_ratio;
        if (!Number.isFinite(scale) || scale <= 0) {
            errors.push(issue('error', 'SCALE_INVALID', 'Tỷ lệ scale_ratio phải > 0 (Cấu hình → Tỷ lệ mét/ô).'));
        }

        collectIds(mapData.rooms, 'id').forEach(function (id) {
            errors.push(issue('error', 'DUPLICATE_ROOM_ID', 'Trùng ID phòng: ' + id));
        });
        collectIds(mapData.doors, 'id').forEach(function (id) {
            errors.push(issue('error', 'DUPLICATE_DOOR_ID', 'Trùng ID cửa: ' + id));
        });
        collectIds(mapData.nodes, 'id').forEach(function (id) {
            errors.push(issue('error', 'DUPLICATE_NODE_ID', 'Trùng ID node: ' + id));
        });
        collectIds(mapData.walls, 'id').forEach(function (id) {
            errors.push(issue('error', 'DUPLICATE_WALL_ID', 'Trùng ID tường: ' + id));
        });

        (mapData.rooms || []).forEach(function (room) {
            if (room.shape === 'polygon') {
                var pts = room.points || [];
                if (pts.length < 3) {
                    errors.push(issue('error', 'ROOM_NOT_CLOSED', 'Phòng "' + (room.name || room.id) + '" đa giác cần ít nhất 3 đỉnh.', { roomId: room.id }));
                }
            }
        });

        var adj = buildAdjacency(mapData.nodes, mapData.edges);
        (mapData.nodes || []).forEach(function (node) {
            var id = String(node.id);
            var degree = (adj[id] || []).length;
            if (degree === 0 && (mapData.nodes || []).length > 1) {
                errors.push(issue('error', 'NODE_ISOLATED', 'Node #' + id + ' không nối với node nào (cô lập).', { nodeId: node.id }));
            }
        });

        if ((mapData.nodes || []).length > 1) {
            var components = graphComponents(adj);
            if (components > 1) {
                warnings.push(issue('warning', 'GRAPH_DISCONNECTED', 'Đồ thị đường đi có ' + components + ' mảnh rời — A* có thể không tìm được đường giữa các vùng.'));
            }
        }

        (mapData.qr_anchors || []).forEach(function (qr) {
            if (qr.node_id == null || qr.node_id === '') {
                warnings.push(issue('warning', 'QR_NO_NODE', 'QR "' + (qr.qr_id || '?') + '" chưa gán Node — TPF Android có thể không khởi tạo đúng.', { qrId: qr.qr_id }));
            }
        });

        (mapData.pois || []).forEach(function (poi) {
            var inside = (mapData.rooms || []).some(function (room) {
                if (room.shape === 'rect' || !room.shape) {
                    return isPointInRect(poi.x, poi.y, room);
                }
                return false;
            });
            if (!inside && (mapData.rooms || []).length > 0) {
                warnings.push(issue('warning', 'POI_OUTSIDE_ROOM', 'POI "' + (poi.name || poi.id) + '" có thể nằm ngoài phòng.', { poiId: poi.id }));
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
