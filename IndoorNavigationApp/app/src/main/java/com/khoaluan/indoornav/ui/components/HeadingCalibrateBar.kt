package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt

/**
 * Phase 0.5 / G3c — chỉnh mapNorthOffset khi test.
 * ±15° tinh; ±90° khi đi Nam mà chấm đi Tây/Đông; 180° đảo ngược.
 * [gridDebugText]: dump ma trận Δ° theo ô (tọa độ map).
 */
@Composable
fun HeadingCalibrateBar(
    offsetDeg: Float,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    onMinus90: () -> Unit = {},
    onPlus90: () -> Unit = {},
    onInvert180: () -> Unit,
    onReset: () -> Unit,
    onSnapHeading: (() -> Unit)? = null,
    gridDebugText: String? = null,
    gridDeltaHereDeg: Float = 0f,
    onResetGrid: (() -> Unit)? = null,
    motionLogActive: Boolean = false,
    onToggleMotionLog: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .background(Color.Black.copy(alpha = 0.55f), RoundedCornerShape(10.dp))
            .padding(horizontal = 4.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            TextButton(onClick = onMinus90) {
                Text("−90°", color = Color(0xFFFFAB40), fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
            TextButton(onClick = onMinus) {
                Text("−15°", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            Text(
                text = "Bắc ${offsetDeg.roundToInt()}°",
                color = Color(0xFF00E5FF),
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            )
            TextButton(onClick = onPlus) {
                Text("+15°", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            TextButton(onClick = onPlus90) {
                Text("+90°", color = Color(0xFFFFAB40), fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
            TextButton(onClick = onInvert180) {
                Text("180° đảo", color = Color(0xFFFF6E40), fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            if (onSnapHeading != null) {
                TextButton(onClick = onSnapHeading) {
                    Text("Snap", color = Color(0xFF69F0AE), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
            if (onToggleMotionLog != null) {
                TextButton(onClick = onToggleMotionLog) {
                    Text(
                        if (motionLogActive) "Dừng ghi" else "Ghi xoay",
                        color = if (motionLogActive) Color(0xFFFFAB91) else Color(0xFFFFD54F),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            TextButton(onClick = onReset) {
                Text("Reset", color = Color.LightGray, fontSize = 11.sp)
            }
        }
        if (gridDebugText != null) {
            val hereSign = if (gridDeltaHereDeg >= 0f) "+" else ""
            Text(
                text = "Lưới tại chỗ ${hereSign}${gridDeltaHereDeg.roundToInt()}°",
                color = if (kotlin.math.abs(gridDeltaHereDeg) >= 45f) Color(0xFFFFAB40) else Color(0xFFB0BEC5),
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            )
            Text(
                text = gridDebugText,
                color = Color(0xFFE0E0E0),
                fontSize = 9.sp,
                lineHeight = 12.sp,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            )
            if (onResetGrid != null) {
                TextButton(onClick = onResetGrid) {
                    Text("Xóa lưới Δ°", color = Color(0xFFFF8A80), fontSize = 10.sp)
                }
            }
        }
    }
}
