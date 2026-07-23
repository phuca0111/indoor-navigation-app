package com.khoaluan.indoornav.navigation.instruction

import com.khoaluan.indoornav.data.model.PathNode
import com.khoaluan.indoornav.navigation.graph.GraphEdge

/**
 * W3 — Phát hiện node cầu thang / thang máy trên path (cùng tầng).
 * Multi-floor A* đầy đủ phụ thuộc data connector giữa tầng; bản này gợi ý UX khi tới connector.
 */
object FloorTransitionDetector {

    data class ConnectorHint(
        val kind: Kind,
        val nodeId: String,
        val atDistanceMeters: Float,
    ) {
        enum class Kind { STAIRS, ELEVATOR }

        val labelVi: String
            get() = when (kind) {
                Kind.STAIRS -> "cầu thang"
                Kind.ELEVATOR -> "thang máy"
            }
    }

    fun findConnectorsOnPath(
        edges: List<GraphEdge>,
        nodeMap: Map<String, PathNode>,
    ): List<ConnectorHint> {
        if (edges.isEmpty()) return emptyList()
        val out = mutableListOf<ConnectorHint>()
        var cum = 0f
        // Kiểm tra target của mỗi edge (vertex giữa + đích)
        for (edge in edges) {
            cum += edge.distanceMeters
            val node = nodeMap[edge.targetNodeId] ?: continue
            val kind = when {
                node.isElevator -> ConnectorHint.Kind.ELEVATOR
                node.isStairs -> ConnectorHint.Kind.STAIRS
                else -> null
            } ?: continue
            // Tránh trùng node liên tiếp
            if (out.lastOrNull()?.nodeId == edge.targetNodeId) continue
            out.add(ConnectorHint(kind, edge.targetNodeId, cum))
        }
        return out
    }

    /**
     * Nếu đang trong [approachMeters] tới connector → câu gợi ý chuyển tầng.
     * Null nếu chưa gần.
     */
    fun approachInstruction(
        connectors: List<ConnectorHint>,
        traveledMeters: Float,
        approachMeters: Float = 8f,
        targetFloor: Int? = null,
    ): String? {
        val next = connectors.firstOrNull { it.atDistanceMeters > traveledMeters - 0.5f }
            ?: return null
        val dist = next.atDistanceMeters - traveledMeters
        if (dist > approachMeters) return null
        val floorHint = when {
            targetFloor == null -> ""
            targetFloor == 0 -> " · lên tầng trệt"
            else -> " · lên tầng $targetFloor"
        }
        return when {
            dist <= 2f -> "Tới ${next.labelVi}$floorHint — đổi tầng rồi tiếp tục"
            else -> "Đến ${next.labelVi} sau ${dist.toInt()} m$floorHint"
        }
    }
}
