package com.khoaluan.indoornav.navigation.heading

/**
 * Khung chuẩn phương hướng trên map.
 *
 * Quy ước: 0° = Bắc map (trục PDR).
 * mapHeading = deviceHeading − (base + calib + gridDelta)
 *
 * - [base] = map_bearing_offset (Publish / Editor)
 * - [calib] = hiệu chỉnh tay / snap tạm
 * - [gridDelta] = lệch theo ô tọa độ (MagHeadingCorrectionGrid)
 */
object HeadingReferenceFrame {

    fun effectiveOffset(
        baseDeg: Float,
        calibDeg: Float,
        gridDeltaDeg: Float = 0f,
    ): Float = MapHeadingMath.normalizeDegrees(baseDeg + calibDeg + gridDeltaDeg)

    fun deviceToMap(
        deviceHeadingDeg: Float,
        baseDeg: Float,
        calibDeg: Float = 0f,
        gridDeltaDeg: Float = 0f,
    ): Float = MapHeadingMath.deviceToMapHeading(
        deviceHeadingDeg,
        effectiveOffset(baseDeg, calibDeg, gridDeltaDeg),
    )

    /**
     * Calib để mapHeading = target khi đã cộng [gridDeltaDeg].
     * target = device − (base + cal + grid)  ⇒  cal = device − base − grid − target
     */
    fun calibrationToMatchTarget(
        deviceHeadingDeg: Float,
        baseDeg: Float,
        targetMapHeadingDeg: Float,
        gridDeltaDeg: Float = 0f,
    ): Float = MapHeadingMath.normalizeDegrees(
        deviceHeadingDeg - baseDeg - gridDeltaDeg - targetMapHeadingDeg
    )

    /**
     * Δ° cục bộ cần lưu vào lưới: phần lệch còn lại sau base+calib
     * so với hướng chuẩn map (cạnh hành lang).
     */
    fun localGridDelta(
        deviceHeadingDeg: Float,
        baseDeg: Float,
        calibDeg: Float,
        expectedMapHeadingDeg: Float,
    ): Float = MapHeadingMath.normalizeDegrees(
        deviceHeadingDeg - baseDeg - calibDeg - expectedMapHeadingDeg
    )
}
