package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.ui.viewmodel.NavigationState

/**
 * Module #9 — minimap góc màn hình: overview + viewport + pin user/dest.
 */
@Composable
fun MiniMapOverlay(
    mapData: MapData,
    navState: NavigationState,
    viewportScale: Float,
    viewportOffset: Offset,
    screenW: Float,
    screenH: Float,
    modifier: Modifier = Modifier,
) {
    val bounds = remember(mapData) {
        val xs = mapData.rooms.flatMap { listOf(it.x.toFloat(), (it.x + it.width).toFloat()) }
        val ys = mapData.rooms.flatMap { listOf(it.y.toFloat(), (it.y + it.height).toFloat()) }
        val minX = xs.minOrNull() ?: 0f
        val maxX = xs.maxOrNull() ?: 1000f
        val minY = ys.minOrNull() ?: 0f
        val maxY = ys.maxOrNull() ?: 1000f
        floatArrayOf(minX, minY, maxX, maxY)
    }
    val minX = bounds[0]
    val minY = bounds[1]
    val maxX = bounds[2]
    val maxY = bounds[3]
    val mapW = (maxX - minX).coerceAtLeast(1f)
    val mapH = (maxY - minY).coerceAtLeast(1f)

    Box(
        modifier = modifier
            .background(Color(0xEEFFFFFF), RoundedCornerShape(10.dp))
            .border(1.dp, Color(0xFFCFD8DC), RoundedCornerShape(10.dp)),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val pad = 8f
            val availW = size.width - pad * 2
            val availH = size.height - pad * 2
            val fit = minOf(availW / mapW, availH / mapH)
            fun toMini(p: Offset): Offset = Offset(
                pad + (p.x - minX) * fit,
                pad + (p.y - minY) * fit,
            )

            mapData.rooms.forEach { room ->
                val tl = toMini(Offset(room.x.toFloat(), room.y.toFloat()))
                drawRect(
                    color = Color(0xFF90A4AE).copy(alpha = 0.45f),
                    topLeft = tl,
                    size = Size(room.width.toFloat() * fit, room.height.toFloat() * fit),
                )
            }

            navState.path?.let { path ->
                if (path.size > 1) {
                    for (i in 0 until path.size - 1) {
                        drawLine(
                            color = Color(0xFF1A73E8),
                            start = toMini(path[i]),
                            end = toMini(path[i + 1]),
                            strokeWidth = 2f,
                        )
                    }
                }
            }

            if (viewportScale > 0.01f && screenW > 0f && screenH > 0f) {
                val topLeftMap = Offset(-viewportOffset.x / viewportScale, -viewportOffset.y / viewportScale)
                val bottomRightMap = Offset(
                    (screenW - viewportOffset.x) / viewportScale,
                    (screenH - viewportOffset.y) / viewportScale,
                )
                val vTl = toMini(topLeftMap)
                val vBr = toMini(bottomRightMap)
                drawRect(
                    color = Color(0xFF1A73E8).copy(alpha = 0.85f),
                    topLeft = vTl,
                    size = Size((vBr.x - vTl.x).coerceAtLeast(4f), (vBr.y - vTl.y).coerceAtLeast(4f)),
                    style = Stroke(width = 1.5f),
                )
            }

            navState.startAnchorPos?.let {
                drawCircle(Color(0xFF2E7D32), radius = 3.5f, center = toMini(it))
            }
            (navState.path?.lastOrNull() ?: navState.destinationMarkerPos)?.let {
                drawCircle(Color(0xFFE53935), radius = 3.5f, center = toMini(it))
            }
            navState.userPos?.let {
                drawCircle(Color(0xFF1A73E8), radius = 4f, center = toMini(it))
            }
        }
    }
}
