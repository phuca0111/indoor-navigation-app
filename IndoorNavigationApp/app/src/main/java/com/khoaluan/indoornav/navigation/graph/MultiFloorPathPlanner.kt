package com.khoaluan.indoornav.navigation.graph

import com.khoaluan.indoornav.data.model.PathNode
import com.khoaluan.indoornav.data.model.Poi
import com.khoaluan.indoornav.navigation.instruction.FloorTransitionDetector
import com.khoaluan.indoornav.ui.components.PoiCategory
import kotlin.math.hypot

/**
 * W3 — Lập đường đa tầng tối thiểu (không đổi signature [AStarPathfinder.findPath]).
 *
 * Convention connector: node `is_elevator` / `is_stairs` cùng loại trên 2 tầng
 * được coi là một cặp nếu khoảng cách pixel ≤ [matchPx].
 *
 * Chọn cầu thang: tối thiểu tổng quãng đường, nhưng **ưu tiên đoạn trên tầng hiện tại ngắn**
 * (tránh đi vòng qua cầu thang xa trong khi có cầu thang gần hơn trên đường).
 */
object MultiFloorPathPlanner {

    const val DEFAULT_MATCH_PX = 220f
    /** Chi phí cố định khi đổi tầng qua connector (mét ảo). */
    const val FLOOR_CHANGE_COST_M = 12f
    /** Soft-bridge khi graph Editor đứt đoạn tới cầu thang (px). */
    const val DEFAULT_SOFT_BRIDGE_PX = 200f
    /**
     * Nhân chi phí đoạn tầng hiện tại — giảm “đi vòng” tới cầu thang xa
     * khi tầng đích chỉ ngắn hơn vài mét.
     */
    const val CURRENT_FLOOR_PATH_WEIGHT = 1.45f
    /** Ghép thêm connector theo XY khi map lệch nhẹ giữa tầng. */
    const val RELAXED_MATCH_PX = 400f

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
        fromPois: List<Poi>,
        toPois: List<Poi>,
        matchPx: Float = DEFAULT_MATCH_PX * 2f,
        avoidConnectorKinds: Set<FloorTransitionDetector.ConnectorHint.Kind> = emptySet(),
    ): List<ConnectorLink> {
        fun kindOfPoi(poi: Poi): FloorTransitionDetector.ConnectorHint.Kind? {
            return when (
                PoiCategory.fromRaw(
                    type = poi.type,
                    typeIndex = poi.typeIndex,
                    poiTypeKey = poi.poiType ?: poi.poiTypeCamel,
                    name = poi.name,
                )
            ) {
                PoiCategory.STAIRS ->
                    FloorTransitionDetector.ConnectorHint.Kind.STAIRS
                PoiCategory.ELEVATOR,
                PoiCategory.ESCALATOR ->
                    FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR
                else -> null
            }
        }
        val links = mutableListOf<ConnectorLink>()
        for (a in fromPois) {
            val kindA = kindOfPoi(a) ?: continue
            if (kindA in avoidConnectorKinds) continue
            val fromNodeId = nearestConnectorNodeForPoi(fromFloor, a, kindA) ?: continue
            var matched = false
            for (b in toPois) {
                val kindB = kindOfPoi(b) ?: continue
                if (kindA != kindB) continue
                val d = hypot((a.x - b.x).toDouble(), (a.y - b.y).toDouble()).toFloat()
                if (d > matchPx) continue
                val toNodeId = nearestConnectorNodeForPoi(toFloor, b, kindB) ?: continue
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
                val toNodeId = nearestConnectorNodeAt(
                    toFloor,
                    a.x.toFloat(),
                    a.y.toFloat(),
                    preferKind = kindA,
                    maxPx = matchPx,
                ) ?: continue
                val tn = toFloor.nodeMap[toNodeId] ?: continue
                val d = hypot((a.x - tn.x).toDouble(), (a.y - tn.y).toDouble()).toFloat()
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
        return links.distinctBy { "${it.kind}:${it.fromNodeId}->${it.toNodeId}" }
    }

    /**
     * Mọi connector trên tầng đi → connector gần nhất cùng loại trên tầng đến (nới bán kính).
     * Đảm bảo cả 2 cầu thang (trái/phải) đều là ứng viên.
     */
    fun matchConnectorsNearestSameKind(
        fromFloor: GraphModel,
        toFloor: GraphModel,
        maxPx: Float = RELAXED_MATCH_PX,
        avoidConnectorKinds: Set<FloorTransitionDetector.ConnectorHint.Kind> = emptySet(),
    ): List<ConnectorLink> {
        val to = connectorsOf(toFloor)
        if (to.isEmpty()) return emptyList()
        val links = mutableListOf<ConnectorLink>()
        for (a in connectorsOf(fromFloor)) {
            val kindA = kindOf(a) ?: continue
            if (kindA in avoidConnectorKinds) continue
            val best = to
                .filter { kindOf(it) == kindA }
                .minByOrNull { hypot((a.x - it.x).toDouble(), (a.y - it.y).toDouble()) }
                ?: continue
            val d = hypot((a.x - best.x).toDouble(), (a.y - best.y).toDouble()).toFloat()
            if (d > maxPx) continue
            links.add(
                ConnectorLink(
                    kind = kindA,
                    fromNodeId = a.nodeId,
                    toNodeId = best.nodeId,
                    matchDistancePx = d,
                ),
            )
        }
        return links
    }

    fun matchConnectorsRelaxed(
        fromFloor: GraphModel,
        toFloor: GraphModel,
        fromPois: List<Poi> = emptyList(),
        toPois: List<Poi> = emptyList(),
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
        startPois: List<Poi> = emptyList(),
        destPois: List<Poi> = emptyList(),
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
        val nearestLinks = matchConnectorsNearestSameKind(
            startGraph, destGraph, RELAXED_MATCH_PX, avoidConnectorKinds,
        )
        val links = (flagged + fromPoisLinks + nearestLinks)
            .distinctBy { "${it.kind}:${it.fromNodeId}->${it.toNodeId}" }
        if (links.isEmpty()) return null

        val destFinder = AStarPathfinder(destGraph)

        fun scoreOf(
            toConnM: Float,
            fromConnM: Float,
            kind: FloorTransitionDetector.ConnectorHint.Kind,
        ): Float {
            val preferBias =
                if (preferElevator && kind == FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR) {
                    -0.5f
                } else {
                    0f
                }
            return toConnM * CURRENT_FLOOR_PATH_WEIGHT + floorChangeCostM + fromConnM + preferBias
        }

        fun tryLinks(opts: AStarPathfinder.RoutingOptions): Plan? {
            var localBest: Plan? = null
            var localBestScore = Float.MAX_VALUE
            var localBestCurrentM = Float.MAX_VALUE
            for (link in links) {
                val toConn = startFinder.findPath(startNodeId, link.fromNodeId, opts) ?: continue
                val fromConn = destFinder.findPath(link.toNodeId, destNodeId, opts) ?: continue
                val score = scoreOf(
                    toConn.totalDistanceMeters,
                    fromConn.totalDistanceMeters,
                    link.kind,
                )
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
                val better = when {
                    localBest == null -> true
                    score < localBestScore - 0.35f -> true
                    // Gần bằng điểm → chọn cầu thang gần hơn trên tầng hiện tại
                    kotlin.math.abs(score - localBestScore) <= 0.35f &&
                        toConn.totalDistanceMeters < localBestCurrentM - 0.5f -> true
                    else -> false
                }
                if (better) {
                    localBest = candidate
                    localBestScore = score
                    localBestCurrentM = toConn.totalDistanceMeters
                }
            }
            return localBest
        }

        var best = tryLinks(AStarPathfinder.RoutingOptions())
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

    /** Ưu tiên node is_stairs/elevator gần icon POI — tránh 2 cầu thang snap cùng 1 node. */
    private fun nearestConnectorNodeForPoi(
        graph: GraphModel,
        poi: Poi,
        preferKind: FloorTransitionDetector.ConnectorHint.Kind,
        maxFlaggedPx: Float = 100f,
    ): String? {
        val px = poi.x.toFloat()
        val py = poi.y.toFloat()
        val flagged = connectorsOf(graph).filter { kindOf(it) == preferKind }
        val bestFlagged = flagged.minByOrNull {
            hypot((it.x - px).toDouble(), (it.y - py).toDouble())
        }
        if (bestFlagged != null) {
            val d = hypot(
                (bestFlagged.x - px).toDouble(),
                (bestFlagged.y - py).toDouble(),
            ).toFloat()
            if (d <= maxFlaggedPx) return bestFlagged.nodeId
        }
        return SafePoiLocator.nearestNodeIdForPoi(graph, poi)
    }

    private fun nearestConnectorNodeAt(
        graph: GraphModel,
        x: Float,
        y: Float,
        preferKind: FloorTransitionDetector.ConnectorHint.Kind,
        maxPx: Float,
    ): String? {
        val flagged = connectorsOf(graph).filter { kindOf(it) == preferKind }
        val bestFlagged = flagged.minByOrNull {
            hypot((it.x - x).toDouble(), (it.y - y).toDouble())
        }
        if (bestFlagged != null) {
            val d = hypot(
                (bestFlagged.x - x).toDouble(),
                (bestFlagged.y - y).toDouble(),
            ).toFloat()
            if (d <= maxPx) return bestFlagged.nodeId
        }
        val any = SafePoiLocator.nearestNodeIdFromPosition(graph, x, y) ?: return null
        val n = graph.nodeMap[any] ?: return null
        val d = hypot((n.x - x).toDouble(), (n.y - y).toDouble()).toFloat()
        return if (d <= maxPx) any else null
    }
}
