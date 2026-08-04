package com.khoaluan.indoornav.navigation.outdoor

import com.khoaluan.indoornav.data.api.OutdoorRouteResponse
import com.khoaluan.indoornav.data.api.OutdoorRouteStep
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Turn-by-turn outdoor từ bước OSRM (không dùng graph A* indoor).
 */
object OutdoorTurnByTurn {

    data class Guidance(
        val instruction: String,
        val stepIndex: Int,
        val distanceToNextM: Float,
        val remainingM: Float,
        val etaSeconds: Int,
        val arrived: Boolean,
        val progress: Float,
        val maneuver: String? = null,
    )

    fun haversineMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Float {
        val r = 6371000.0
        val p1 = Math.toRadians(lat1)
        val p2 = Math.toRadians(lat2)
        val dp = Math.toRadians(lat2 - lat1)
        val dl = Math.toRadians(lng2 - lng1)
        val a = sin(dp / 2) * sin(dp / 2) +
            cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return (r * c).toFloat()
    }

    fun formatInstruction(step: OutdoorRouteStep, distanceToStepM: Float): String {
        val base = step.instruction?.takeIf { it.isNotBlank() }
        if (base != null && distanceToStepM <= 1.2f) {
            return when (step.maneuver?.lowercase()) {
                "left" -> "Rẽ trái"
                "right" -> "Rẽ phải"
                "arrive" -> "Đã đến nơi"
                else -> base
            }
        }
        if (base != null) return base
        val d = distanceToStepM.roundToInt().coerceAtLeast(0)
        return when (step.maneuver?.lowercase()) {
            "left" -> if (d <= 1) "Rẽ trái" else "Rẽ trái sau $d m"
            "right" -> if (d <= 1) "Rẽ phải" else "Rẽ phải sau $d m"
            "arrive" -> "Đã đến nơi"
            "depart" -> if (d > 0) "Đi thẳng $d m" else "Bắt đầu"
            else -> if (d > 0) "Đi thẳng $d m" else "Đi thẳng"
        }
    }

    fun arriveThresholdMeters(activationRadiusM: Int?): Float {
        val r = (activationRadiusM ?: 50).coerceIn(25, 80)
        return maxOf(25f, minOf(r.toFloat(), 45f))
    }

    /** Gần đích — gợi ý chuẩn bị handoff Indoor (chưa arrived). */
    fun approachThresholdMeters(activationRadiusM: Int?): Float =
        maxOf(70f, arriveThresholdMeters(activationRadiusM) * 2f)

    /**
     * Chọn bước tiếp theo phía trước user; tới đích khi < [arriveThresholdM].
     */
    fun guidance(
        route: OutdoorRouteResponse,
        userLat: Double,
        userLng: Double,
        arriveThresholdM: Float = 40f,
    ): Guidance {
        val dest = route.to
            ?: route.polyline.lastOrNull()?.let {
                com.khoaluan.indoornav.data.api.OutdoorLatLng(it.lat, it.lng)
            }
        val distToDest = if (dest != null) {
            haversineMeters(userLat, userLng, dest.lat, dest.lng)
        } else {
            Float.MAX_VALUE
        }
        val total = route.distanceM.coerceAtLeast(1f)
        val remainingFromDest = distToDest.coerceAtLeast(0f)
        val eta = if (total > 1f && route.durationS > 0) {
            ((remainingFromDest / total) * route.durationS).roundToInt().coerceAtLeast(0)
        } else {
            (remainingFromDest / 1.3f).roundToInt() // ~1.3 m/s đi bộ
        }

        if (distToDest <= arriveThresholdM) {
            return Guidance(
                instruction = "Đã đến nơi",
                stepIndex = route.steps.lastIndex.coerceAtLeast(0),
                distanceToNextM = 0f,
                remainingM = 0f,
                etaSeconds = 0,
                arrived = true,
                progress = 1f,
                maneuver = "arrive",
            )
        }

        val steps = route.steps
        if (steps.isEmpty()) {
            return Guidance(
                instruction = "Đi tới điểm đến · còn ${remainingFromDest.roundToInt()} m",
                stepIndex = 0,
                distanceToNextM = remainingFromDest,
                remainingM = remainingFromDest,
                etaSeconds = eta,
                arrived = false,
                progress = (1f - remainingFromDest / total).coerceIn(0f, 1f),
                maneuver = "straight",
            )
        }

        // Bước tiếp theo: maneuver location còn phía trước (chưa đi qua)
        var bestIdx = steps.lastIndex
        var bestDist = Float.MAX_VALUE
        for (i in steps.indices) {
            val loc = steps[i].location ?: continue
            val d = haversineMeters(userLat, userLng, loc.lat, loc.lng)
            val isArrive = steps[i].maneuver.equals("arrive", ignoreCase = true)
            if (isArrive) continue
            // Giữ bước gần nhất phía trước trong bán kính hợp lý của đoạn
            if (d < bestDist) {
                bestDist = d
                bestIdx = i
            }
        }

        // Nếu đã rất gần bước hiện tại, nhảy sang bước kế
        var idx = bestIdx
        val near = steps.getOrNull(idx)?.location
        if (near != null) {
            val dNear = haversineMeters(userLat, userLng, near.lat, near.lng)
            if (dNear <= 12f && idx < steps.lastIndex) {
                idx += 1
            }
        }

        val step = steps[idx.coerceIn(0, steps.lastIndex)]
        val loc = step.location
        val distNext = if (loc != null) {
            haversineMeters(userLat, userLng, loc.lat, loc.lng)
        } else {
            step.distanceM
        }

        return Guidance(
            instruction = formatInstruction(step, distNext),
            stepIndex = idx,
            distanceToNextM = distNext,
            remainingM = remainingFromDest,
            etaSeconds = eta,
            arrived = false,
            progress = (1f - remainingFromDest / total).coerceIn(0f, 1f),
            maneuver = step.maneuver,
        )
    }
}
