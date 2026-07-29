// ============================================================
// P2.4 — Navigation graph helpers (A*, Safe POI, routing contract)
// Pure functions — unit-testable; mirror Android GraphModel/A*.
// ============================================================

const { normalizePoiCategoryKey } = require('./poiCatalog');

const GRID_SIZE_PX = 40;
const DEFAULT_SCALE_RATIO = 0.5;
const SAFE_KINDS = Object.freeze(['EXIT', 'ASSEMBLY_POINT', 'SAFETY']);

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

function sanitizeMapData(raw = {}) {
  return {
    scale_ratio: Number(raw.scale_ratio) > 0 ? Number(raw.scale_ratio) : DEFAULT_SCALE_RATIO,
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
    pois: Array.isArray(raw.pois) ? raw.pois : []
  };
}

function nodeIdOf(node) {
  if (node == null) return null;
  if (node.node_id != null && node.node_id !== '') return String(node.node_id);
  if (node.id != null) return String(node.id);
  return null;
}

function buildGraph(mapData) {
  const data = sanitizeMapData(mapData);
  const scaleRatio = data.scale_ratio;
  const nodeMap = new Map();
  for (const node of data.nodes) {
    const id = nodeIdOf(node);
    if (!id) continue;
    nodeMap.set(id, {
      id,
      x: Number(node.x) || 0,
      y: Number(node.y) || 0,
      is_elevator: Boolean(node.is_elevator),
      is_stairs: Boolean(node.is_stairs)
    });
  }

  const adjacency = new Map();
  const addEdge = (edge) => {
    const src = String(edge.source);
    const tgt = String(edge.target);
    const srcNode = nodeMap.get(src);
    const tgtNode = nodeMap.get(tgt);
    if (!srcNode || !tgtNode) return;

    const dx = tgtNode.x - srcNode.x;
    const dy = tgtNode.y - srcNode.y;
    const distPx = Math.hypot(dx, dy);
    const distMeters = (distPx / GRID_SIZE_PX) * scaleRatio;
    const angleRad = Math.atan2(dx, -dy);

    const forward = {
      id: `${src}→${tgt}`,
      sourceNodeId: src,
      targetNodeId: tgt,
      distanceMeters: distMeters,
      angleRad
    };
    const reverse = {
      id: `${tgt}→${src}`,
      sourceNodeId: tgt,
      targetNodeId: src,
      distanceMeters: distMeters,
      angleRad: Math.atan2(-dx, dy)
    };

    if (!adjacency.has(src)) adjacency.set(src, []);
    if (!adjacency.has(tgt)) adjacency.set(tgt, []);
    adjacency.get(src).push(forward);
    adjacency.get(tgt).push(reverse);
  };

  for (const edge of data.edges) addEdge(edge);

  return { nodeMap, adjacency, scaleRatio, pois: data.pois };
}

function pixelsToMeters(graph, pixels) {
  return (pixels / GRID_SIZE_PX) * graph.scaleRatio;
}

function heuristic(graph, nodeId, goalX, goalY) {
  const node = graph.nodeMap.get(nodeId);
  if (!node) return 0;
  const dx = node.x - goalX;
  const dy = node.y - goalY;
  return pixelsToMeters(graph, Math.hypot(dx, dy));
}

/**
 * @param {{blockedNodeIds?:Set<string>, blockedEdgeKeys?:Set<string>}} options
 */
function findPath(graph, startNodeId, goalNodeId, options = {}) {
  const blockedNodeIds = options.blockedNodeIds || new Set();
  const blockedEdgeKeys = options.blockedEdgeKeys || new Set();

  if (blockedNodeIds.has(startNodeId) || blockedNodeIds.has(goalNodeId)) return null;
  if (startNodeId === goalNodeId) {
    return { nodeIds: [startNodeId], edgeKeys: [], totalDistanceMeters: 0 };
  }

  const goalNode = graph.nodeMap.get(goalNodeId);
  if (!goalNode) return null;
  const goalX = goalNode.x;
  const goalY = goalNode.y;

  /** @type {Map<string, number>} */
  const gScore = new Map();
  /** @type {Map<string, string>} */
  const cameFromNode = new Map();
  /** @type {Map<string, string>} */
  const cameFromEdge = new Map();
  const closed = new Set();

  /** @type {Array<{f:number, id:string}>} */
  const open = [{ f: heuristic(graph, startNodeId, goalX, goalY), id: startNodeId }];
  gScore.set(startNodeId, 0);

  while (open.length) {
    open.sort((a, b) => a.f - b.f || a.id.localeCompare(b.id));
    const current = open.shift().id;

    if (current === goalNodeId) {
      const nodeIds = [];
      const edgeKeys = [];
      let walk = current;
      while (cameFromNode.has(walk)) {
        nodeIds.unshift(walk);
        edgeKeys.unshift(cameFromEdge.get(walk));
        walk = cameFromNode.get(walk);
      }
      nodeIds.unshift(walk);
      return {
        nodeIds,
        edgeKeys,
        totalDistanceMeters: gScore.get(current) || 0
      };
    }

    if (closed.has(current)) continue;
    closed.add(current);

    for (const edge of graph.adjacency.get(current) || []) {
      const neighbor = edge.targetNodeId;
      if (blockedNodeIds.has(neighbor)) continue;
      if (blockedEdgeKeys.has(edge.id)) continue;
      if (closed.has(neighbor)) continue;

      const tentative = (gScore.get(current) || 0) + edge.distanceMeters;
      if (tentative < (gScore.get(neighbor) ?? Number.POSITIVE_INFINITY)) {
        gScore.set(neighbor, tentative);
        cameFromNode.set(neighbor, current);
        cameFromEdge.set(neighbor, edge.id);
        open.push({
          f: tentative + heuristic(graph, neighbor, goalX, goalY),
          id: neighbor
        });
      }
    }
  }

  return null;
}

function nearestNodeId(graph, x, y) {
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const node of graph.nodeMap.values()) {
    const dist = Math.hypot(node.x - x, node.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = node.id;
    }
  }
  return best;
}

function poiCategoryKey(poi) {
  const raw = poi?.poi_type || poi?.poiType || poi?.type || '';
  return normalizePoiCategoryKey(raw);
}

function poiToSafeKind(poi) {
  const key = poiCategoryKey(poi);
  if (key === 'EXIT') return 'EXIT';
  if (key === 'ASSEMBLY_POINT') return 'ASSEMBLY_POINT';
  if (key === 'FIRE_EXTINGUISHER' || key === 'SAFETY') return 'SAFETY';
  return null;
}

function parseSafeKinds(raw) {
  if (!raw) return new Set(SAFE_KINDS);
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const allowed = new Set(parts.filter((k) => SAFE_KINDS.includes(k)));
  return allowed.size ? allowed : new Set(SAFE_KINDS);
}

function parseBlockedList(raw) {
  if (!raw) return new Set();
  return new Set(
    String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function findNearestSafePoi(graph, startNodeId, pois, kinds, options = {}) {
  let best = null;
  for (const poi of pois || []) {
    const kind = poiToSafeKind(poi);
    if (!kind || !kinds.has(kind)) continue;
    const targetNodeId = nearestNodeId(graph, Number(poi.x) || 0, Number(poi.y) || 0);
    if (!targetNodeId) continue;
    const path = findPath(graph, startNodeId, targetNodeId, options);
    if (!path) continue;
    const candidate = {
      kind,
      poi,
      poi_type: poiCategoryKey(poi),
      nearest_node_id: targetNodeId,
      path
    };
    if (!best || path.totalDistanceMeters < best.path.totalDistanceMeters) {
      best = candidate;
    }
  }
  return best;
}

function resolveStartNodeId(graph, query = {}) {
  const explicit = String(query.start_node_id || query.startNodeId || '').trim();
  if (explicit) return explicit;

  const x = Number(query.x);
  const y = Number(query.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return nearestNodeId(graph, x, y);
  }
  return null;
}

function resolveGoalNodeId(graph, query = {}) {
  const explicit = String(
    query.goal_node_id || query.goalNodeId || query.end_node_id || query.endNodeId || ''
  ).trim();
  if (explicit) return explicit;

  const x = Number(query.goal_x ?? query.end_x ?? query.x2);
  const y = Number(query.goal_y ?? query.end_y ?? query.y2);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return nearestNodeId(graph, x, y);
  }
  return null;
}

function buildRoutingOptions(query = {}) {
  return {
    blockedNodeIds: parseBlockedList(query.blocked_nodes || query.blockedNodes),
    blockedEdgeKeys: parseBlockedList(query.blocked_edges || query.blockedEdges)
  };
}

function toRoutingResponse(input) {
  const { buildingId, floorNumber, startNodeId, candidate } = input;
  const poi = candidate.poi;
  return {
    building_id: buildingId,
    floor_number: floorNumber,
    start_node_id: startNodeId,
    target: {
      poi_id: poi.id ?? poi._id ?? null,
      poi_type: candidate.poi_type,
      safe_kind: candidate.kind,
      name: poi.name || null,
      node_id: candidate.nearest_node_id,
      x: Number(poi.x) || 0,
      y: Number(poi.y) || 0
    },
    path: {
      node_ids: candidate.path.nodeIds,
      edge_keys: candidate.path.edgeKeys,
      total_distance_meters: candidate.path.totalDistanceMeters
    }
  };
}

function toPathResponse(input) {
  const { buildingId, floorNumber, startNodeId, goalNodeId, path } = input;
  return {
    building_id: buildingId,
    floor_number: floorNumber,
    start_node_id: startNodeId,
    goal_node_id: goalNodeId,
    path: {
      node_ids: path.nodeIds,
      edge_keys: path.edgeKeys,
      total_distance_meters: path.totalDistanceMeters
    }
  };
}

module.exports = {
  SAFE_KINDS,
  GRID_SIZE_PX,
  httpError,
  sanitizeMapData,
  buildGraph,
  findPath,
  nearestNodeId,
  poiToSafeKind,
  parseSafeKinds,
  parseBlockedList,
  findNearestSafePoi,
  resolveStartNodeId,
  resolveGoalNodeId,
  buildRoutingOptions,
  toRoutingResponse,
  toPathResponse
};
