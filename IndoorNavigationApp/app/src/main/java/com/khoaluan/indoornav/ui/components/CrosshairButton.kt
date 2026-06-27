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
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.khoaluan.indoornav.ui.theme.NavBlue

/**
 * Nút về vị trí hiện tại — nhấn để center bản đồ vào Blue Dot
 *
 * @param onClick Callback khi nhấn (trigger center on user in MapView)
 * @param modifier Modifier từ parent (vị trí, padding)
 */
@Composable
fun CrosshairButton(
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
                val cy = size.height / 2f
                val r  = size.width / 2f - 2.dp.toPx()
                val gap = 4.dp.toPx()
                val sw  = 2.dp.toPx()

                // Vòng tròn ngoài
                drawCircle(
                    color = NavBlue,
                    radius = r,
                    center = center,
                    style = Stroke(sw),
                )
                // Nét ngang trái
                drawLine(NavBlue, start = center.copy(x = 0f), end = center.copy(x = cx - gap), strokeWidth = sw, cap = StrokeCap.Round)
                // Nét ngang phải
                drawLine(NavBlue, start = center.copy(x = cx + gap), end = center.copy(x = size.width), strokeWidth = sw, cap = StrokeCap.Round)
                // Nét dọc trên
                drawLine(NavBlue, start = center.copy(y = 0f), end = center.copy(y = cy - gap), strokeWidth = sw, cap = StrokeCap.Round)
                // Nét dọc dưới
                drawLine(NavBlue, start = center.copy(y = cy + gap), end = center.copy(y = size.height), strokeWidth = sw, cap = StrokeCap.Round)
            }
        }
    }
}
