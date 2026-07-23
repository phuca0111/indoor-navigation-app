package com.khoaluan.indoornav.navigation.instruction

import com.khoaluan.indoornav.navigation.graph.GraphEdge
import com.khoaluan.indoornav.navigation.heading.MapHeadingMath
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.roundToInt

/**
 * W1 — Sinh chỉ dẫn text (đi thẳng / rẽ trái / rẽ phải) từ path A*.
 * Không TTS (W5). Không xử lý “đến nơi” formal (W2) — chỉ text “Sắp đến”.
 */
object TurnByTurnEngine {

    enum class ManeuverType {
        STRAIGHT,
        TURN_LEFT,
        TURN_RIGHT,
        ARRIVE,
    }

    data class Maneuver(
        val type: ManeuverType,
        /** Mét tích lũy từ đầu path tới vertex manoeuvre. */
        val atDistanceMeters: Float,
    )

    data class Guidance(
        val instructionText: String,
        val distanceToNextManeuverMeters: Float,
        val remainingDistanceMeters: Float,
        val routeProgress: Float,
        val nextType: ManeuverType,
    )

    /** Góc dưới ngưỡng này coi là đi thẳng (gộp đoạn). */
    const val STRAIGHT_THRESHOLD_DEG = 28f

    fun buildManeuvers(edges: List<GraphEdge>): List<Maneuver> {
        if (edges.isEmpty()) {
            return listOf(Maneuver(ManeuverType.ARRIVE, 0f))
        }
        val out = mutableListOf<Maneuver>()
        var cum = 0f
        for (i in 0 until edges.lastIndex) {
            cum += edges[i].distanceMeters
            val fromDeg = radToBearingDeg(edges[i].angleRad)
            val toDeg = radToBearingDeg(edges[i + 1].angleRad)
            val delta = MapHeadingMath.shortestDeltaDegrees(fromDeg, toDeg)
            when {
                abs(delta) < STRAIGHT_THRESHOLD_DEG -> {
                    // Đi thẳng — không thêm manoeuvre rẽ
                }
                delta > 0f -> out.add(Maneuver(ManeuverType.TURN_RIGHT, cum))
                else -> out.add(Maneuver(ManeuverType.TURN_LEFT, cum))
            }
        }
        val total = edges.sumOf { it.distanceMeters.toDouble() }.toFloat()
        out.add(Maneuver(ManeuverType.ARRIVE, total))
        return out
    }

    /**
     * Mét đã đi dọc path: chiếu user lên segment gần nhất.
     */
    fun traveledMetersAlongEdges(
        edges: List<GraphEdge>,
        userX: Float,
        userY: Float,
    ): Float {
        if (edges.isEmpty()) return 0f
        var bestDist = Float.MAX_VALUE
        var bestTraveled = 0f
        var prefix = 0f
        for (edge in edges) {
            val (d, t) = distanceAndTToSegment(
                userX, userY,
                edge.sourceX, edge.sourceY,
                edge.targetX, edge.targetY,
            )
            if (d < bestDist) {
                bestDist = d
                bestTraveled = prefix + t * edge.distanceMeters
            }
            prefix += edge.distanceMeters
        }
        return bestTraveled.coerceIn(0f, prefix)
    }

    fun guidance(
        maneuvers: List<Maneuver>,
        totalDistanceMeters: Float,
        traveledMeters: Float,
    ): Guidance {
        val total = totalDistanceMeters.coerceAtLeast(0f)
        val traveled = traveledMeters.coerceIn(0f, total)
        val remaining = (total - traveled).coerceAtLeast(0f)
        val progress = if (total > 1e-3f) (traveled / total).coerceIn(0f, 1f) else 0f

        if (maneuvers.isEmpty()) {
            return Guidance("Đang điều hướng", remaining, remaining, progress, ManeuverType.STRAIGHT)
        }

        // Manoeuvre tiếp theo phía trước (hysteresis 0.8 m tránh nhấp nháy)
        val next = maneuvers.firstOrNull { it.atDistanceMeters > traveled + 0.8f }
            ?: maneuvers.last()
        val distToNext = (next.atDistanceMeters - traveled).coerceAtLeast(0f)
        val text = formatInstruction(next.type, distToNext, remaining)
        return Guidance(
            instructionText = text,
            distanceToNextManeuverMeters = distToNext,
            remainingDistanceMeters = remaining,
            routeProgress = progress,
            nextType = next.type,
        )
    }

    fun formatInstruction(
        type: ManeuverType,
        distanceToManeuverMeters: Float,
        remainingMeters: Float = distanceToManeuverMeters,
    ): String {
        val d = distanceToManeuverMeters.roundToInt().coerceAtLeast(0)
        return when (type) {
            ManeuverType.TURN_LEFT -> when {
                d <= 3 -> "Rẽ trái"
                else -> "Rẽ trái sau $d m"
            }
            ManeuverType.TURN_RIGHT -> when {
                d <= 3 -> "Rẽ phải"
                else -> "Rẽ phải sau $d m"
            }
            ManeuverType.ARRIVE -> when {
                remainingMeters <= 5f || d <= 5 -> "Sắp đến nơi"
                d <= 15 -> "Đi thẳng · còn ${remainingMeters.roundToInt()} m"
                else -> "Đi thẳng ${d} m · còn ${remainingMeters.roundToInt()} m"
            }
            ManeuverType.STRAIGHT -> when {
                d <= 5 -> "Đi thẳng"
                else -> "Đi thẳng $d m"
            }
        }
    }

    /** Bearing độ: 0 = Bắc, tăng theo kim đồng hồ (khớp GraphModel). */
    fun radToBearingDeg(angleRad: Float): Float {
        val deg = Math.toDegrees(angleRad.toDouble()).toFloat()
        return MapHeadingMath.normalizeDegrees(deg)
    }

    /** Bearing từ vector pixel (Y tăng xuống). */
    fun bearingDegFromDelta(dx: Float, dy: Float): Float {
        // Cùng công thức GraphModel: atan2(dx, -dy)
        return radToBearingDeg(atan2(dx, -dy))
    }

    private fun distanceAndTToSegment(
        px: Float,
        py: Float,
        ax: Float,
        ay: Float,
        bx: Float,
        by: Float,
    ): Pair<Float, Float> {
        val abX = bx - ax
        val abY = by - ay
        val abLenSq = abX * abX + abY * abY
        if (abLenSq <= 1e-6f) {
            return hypot(px - ax, py - ay) to 0f
        }
        val t = (((px - ax) * abX + (py - ay) * abY) / abLenSq).coerceIn(0f, 1f)
        val projX = ax + t * abX
        val projY = ay + t * abY
        return hypot(px - projX, py - projY) to t
    }
}
