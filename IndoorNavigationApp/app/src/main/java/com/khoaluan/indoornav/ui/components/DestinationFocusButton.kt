package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * Nút căn giữa bản đồ vào điểm đến (pin đỏ) — tương tự Crosshair nhưng cho destination.
 */
@Composable
fun DestinationFocusButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .shadow(4.dp, CircleShape)
            .size(44.dp)
            .clip(CircleShape)
            .background(Color.White),
        contentAlignment = Alignment.Center,
    ) {
        IconButton(onClick = onClick) {
            Canvas(modifier = Modifier.size(22.dp)) {
                val cx = size.width / 2f
                val pinColor = Color(0xFFFF1744)
                val tipY = size.height - 1.dp.toPx()
                val topY = 2.dp.toPx()
                val r = size.width * 0.28f
                val path = Path().apply {
                    moveTo(cx, tipY)
                    lineTo(cx - r * 0.95f, topY + r * 1.1f)
                    quadraticBezierTo(cx - r * 1.15f, topY, cx, topY)
                    quadraticBezierTo(cx + r * 1.15f, topY, cx + r * 0.95f, topY + r * 1.1f)
                    close()
                }
                drawPath(path, pinColor)
                drawCircle(Color.White, radius = r * 0.45f, center = androidx.compose.ui.geometry.Offset(cx, topY + r * 0.75f))
                drawCircle(
                    pinColor,
                    radius = r * 0.45f,
                    center = androidx.compose.ui.geometry.Offset(cx, topY + r * 0.75f),
                    style = Stroke(1.5.dp.toPx()),
                )
            }
        }
    }
}
