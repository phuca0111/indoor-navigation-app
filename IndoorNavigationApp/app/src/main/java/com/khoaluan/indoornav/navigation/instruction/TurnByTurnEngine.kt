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
    const val STRAIGHT_THRESHOLD_DEG = 42f

    /**
     * Dưới ngưỡng này (mét) nói “Rẽ trái/phải” (không kèm “sau Xm”).
     * Có hysteresis riêng trong [guidance] để khỏi nhấp 2↔3 m spam UI/TTS.
     */
    const val IMMEDIATE_TURN_METERS = 1.2f
    /** Ra khỏi chế độ “Rẽ ngay” khi cách điểm rẽ xa hơn ngưỡng này. */
    const val IMMEDIATE_TURN_EXIT_METERS = 2.4f
    /** Xa hơn ngưỡng này → hiện “Đi thẳng” (chưa nhắc rẽ). */
    const val TURN_PREVIEW_METERS = 4.0f

    /** Khoảng cách tới điểm rẽ còn trong cửa sổ này mới xét early-turn. */
    const val EARLY_TURN_MIN_DIST_M = 0.25f
    const val EARLY_TURN_MAX_DIST_M = 6f

    /** Heading lệch hướng cạnh sau rẽ ≤ ngưỡng → coi đã rẽ. */
    const val EARLY_TURN_ALIGN_DEG = 32f

    /** Hysteresis khi chọn manoeuvre tiếp theo / sau khi skip — chỉ cho ARRIVE/thẳng. */
    const val MANEUVER_HYSTERESIS_M = 0.8f
    /** Phải đi quá điểm rẽ ít nhất từng này (hoặc đã quay đúng hướng) mới bỏ manoeuvre rẽ. */
    const val TURN_PASS_METERS = 1.6f
    /** Còn trong cửa sổ này quanh điểm rẽ → giữ “Rẽ …” dù projection đã hơi vượt vertex. */
    const val TURN_HOLD_BEFORE_M = 0.35f
    const val TURN_HOLD_AFTER_M = 2.2f

    /**
     * Sinh manoeuvre từ **hình học cạnh** (dx,dy), không tin angleRad có thể lệch chiều.
     * Cạnh rất ngắn (bridge) không tạo điểm rẽ — vẫn cộng cum để khớp traveled.
     */
    fun buildManeuvers(edges: List<GraphEdge>): List<Maneuver> {
        if (edges.isEmpty()) {
            return listOf(Maneuver(ManeuverType.ARRIVE, 0f))
        }
        val out = mutableListOf<Maneuver>()
        var cum = 0f
        for (i in 0 until edges.lastIndex) {
            cum += edges[i].distanceMeters
            if (edges[i].distanceMeters < 0.35f || edges[i + 1].distanceMeters < 0.35f) {
                continue
            }
            val ix = edges[i].targetX - edges[i].sourceX
            val iy = edges[i].targetY - edges[i].sourceY
            val ox = edges[i + 1].targetX - edges[i + 1].sourceX
            val oy = edges[i + 1].targetY - edges[i + 1].sourceY
            if (hypot(ix, iy) < 1e-3f || hypot(ox, oy) < 1e-3f) continue
            val fromDeg = bearingDegFromDelta(ix, iy)
            val toDeg = bearingDegFromDelta(ox, oy)
            val delta = MapHeadingMath.shortestDeltaDegrees(fromDeg, toDeg)
            when {
                abs(delta) < STRAIGHT_THRESHOLD_DEG -> Unit
                delta > 0f -> out.add(Maneuver(ManeuverType.TURN_RIGHT, cum))
                else -> out.add(Maneuver(ManeuverType.TURN_LEFT, cum))
            }
        }
        val total = edges.sumOf { it.distanceMeters.toDouble() }.toFloat()
        out.add(Maneuver(ManeuverType.ARRIVE, total))
        return out
    }

    /**
     * Maneuver theo polyline đang vẽ (khớp mắt nhìn trên map).
     */
    fun buildManeuversFromPoints(
        points: List<androidx.compose.ui.geometry.Offset>,
        pixelsToMeters: (Float) -> Float,
    ): List<Maneuver> {
        if (points.size < 2) {
            return listOf(Maneuver(ManeuverType.ARRIVE, 0f))
        }
        val pts = ArrayList<androidx.compose.ui.geometry.Offset>(points.size)
        for (p in points) {
            if (pts.isEmpty()) {
                pts.add(p)
            } else {
                val last = pts.last()
                if (hypot(p.x - last.x, p.y - last.y) >= 8f) pts.add(p)
            }
        }
        if (pts.size < 2) {
            return listOf(Maneuver(ManeuverType.ARRIVE, 0f))
        }
        val out = mutableListOf<Maneuver>()
        var cum = 0f
        for (i in 0 until pts.lastIndex) {
            val a = pts[i]
            val b = pts[i + 1]
            if (i >= 1) {
                val prev = pts[i - 1]
                val ix = a.x - prev.x
                val iy = a.y - prev.y
                val ox = b.x - a.x
                val oy = b.y - a.y
                val inLen = hypot(ix, iy)
                val outLen = hypot(ox, oy)
                // Chân ngắn vẫn nhận góc ~90° (tránh mất “Rẽ trái” sát góc)
                val sharp = abs(
                    MapHeadingMath.shortestDeltaDegrees(
                        bearingDegFromDelta(ix, iy),
                        bearingDegFromDelta(ox, oy),
                    ),
                ) >= 55f
                val minLegPx = if (sharp) 12f else 28f
                if (inLen >= minLegPx && outLen >= minLegPx) {
                    val fromDeg = bearingDegFromDelta(ix, iy)
                    val toDeg = bearingDegFromDelta(ox, oy)
                    val delta = MapHeadingMath.shortestDeltaDegrees(fromDeg, toDeg)
                    when {
                        abs(delta) < STRAIGHT_THRESHOLD_DEG -> Unit
                        delta > 0f -> out.add(Maneuver(ManeuverType.TURN_RIGHT, cum))
                        else -> out.add(Maneuver(ManeuverType.TURN_LEFT, cum))
                    }
                }
            }
            cum += pixelsToMeters(hypot(b.x - a.x, b.y - a.y))
        }
        out.add(Maneuver(ManeuverType.ARRIVE, cum))
        return out
    }

    fun traveledMetersAlongPoints(
        points: List<androidx.compose.ui.geometry.Offset>,
        userX: Float,
        userY: Float,
        pixelsToMeters: (Float) -> Float,
    ): Float {
        if (points.size < 2) return 0f
        var bestDist = Float.MAX_VALUE
        var bestTraveled = 0f
        var prefix = 0f
        for (i in 0 until points.lastIndex) {
            val a = points[i]
            val b = points[i + 1]
            val (d, t) = distanceAndTToSegment(userX, userY, a.x, a.y, b.x, b.y)
            val segM = pixelsToMeters(hypot(b.x - a.x, b.y - a.y))
            if (d < bestDist) {
                bestDist = d
                bestTraveled = prefix + t * segM
            }
            prefix += segM
        }
        return bestTraveled.coerceIn(0f, prefix)
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

    /** Sticky “Rẽ ngay” — tránh UI nhấp “sau 2 m” ↔ “Rẽ phải” ở ngã rẽ. */
    private var stickyImmediateTurn = false
    private var stickyImmediateAtMeters = Float.NaN

    fun resetInstructionSticky() {
        stickyImmediateTurn = false
        stickyImmediateAtMeters = Float.NaN
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

        val next = selectActiveManeuver(
            maneuvers = maneuvers,
            traveled = traveled,
            edges = edges,
            userHeadingDeg = userHeadingDeg,
        )
        val distToNext = (next.atDistanceMeters - traveled).coerceAtLeast(0f)

        val isTurn = next.type == ManeuverType.TURN_LEFT || next.type == ManeuverType.TURN_RIGHT
        if (!isTurn || stickyImmediateAtMeters != next.atDistanceMeters) {
            stickyImmediateTurn = false
            stickyImmediateAtMeters = next.atDistanceMeters
        }
        if (isTurn) {
            // Đứng tại / sắp tới góc → luôn “Rẽ …”, không nhảy sang đoạn sau
            val atCorner = distToNext <= IMMEDIATE_TURN_EXIT_METERS ||
                (traveled >= next.atDistanceMeters - TURN_HOLD_BEFORE_M &&
                    traveled <= next.atDistanceMeters + TURN_HOLD_AFTER_M)
            when {
                atCorner || distToNext <= IMMEDIATE_TURN_METERS -> stickyImmediateTurn = true
                distToNext > IMMEDIATE_TURN_EXIT_METERS -> stickyImmediateTurn = false
            }
        }
        val text = formatInstruction(next.type, distToNext, remaining, stickyImmediateTurn)
        val pos = maneuverMapPosition(edges, next.atDistanceMeters)
        val showMarker = isTurn && (stickyImmediateTurn || distToNext <= TURN_PREVIEW_METERS)
        // Xa ngã rẽ: UI/TTS coi như đi thẳng — chỉ nhắc rẽ khi còn ~1–2 m / đang ở góc
        val displayType = if (isTurn && !stickyImmediateTurn && distToNext > TURN_PREVIEW_METERS) {
            ManeuverType.STRAIGHT
        } else {
            next.type
        }

        return Guidance(
            instructionText = text,
            distanceToNextManeuverMeters = distToNext,
            remainingDistanceMeters = remaining,
            routeProgress = progress,
            nextType = displayType,
            effectiveTraveledMeters = traveled,
            nextManeuverAtMeters = next.atDistanceMeters,
            nextManeuverMapX = if (showMarker) pos?.first else null,
            nextManeuverMapY = if (showMarker) pos?.second else null,
        )
    }

    /**
     * Chọn manoeuvre đang hiệu lực.
     * Điểm rẽ: giữ đến khi đã đi quá rõ **hoặc** heading đã khớp hướng đoạn sau —
     * tránh đứng góc mà nhảy sang “Đi thẳng Xm rồi rẽ …” đoạn kế.
     */
    fun selectActiveManeuver(
        maneuvers: List<Maneuver>,
        traveled: Float,
        edges: List<GraphEdge> = emptyList(),
        userHeadingDeg: Float? = null,
    ): Maneuver {
        if (maneuvers.isEmpty()) {
            return Maneuver(ManeuverType.ARRIVE, traveled.coerceAtLeast(0f))
        }
        for (m in maneuvers) {
            val isTurn = m.type == ManeuverType.TURN_LEFT || m.type == ManeuverType.TURN_RIGHT
            if (!isTurn) {
                if (m.atDistanceMeters > traveled + MANEUVER_HYSTERESIS_M) return m
                continue
            }
            // Chưa tới góc
            if (traveled < m.atDistanceMeters - TURN_HOLD_BEFORE_M) {
                return m
            }
            // Đã vượt xa điểm rẽ
            if (traveled > m.atDistanceMeters + TURN_PASS_METERS) {
                continue
            }
            // Trong cửa sổ góc: chỉ bỏ khi đã quay đúng hướng đoạn sau
            val passedByHeading = if (userHeadingDeg != null && edges.isNotEmpty()) {
                val outBearing = outgoingBearingDeg(edges, m.atDistanceMeters)
                if (outBearing != null) {
                    abs(MapHeadingMath.shortestDeltaDegrees(userHeadingDeg, outBearing)) <=
                        EARLY_TURN_ALIGN_DEG
                } else {
                    false
                }
            } else {
                false
            }
            if (passedByHeading && traveled >= m.atDistanceMeters - 0.15f) {
                continue
            }
            return m
        }
        return maneuvers.last()
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
        val next = selectActiveManeuver(
            maneuvers = maneuvers,
            traveled = traveled,
            edges = edges,
            userHeadingDeg = userHeadingDeg,
        )
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
                val dx = next.targetX - next.sourceX
                val dy = next.targetY - next.sourceY
                return bearingDegFromDelta(dx, dy)
            }
        }
        return null
    }

    fun formatInstruction(
        type: ManeuverType,
        distanceToManeuverMeters: Float,
        remainingMeters: Float = distanceToManeuverMeters,
        forceImmediate: Boolean = false,
    ): String {
        val d = distanceToManeuverMeters.roundToInt().coerceAtLeast(1)
        val remain = remainingMeters.roundToInt().coerceAtLeast(1)
        val now = forceImmediate || distanceToManeuverMeters <= IMMEDIATE_TURN_METERS
        return when (type) {
            ManeuverType.TURN_LEFT -> when {
                now -> "Rẽ trái"
                else -> "Đi thẳng $d m rồi rẽ trái"
            }
            ManeuverType.TURN_RIGHT -> when {
                now -> "Rẽ phải"
                else -> "Đi thẳng $d m rồi rẽ phải"
            }
            ManeuverType.ARRIVE -> when {
                remainingMeters <= 2.5f || distanceToManeuverMeters <= 2.5f -> "Sắp đến nơi"
                else -> "Đi thẳng $remain m"
            }
            ManeuverType.STRAIGHT -> "Đi thẳng $d m"
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
