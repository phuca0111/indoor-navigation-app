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
 *
 * ## Hai chế độ pivot (quan trọng cho pan)
 *
 * 1. **Pivot cố định map-space** (HEADING_UP + có user):
 *    `screen = scale * R_pivot(map) + offset` — đổi offset thêm `pan` → nội dung đi theo ngón.
 *
 * 2. **Pivot = tâm màn hình** (NORTH_UP / xoay tay):
 *    pivot = (center - offset) / scale đổi mỗi khi pan → tương đương
 *    `screen = R_center(scale * map + offset)`.
 *    Đổi offset thêm `d` → màn hình dịch `R(d)`, nên cần
 *    `d = R^{-1}(pan)` ([screenPanToMapOffsetDelta]).
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

/** Pivot xoay cố định tại vị trí user (HEADING_UP) → pan thô đúng. */
fun isMapRotationPivotFixedToUser(
    mode: MapRotationMode,
    hasUserPos: Boolean,
): Boolean = mode == MapRotationMode.HEADING_UP && hasUserPos

/**
 * Xoay điểm quanh [pivot] (ma trận CCW chuẩn; khớp [rotateMapPointAroundPivot] / DrawScope).
 */
fun rotateAroundPivot(point: Offset, pivot: Offset, degrees: Float): Offset {
    if (degrees == 0f || point == pivot) return point
    val rad = Math.toRadians(degrees.toDouble())
    val c = cos(rad).toFloat()
    val s = sin(rad).toFloat()
    val dx = point.x - pivot.x
    val dy = point.y - pivot.y
    return Offset(
        x = pivot.x + dx * c - dy * s,
        y = pivot.y + dx * s + dy * c,
    )
}

/**
 * Nghịch xoay vector vuốt khi offset nằm trước phép xoay quanh tâm màn hình.
 *
 * Chỉ dùng khi pivot = tâm màn hình (NORTH_UP / xoay tay).
 * Không dùng khi pivot cố định user (HEADING_UP) — sẽ đảo cử chỉ lúc heading ~Nam.
 */
fun screenPanToMapOffsetDelta(pan: Offset, mapRotationDegrees: Float): Offset {
    if (pan == Offset.Zero || mapRotationDegrees == 0f) return pan
    val rad = Math.toRadians(-mapRotationDegrees.toDouble())
    val c = cos(rad).toFloat()
    val s = sin(rad).toFloat()
    return Offset(
        x = pan.x * c - pan.y * s,
        y = pan.x * s + pan.y * c,
    )
}

/**
 * Cập nhật offset camera theo gesture (pan + zoom), đúng với từng chế độ pivot.
 */
fun applyMapPanZoomOffset(
    currentOffset: Offset,
    centroid: Offset,
    pan: Offset,
    oldScale: Float,
    newScale: Float,
    mapRotationDegrees: Float,
    screenCenter: Offset,
    pivotFixedToUser: Boolean,
): Offset {
    val scaleRatio = if (oldScale == 0f) 1f else newScale / oldScale
    if (pivotFixedToUser || mapRotationDegrees == 0f) {
        return centroid + pan - (centroid - currentOffset) * scaleRatio
    }
    // Pivot tâm màn hình: zoom quanh điểm map dưới centroid (trước xoay), pan = R^{-1}(finger).
    val unrotatedCentroid = rotateAroundPivot(centroid, screenCenter, -mapRotationDegrees)
    val adjustedPan = screenPanToMapOffsetDelta(pan, mapRotationDegrees)
    return unrotatedCentroid + adjustedPan - (unrotatedCentroid - currentOffset) * scaleRatio
}
