package com.khoaluan.indoornav.navigation.heading

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Orientation Manager — luận văn / PDR+TPF thương mại.
 *
 * Lớp 1 Device Heading  → cảm biến (RV + Gyro)
 * Lớp 2 Map Heading     → Device − mapNorthOffset
 * Lớp 3 Movement Heading → hướng đi thật (sau vài bước ổn định)
 *
 * Navigation Heading = Map (+ tùy chọn blend Movement nhẹ qua EMA).
 *
 * **2026-08:** UI blend Movement tạm **TẮT** ([ENABLE_MOVEMENT_HEADING_BLEND]) —
 * tránh trộn mũi tên. Recalib cal theo hướng đi vẫn bật ([ENABLE_TRAVEL_HEADING_RECALIB]).
 */
class OrientationManager(
    private val minStepsForMovement: Int = 3,
    private val maxStepsForFullBlend: Int = 5,
    /** Blend Movement tối đa — giữ nhẹ để mũi tên bám cảm biến, không giật. */
    private val maxMovementBlend: Float = 0.22f,
    /** EMA đầu ra Navigation (cao = mượt hơn, chậm hơn). Thấp hơn → xoay nhanh ít tụt. */
    private val navOutputEma: Float = 0.55f,
    /** H10 — lệch Map vs Movement vượt ngưỡng → conflict. */
    private val conflictEnterDeg: Float = 55f,
    private val conflictExitDeg: Float = 40f,
    /** Conflict kéo dài → gợi ý quét QR (ms). */
    private val conflictTimeoutMs: Long = 8_000L,
) {
    var deviceHeadingDeg: Float = 0f
        private set

    var mapNorthOffsetDeg: Float = 0f
        private set

    val mapHeadingDeg: Float
        get() = MapHeadingMath.deviceToMapHeading(deviceHeadingDeg, mapNorthOffsetDeg)

    var movementHeadingDeg: Float? = null
        private set

    var consecutiveWalkingSteps: Int = 0
        private set

    /** H10 — đang conflict heading (freeze Movement correction). */
    var isHeadingConflict: Boolean = false
        private set

    /** H10 — conflict kéo dài; caller hiện gợi ý QR rồi gọi [clearConflictQrSuggestion]. */
    var suggestQrDueToConflict: Boolean = false
        private set

    private val recentStepHeadings = ArrayDeque<Float>()
    private var totalMovementSamples: Int = 0
    private var recalibOffered: Boolean = false
    private var smoothedNavDeg: Float? = null
    private var conflictStartedAtMs: Long? = null
    private var conflictQrAlreadySuggested: Boolean = false
    /** G3c — tư thế cầm; khi túi/flat giảm blend Movement. */
    var devicePose: com.khoaluan.indoornav.navigation.pdr.DevicePoseClassifier.Pose =
        com.khoaluan.indoornav.navigation.pdr.DevicePoseClassifier.Pose.PORTRAIT_HAND
        private set

    /** Đong đưa máy → giảm tin heading (bổ sung pose túi/flat). */
    private var swingHeadingUnreliable: Boolean = false

    fun updateAccelForPose(ax: Float, ay: Float, az: Float) {
        devicePose = com.khoaluan.indoornav.navigation.pdr.DevicePoseClassifier.classify(ax, ay, az)
    }

    fun setSwingHeadingUnreliable(unreliable: Boolean) {
        swingHeadingUnreliable = unreliable
    }

    fun setMapNorthOffset(offsetDeg: Float) {
        mapNorthOffsetDeg = MapHeadingMath.normalizeDegrees(offsetDeg)
    }

    fun updateDeviceHeading(deviceDeg: Float) {
        deviceHeadingDeg = MapHeadingMath.normalizeDegrees(deviceDeg)
    }

    /** STILL ngắn — không xóa Movement đã học. */
    fun onStill() {
        consecutiveWalkingSteps = 0
    }

    fun onStepDisplacement(dxPx: Float, dyPx: Float) {
        val len = hypot(dxPx.toDouble(), dyPx.toDouble()).toFloat()
        if (len < 0.5f) return
        val stepHeading = Math.toDegrees(atan2(dxPx.toDouble(), -dyPx.toDouble())).toFloat()
        onStepHeadingSample(stepHeading)
    }

    /**
     * Mẫu hướng đi trên map. Bỏ mẫu lệch >70° so với mean hiện tại
     * (tránh graph fwd/bwd làm mũi tên đảo 180°).
     */
    fun onStepHeadingSample(headingMapDeg: Float) {
        val normalized = MapHeadingMath.normalizeDegrees(headingMapDeg)
        val current = movementHeadingDeg
        if (current != null) {
            val jump = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(current, normalized))
            if (jump > 70f) return
        }
        recentStepHeadings.addLast(normalized)
        while (recentStepHeadings.size > maxStepsForFullBlend) {
            recentStepHeadings.removeFirst()
        }
        consecutiveWalkingSteps++
        totalMovementSamples++

        if (totalMovementSamples >= minStepsForMovement && recentStepHeadings.isNotEmpty()) {
            // Chỉ nhận Movement khi các bước gần nhau (không loạn)
            if (movementSamplesConsistent()) {
                movementHeadingDeg = circularMeanDeg(recentStepHeadings)
            }
        }
    }

    /**
     * Đề xuất recalibrate khi Movement ổn định và lệch Map.
     * Caller nên áp dụng từ từ (slew), không snap một phát.
     *
     * [requireOfferGate]: true = chỉ đề xuất một lần đến [markRecalibrationDone]
     * (mag OK). false = đề xuất liên tục khi còn lệch (mag nhiễu / travel neo).
     */
    fun peekMovementRecalibrationTarget(
        minDisagreeDeg: Float = 35f,
        requireOfferGate: Boolean = true,
    ): Float? {
        if (requireOfferGate && recalibOffered) return null
        val moveH = movementHeadingDeg ?: return null
        if (totalMovementSamples < maxStepsForFullBlend) return null
        if (!movementSamplesConsistent()) return null
        val disagree = kotlin.math.abs(
            MapHeadingMath.shortestDeltaDegrees(mapHeadingDeg, moveH)
        )
        if (disagree < minDisagreeDeg) return null
        return moveH
    }

    fun markRecalibrationDone() {
        recalibOffered = true
    }

    /**
     * Hướng UI + PDR. Luôn EMA — không hard-switch theo walking
     * (tránh “lúc xoay lúc đứng yên” khi motion nhấp nháy).
     *
     * H10 Conflict: lệch Map↔Movement lớn → freeze blend, bám Map; kéo dài → suggest QR.
     */
    fun navigationHeading(
        walking: Boolean,
        turning: Boolean = false,
        nowMs: Long = System.currentTimeMillis(),
        /** Nhiễu từ: bám tay xoay nhanh hơn, giảm cảm giác «xoay lệch / trễ». */
        magneticHold: Boolean = false,
    ): Float {
        val mapH = mapHeadingDeg

        // Luôn theo dõi conflict Map↔Movement (gợi ý QR) — kể cả khi không blend UI.
        val moveH = movementHeadingDeg
        val disagree = if (moveH != null && totalMovementSamples >= minStepsForMovement &&
            movementSamplesConsistent()
        ) {
            kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(mapH, moveH))
        } else {
            0f
        }
        updateConflictState(disagree = disagree, walking = walking, turning = turning, nowMs = nowMs)

        // Movement blend tắt: mũi tên = Map Heading (travel chỉ dùng để recalib calib ở LocationEngine).
        if (!ENABLE_MOVEMENT_HEADING_BLEND) {
            smoothedNavDeg = mapH
            return mapH
        }

        var target = mapH

        if (!turning && !magneticHold && !isHeadingConflict && moveH != null &&
            totalMovementSamples >= minStepsForMovement &&
            movementSamplesConsistent()
        ) {
            if (disagree <= conflictEnterDeg) {
                val baseBlend = if (walking) maxMovementBlend else maxMovementBlend * 0.45f
                val blend = if (
                    com.khoaluan.indoornav.navigation.pdr.DevicePoseClassifier.headingUnreliable(devicePose) ||
                    swingHeadingUnreliable
                ) {
                    baseBlend * 0.25f
                } else {
                    baseBlend
                }
                target = lerpAngleDeg(mapH, moveH, blend)
            }
        }

        val prev = smoothedNavDeg
        smoothedNavDeg = if (prev == null) {
            target
        } else {
            val jump = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(prev, target))
            when {
                jump >= 20f -> target // snap — không tụt hàng chục độ
                magneticHold -> lerpAngleDeg(prev, target, 0.85f)
                turning -> lerpAngleDeg(prev, target, 0.80f)
                jump >= 8f -> lerpAngleDeg(prev, target, 0.90f)
                else -> lerpAngleDeg(prev, target, 1f - navOutputEma)
            }
        }
        return smoothedNavDeg!!
    }

    fun clearConflictQrSuggestion() {
        suggestQrDueToConflict = false
        conflictQrAlreadySuggested = true
    }

    private fun updateConflictState(
        disagree: Float,
        walking: Boolean,
        turning: Boolean,
        nowMs: Long,
    ) {
        if (turning || !walking || disagree < conflictExitDeg) {
            isHeadingConflict = false
            conflictStartedAtMs = null
            return
        }
        if (disagree >= conflictEnterDeg) {
            if (!isHeadingConflict) {
                isHeadingConflict = true
                conflictStartedAtMs = nowMs
            }
            val started = conflictStartedAtMs ?: nowMs
            if (!conflictQrAlreadySuggested && nowMs - started >= conflictTimeoutMs) {
                suggestQrDueToConflict = true
            }
        } else if (disagree < conflictExitDeg) {
            isHeadingConflict = false
            conflictStartedAtMs = null
        }
    }

    fun reset() {
        deviceHeadingDeg = 0f
        movementHeadingDeg = null
        consecutiveWalkingSteps = 0
        totalMovementSamples = 0
        recentStepHeadings.clear()
        recalibOffered = false
        smoothedNavDeg = null
        isHeadingConflict = false
        suggestQrDueToConflict = false
        conflictStartedAtMs = null
        conflictQrAlreadySuggested = false
    }

    /**
     * Sau resume / snap tay: bỏ Movement + EMA cũ (giữ mapNorthOffset),
     * để mũi tên bám lại Device Heading tuyệt đối từ cảm biến.
     */
    fun clearLearnedMovementAndNavSmooth() {
        movementHeadingDeg = null
        consecutiveWalkingSteps = 0
        totalMovementSamples = 0
        recentStepHeadings.clear()
        recalibOffered = false
        smoothedNavDeg = null
        isHeadingConflict = false
        suggestQrDueToConflict = false
        conflictStartedAtMs = null
        conflictQrAlreadySuggested = false
    }

    /** Mean resultant length đủ cao = các bước cùng hướng. */
    private fun movementSamplesConsistent(): Boolean {
        if (recentStepHeadings.size < minStepsForMovement) return false
        var sx = 0.0
        var sy = 0.0
        for (a in recentStepHeadings) {
            val r = Math.toRadians(a.toDouble())
            sx += cos(r)
            sy += sin(r)
        }
        val n = recentStepHeadings.size.toDouble()
        val rBar = sqrt(sx * sx + sy * sy) / n
        return rBar >= 0.82
    }

    companion object {
        /**
         * Blend Movement vào Navigation Heading (UI). Tắt — mũi tên bám Map/Device.
         */
        const val ENABLE_MOVEMENT_HEADING_BLEND = false

        /**
         * Slew calib theo hướng đi (Δ bước PDR) — xem [HeadingAssistFlags.ENABLE_TRAVEL_HEADING_RECALIB].
         * @deprecated Dùng HeadingAssistFlags; giữ tên để chỗ cũ compile.
         */
        const val ENABLE_TRAVEL_HEADING_RECALIB = HeadingAssistFlags.ENABLE_TRAVEL_HEADING_RECALIB

        fun circularMeanDeg(angles: Collection<Float>): Float {
            if (angles.isEmpty()) return 0f
            var sx = 0.0
            var sy = 0.0
            for (a in angles) {
                val r = Math.toRadians(a.toDouble())
                sx += cos(r)
                sy += sin(r)
            }
            val n = sqrt(sx * sx + sy * sy)
            if (n < 1e-9) return angles.first()
            return MapHeadingMath.normalizeDegrees(
                Math.toDegrees(atan2(sy, sx)).toFloat()
            )
        }

        fun lerpAngleDeg(from: Float, to: Float, t: Float): Float {
            val delta = MapHeadingMath.shortestDeltaDegrees(from, to)
            return MapHeadingMath.normalizeDegrees(from + delta * t.coerceIn(0f, 1f))
        }
    }
}
