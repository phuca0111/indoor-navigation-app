package com.khoaluan.indoornav.navigation.graph

import com.khoaluan.indoornav.data.model.PathNode
import com.khoaluan.indoornav.navigation.instruction.FloorTransitionDetector
import kotlin.math.hypot

/**
 * W3 — Lập đường đa tầng tối thiểu (không đổi signature [AStarPathfinder.findPath]).
 *
 * Convention connector: node `is_elevator` / `is_stairs` cùng loại trên 2 tầng
 * được coi là một cặp nếu khoảng cách pixel ≤ [matchPx].
 */
object MultiFloorPathPlanner {

    const val DEFAULT_MATCH_PX = 120f
    /** Chi phí cố định khi đổi tầng qua connector (mét ảo). */
    const val FLOOR_CHANGE_COST_M = 12f
    /** Soft-bridge khi graph Editor đứt đoạn tới cầu thang (px). */
    const val DEFAULT_SOFT_BRIDGE_PX = 200f

    data class ConnectorLink(
        val kind: FloorTransitionDetector.ConnectorHint.Kind,
        val fromNodeId: String,
        val toNodeId: String,
        val matchDistancePx: Float,
    )

    data class Plan(
        val sameFloor: Boolean,
        /** Đoạn vẽ trên tầng hiện tại (tới connector hoặc tới đích). */
        val currentFloorPath: AStarPathfinder.PathResult,
        val targetFloor: Int,
        val destNodeId: String,
        /** Null nếu cùng tầng. */
        val via: ConnectorLink?,
        /** Ước lượng tổng (tầng hiện tại + đổi tầng + đoạn tầng đích). */
        val totalDistanceMeters: Float,
        /** Đoạn còn lại trên tầng đích (chỉ khi multi-floor). */
        val remainingOnDestFloorMeters: Float = 0f,
    )

    fun connectorsOf(graph: GraphModel): List<PathNode> =
        graph.nodeMap.values.filter { it.isElevator || it.isStairs }

    fun matchConnectors(
        fromFloor: GraphModel,
        toFloor: GraphModel,
        matchPx: Float = DEFAULT_MATCH_PX,
        avoidConnectorKinds: Set<FloorTransitionDetector.ConnectorHint.Kind> = emptySet(),
    ): List<ConnectorLink> {
        val from = connectorsOf(fromFloor)
        val to = connectorsOf(toFloor)
        val links = mutableListOf<ConnectorLink>()
        for (a in from) {
            val kindA = kindOf(a) ?: continue
            var best: PathNode? = null
            var bestDist = Float.MAX_VALUE
            for (b in to) {
                val kindB = kindOf(b) ?: continue
                if (kindA != kindB) continue
                val d = hypot((a.x - b.x).toDouble(), (a.y - b.y).toDouble()).toFloat()
                if (d < bestDist) {
                    bestDist = d
                    best = b
                }
            }
            if (best != null && bestDist <= matchPx && kindA !in avoidConnectorKinds) {
                links.add(
                    ConnectorLink(
                        kind = kindA,
                        fromNodeId = a.nodeId,
                        toNodeId = best.nodeId,
                        matchDistancePx = bestDist,
                    ),
                )
            }
        }
        return links
    }

    /**
     * Khi map chưa gắn is_stairs/is_elevator trên node: ghép connector theo POI
     * cầu thang / thang máy gần cùng tọa độ giữa 2 tầng.
     */
    fun matchConnectorsFromPois(
        fromFloor: GraphModel,
        toFloor: GraphModel,
        fromPois: List<com.khoaluan.indoornav.data.model.Poi>,
        toPois: List<com.khoaluan.indoornav.data.model.Poi>,
        matchPx: Float = DEFAULT_MATCH_PX * 2f,
        avoidConnectorKinds: Set<FloorTransitionDetector.ConnectorHint.Kind> = emptySet(),
    ): List<ConnectorLink> {
        fun kindOfPoi(poi: com.khoaluan.indoornav.data.model.Poi): FloorTransitionDetector.ConnectorHint.Kind? {
            return when (com.khoaluan.indoornav.ui.components.PoiCategory.fromRaw(
                type = poi.type,
                typeIndex = poi.typeIndex,
                poiTypeKey = poi.poiType ?: poi.poiTypeCamel,
                name = poi.name,
            )) {
                com.khoaluan.indoornav.ui.components.PoiCategory.STAIRS ->
                    FloorTransitionDetector.ConnectorHint.Kind.STAIRS
                com.khoaluan.indoornav.ui.components.PoiCategory.ELEVATOR,
                com.khoaluan.indoornav.ui.components.PoiCategory.ESCALATOR ->
                    FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR
                else -> null
            }
        }
        val links = mutableListOf<ConnectorLink>()
        for (a in fromPois) {
            val kindA = kindOfPoi(a) ?: continue
            if (kindA in avoidConnectorKinds) continue
            val fromNodeId = SafePoiLocator.nearestNodeIdForPoi(fromFloor, a) ?: continue
            var matched = false
            for (b in toPois) {
                val kindB = kindOfPoi(b) ?: continue
                if (kindA != kindB) continue
                val d = hypot((a.x - b.x).toDouble(), (a.y - b.y).toDouble()).toFloat()
                if (d > matchPx) continue
                val toNodeId = SafePoiLocator.nearestNodeIdForPoi(toFloor, b) ?: continue
                links.add(
                    ConnectorLink(
                        kind = kindA,
                        fromNodeId = fromNodeId,
                        toNodeId = toNodeId,
                        matchDistancePx = d,
                    ),
                )
                matched = true
            }
            if (!matched) {
                // Chỉ có POI một tầng: nối node gần cùng tọa độ trên tầng kia
                val toNodeId = SafePoiLocator.nearestNodeIdFromPosition(
                    toFloor, a.x.toFloat(), a.y.toFloat(),
                ) ?: continue
                val tn = toFloor.nodeMap[toNodeId] ?: continue
                val d = hypot((a.x - tn.x).toDouble(), (a.y - tn.y).toDouble()).toFloat()
                if (d <= matchPx) {
                    links.add(
                        ConnectorLink(
                            kind = kindA,
                            fromNodeId = fromNodeId,
                            toNodeId = toNodeId,
                            matchDistancePx = d,
                        ),
                    )
                }
            }
        }
        return links.distinctBy { "${it.kind}:${it.fromNodeId}->${it.toNodeId}" }
    }

    fun matchConnectorsRelaxed(
        fromFloor: GraphModel,
        toFloor: GraphModel,
        fromPois: List<com.khoaluan.indoornav.data.model.Poi> = emptyList(),
        toPois: List<com.khoaluan.indoornav.data.model.Poi> = emptyList(),
        matchPx: Float = DEFAULT_MATCH_PX,
        avoidConnectorKinds: Set<FloorTransitionDetector.ConnectorHint.Kind> = emptySet(),
    ): List<ConnectorLink> {
        val flagged = matchConnectors(fromFloor, toFloor, matchPx, avoidConnectorKinds)
        if (flagged.isNotEmpty()) return flagged
        if (fromPois.isEmpty() && toPois.isEmpty()) return emptyList()
        return matchConnectorsFromPois(
            fromFloor, toFloor, fromPois, toPois, matchPx * 2f, avoidConnectorKinds,
        )
    }

    /**
     * @return null nếu không tìm được đường (thiếu connector / A* fail).
     */
    fun plan(
        startFloor: Int,
        destFloor: Int,
        startNodeId: String,
        destNodeId: String,
        startGraph: GraphModel,
        destGraph: GraphModel,
        matchPx: Float = DEFAULT_MATCH_PX,
        floorChangeCostM: Float = FLOOR_CHANGE_COST_M,
        preferElevator: Boolean = true,
        avoidConnectorKinds: Set<FloorTransitionDetector.ConnectorHint.Kind> = emptySet(),
        startPois: List<com.khoaluan.indoornav.data.model.Poi> = emptyList(),
        destPois: List<com.khoaluan.indoornav.data.model.Poi> = emptyList(),
        /**
         * Khi graph Editor đứt đoạn (phòng không nối cầu thang): nối tạm node ≤ px.
         * 0 = tắt. Mặc định bật nhẹ cho đa tầng.
         */
        softBridgeMaxPx: Float = DEFAULT_SOFT_BRIDGE_PX,
    ): Plan? {
        val startFinder = AStarPathfinder(startGraph)
        val routingOpts = if (softBridgeMaxPx > 0f) {
            AStarPathfinder.RoutingOptions(softBridgeMaxPx = softBridgeMaxPx)
        } else {
            AStarPathfinder.RoutingOptions()
        }
        if (startFloor == destFloor) {
            val path = startFinder.findPath(startNodeId, destNodeId, routingOpts) ?: return null
            return Plan(
                sameFloor = true,
                currentFloorPath = path,
                targetFloor = destFloor,
                destNodeId = destNodeId,
                via = null,
                totalDistanceMeters = path.totalDistanceMeters,
            )
        }

        val flagged = matchConnectors(
            fromFloor = startGraph,
            toFloor = destGraph,
            matchPx = matchPx,
            avoidConnectorKinds = avoidConnectorKinds,
        )
        val fromPoisLinks = if (startPois.isNotEmpty() || destPois.isNotEmpty()) {
            matchConnectorsFromPois(
                startGraph, destGraph, startPois, destPois, matchPx * 2f, avoidConnectorKinds,
            )
        } else {
            emptyList()
        }
        val links = (flagged + fromPoisLinks)
            .distinctBy { "${it.kind}:${it.fromNodeId}->${it.toNodeId}" }
        if (links.isEmpty()) return null

        val destFinder = AStarPathfinder(destGraph)
        var best: Plan? = null

        fun tryLinks(opts: AStarPathfinder.RoutingOptions): Plan? {
            var localBest: Plan? = null
            for (link in links) {
                val toConn = startFinder.findPath(startNodeId, link.fromNodeId, opts) ?: continue
                val fromConn = destFinder.findPath(link.toNodeId, destNodeId, opts) ?: continue
                val preferBias =
                    if (preferElevator && link.kind == FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR) {
                        -0.5f
                    } else {
                        0f
                    }
                val score =
                    toConn.totalDistanceMeters + floorChangeCostM + fromConn.totalDistanceMeters + preferBias
                val candidate = Plan(
                    sameFloor = false,
                    currentFloorPath = toConn,
                    targetFloor = destFloor,
                    destNodeId = destNodeId,
                    via = link,
                    totalDistanceMeters = toConn.totalDistanceMeters + floorChangeCostM +
                        fromConn.totalDistanceMeters,
                    remainingOnDestFloorMeters = fromConn.totalDistanceMeters,
                )
                val bestScore = localBest?.let { b ->
                    b.totalDistanceMeters +
                        if (preferElevator && b.via?.kind == FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR) {
                            -0.5f
                        } else {
                            0f
                        }
                }
                if (localBest == null || score < (bestScore ?: Float.MAX_VALUE)) {
                    localBest = candidate
                }
            }
            return localBest
        }

        // 1) Thử graph cứng; 2) nếu đứt đoạn Editor → soft-bridge
        best = tryLinks(AStarPathfinder.RoutingOptions())
        if (best == null && softBridgeMaxPx > 0f) {
            best = tryLinks(routingOpts)
        }
        return best
    }

    private fun kindOf(n: PathNode): FloorTransitionDetector.ConnectorHint.Kind? = when {
        n.isElevator -> FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR
        n.isStairs -> FloorTransitionDetector.ConnectorHint.Kind.STAIRS
        else -> null
    }
}
