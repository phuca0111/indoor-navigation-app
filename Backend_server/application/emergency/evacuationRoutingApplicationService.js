/**
 * Phase 3 — Evacuation Routing (Policy + Hazard block + Nav Foundation).
 */
const Incident = require('../../models/Incident');
const HazardZone = require('../../models/HazardZone');
const { getPolicyByType } = require('./emergencyPolicyApplicationService');
const { loadPublishedFloorMap } = require('../navigation/navigationFoundationApplicationService');
const {
  buildGraph,
  findNearestSafePoi,
  resolveStartNodeId,
  toRoutingResponse,
  parseSafeKinds,
  httpError
} = require('../../utils/navigationGraph');
const { nodesInPolygons, elevatorNodeIds } = require('../../utils/hazardGeometry');

function preferTargetsToKinds(preferTargets = []) {
  const kinds = new Set();
  for (const target of preferTargets || []) {
    const key = String(target).trim().toUpperCase();
    if (key === 'EXIT') kinds.add('EXIT');
    if (key === 'ASSEMBLY_POINT' || key === 'ASSEMBLY') kinds.add('ASSEMBLY_POINT');
    if (key === 'SAFETY' || key === 'FIRE_EXTINGUISHER' || key === 'AED') kinds.add('SAFETY');
  }
  if (!kinds.size) kinds.add('EXIT');
  return kinds;
}

async function buildEvacuationOptions(incident, buildingId, floorNumber) {
  const policy = await getPolicyByType(incident.type);
  const zones = await HazardZone.find({
    incident_id: incident._id,
    active: true,
    building_id: buildingId,
    $or: [{ floor_number: floorNumber }, { floor_number: null }]
  }).lean();

  const floor = await loadPublishedFloorMap(buildingId, floorNumber);
  const graph = buildGraph(floor.map_data);

  const polygons = zones.map((z) => z.polygon).filter((p) => Array.isArray(p) && p.length >= 3);
  const blockedNodeIds = nodesInPolygons(graph, polygons);

  if (policy.block_elevators || policy.avoid_elevators) {
    for (const id of elevatorNodeIds(graph)) blockedNodeIds.add(id);
  }

  return {
    policy,
    graph,
    blockedNodeIds,
    floor
  };
}

async function getEvacuationRoute(input = {}) {
  const incidentId = input.params?.incidentId;
  const buildingId = String(input.params?.buildingId || '').trim();
  const floorNumber = Number(input.params?.floor);

  if (!buildingId) throw httpError(400, 'Thiếu building id.');
  if (!Number.isFinite(floorNumber)) throw httpError(400, 'Thiếu hoặc sai floor.');

  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  if (incident.status !== 'ACTIVE' && incident.status !== 'CONTAINED') {
    throw httpError(409, 'Evacuation chỉ khi Incident ACTIVE/CONTAINED.', 'INCIDENT_NOT_EVACUATING');
  }

  const { policy, graph, blockedNodeIds } = await buildEvacuationOptions(
    incident,
    buildingId,
    floorNumber
  );

  if (graph.nodeMap.size === 0) {
    throw httpError(422, 'Bản đồ không có node điều hướng.', 'NAV_GRAPH_EMPTY');
  }

  const startNodeId = resolveStartNodeId(graph, input.query || {});
  if (!startNodeId || !graph.nodeMap.has(startNodeId)) {
    throw httpError(400, 'Cần start_node_id hoặc cặp x,y hợp lệ.', 'START_NODE_INVALID');
  }

  const kinds = preferTargetsToKinds(policy.prefer_targets);
  const routingOptions = { blockedNodeIds };

  const candidate = findNearestSafePoi(
    graph,
    startNodeId,
    graph.pois,
    kinds,
    routingOptions
  );

  if (!candidate) {
    throw httpError(404, 'Không tìm thấy đích an toàn hoặc không có đường đi.', 'EVACUATION_ROUTE_NOT_FOUND');
  }

  return {
    status: 200,
    body: {
      incident_id: String(incidentId),
      policy: {
        hazard_type: incident.type,
        prefer_targets: policy.prefer_targets,
        block_elevators: Boolean(policy.block_elevators || policy.avoid_elevators),
        navigation_mode: policy.navigation_mode || 'EVACUATION'
      },
      blocked_node_count: blockedNodeIds.size,
      active_hazard_zones: (await HazardZone.countDocuments({
        incident_id: incidentId,
        active: true,
        building_id: buildingId
      })),
      route: toRoutingResponse({
        buildingId,
        floorNumber,
        startNodeId,
        candidate
      })
    }
  };
}

module.exports = {
  preferTargetsToKinds,
  buildEvacuationOptions,
  getEvacuationRoute
};
