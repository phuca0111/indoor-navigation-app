/**
 * Phase 3 — Hazard geometry helpers (pure functions, unit-testable).
 */

function pointInPolygon(x, y, polygon = []) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i].x);
    const yi = Number(polygon[i].y);
    const xj = Number(polygon[j].x);
    const yj = Number(polygon[j].y);
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function nodesInPolygons(graph, polygons = []) {
  const blocked = new Set();
  if (!graph?.nodeMap) return blocked;
  for (const node of graph.nodeMap.values()) {
    for (const polygon of polygons) {
      if (pointInPolygon(node.x, node.y, polygon)) {
        blocked.add(node.id);
        break;
      }
    }
  }
  return blocked;
}

function elevatorNodeIds(graph) {
  const ids = new Set();
  if (!graph?.nodeMap) return ids;
  for (const node of graph.nodeMap.values()) {
    if (node.is_elevator) ids.add(node.id);
  }
  return ids;
}

module.exports = {
  pointInPolygon,
  nodesInPolygons,
  elevatorNodeIds
};
