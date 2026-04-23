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

    data class PathResult(
        val nodeIds: List<String>,          // Trình tự nodeId từ start đến goal
        val edges: List<GraphEdge>,         // Trình tự GraphEdge từ start đến goal
        val totalDistanceMeters: Float      // Tổng khoảng cách (mét)
    )

    /**
     * Tìm đường ngắn nhất từ startNodeId đến goalNodeId
     * @return PathResult hoặc null nếu không tìm được đường đi
     */
    fun findPath(startNodeId: String, goalNodeId: String): PathResult? {
        // Trường hợp đặc biệt: bắt đầu = đích
        if (startNodeId == goalNodeId) {
            return PathResult(listOf(startNodeId), emptyList(), 0f)
        }

        val goalNode = graph.nodeMap[goalNodeId] ?: return null
        val goalX = goalNode.x.toFloat()
        val goalY = goalNode.y.toFloat()

        // ── Khởi tạo ──
        // openSet: (fScore, nodeId) — ưu tiên fScore thấp nhất
        val openSet = PriorityQueue<Pair<Float, String>>(compareBy { it.first })
        val gScore = mutableMapOf<String, Float>().withDefault { Float.MAX_VALUE }
        val cameFromNode = mutableMapOf<String, String>()
        val cameFromEdge = mutableMapOf<String, GraphEdge>()
        val closedSet = mutableSetOf<String>()

        gScore[startNodeId] = 0f
        openSet.add(Pair(heuristic(startNodeId, goalX, goalY), startNodeId))

        // ── A* Loop ──
        while (openSet.isNotEmpty()) {
            val (_, current) = openSet.poll()

            if (current == goalNodeId) {
                return reconstructPath(current, cameFromNode, cameFromEdge, gScore[current] ?: 0f)
            }

            if (current in closedSet) continue
            closedSet.add(current)

            graph.adjacency[current]?.forEach { edge ->
                val neighbor = edge.targetNodeId
                if (neighbor in closedSet) return@forEach

                val tentativeG = gScore.getValue(current) + edge.distanceMeters
                if (tentativeG < gScore.getValue(neighbor)) {
                    gScore[neighbor] = tentativeG
                    cameFromNode[neighbor] = current
                    cameFromEdge[neighbor] = edge
                    val fScore = tentativeG + heuristic(neighbor, goalX, goalY)
                    openSet.add(Pair(fScore, neighbor))
                }
            }
        }

        return null  // Không tìm thấy đường
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Heuristic: khoảng cách Euclid pixel (admissible vì scaleRatio đồng nhất) */
    private fun heuristic(nodeId: String, goalX: Float, goalY: Float): Float {
        val node = graph.nodeMap[nodeId] ?: return 0f
        val dx = node.x - goalX
        val dy = node.y - goalY
        return sqrt(dx * dx + dy * dy)
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
