package com.khoaluan.indoornav.navigation.graph

import java.util.PriorityQueue
import kotlin.math.sqrt

/**
 * FILE: AStarPathfinder.kt
 * MỤC ĐÍCH: Tìm đường đi ngắn nhất trên đồ thị NavigationGraph bằng thuật toán A*
 *
 * THUẬT TOÁN:
 *   - f(n) = g(n) + h(n)
 *   - g(n): tổng chi phí thực từ đầu đến n (đơn vị mét)
 *   - h(n): heuristic ước lượng từ n đến đích (khoảng cách Euclid pixel)
 *   Heuristic Euclid là ADMISSIBLE (không bao giờ đánh giá QUÁ CAO chi phí thật)
 *   → A* LUÔN tìm ra đường ngắn nhất
 *
 * ĐẦU VÀO: GraphModel + startNodeId + goalNodeId
 * ĐẦU RA:  PathResult (danh sách nodeId + danh sách GraphEdge + tổng khoảng cách)
 */
class AStarPathfinder(private val graph: GraphModel) {

    /** P2.4 — ràng buộc tùy chọn; mặc định rỗng = hành vi cũ. */
    data class RoutingOptions(
        val blockedNodeIds: Set<String> = emptySet(),
        val blockedEdgeKeys: Set<String> = emptySet(),
        /**
         * Khi > 0: nối tạm các node cách nhau ≤ px (đồ thị đứt đoạn trong Editor).
         * Dùng cho sơ tán khẩn cấp — không ảnh hưởng chỉ đường thường.
         */
        val softBridgeMaxPx: Float = 0f,
        /**
         * User đang đứng trong vùng nguy hiểm: cho phép bắt đầu từ node blocked
         * và đi xuyên zone để ra ngoài — không được đi vào lại zone từ ngoài.
         */
        val escapeFromHazard: Boolean = false,
        /** Polygon vùng nguy hiểm — chặn cạnh / soft-bridge cắt xuyên vùng đỏ. */
        val hazardPolygons: List<List<Pair<Float, Float>>> = emptyList(),
        /**
         * Phương án cuối: lối duy nhất bị vùng đỏ chặn → cho đi xuyên,
         * nhưng phạt rất nặng + UI phải cảnh báo.
         */
        val allowHazardTraversal: Boolean = false,
    )

    data class PathResult(
        val nodeIds: List<String>,          // Trình tự nodeId từ start đến goal
        val edges: List<GraphEdge>,         // Trình tự GraphEdge từ start đến goal
        val totalDistanceMeters: Float      // Tổng khoảng cách (mét)
    ) {
        /** Mét còn đi trong vùng đỏ (edge xuất phát từ node blocked). */
        fun hazardExposureMeters(blockedNodeIds: Set<String>): Float {
            if (blockedNodeIds.isEmpty() || edges.isEmpty()) return 0f
            var sum = 0f
            for (e in edges) {
                if (e.sourceNodeId in blockedNodeIds) sum += e.distanceMeters
            }
            return sum
        }
    }

    /**
     * Tìm đường ngắn nhất từ startNodeId đến goalNodeId
     * @return PathResult hoặc null nếu không tìm được đường đi
     */
    fun findPath(
        startNodeId: String,
        goalNodeId: String,
        options: RoutingOptions = RoutingOptions(),
    ): PathResult? {
        // Đích trong vùng đỏ: chỉ khi buộc xuyên zone (lối duy nhất)
        if (goalNodeId in options.blockedNodeIds && !options.allowHazardTraversal) return null
        // Điểm bắt đầu trong zone: escape hoặc buộc xuyên
        if (startNodeId in options.blockedNodeIds &&
            !options.escapeFromHazard &&
            !options.allowHazardTraversal
        ) {
            return null
        }

        if (startNodeId == goalNodeId) {
            return PathResult(listOf(startNodeId), emptyList(), 0f)
        }

        val goalNode = graph.nodeMap[goalNodeId] ?: return null
        val goalX = goalNode.x.toFloat()
        val goalY = goalNode.y.toFloat()
        val softEdges = buildSoftBridgeEdges(
            maxPx = options.softBridgeMaxPx,
            blockedNodeIds = options.blockedNodeIds,
            escapeFromHazard = options.escapeFromHazard,
            hazardPolygons = options.hazardPolygons,
            allowHazardTraversal = options.allowHazardTraversal,
        )
        val startInHazard = startNodeId in options.blockedNodeIds

        val openSet = PriorityQueue<Pair<Float, String>>(
            compareBy<Pair<Float, String>> { it.first }.thenBy { it.second },
        )
        val gScore = mutableMapOf<String, Float>().withDefault { Float.MAX_VALUE }
        val cameFromNode = mutableMapOf<String, String>()
        val cameFromEdge = mutableMapOf<String, GraphEdge>()
        val closedSet = mutableSetOf<String>()

        gScore[startNodeId] = 0f
        openSet.add(Pair(heuristic(startNodeId, goalX, goalY), startNodeId))

        while (openSet.isNotEmpty()) {
            val (_, current) = openSet.poll()

            if (current == goalNodeId) {
                return reconstructPath(current, cameFromNode, cameFromEdge, gScore[current] ?: 0f)
            }

            if (current in closedSet) continue
            closedSet.add(current)

            fun considerEdge(edge: GraphEdge) {
                val neighbor = edge.targetNodeId
                if (edge.id in options.blockedEdgeKeys) return
                if (neighbor in closedSet) return
                if (neighbor in options.blockedNodeIds) {
                    val escaping = options.escapeFromHazard && startInHazard &&
                        current in options.blockedNodeIds
                    if (!escaping && !options.allowHazardTraversal) return
                }

                val crossesHazard = options.hazardPolygons.isNotEmpty() &&
                    segmentCrossesHazard(
                        edge.sourceX, edge.sourceY, edge.targetX, edge.targetY,
                        options.hazardPolygons,
                    )
                if (crossesHazard) {
                    val escaping = options.escapeFromHazard && startInHazard &&
                        current in options.blockedNodeIds
                    val leavingOrInside = escaping &&
                        (neighbor in options.blockedNodeIds || current in options.blockedNodeIds)
                    if (!options.allowHazardTraversal) {
                        if (!leavingOrInside) return
                        if (current !in options.blockedNodeIds && neighbor !in options.blockedNodeIds) return
                    }
                }

                val hazardPenalty = when {
                    options.allowHazardTraversal &&
                        (neighbor in options.blockedNodeIds || crossesHazard) ->
                        edge.distanceMeters * 8f
                    !options.escapeFromHazard -> 0f
                    neighbor in options.blockedNodeIds -> edge.distanceMeters * 2.5f
                    else -> 0f
                }
                val tentativeG = gScore.getValue(current) + edge.distanceMeters + hazardPenalty
                if (tentativeG < gScore.getValue(neighbor)) {
                    gScore[neighbor] = tentativeG
                    cameFromNode[neighbor] = current
                    cameFromEdge[neighbor] = edge
                    val fScore = tentativeG + heuristic(neighbor, goalX, goalY)
                    openSet.add(Pair(fScore, neighbor))
                }
            }

            graph.adjacency[current]?.forEach { considerEdge(it) }
            softEdges[current]?.forEach { considerEdge(it) }
        }

        return null
    }

    private fun buildSoftBridgeEdges(
        maxPx: Float,
        blockedNodeIds: Set<String> = emptySet(),
        escapeFromHazard: Boolean = false,
        hazardPolygons: List<List<Pair<Float, Float>>> = emptyList(),
        allowHazardTraversal: Boolean = false,
    ): Map<String, List<GraphEdge>> {
        if (maxPx <= 0f) return emptyMap()
        val nodes = graph.nodeMap.values.toList()
        if (nodes.size < 2) return emptyMap()
        val result = mutableMapOf<String, MutableList<GraphEdge>>()
        val existing = mutableSetOf<String>()
        graph.adjacency.forEach { (from, edges) ->
            edges.forEach { e -> existing.add("$from→${e.targetNodeId}") }
        }
        for (i in nodes.indices) {
            for (j in i + 1 until nodes.size) {
                val a = nodes[i]
                val b = nodes[j]
                val aBlocked = a.nodeId in blockedNodeIds
                val bBlocked = b.nodeId in blockedNodeIds
                val dx = (b.x - a.x).toFloat()
                val dy = (b.y - a.y).toFloat()
                val distPx = sqrt(dx * dx + dy * dy)
                if (distPx <= 0.5f || distPx > maxPx) continue
                // Không nối xuyên tường đặc — chỉ qua khe cửa / khoảng trống
                if (graph.crossesWall(
                        a.x.toFloat(), a.y.toFloat(),
                        b.x.toFloat(), b.y.toFloat(),
                    )
                ) {
                    continue
                }
                val exitBridge = escapeFromHazard && aBlocked != bBlocked
                val crossesHz = hazardPolygons.isNotEmpty() &&
                    segmentCrossesHazard(
                        a.x.toFloat(), a.y.toFloat(),
                        b.x.toFloat(), b.y.toFloat(),
                        hazardPolygons,
                    )
                if (crossesHz && !exitBridge && !allowHazardTraversal) continue
                val keyAb = "${a.nodeId}→${b.nodeId}"
                val keyBa = "${b.nodeId}→${a.nodeId}"
                if (keyAb in existing && keyBa in existing) continue
                val distM = graph.pixelsToMeters(distPx)
                val softCost = when {
                    crossesHz && allowHazardTraversal -> distM * 9f
                    exitBridge -> distM * 0.85f
                    escapeFromHazard && aBlocked && bBlocked -> distM * 1.6f
                    else -> distM * 1.15f
                }
                val angle = kotlin.math.atan2(dx, -dy)
                val rev = kotlin.math.atan2(-dx, dy)
                if (keyAb !in existing) {
                    result.getOrPut(a.nodeId) { mutableListOf() }.add(
                        GraphEdge(
                            id = "soft:$keyAb",
                            sourceNodeId = a.nodeId,
                            targetNodeId = b.nodeId,
                            sourceX = a.x.toFloat(),
                            sourceY = a.y.toFloat(),
                            targetX = b.x.toFloat(),
                            targetY = b.y.toFloat(),
                            angleRad = angle,
                            reverseAngleRad = rev,
                            distanceMeters = softCost,
                        ),
                    )
                }
                if (keyBa !in existing) {
                    result.getOrPut(b.nodeId) { mutableListOf() }.add(
                        GraphEdge(
                            id = "soft:$keyBa",
                            sourceNodeId = b.nodeId,
                            targetNodeId = a.nodeId,
                            sourceX = b.x.toFloat(),
                            sourceY = b.y.toFloat(),
                            targetX = a.x.toFloat(),
                            targetY = a.y.toFloat(),
                            angleRad = rev,
                            reverseAngleRad = angle,
                            distanceMeters = softCost,
                        ),
                    )
                }
            }
        }
        return result
    }

    /** Đoạn thẳng cắt / đi vào trong polygon vùng nguy hiểm? */
    private fun segmentCrossesHazard(
        x1: Float,
        y1: Float,
        x2: Float,
        y2: Float,
        polygons: List<List<Pair<Float, Float>>>,
    ): Boolean {
        if (polygons.isEmpty()) return false
        for (poly in polygons) {
            if (poly.size < 3) continue
            for (i in 1..8) {
                val t = i / 9f
                val x = x1 + (x2 - x1) * t
                val y = y1 + (y2 - y1) * t
                if (pointInPolygon(x, y, poly)) return true
            }
        }
        return false
    }

    private fun pointInPolygon(x: Float, y: Float, poly: List<Pair<Float, Float>>): Boolean {
        var inside = false
        var j = poly.size - 1
        for (i in poly.indices) {
            val (xi, yi) = poly[i]
            val (xj, yj) = poly[j]
            if ((yi > y) != (yj > y) &&
                x < (xj - xi) * (y - yi) / (yj - yi + 1e-9f) + xi
            ) {
                inside = !inside
            }
            j = i
        }
        return inside
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Heuristic: khoảng cách Euclid (đơn vị mét) */
    private fun heuristic(nodeId: String, goalX: Float, goalY: Float): Float {
        val node = graph.nodeMap[nodeId] ?: return 0f
        val dx = node.x - goalX
        val dy = node.y - goalY
        val distPx = sqrt(dx * dx + dy * dy)
        return graph.pixelsToMeters(distPx)
    }

    /** Truy ngược đường đi từ goal về start */
    private fun reconstructPath(
        goal: String,
        cameFromNode: Map<String, String>,
        cameFromEdge: Map<String, GraphEdge>,
        totalDist: Float
    ): PathResult {
        val nodeIds = mutableListOf<String>()
        val edges = mutableListOf<GraphEdge>()
        var current = goal

        while (cameFromNode.containsKey(current)) {
            nodeIds.add(0, current)
            cameFromEdge[current]?.let { edges.add(0, it) }
            current = cameFromNode[current]!!
        }
        nodeIds.add(0, current)  // thêm start node

        return PathResult(nodeIds, edges, totalDist)
    }
}
