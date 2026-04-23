package com.khoaluan.indoornav.navigation.graph

import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.PathNode
import kotlin.math.*

/**
 * FILE: GraphModel.kt
 * MỤC ĐÍCH: Xây dựng đồ thị điều hướng từ MapData
 *
 * INPUT : MapData.nodes (PathNode) + MapData.edges (PathEdge) + scaleRatio
 * OUTPUT: Danh sách GraphEdge đã tính sẵn:
 *           - angleRad:       hướng source→target (radian, 0=Bắc)
 *           - distanceMeters: chiều dài thực (mét)
 *
 * SCALE: Công thức từ Web Editor: Mét = (Pixel / 40) × scaleRatio
 *        Trong đó scaleRatio là metersPerGrid (1 ô lưới = 40px)
 *
 * HỆ TRỤC: Canvas Android — Y tăng xuống dưới
 *   → atan2(dx, -dy) cho góc tính từ Bắc, tăng theo chiều kim đồng hồ
 */

/** Đại diện cho 1 cạnh đồ thị đã được xử lý đầy đủ */
data class GraphEdge(
    val id: String,                // Format: "sourceNodeId→targetNodeId"
    val sourceNodeId: String,
    val targetNodeId: String,
    val sourceX: Float,
    val sourceY: Float,
    val targetX: Float,
    val targetY: Float,
    val angleRad: Float,           // Hướng source→target (rad, 0=Bắc)
    val reverseAngleRad: Float,    // Hướng target→source (rad)
    val distanceMeters: Float      // Chiều dài thực (mét)
)

private data class WallSegment(
    val x1: Float,
    val y1: Float,
    val x2: Float,
    val y2: Float
)

class GraphModel(private val mapData: MapData) {
    companion object {
        private const val GRID_SIZE_PX = 40f
        private const val DEFAULT_SCALE_RATIO = 0.5f // 1m = 80px
    }

    /** Map nodeId (String) → PathNode để tra cứu O(1) */
    val nodeMap: Map<String, PathNode> = mapData.nodes.associateBy { it.nodeId }

    /** Tất cả GraphEdge (bao gồm cả 2 chiều của mỗi edge gốc) */
    val edges: List<GraphEdge> = buildEdges()

    /** Adjacency list: nodeId → danh sách Edge xuất phát từ node đó */
    val adjacency: Map<String, List<GraphEdge>> = buildAdjacency()

    /** scaleRatio từ MapData (metersPerGrid, 1 grid = 40px) */
    private val safeScaleRatio = mapData.scaleRatio.toFloat().takeIf { it > 0f } ?: DEFAULT_SCALE_RATIO
    private val wallSegments: List<WallSegment> = buildWallSegments()

    // ── Build Edges ────────────────────────────────────────────────────────────

    private fun buildEdges(): List<GraphEdge> {
        val result = mutableListOf<GraphEdge>()

        mapData.edges.forEach { edge ->
            val src = nodeMap[edge.source] ?: return@forEach
            val tgt = nodeMap[edge.target] ?: return@forEach

            val dx = (tgt.x - src.x).toFloat()
            val dy = (tgt.y - src.y).toFloat()
            val distPx = sqrt(dx * dx + dy * dy)

            // Đổi pixel → mét: Mét = (Pixel / GRID_SIZE_PX) × scaleRatio
            val distMeters = (distPx / GRID_SIZE_PX) * safeScaleRatio

            // Góc từ Bắc (0), tăng theo chiều kim đồng hồ
            // Canvas: Y tăng xuống → đảo -dy để trục Y hướng lên trước khi tính atan2
            val angleRad = atan2(dx, -dy)
            val reverseAngleRad = atan2(-dx, dy)

            // Chiều đi: source → target
            result.add(
                GraphEdge(
                    id = "${edge.source}→${edge.target}",
                    sourceNodeId = edge.source,
                    targetNodeId = edge.target,
                    sourceX = src.x.toFloat(),
                    sourceY = src.y.toFloat(),
                    targetX = tgt.x.toFloat(),
                    targetY = tgt.y.toFloat(),
                    angleRad = angleRad,
                    reverseAngleRad = reverseAngleRad,
                    distanceMeters = distMeters
                )
            )

            // Chiều ngược: target → source (đồ thị vô hướng)
            result.add(
                GraphEdge(
                    id = "${edge.target}→${edge.source}",
                    sourceNodeId = edge.target,
                    targetNodeId = edge.source,
                    sourceX = tgt.x.toFloat(),
                    sourceY = tgt.y.toFloat(),
                    targetX = src.x.toFloat(),
                    targetY = src.y.toFloat(),
                    angleRad = reverseAngleRad,
                    reverseAngleRad = angleRad,
                    distanceMeters = distMeters
                )
            )
        }

        return result.filterNot { intersectsAnyWall(it) }
    }

    private fun buildAdjacency(): Map<String, List<GraphEdge>> {
        val adj = mutableMapOf<String, MutableList<GraphEdge>>()
        edges.forEach { e ->
            adj.getOrPut(e.sourceNodeId) { mutableListOf() }.add(e)
        }
        return adj
    }

    // ── Tiện ích ───────────────────────────────────────────────────────────────

    /**
     * Tính tọa độ pixel của vị trí trên Edge theo progress
     * @param progress 0.0 = tại source, 1.0 = tại target
     */
    fun getPositionOnEdge(edge: GraphEdge, progress: Float): Pair<Float, Float> {
        val x = edge.sourceX + (edge.targetX - edge.sourceX) * progress
        val y = edge.sourceY + (edge.targetY - edge.sourceY) * progress
        return Pair(x, y)
    }

    /**
     * Tìm Edge và progress gần nhất với điểm (x, y)
     * Dùng khi cần fallback từ tọa độ pixel sang vị trí topological
     * @return Pair(GraphEdge, progress) hoặc null nếu không có edge
     */
    fun findNearestEdge(x: Float, y: Float): Pair<GraphEdge, Float>? {
        var bestEdge: GraphEdge? = null
        var bestProgress = 0f
        var bestDist = Float.MAX_VALUE

        // Chỉ xét 1 chiều mỗi edge gốc (tránh trùng lặp)
        val seen = mutableSetOf<String>()

        edges.forEach { edge ->
            // Tạo key unique cho edge gốc (không phân biệt source/target)
            val key = listOf(edge.sourceNodeId, edge.targetNodeId).sorted().joinToString("–")
            if (key in seen) return@forEach
            seen.add(key)

            val (projX, projY, t) = projectOnEdge(x, y, edge)
            val dist = sqrt((projX - x).pow(2) + (projY - y).pow(2))
            if (dist < bestDist) {
                bestDist = dist
                bestEdge = edge
                bestProgress = t
            }
        }

        return bestEdge?.let { Pair(it, bestProgress) }
    }

    /** Chiếu điểm (px, py) vuông góc lên đoạn thẳng của edge */
    private fun projectOnEdge(px: Float, py: Float, edge: GraphEdge): Triple<Float, Float, Float> {
        val dx = edge.targetX - edge.sourceX
        val dy = edge.targetY - edge.sourceY
        val lenSq = dx * dx + dy * dy
        if (lenSq == 0f) return Triple(edge.sourceX, edge.sourceY, 0f)
        val t = ((px - edge.sourceX) * dx + (py - edge.sourceY) * dy) / lenSq
        val tc = t.coerceIn(0f, 1f)
        return Triple(edge.sourceX + tc * dx, edge.sourceY + tc * dy, tc)
    }

    /**
     * Lấy tất cả các Edge xuất phát từ Node — trả về danh sách hướng có thể đi
     */
    fun getEdgesFromNode(nodeId: String): List<GraphEdge> =
        adjacency[nodeId] ?: emptyList()

    private fun buildWallSegments(): List<WallSegment> {
        val segments = mutableListOf<WallSegment>()
        mapData.walls.forEach { wall ->
            val pts = wall.points
            if (pts.size >= 2) {
                for (i in 0 until pts.size - 1) {
                    segments.add(
                        WallSegment(
                            x1 = pts[i].x,
                            y1 = pts[i].y,
                            x2 = pts[i + 1].x,
                            y2 = pts[i + 1].y
                        )
                    )
                }
                if (wall.isOuter && pts.size > 2) {
                    val first = pts.first()
                    val last = pts.last()
                    segments.add(
                        WallSegment(
                            x1 = last.x,
                            y1 = last.y,
                            x2 = first.x,
                            y2 = first.y
                        )
                    )
                }
            } else if (wall.x1 != null && wall.y1 != null && wall.x2 != null && wall.y2 != null) {
                segments.add(
                    WallSegment(
                        x1 = wall.x1,
                        y1 = wall.y1,
                        x2 = wall.x2,
                        y2 = wall.y2
                    )
                )
            }
        }
        return segments
    }

    private fun intersectsAnyWall(edge: GraphEdge): Boolean {
        if (wallSegments.isEmpty()) return false
        return wallSegments.any { ws ->
            segmentsIntersect(
                edge.sourceX, edge.sourceY, edge.targetX, edge.targetY,
                ws.x1, ws.y1, ws.x2, ws.y2
            )
        }
    }

    private fun segmentsIntersect(
        ax: Float, ay: Float, bx: Float, by: Float,
        cx: Float, cy: Float, dx: Float, dy: Float
    ): Boolean {
        val o1 = orientation(ax, ay, bx, by, cx, cy)
        val o2 = orientation(ax, ay, bx, by, dx, dy)
        val o3 = orientation(cx, cy, dx, dy, ax, ay)
        val o4 = orientation(cx, cy, dx, dy, bx, by)

        if (o1 != o2 && o3 != o4) return true

        // Xử lý collinear cases
        return (o1 == 0 && onSegment(ax, ay, cx, cy, bx, by)) ||
            (o2 == 0 && onSegment(ax, ay, dx, dy, bx, by)) ||
            (o3 == 0 && onSegment(cx, cy, ax, ay, dx, dy)) ||
            (o4 == 0 && onSegment(cx, cy, bx, by, dx, dy))
    }

    private fun orientation(
        ax: Float, ay: Float,
        bx: Float, by: Float,
        cx: Float, cy: Float
    ): Int {
        val value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by)
        val eps = 1e-5f
        return when {
            abs(value) < eps -> 0
            value > 0 -> 1
            else -> 2
        }
    }

    private fun onSegment(
        ax: Float, ay: Float,
        bx: Float, by: Float,
        cx: Float, cy: Float
    ): Boolean {
        return bx <= max(ax, cx) && bx >= min(ax, cx) &&
            by <= max(ay, cy) && by >= min(ay, cy)
    }
}
