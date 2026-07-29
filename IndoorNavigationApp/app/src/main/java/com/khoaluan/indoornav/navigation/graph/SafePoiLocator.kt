package com.khoaluan.indoornav.navigation.graph

import com.khoaluan.indoornav.data.model.Poi
import com.khoaluan.indoornav.data.model.isMarkedFinalExit
import com.khoaluan.indoornav.ui.components.PoiCategory
import com.khoaluan.indoornav.ui.components.resolveCategory
import kotlin.math.hypot

/**
 * P2.4 — Tìm POI an toàn gần nhất (EXIT / ASSEMBLY_POINT / SAFETY) theo chi phí A*.
 *
 * Ưu tiên sơ tán:
 * 1) Bỏ POI / node đích nằm trong vùng nguy hiểm (trừ khi allowHazardTraversal)
 * 2) EXIT `exit_role=final` (cửa ra ngoài) trước EXIT internal
 * 3) Trong nhóm còn lại: path A* ngắn nhất
 */
object SafePoiLocator {

    enum class SafeKind {
        EXIT,
        ASSEMBLY_POINT,
        SAFETY,
    }

    data class SafePoiCandidate(
        val poi: Poi,
        val category: PoiCategory,
        val kind: SafeKind,
        val nearestNodeId: String,
        val path: AStarPathfinder.PathResult,
        val distanceMeters: Float,
    )

    fun findNearest(
        graph: GraphModel,
        pois: List<Poi>,
        startNodeId: String,
        kinds: Set<SafeKind> = setOf(SafeKind.EXIT, SafeKind.ASSEMBLY_POINT, SafeKind.SAFETY),
        options: AStarPathfinder.RoutingOptions = AStarPathfinder.RoutingOptions(),
        pathfinder: AStarPathfinder = AStarPathfinder(graph),
    ): SafePoiCandidate? {
        if (kinds.isEmpty()) return null

        val candidates = mutableListOf<SafePoiCandidate>()
        for (poi in pois) {
            val category = poi.resolveCategory()
            val kind = category.toSafeKind() ?: continue
            if (kind !in kinds) continue

            val nearestNodeId = nearestNodeIdForPoi(graph, poi) ?: continue

            // Đích nằm trong vùng đỏ → không chọn (trừ chế độ xuyên zone bắt buộc)
            if (!options.allowHazardTraversal) {
                if (nearestNodeId in options.blockedNodeIds) continue
                if (poiInsideHazard(poi, options.hazardPolygons)) continue
            }

            val path = pathfinder.findPath(startNodeId, nearestNodeId, options) ?: continue
            candidates.add(
                SafePoiCandidate(
                    poi = poi,
                    category = category,
                    kind = kind,
                    nearestNodeId = nearestNodeId,
                    path = path,
                    distanceMeters = path.totalDistanceMeters,
                ),
            )
        }
        if (candidates.isEmpty()) return null

        // Có EXIT final an toàn/reachable → chỉ chọn trong nhóm final
        val preferFinalExits = SafeKind.EXIT in kinds &&
            candidates.any { it.kind == SafeKind.EXIT && it.poi.isMarkedFinalExit() }
        val pool = if (preferFinalExits) {
            candidates.filter { it.kind != SafeKind.EXIT || it.poi.isMarkedFinalExit() }
        } else {
            candidates
        }

        return pool.minWithOrNull(
            compareBy<SafePoiCandidate> { kindRank(it.kind) }
                .thenBy { it.distanceMeters },
        )
    }

    private fun kindRank(kind: SafeKind): Int = when (kind) {
        SafeKind.EXIT -> 0
        SafeKind.ASSEMBLY_POINT -> 1
        SafeKind.SAFETY -> 2
    }

    fun findNearestExit(
        graph: GraphModel,
        pois: List<Poi>,
        startNodeId: String,
        options: AStarPathfinder.RoutingOptions = AStarPathfinder.RoutingOptions(),
        pathfinder: AStarPathfinder = AStarPathfinder(graph),
    ): SafePoiCandidate? = findNearest(
        graph = graph,
        pois = pois,
        startNodeId = startNodeId,
        kinds = setOf(SafeKind.EXIT),
        options = options,
        pathfinder = pathfinder,
    )

    fun nearestNodeIdForPoi(graph: GraphModel, poi: Poi): String? {
        if (graph.nodeMap.isEmpty()) return null
        return graph.nodeMap.values.minByOrNull { node ->
            val dx = node.x - poi.x
            val dy = node.y - poi.y
            hypot(dx.toDouble(), dy.toDouble())
        }?.nodeId
    }

    fun nearestNodeIdFromPosition(graph: GraphModel, x: Float, y: Float): String? {
        if (graph.nodeMap.isEmpty()) return null
        return graph.nodeMap.values.minByOrNull { node ->
            val dx = node.x - x
            val dy = node.y - y
            hypot(dx.toDouble(), dy.toDouble())
        }?.nodeId
    }

    /** POI (tâm icon) nằm trong polygon vùng nguy hiểm. */
    fun poiInsideHazard(poi: Poi, hazardPolygons: List<List<Pair<Float, Float>>>): Boolean {
        if (hazardPolygons.isEmpty()) return false
        val x = poi.x.toFloat()
        val y = poi.y.toFloat()
        return hazardPolygons.any { pointInPolygon(x, y, it) }
    }

    private fun pointInPolygon(x: Float, y: Float, poly: List<Pair<Float, Float>>): Boolean {
        if (poly.size < 3) return false
        var inside = false
        var j = poly.lastIndex
        for (i in poly.indices) {
            val yi = poly[i].second
            val yj = poly[j].second
            val xi = poly[i].first
            val xj = poly[j].first
            val intersect = ((yi > y) != (yj > y)) &&
                (x < (xj - xi) * (y - yi) / ((yj - yi).takeIf { it != 0f } ?: 1e-6f) + xi)
            if (intersect) inside = !inside
            j = i
        }
        return inside
    }

    private fun PoiCategory.toSafeKind(): SafeKind? = when (this) {
        PoiCategory.EXIT -> SafeKind.EXIT
        PoiCategory.ASSEMBLY_POINT -> SafeKind.ASSEMBLY_POINT
        PoiCategory.SAFETY -> SafeKind.SAFETY
        else -> null
    }
}
