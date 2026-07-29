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
 *
 * Early-turn: nếu user đã quay đúng hướng cạnh sau điểm rẽ (còn cách vài mét),
 * bỏ manoeuvre đó để không kẹt “Rẽ phải sau 3–4 m”.
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
        /** Mét dọc path đã dùng sau early-turn skip (có thể > traveled thật). */
        val effectiveTraveledMeters: Float = 0f,
        val nextManeuverAtMeters: Float = 0f,
        val nextManeuverMapX: Float? = null,
        val nextManeuverMapY: Float? = null,
    )

    /** Góc dưới ngưỡng này coi là đi thẳng (gộp đoạn). */
    const val STRAIGHT_THRESHOLD_DEG = 28f

    /**
     * Dưới ngưỡng này (mét) mới nói “Rẽ trái/phải” (không kèm “sau Xm”).
     * Trước 3 m báo quá sớm trong nhà.
     */
    const val IMMEDIATE_TURN_METERS = 1f

    /** Khoảng cách tới điểm rẽ còn trong cửa sổ này mới xét early-turn. */
    const val EARLY_TURN_MIN_DIST_M = 0.25f
    const val EARLY_TURN_MAX_DIST_M = 6f

    /** Heading lệch hướng cạnh sau rẽ ≤ ngưỡng → coi đã rẽ. */
    const val EARLY_TURN_ALIGN_DEG = 28f

    /** Hysteresis khi chọn manoeuvre tiếp theo / sau khi skip. */
    const val MANEUVER_HYSTERESIS_M = 0.8f

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

    /**
     * @param skipEarlyTurnConfirmed true khi ViewModel đã thấy heading khớp đủ lâu (~280ms)
     */
    fun guidance(
        maneuvers: List<Maneuver>,
        totalDistanceMeters: Float,
        traveledMeters: Float,
        edges: List<GraphEdge> = emptyList(),
        userHeadingDeg: Float? = null,
        skipEarlyTurnConfirmed: Boolean = false,
    ): Guidance {
        val total = totalDistanceMeters.coerceAtLeast(0f)
        var traveled = traveledMeters.coerceIn(0f, total)

        if (maneuvers.isEmpty()) {
            return Guidance(
                instructionText = "Đang điều hướng",
                distanceToNextManeuverMeters = total,
                remainingDistanceMeters = (total - traveled).coerceAtLeast(0f),
                routeProgress = if (total > 1e-3f) (traveled / total).coerceIn(0f, 1f) else 0f,
                nextType = ManeuverType.STRAIGHT,
                effectiveTraveledMeters = traveled,
            )
        }

        // Early-turn: đẩy traveled ảo qua điểm rẽ nếu đã quay đúng hướng cạnh sau.
        if (skipEarlyTurnConfirmed && userHeadingDeg != null && edges.isNotEmpty()) {
            traveled = applyEarlyTurnSkip(maneuvers, edges, traveled, userHeadingDeg, total)
        }

        val remaining = (total - traveled).coerceAtLeast(0f)
        val progress = if (total > 1e-3f) (traveled / total).coerceIn(0f, 1f) else 0f

        val next = maneuvers.firstOrNull { it.atDistanceMeters > traveled + MANEUVER_HYSTERESIS_M }
            ?: maneuvers.last()
        val distToNext = (next.atDistanceMeters - traveled).coerceAtLeast(0f)
        val text = formatInstruction(next.type, distToNext, remaining)
        val pos = maneuverMapPosition(edges, next.atDistanceMeters)
        val showMarker = next.type == ManeuverType.TURN_LEFT || next.type == ManeuverType.TURN_RIGHT

        return Guidance(
            instructionText = text,
            distanceToNextManeuverMeters = distToNext,
            remainingDistanceMeters = remaining,
            routeProgress = progress,
            nextType = next.type,
            effectiveTraveledMeters = traveled,
            nextManeuverAtMeters = next.atDistanceMeters,
            nextManeuverMapX = if (showMarker) pos?.first else null,
            nextManeuverMapY = if (showMarker) pos?.second else null,
        )
    }

    /**
     * Heading đã khớp hướng sau điểm rẽ (chưa cần confirmed stable).
     * Dùng để ViewModel đo thời gian ổn định trước khi skip.
     */
    fun isEarlyTurnHeadingAligned(
        maneuvers: List<Maneuver>,
        edges: List<GraphEdge>,
        traveledMeters: Float,
        userHeadingDeg: Float,
        totalDistanceMeters: Float = Float.MAX_VALUE,
    ): Boolean {
        if (edges.isEmpty() || maneuvers.isEmpty()) return false
        val traveled = traveledMeters.coerceIn(0f, totalDistanceMeters.coerceAtLeast(0f))
        val next = maneuvers.firstOrNull { it.atDistanceMeters > traveled + MANEUVER_HYSTERESIS_M }
            ?: return false
        if (next.type != ManeuverType.TURN_LEFT && next.type != ManeuverType.TURN_RIGHT) return false
        val dist = next.atDistanceMeters - traveled
        if (dist < EARLY_TURN_MIN_DIST_M || dist > EARLY_TURN_MAX_DIST_M) return false
        val outBearing = outgoingBearingDeg(edges, next.atDistanceMeters) ?: return false
        val delta = abs(MapHeadingMath.shortestDeltaDegrees(userHeadingDeg, outBearing))
        return delta <= EARLY_TURN_ALIGN_DEG
    }

    fun applyEarlyTurnSkip(
        maneuvers: List<Maneuver>,
        edges: List<GraphEdge>,
        traveledMeters: Float,
        userHeadingDeg: Float,
        totalDistanceMeters: Float,
    ): Float {
        var traveled = traveledMeters.coerceIn(0f, totalDistanceMeters.coerceAtLeast(0f))
        // Có thể skip nhiều manoeuvre liên tiếp nếu user đã quay đúng hướng đoạn sau.
        repeat(4) {
            val next = maneuvers.firstOrNull { it.atDistanceMeters > traveled + MANEUVER_HYSTERESIS_M }
                ?: return traveled
            if (next.type != ManeuverType.TURN_LEFT && next.type != ManeuverType.TURN_RIGHT) {
                return traveled
            }
            val dist = next.atDistanceMeters - traveled
            if (dist < EARLY_TURN_MIN_DIST_M || dist > EARLY_TURN_MAX_DIST_M) return traveled
            val outBearing = outgoingBearingDeg(edges, next.atDistanceMeters) ?: return traveled
            val delta = abs(MapHeadingMath.shortestDeltaDegrees(userHeadingDeg, outBearing))
            if (delta > EARLY_TURN_ALIGN_DEG) return traveled
            traveled = (next.atDistanceMeters + MANEUVER_HYSTERESIS_M + 0.05f)
                .coerceAtMost(totalDistanceMeters.coerceAtLeast(0f))
        }
        return traveled
    }

    /** Tọa độ map (px) của vertex manoeuvre. */
    fun maneuverMapPosition(edges: List<GraphEdge>, atDistanceMeters: Float): Pair<Float, Float>? {
        if (edges.isEmpty()) return null
        var cum = 0f
        for (edge in edges) {
            cum += edge.distanceMeters
            if (cum + 1e-3f >= atDistanceMeters) {
                return edge.targetX to edge.targetY
            }
        }
        val last = edges.last()
        return last.targetX to last.targetY
    }

    /** Bearing cạnh đi ra sau điểm rẽ (edge kế tiếp). */
    fun outgoingBearingDeg(edges: List<GraphEdge>, atDistanceMeters: Float): Float? {
        if (edges.size < 2) return null
        var cum = 0f
        for (i in edges.indices) {
            cum += edges[i].distanceMeters
            if (cum + 1e-3f >= atDistanceMeters) {
                val next = edges.getOrNull(i + 1) ?: return null
                return radToBearingDeg(next.angleRad)
            }
        }
        return null
    }

    fun formatInstruction(
        type: ManeuverType,
        distanceToManeuverMeters: Float,
        remainingMeters: Float = distanceToManeuverMeters,
    ): String {
        val d = distanceToManeuverMeters.roundToInt().coerceAtLeast(0)
        val now = distanceToManeuverMeters <= IMMEDIATE_TURN_METERS
        return when (type) {
            ManeuverType.TURN_LEFT -> when {
                now -> "Rẽ trái"
                else -> "Rẽ trái sau ${d.coerceAtLeast(1)} m"
            }
            ManeuverType.TURN_RIGHT -> when {
                now -> "Rẽ phải"
                else -> "Rẽ phải sau ${d.coerceAtLeast(1)} m"
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
