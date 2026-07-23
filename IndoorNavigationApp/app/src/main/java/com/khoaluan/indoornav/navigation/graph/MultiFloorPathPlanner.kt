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
            if (best != null && bestDist <= matchPx) {
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
    ): Plan? {
        val startFinder = AStarPathfinder(startGraph)
        if (startFloor == destFloor) {
            val path = startFinder.findPath(startNodeId, destNodeId) ?: return null
            return Plan(
                sameFloor = true,
                currentFloorPath = path,
                targetFloor = destFloor,
                destNodeId = destNodeId,
                via = null,
                totalDistanceMeters = path.totalDistanceMeters,
            )
        }

        val links = matchConnectors(startGraph, destGraph, matchPx)
        if (links.isEmpty()) return null

        val destFinder = AStarPathfinder(destGraph)
        var best: Plan? = null

        for (link in links) {
            val toConn = startFinder.findPath(startNodeId, link.fromNodeId) ?: continue
            val fromConn = destFinder.findPath(link.toNodeId, destNodeId) ?: continue
            val preferBias =
                if (preferElevator && link.kind == FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR) -0.5f else 0f
            val score = toConn.totalDistanceMeters + floorChangeCostM + fromConn.totalDistanceMeters + preferBias
            val candidate = Plan(
                sameFloor = false,
                currentFloorPath = toConn,
                targetFloor = destFloor,
                destNodeId = destNodeId,
                via = link,
                totalDistanceMeters = toConn.totalDistanceMeters + floorChangeCostM + fromConn.totalDistanceMeters,
                remainingOnDestFloorMeters = fromConn.totalDistanceMeters,
            )
            if (best == null || score < (
                    best.totalDistanceMeters +
                        if (preferElevator && best.via?.kind == FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR) -0.5f else 0f
                    )
            ) {
                best = candidate
            }
        }
        return best
    }

    private fun kindOf(n: PathNode): FloorTransitionDetector.ConnectorHint.Kind? = when {
        n.isElevator -> FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR
        n.isStairs -> FloorTransitionDetector.ConnectorHint.Kind.STAIRS
        else -> null
    }
}
