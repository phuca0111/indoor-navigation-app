package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .background(Color.Black.copy(alpha = 0.55f), RoundedCornerShape(10.dp))
            .padding(horizontal = 4.dp, vertical = 2.dp),
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
            Text("180°", color = Color(0xFFFFAB40), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        if (onSnapHeading != null) {
            TextButton(onClick = onSnapHeading) {
                Text("Snap", color = Color(0xFF69F0AE), fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
        TextButton(onClick = onReset) {
            Text("Reset", color = Color.LightGray, fontSize = 11.sp)
        }
    }
}
