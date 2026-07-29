/**
 * P2.4 — Navigation Foundation: Exit + Nearest Safe POI (read-only trên bản publish).
 */
const Floor = require('../../models/Floor');
const {
  buildGraph,
  findPath,
  findNearestSafePoi,
  resolveStartNodeId,
  resolveGoalNodeId,
  buildRoutingOptions,
  toRoutingResponse,
  toPathResponse,
  parseSafeKinds,
  httpError
} = require('../../utils/navigationGraph');

async function loadPublishedFloorMap(buildingId, floorNumber) {
  const floor = await Floor.findOne({
    building_id: buildingId,
    floor_number: floorNumber
  })
    .select('map_data published_at version floor_name is_visible')
    .lean();

  if (!floor?.map_data) {
    throw httpError(404, 'Chưa có bản đồ xuất bản cho tầng này.', 'FLOOR_NOT_PUBLISHED');
  }
  if (!floor.published_at) {
    throw httpError(404, 'Tầng chưa được xuất bản.', 'FLOOR_NOT_PUBLISHED');
  }
  if (floor.is_visible === false) {
    throw httpError(404, 'Tầng không khả dụng công khai.', 'FLOOR_HIDDEN');
  }
  return floor;
}

async function resolveRoutingContext(input = {}) {
  const buildingId = String(input.params?.buildingId || input.params?.id || '').trim();
  const floorNumber = Number(input.params?.floor);
  if (!buildingId) throw httpError(400, 'Thiếu building id.');
  if (!Number.isFinite(floorNumber)) throw httpError(400, 'Thiếu hoặc sai floor.');

  const floor = await loadPublishedFloorMap(buildingId, floorNumber);
  const graph = buildGraph(floor.map_data);
  if (graph.nodeMap.size === 0) {
    throw httpError(422, 'Bản đồ không có node điều hướng.', 'NAV_GRAPH_EMPTY');
  }

  const startNodeId = resolveStartNodeId(graph, input.query || {});
  if (!startNodeId || !graph.nodeMap.has(startNodeId)) {
    throw httpError(400, 'Cần start_node_id hoặc cặp x,y hợp lệ.', 'START_NODE_INVALID');
  }

  const options = buildRoutingOptions(input.query || {});
  return { buildingId, floorNumber, floor, graph, startNodeId, options };
}

/** GET .../navigation/nearest-exit */
async function getNearestExit(input = {}) {
  const ctx = await resolveRoutingContext(input);
  const candidate = findNearestSafePoi(
    ctx.graph,
    ctx.startNodeId,
    ctx.graph.pois,
    new Set(['EXIT']),
    ctx.options
  );
  if (!candidate) {
    throw httpError(404, 'Không tìm thấy EXIT hoặc không có đường đi.', 'EXIT_NOT_FOUND');
  }

  return {
    status: 200,
    body: toRoutingResponse({
      buildingId: ctx.buildingId,
      floorNumber: ctx.floorNumber,
      startNodeId: ctx.startNodeId,
      candidate
    })
  };
}

/** GET .../navigation/nearest-safe */
async function getNearestSafePoi(input = {}) {
  const ctx = await resolveRoutingContext(input);
  const kinds = parseSafeKinds(input.query?.kinds);
  const candidate = findNearestSafePoi(
    ctx.graph,
    ctx.startNodeId,
    ctx.graph.pois,
    kinds,
    ctx.options
  );
  if (!candidate) {
    throw httpError(404, 'Không tìm thấy POI an toàn phù hợp.', 'SAFE_POI_NOT_FOUND');
  }

  return {
    status: 200,
    body: toRoutingResponse({
      buildingId: ctx.buildingId,
      floorNumber: ctx.floorNumber,
      startNodeId: ctx.startNodeId,
      candidate
    })
  };
}

/** GET .../navigation/path — A* point-to-point trên bản publish (cùng contract P2.4). */
async function getPath(input = {}) {
  const ctx = await resolveRoutingContext(input);
  const goalNodeId = resolveGoalNodeId(ctx.graph, input.query || {});
  if (!goalNodeId || !ctx.graph.nodeMap.has(goalNodeId)) {
    throw httpError(400, 'Cần goal_node_id hoặc cặp goal_x,goal_y hợp lệ.', 'GOAL_NODE_INVALID');
  }
  const path = findPath(ctx.graph, ctx.startNodeId, goalNodeId, ctx.options);
  if (!path) {
    throw httpError(404, 'Không tìm thấy đường đi.', 'PATH_NOT_FOUND');
  }

  return {
    status: 200,
    body: toPathResponse({
      buildingId: ctx.buildingId,
      floorNumber: ctx.floorNumber,
      startNodeId: ctx.startNodeId,
      goalNodeId,
      path
    })
  };
}

module.exports = {
  loadPublishedFloorMap,
  resolveRoutingContext,
  getNearestExit,
  getNearestSafePoi,
  getPath
};
