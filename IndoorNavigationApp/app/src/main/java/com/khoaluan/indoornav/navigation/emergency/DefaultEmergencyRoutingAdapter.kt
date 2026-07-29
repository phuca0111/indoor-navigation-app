package com.khoaluan.indoornav.navigation.emergency

import com.khoaluan.indoornav.data.model.Poi
import com.khoaluan.indoornav.navigation.graph.AStarPathfinder
import com.khoaluan.indoornav.navigation.graph.GraphModel
import com.khoaluan.indoornav.navigation.graph.MultiFloorPathPlanner
import com.khoaluan.indoornav.navigation.graph.SafePoiLocator
import com.khoaluan.indoornav.navigation.instruction.FloorTransitionDetector

/**
 * P2.4 — Adapter mỏng bọc A* / SafePoiLocator / MultiFloorPathPlanner cho Phase 3.
 */
class DefaultEmergencyRoutingAdapter(
    private val currentFloorGraph: GraphModel,
    private val floorGraphProvider: (Int) -> GraphModel? = { null },
    private val currentFloor: Int = 0,
    private val floorPoisProvider: (Int) -> List<Poi> = { emptyList() },
    private val hazardPolygonsProvider: () -> List<List<Pair<Float, Float>>> = { emptyList() },
) : EmergencyRoutingInterface {

    private val pathfinder = AStarPathfinder(currentFloorGraph)

    /** Nối tạm node gần nhau khi Editor để đồ thị đứt đoạn. */
    private fun routingOptions(
        startNodeId: String,
        blockedNodeIds: Set<String>,
        blockedEdgeKeys: Set<String>,
    ) = AStarPathfinder.RoutingOptions(
        blockedNodeIds = blockedNodeIds,
        blockedEdgeKeys = blockedEdgeKeys,
        softBridgeMaxPx = EMERGENCY_SOFT_BRIDGE_PX,
        escapeFromHazard = startNodeId in blockedNodeIds,
        hazardPolygons = hazardPolygonsProvider(),
    )

    override fun findPath(
        startNodeId: String,
        goalNodeId: String,
        blockedNodeIds: Set<String>,
        blockedEdgeKeys: Set<String>,
    ): AStarPathfinder.PathResult? = pathfinder.findPath(
        startNodeId,
        goalNodeId,
        routingOptions(startNodeId, blockedNodeIds, blockedEdgeKeys),
    )

    override fun findNearestExit(
        startNodeId: String,
        pois: List<Poi>,
        blockedNodeIds: Set<String>,
        blockedEdgeKeys: Set<String>,
    ): SafePoiLocator.SafePoiCandidate? = SafePoiLocator.findNearestExit(
        graph = currentFloorGraph,
        pois = pois,
        startNodeId = startNodeId,
        options = routingOptions(startNodeId, blockedNodeIds, blockedEdgeKeys),
        pathfinder = pathfinder,
    )

    override fun findNearestSafePoi(
        startNodeId: String,
        pois: List<Poi>,
        kinds: Set<SafePoiLocator.SafeKind>,
        blockedNodeIds: Set<String>,
        blockedEdgeKeys: Set<String>,
    ): SafePoiLocator.SafePoiCandidate? = SafePoiLocator.findNearest(
        graph = currentFloorGraph,
        pois = pois,
        startNodeId = startNodeId,
        kinds = kinds,
        options = routingOptions(startNodeId, blockedNodeIds, blockedEdgeKeys),
        pathfinder = pathfinder,
    )

    override fun planMultiFloor(
        startFloor: Int,
        destFloor: Int,
        startNodeId: String,
        destNodeId: String,
        blockedNodeIds: Set<String>,
        blockedEdgeKeys: Set<String>,
        avoidConnectorKinds: Set<FloorTransitionDetector.ConnectorHint.Kind>,
    ): MultiFloorPathPlanner.Plan? {
        val startGraph = if (startFloor == currentFloor) {
            currentFloorGraph
        } else {
            floorGraphProvider(startFloor) ?: return null
        }
        val destGraph = if (destFloor == currentFloor) {
            currentFloorGraph
        } else {
            floorGraphProvider(destFloor) ?: return null
        }
        val options = routingOptions(startNodeId, blockedNodeIds, blockedEdgeKeys)
        // Tầng đích: không escape — connector/đích không được nằm trong zone
        val destOptions = AStarPathfinder.RoutingOptions(
            blockedNodeIds = blockedNodeIds,
            blockedEdgeKeys = blockedEdgeKeys,
            softBridgeMaxPx = EMERGENCY_SOFT_BRIDGE_PX,
            escapeFromHazard = false,
            hazardPolygons = hazardPolygonsProvider(),
        )
        val startFinder = if (startGraph === currentFloorGraph) pathfinder else AStarPathfinder(startGraph)
        val destFinder = if (destGraph === currentFloorGraph) pathfinder else AStarPathfinder(destGraph)

        if (startFloor == destFloor) {
            val path = startFinder.findPath(startNodeId, destNodeId, options) ?: return null
            return MultiFloorPathPlanner.Plan(
                sameFloor = true,
                currentFloorPath = path,
                targetFloor = destFloor,
                destNodeId = destNodeId,
                via = null,
                totalDistanceMeters = path.totalDistanceMeters,
            )
        }

        val links = MultiFloorPathPlanner.matchConnectorsRelaxed(
            fromFloor = startGraph,
            toFloor = destGraph,
            fromPois = floorPoisProvider(startFloor),
            toPois = floorPoisProvider(destFloor),
            avoidConnectorKinds = avoidConnectorKinds,
        )
        if (links.isEmpty()) return null

        var best: MultiFloorPathPlanner.Plan? = null
        for (link in links) {
            val toConn = startFinder.findPath(startNodeId, link.fromNodeId, options) ?: continue
            val fromConn = destFinder.findPath(link.toNodeId, destNodeId, destOptions) ?: continue
            val total = toConn.totalDistanceMeters + MultiFloorPathPlanner.FLOOR_CHANGE_COST_M + fromConn.totalDistanceMeters
            val candidate = MultiFloorPathPlanner.Plan(
                sameFloor = false,
                currentFloorPath = toConn,
                targetFloor = destFloor,
                destNodeId = destNodeId,
                via = link,
                totalDistanceMeters = total,
                remainingOnDestFloorMeters = fromConn.totalDistanceMeters,
            )
            if (best == null || candidate.totalDistanceMeters < best.totalDistanceMeters) {
                best = candidate
            }
        }
        return best
    }

        companion object {
        /** Soft-bridge qua khe cửa khi sơ tán (đủ dài để ra khỏi phòng). */
        const val EMERGENCY_SOFT_BRIDGE_PX = 420f
    }
}
