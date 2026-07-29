package com.khoaluan.indoornav.ui.components

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Vẽ POI giống Web Editor: vòng màu catalog + emoji `pois.js`.
 * Nếu emoji không đo được (font máy thiếu) → fallback chữ ngắn.
 */
fun DrawScope.drawPoiIcon(
    category: PoiCategory,
    center: Offset,
    iconSize: Float,
    isSelected: Boolean,
    textMeasurer: androidx.compose.ui.text.TextMeasurer,
) {
    val r = iconSize / 2f
    val bg = if (isSelected) Color(0xFFF1C40F) else category.color
    val ring = if (isSelected) Color(0xFFE74C3C) else Color(0xFF333333)

    drawCircle(Color.White, radius = r + 2.5f, center = center)
    drawCircle(bg, radius = r, center = center)
    drawCircle(
        color = ring,
        radius = r,
        center = center,
        style = Stroke(width = (iconSize * 0.06f).coerceAtLeast(1.5f)),
    )

    val emojiLayout = textMeasurer.measure(
        category.emoji,
        TextStyle(fontSize = (iconSize * 0.62f).sp),
    )
    // Một số máy đo emoji = 0 / quá hẹp → dùng fallback
    if (emojiLayout.size.width > iconSize * 0.15f && emojiLayout.size.height > iconSize * 0.15f) {
        drawText(
            emojiLayout,
            topLeft = Offset(
                center.x - emojiLayout.size.width / 2f,
                center.y - emojiLayout.size.height / 2f,
            ),
        )
        return
    }

    val fallback = when (category) {
        PoiCategory.TOILET -> "WC"
        PoiCategory.ATM -> "ATM"
        PoiCategory.EXIT -> "EXIT"
        PoiCategory.ELEVATOR, PoiCategory.ESCALATOR -> "↑↓"
        PoiCategory.STAIRS -> "〰"
        PoiCategory.FOOD -> "FOOD"
        PoiCategory.CAFE -> "CAFE"
        PoiCategory.PARKING -> "P"
        PoiCategory.MEDICAL -> "+"
        PoiCategory.SECURITY -> "SEC"
        PoiCategory.SAFETY -> "F"
        PoiCategory.ASSEMBLY_POINT -> "★"
        PoiCategory.RECEPTION -> "R"
        PoiCategory.INFO -> "i"
        PoiCategory.WAITING -> "W"
        PoiCategory.VENDING -> "V"
        PoiCategory.OTHER -> "?"
    }
    val layout = textMeasurer.measure(
        fallback,
        TextStyle(
            fontSize = (iconSize * if (fallback.length <= 2) 0.42f else 0.28f).sp,
            color = Color.White,
            fontWeight = FontWeight.Bold,
        ),
    )
    drawText(
        layout,
        topLeft = Offset(
            center.x - layout.size.width / 2f,
            center.y - layout.size.height / 2f,
        ),
    )
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
