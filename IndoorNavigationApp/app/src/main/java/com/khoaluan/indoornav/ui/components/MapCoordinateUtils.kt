package com.khoaluan.indoornav.ui.components

import androidx.compose.ui.geometry.Offset
import kotlin.math.cos
import kotlin.math.sin

/** Chuyển toạ độ chạm màn hình → toạ độ pixel trên bản đồ (nghịch transform camera). */
fun screenToMapCoords(
    screen: Offset,
    scale: Float,
    offset: Offset,
    rotationDeg: Float,
    pivot: Offset,
): Offset {
    if (scale <= 0f) return Offset.Zero
    var mx = (screen.x - offset.x) / scale
    var my = (screen.y - offset.y) / scale
    if (rotationDeg != 0f) {
        val rad = Math.toRadians(-rotationDeg.toDouble())
        val c = cos(rad).toFloat()
        val s = sin(rad).toFloat()
        val dx = mx - pivot.x
        val dy = my - pivot.y
        mx = pivot.x + dx * c - dy * s
        my = pivot.y + dx * s + dy * c
    }
    return Offset(mx, my)
}
