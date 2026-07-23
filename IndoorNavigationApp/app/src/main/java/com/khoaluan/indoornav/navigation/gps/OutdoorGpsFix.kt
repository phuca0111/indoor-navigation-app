package com.khoaluan.indoornav.navigation.gps

/**
 * Bản ghi GPS ngoài trời gần nhất — dùng handoff hướng vào indoor (QR).
 * [bearingDeg] = course-over-ground (độ, Đông của Bắc thật), null nếu chưa có.
 */
data class OutdoorGpsFix(
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float,
    val bearingDeg: Float?,
    val bearingAccuracyDeg: Float?,
    val speedMps: Float?,
    val timestampMs: Long,
    val provider: String?,
)
