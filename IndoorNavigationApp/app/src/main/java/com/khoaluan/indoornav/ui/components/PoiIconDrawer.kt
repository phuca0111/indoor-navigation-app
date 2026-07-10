package com.khoaluan.indoornav.ui.components

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.drawText

/** Vẽ icon POI lên Canvas (không cần asset bitmap). */
fun DrawScope.drawPoiIcon(
    category: PoiCategory,
    center: Offset,
    iconSize: Float,
    isSelected: Boolean,
    textMeasurer: androidx.compose.ui.text.TextMeasurer,
) {
    val r = iconSize / 2f
    val bg = if (isSelected) Color(0xFFFF1744) else category.color
    drawCircle(Color.White, radius = r + 2f, center = center)
    drawCircle(bg, radius = r, center = center)

    when (category) {
        PoiCategory.TOILET -> {
            val layout = textMeasurer.measure(
                "WC",
                TextStyle(fontSize = (iconSize * 0.42f).sp, color = Color.White),
            )
            drawText(
                layout,
                topLeft = Offset(center.x - layout.size.width / 2f, center.y - layout.size.height / 2f),
            )
        }
        PoiCategory.STAIRS -> {
            val stepH = iconSize * 0.14f
            val stepW = iconSize * 0.22f
            var y = center.y + r * 0.35f
            var x = center.x - r * 0.55f
            repeat(3) {
                drawLine(Color.White, Offset(x, y), Offset(x + stepW, y), strokeWidth = stepH, cap = StrokeCap.Round)
                y -= stepH * 1.4f
                x += stepW * 0.55f
            }
        }
        PoiCategory.ELEVATOR -> {
            val w = iconSize * 0.38f
            val h = iconSize * 0.48f
            drawRect(
                Color.White,
                topLeft = Offset(center.x - w / 2f, center.y - h / 2f),
                size = Size(w, h),
                style = Stroke(width = iconSize * 0.08f),
            )
            val tri = iconSize * 0.12f
            drawPath(
                Path().apply {
                    moveTo(center.x, center.y - h * 0.22f)
                    lineTo(center.x - tri, center.y - h * 0.22f + tri)
                    lineTo(center.x + tri, center.y - h * 0.22f + tri)
                    close()
                },
                Color.White,
            )
            drawPath(
                Path().apply {
                    moveTo(center.x, center.y + h * 0.22f)
                    lineTo(center.x - tri, center.y + h * 0.22f - tri)
                    lineTo(center.x + tri, center.y + h * 0.22f - tri)
                    close()
                },
                Color.White,
            )
        }
        PoiCategory.EXIT -> {
            drawLine(
                Color.White,
                Offset(center.x - r * 0.35f, center.y - r * 0.35f),
                Offset(center.x + r * 0.35f, center.y + r * 0.35f),
                strokeWidth = iconSize * 0.1f,
                cap = StrokeCap.Round,
            )
            drawLine(
                Color.White,
                Offset(center.x + r * 0.1f, center.y - r * 0.35f),
                Offset(center.x + r * 0.45f, center.y),
                strokeWidth = iconSize * 0.1f,
                cap = StrokeCap.Round,
            )
            drawLine(
                Color.White,
                Offset(center.x + r * 0.1f, center.y + r * 0.35f),
                Offset(center.x + r * 0.45f, center.y),
                strokeWidth = iconSize * 0.1f,
                cap = StrokeCap.Round,
            )
        }
        PoiCategory.FOOD -> {
            drawCircle(Color.White, radius = r * 0.28f, center = Offset(center.x, center.y - r * 0.08f))
            drawArc(
                color = Color.White,
                startAngle = 20f,
                sweepAngle = 140f,
                useCenter = false,
                topLeft = Offset(center.x - r * 0.45f, center.y - r * 0.05f),
                size = Size(r * 0.9f, r * 0.55f),
                style = Stroke(width = iconSize * 0.08f),
            )
        }
        else -> drawCircle(Color.White, radius = r * 0.22f, center = center)
    }
}

fun DrawScope.drawDestinationPin(center: Offset, mapScale: Float, emphasized: Boolean) {
    val pinAlpha = if (emphasized) 1f else 0.85f
    drawCircle(Color(0xFFFF1744).copy(0.25f * pinAlpha), radius = 22f / mapScale, center = center)
    drawCircle(Color(0xFFFF1744).copy(pinAlpha), radius = 11f / mapScale, center = center)
    drawCircle(Color.White.copy(pinAlpha), radius = 5f / mapScale, center = center)
    withTransform({ translate(center.x, center.y) }) {
        val pinPath = Path().apply {
            moveTo(0f, -20f / mapScale)
            lineTo(-11f / mapScale, 3f / mapScale)
            lineTo(11f / mapScale, 3f / mapScale)
            close()
        }
        drawPath(pinPath, Color(0xFFFF1744).copy(pinAlpha))
        drawPath(pinPath, Color.White.copy(pinAlpha), style = Stroke(width = 1.5f / mapScale))
    }
}
