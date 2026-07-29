package com.khoaluan.indoornav.ui.screens.emergency

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.navigation.emergency.EmergencySession

/**
 * Hỏi tầng đang đứng khi cảnh báo mà app chưa chắc (chưa QR / chưa định vị trên tầng).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EmergencyFloorPickOverlay(
    session: EmergencySession,
    currentFloor: Int?,
    totalFloors: Int,
    onFloorSelected: (Int) -> Unit,
    onDismiss: (() -> Unit)? = null,
) {
    val safeTotal = totalFloors.coerceAtLeast(1)
    val floors = (0 until safeTotal).toList()
    val hintFloor = currentFloor?.takeIf { it in floors }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color(0xFF7F1D1D),
                        Color(0xFF450A0A),
                        Color(0xFF1C0505),
                    ),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "⚠ XÁC NHẬN TẦNG",
                color = Color(0xFFFFE4E6),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 1.5.sp,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = "Bạn đang ở tầng nào?",
                color = Color.White,
                fontSize = 28.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = "App chưa chắc tầng (chưa quét QR / định vị trên tầng này). " +
                    "Chọn đúng tầng đang đứng để chỉ đường sơ tán.",
                color = Color(0xFFFECACA),
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                lineHeight = 20.sp,
            )
            if (hintFloor != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Gợi ý: tầng đang mở trên map là ${if (hintFloor == 0) "GF" else hintFloor}",
                    color = Color(0xFFFDE68A),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(Modifier.height(24.dp))
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                floors.forEach { floor ->
                    val label = if (floor == 0) "GF" else "${floor}F"
                    val selected = floor == hintFloor
                    Box(
                        modifier = Modifier
                            .background(
                                if (selected) Color(0xFFFBBF24) else Color(0x33FFFFFF),
                                RoundedCornerShape(14.dp),
                            )
                            .border(
                                width = 1.dp,
                                color = if (selected) Color(0xFFFBBF24) else Color(0x55FECACA),
                                shape = RoundedCornerShape(14.dp),
                            )
                            .clickable { onFloorSelected(floor) }
                            .padding(horizontal = 22.dp, vertical = 16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = label,
                            color = if (selected) Color(0xFF1C1917) else Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                        )
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Text(
                text = session.title.ifBlank {
                    EmergencySession.headlineForType(session.incidentType)
                },
                color = Color(0xFFFECDD3).copy(alpha = 0.7f),
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
            )
            if (onDismiss != null) {
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = onDismiss) {
                    Text("Đóng", color = Color(0xFFFDA4AF))
                }
            }
        }
    }
}
