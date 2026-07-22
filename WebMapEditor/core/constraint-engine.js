(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else {
        root.EditorCore = root.EditorCore || {};
        root.EditorCore.ConstraintEngine = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var TYPES = [
        'horizontal', 'vertical', 'distance', 'coincident', 'fixedPoint',
        'parallel', 'perpendicular', 'equalLength'
    ];

    function normalize(raw) {
        if (!raw || TYPES.indexOf(raw.type) < 0 || raw.objectId == null) return null;
        var out = {
            id: raw.id || ('constraint_' + Date.now() + '_' + Math.floor(Math.random() * 10000)),
            type: raw.type,
            objectId: raw.objectId,
            objectType: raw.objectType || 'line',
            a: Math.max(0, Math.round(Number(raw.a) || 0)),
            b: Math.max(0, Math.round(Number(raw.b) || 1)),
            enabled: raw.enabled !== false
        };
        if (raw.otherObjectId != null) {
            out.otherObjectId = raw.otherObjectId;
            out.otherObjectType = raw.otherObjectType || out.objectType;
            out.c = Math.max(0, Math.round(Number(raw.c) || 0));
            out.d = Math.max(0, Math.round(Number(raw.d) || 1));
        }
        if (raw.type === 'distance') {
            out.value = Number(raw.value);
            if (!Number.isFinite(out.value) || out.value < 0) return null;
        } else if (raw.type === 'fixedPoint') {
            out.x = Number(raw.x);
            out.y = Number(raw.y);
            if (!Number.isFinite(out.x) || !Number.isFinite(out.y)) return null;
        } else if (['parallel', 'perpendicular', 'equalLength'].indexOf(raw.type) >= 0 &&
            raw.otherObjectId == null) {
            return null;
        }
        return out;
    }

    function segment(points, first, second) {
        if (!Array.isArray(points) || !points[first] || !points[second]) return null;
        return { a: points[first], b: points[second] };
    }

    function setDirection(target, dx, dy, length) {
        var norm = Math.hypot(dx, dy);
        if (norm < 1e-9) return false;
        target.b.x = target.a.x + dx / norm * length;
        target.b.y = target.a.y + dy / norm * length;
        return true;
    }

    function apply(object, constraint, otherObject) {
        var c = normalize(constraint);
        var points = object && object.points;
        if (!c || !c.enabled || !Array.isArray(points) || !points[c.a]) return false;
        if (c.type === 'fixedPoint') {
            points[c.a].x = c.x;
            points[c.a].y = c.y;
            return true;
        }
        if (c.type === 'coincident' && otherObject) {
            var otherPoints = otherObject.points;
            if (!Array.isArray(otherPoints) || !otherPoints[c.c]) return false;
            otherPoints[c.c].x = points[c.a].x;
            otherPoints[c.c].y = points[c.a].y;
            return true;
        }
        if (!points[c.b]) return false;
        var a = points[c.a], b = points[c.b];
        if (c.type === 'horizontal') b.y = a.y;
        else if (c.type === 'vertical') b.x = a.x;
        else if (c.type === 'coincident') { b.x = a.x; b.y = a.y; }
        else if (c.type === 'distance') {
            var dx = b.x - a.x, dy = b.y - a.y;
            var length = Math.hypot(dx, dy);
            if (length < 1e-9) { dx = 1; dy = 0; length = 1; }
            b.x = a.x + dx / length * c.value;
            b.y = a.y + dy / length * c.value;
        } else if (['parallel', 'perpendicular', 'equalLength'].indexOf(c.type) >= 0) {
            var source = segment(points, c.a, c.b);
            var target = segment(otherObject && otherObject.points, c.c, c.d);
            if (!source || !target) return false;
            var sourceDx = source.b.x - source.a.x;
            var sourceDy = source.b.y - source.a.y;
            var targetLength = Math.hypot(target.b.x - target.a.x, target.b.y - target.a.y);
            if (c.type === 'equalLength') {
                var targetDx = target.b.x - target.a.x;
                var targetDy = target.b.y - target.a.y;
                return setDirection(target, targetDx, targetDy, Math.hypot(sourceDx, sourceDy));
            }
            if (targetLength < 1e-9) targetLength = Math.hypot(sourceDx, sourceDy);
            if (c.type === 'perpendicular') {
                return setDirection(target, -sourceDy, sourceDx, targetLength);
            }
            return setDirection(target, sourceDx, sourceDy, targetLength);
        }
        return true;
    }

    function segmentKey(constraint) {
        return constraint.objectType + ':' + String(constraint.objectId) + ':' +
            Math.min(constraint.a, constraint.b) + '-' + Math.max(constraint.a, constraint.b);
    }

    function detectConflicts(constraints) {
        var normalized = (constraints || []).map(normalize).filter(Boolean);
        var conflicts = [];
        var fixed = {};
        var distances = {};
        var orientations = {};
        function add(code, ids, message) {
            conflicts.push({ code: code, constraintIds: ids, message: message });
        }
        normalized.forEach(function (constraint) {
            if (!constraint.enabled) return;
            if (constraint.type === 'fixedPoint') {
                var pointKey = constraint.objectType + ':' + constraint.objectId + ':' + constraint.a;
                if (fixed[pointKey] &&
                    (Math.abs(fixed[pointKey].x - constraint.x) > 1e-6 ||
                        Math.abs(fixed[pointKey].y - constraint.y) > 1e-6)) {
                    add('CONFLICT_FIXED_POINT', [fixed[pointKey].id, constraint.id],
                        'Một điểm bị khóa tại hai tọa độ khác nhau');
                } else fixed[pointKey] = constraint;
            }
            if (constraint.type === 'distance') {
                var distanceKey = segmentKey(constraint);
                if (distances[distanceKey] &&
                    Math.abs(distances[distanceKey].value - constraint.value) > 1e-6) {
                    add('CONFLICT_DISTANCE', [distances[distanceKey].id, constraint.id],
                        'Một đoạn có hai khoảng cách khác nhau');
                } else distances[distanceKey] = constraint;
            }
            if (constraint.type === 'horizontal' || constraint.type === 'vertical') {
                var orientationKey = segmentKey(constraint);
                var previous = orientations[orientationKey];
                if (previous && previous.type !== constraint.type) {
                    var distance = distances[orientationKey];
                    if (!distance || distance.value > 1e-6) {
                        add('CONFLICT_ORIENTATION', [previous.id, constraint.id],
                            'Đoạn khác 0 không thể đồng thời ngang và dọc');
                    }
                } else orientations[orientationKey] = constraint;
            }
        });
        return conflicts;
    }

    function buildGraph(constraints) {
        var nodes = {};
        var edges = [];
        (constraints || []).map(normalize).filter(Boolean).forEach(function (constraint) {
            var from = constraint.objectType + ':' + String(constraint.objectId);
            nodes[from] = true;
            if (constraint.otherObjectId != null) {
                var to = constraint.otherObjectType + ':' + String(constraint.otherObjectId);
                nodes[to] = true;
                edges.push({ from: from, to: to, constraintId: constraint.id, type: constraint.type });
            } else {
                edges.push({ from: from, to: from, constraintId: constraint.id, type: constraint.type });
            }
        });
        return { nodes: Object.keys(nodes), edges: edges };
    }

    function solve(objects, constraints, iterations) {
        var lookup = {};
        (objects || []).forEach(function (ref) {
            if (ref && ref.data && ref.data.id != null) {
                lookup[(ref.type || 'line') + ':' + String(ref.data.id)] = ref.data;
            }
        });
        var normalized = (constraints || []).map(normalize).filter(Boolean);
        var conflicts = detectConflicts(normalized);
        var blocked = {};
        conflicts.forEach(function (conflict) {
            conflict.constraintIds.forEach(function (id) { blocked[id] = true; });
        });
        var applied = 0;
        iterations = Math.max(1, Math.min(20, Math.round(iterations || 3)));
        for (var pass = 0; pass < iterations; pass++) {
            normalized.forEach(function (constraint) {
                var object = lookup[constraint.objectType + ':' + String(constraint.objectId)];
                var other = constraint.otherObjectId != null
                    ? lookup[constraint.otherObjectType + ':' + String(constraint.otherObjectId)]
                    : null;
                if (!blocked[constraint.id] && apply(object, constraint, other)) applied++;
            });
        }
        return {
            ok: conflicts.length === 0,
            applied: applied,
            constraints: normalized,
            conflicts: conflicts,
            graph: buildGraph(normalized)
        };
    }

    return {
        TYPES: TYPES.slice(),
        normalize: normalize,
        apply: apply,
        solve: solve,
        detectConflicts: detectConflicts,
        buildGraph: buildGraph
    };
});
