package com.khoaluan.indoornav.navigation.heading

/**
 * Phase 0.5 — chuyển Device Heading (la bàn thế giới) → Map Heading (trục map).
 *
 * Công thức chuẩn: mapHeading = deviceHeading − mapNorthOffset
 * mapNorthOffset = map_bearing_offset (từ Web Editor) + hiệu chỉnh tay.
 * Navigation Heading = Map Heading + Movement Correction (OrientationManager).
 */
object MapHeadingMath {

    fun normalizeDegrees(angle: Float): Float {
        var r = angle.mod(360f)
        if (r > 180f) r -= 360f
        return r
    }

    /** Góc ngắn nhất từ [from] → [to], kết quả trong (-180, 180]. */
    fun shortestDeltaDegrees(from: Float, to: Float): Float {
        var delta = (to - from).mod(360f)
        if (delta > 180f) delta -= 360f
        return delta
    }

    fun combineOffset(baseFromMap: Float, userCalibration: Float): Float =
        normalizeDegrees(baseFromMap + userCalibration)

    fun deviceToMapHeading(deviceHeadingDeg: Float, mapNorthOffsetDeg: Float): Float =
        normalizeDegrees(deviceHeadingDeg - mapNorthOffsetDeg)

    /**
     * Calibration để [deviceToMapHeading] ra đúng [targetMapHeadingDeg].
     * target = device − (base + cal)  ⇒  cal = device − base − target
     */
    fun calibrationToMatchTarget(
        deviceHeadingDeg: Float,
        mapNorthOffsetBaseDeg: Float,
        targetMapHeadingDeg: Float
    ): Float = normalizeDegrees(
        deviceHeadingDeg - mapNorthOffsetBaseDeg - targetMapHeadingDeg
    )

    /**
     * Handoff GPS ngoài trời: đặt Map Heading = course-over-ground (Bắc thật) chiếu lên map.
     * targetMap = gpsCourse − base  ⇒  cal = device − gpsCourse (base triệt tiêu).
     */
    fun calibrationToMatchGpsCourse(
        deviceHeadingDeg: Float,
        mapNorthOffsetBaseDeg: Float,
        gpsCourseTrueNorthDeg: Float,
    ): Float = calibrationToMatchTarget(
        deviceHeadingDeg,
        mapNorthOffsetBaseDeg,
        deviceToMapHeading(gpsCourseTrueNorthDeg, mapNorthOffsetBaseDeg),
    )
}
