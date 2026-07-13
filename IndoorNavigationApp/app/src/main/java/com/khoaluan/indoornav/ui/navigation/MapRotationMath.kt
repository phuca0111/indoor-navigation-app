package com.khoaluan.indoornav.ui.navigation

import androidx.compose.ui.geometry.Offset
import com.khoaluan.indoornav.ui.viewmodel.MapRotationMode
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * G2 — Công thức xoay map kiểu Google Maps.
 *
 * Compose [detectTransformGestures] trả [rotation] theo **độ** (degrees), không phải radian.
 * Google Maps ~ **1:1** (ngón tay xoay X° → map xoay ~X°).
 */

const val MAP_ROTATION_SENSITIVITY = 1f
const val MAP_ROTATION_MIN_DEGREES = 1f

fun normalizeGestureRotationDegrees(gestureRotationDegrees: Float): Float =
    gestureRotationDegrees

fun resolveManualMapRotationDelta(
    gestureRotationDegrees: Float,
    panDistancePx: Float,
    zoom: Float,
    sensitivity: Float = MAP_ROTATION_SENSITIVITY,
): Float {
    val deg = normalizeGestureRotationDegrees(gestureRotationDegrees) * sensitivity
    if (abs(deg) < MAP_ROTATION_MIN_DEGREES) return 0f
    if (panDistancePx > 16f && abs(deg) < 2.5f) return 0f
    if (abs(zoom - 1f) > 0.04f && abs(deg) < 2.5f) return 0f
    return deg
}

@Deprecated("Dùng resolveManualMapRotationDelta")
fun shouldApplyManualMapRotation(gestureRotationDegrees: Float): Boolean =
    abs(gestureRotationDegrees) >= MAP_ROTATION_MIN_DEGREES

fun computeEffectiveMapRotation(
    mode: MapRotationMode,
    unwrappedUserHeading: Float,
    userMapBearingOffset: Float,
): Float = when (mode) {
    MapRotationMode.HEADING_UP -> -unwrappedUserHeading + userMapBearingOffset
    MapRotationMode.NORTH_UP -> userMapBearingOffset
}

fun computeHeadingDrivenRotation(
    mode: MapRotationMode,
    unwrappedUserHeading: Float,
): Float = when (mode) {
    MapRotationMode.HEADING_UP -> -unwrappedUserHeading
    MapRotationMode.NORTH_UP -> 0f
}

/**
 * Pan trên màn hình → delta offset map khi map đang xoay.
 * Tránh kéo trái/phải bị nghịch khi xoay map (đặc biệt ~180°).
 */
fun screenPanToMapOffsetDelta(pan: Offset, mapRotationDegrees: Float): Offset {
    if (pan == Offset.Zero) return pan
    val rad = Math.toRadians(-mapRotationDegrees.toDouble())
    val c = cos(rad).toFloat()
    val s = sin(rad).toFloat()
    return Offset(
        x = pan.x * c - pan.y * s,
        y = pan.x * s + pan.y * c,
    )
}
