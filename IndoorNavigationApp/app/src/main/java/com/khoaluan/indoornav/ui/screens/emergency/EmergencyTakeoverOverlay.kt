package com.khoaluan.indoornav.ui.screens.emergency

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.navigation.emergency.EmergencySession
import kotlin.math.min
/**
 * Màn hình cảnh báo full-screen (in-app override) — phong cách cảnh báo đỏ / tam giác nguy hiểm.
 */
@Composable
fun EmergencyTakeoverOverlay(
    session: EmergencySession,
    onStartEvacuation: () -> Unit,
    onDismiss: (() -> Unit)? = null,
    onSwitchToExitFloor: (() -> Unit)? = null,
) {
    val pulse = rememberInfiniteTransition(label = "emergencyPulse")
    val glow by pulse.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.95f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "glow",
    )
    val headline = session.title.ifBlank {
        EmergencySession.headlineForType(session.incidentType)
    }
    val detail = session.body.ifBlank {
        EmergencySession.bodyForType(session.incidentType)
    }

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
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val cx = w / 2f
            val cy = h * 0.38f
            val r = min(w, h) * 0.22f

            // HUD corners
            val corner = r * 1.35f
            val accent = Color(0xFFFFF1F2).copy(alpha = 0.55f)
            val len = corner * 0.28f
            fun cornerBracket(x: Float, y: Float, dx: Float, dy: Float) {
                drawLine(
                    color = accent,
                    start = Offset(x, y),
                    end = Offset(x + dx * len, y),
                    strokeWidth = 4f,
                    cap = StrokeCap.Round,
                )
                drawLine(
                    color = accent,
                    start = Offset(x, y),
                    end = Offset(x, y + dy * len),
                    strokeWidth = 4f,
                    cap = StrokeCap.Round,
                )
            }
            cornerBracket(cx - corner, cy - corner, 1f, 1f)
            cornerBracket(cx + corner, cy - corner, -1f, 1f)
            cornerBracket(cx - corner, cy + corner, 1f, -1f)
            cornerBracket(cx + corner, cy + corner, -1f, -1f)

            // Glow disc
            drawCircle(
                color = Color(0xFFFF2D2D).copy(alpha = 0.18f * glow),
                radius = r * 1.55f,
                center = Offset(cx, cy),
            )

            // Warning triangle
            val tri = Path().apply {
                moveTo(cx, cy - r)
                lineTo(cx + r * 0.95f, cy + r * 0.75f)
                lineTo(cx - r * 0.95f, cy + r * 0.75f)
                close()
            }
            drawPath(tri, Color(0xFFFFC107).copy(alpha = 0.95f))
            drawPath(tri, Color(0xFFFF8F00), style = Stroke(width = 6f))

            // Exclamation
            drawRoundRect(
                color = Color(0xFF1A0505),
                topLeft = Offset(cx - r * 0.08f, cy - r * 0.35f),
                size = Size(r * 0.16f, r * 0.55f),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(r * 0.08f),
            )
            drawCircle(
                color = Color(0xFF1A0505),
                radius = r * 0.09f,
                center = Offset(cx, cy + r * 0.42f),
            )

            // Lens flare
            drawLine(
                color = Color.White.copy(alpha = 0.25f * glow),
                start = Offset(cx - r * 1.6f, cy),
                end = Offset(cx + r * 1.6f, cy),
                strokeWidth = 3f,
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp, vertical = 36.dp),
            verticalArrangement = Arrangement.Bottom,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "⚠ CẢNH BÁO NGUY HIỂM",
                color = Color(0xFFFFE4E6),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 2.sp,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = headline.uppercase(),
                color = Color.White,
                fontSize = 34.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
                lineHeight = 40.sp,
            )
            Spacer(Modifier.height(14.dp))
            Text(
                text = detail,
                color = Color(0xFFFFE4E6).copy(alpha = 0.92f),
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
                lineHeight = 22.sp,
                modifier = Modifier.fillMaxWidth(),
            )
            if (session.needsQr) {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Chưa có vị trí đang đứng — sau khi bấm chỉ đường, chạm bản đồ để chọn vị trí (hoặc quét QR).",
                    color = Color(0xFFFDE68A),
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                )
            }
            if (session.hazardZones.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "Bản đồ sẽ tô đỏ ${session.hazardZones.size} vùng nguy hiểm — lộ trình sơ tán sẽ tránh các vùng này.",
                    color = Color(0xFFFECACA),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    fontWeight = FontWeight.Medium,
                )
            }
            session.error?.takeIf { it.isNotBlank() }?.let { err ->
                Spacer(Modifier.height(8.dp))
                Text(
                    text = err,
                    color = Color(0xFFFECACA),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(Modifier.height(28.dp))
            Button(
                onClick = onStartEvacuation,
                enabled = session.error?.startsWith("Đang tìm") != true,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFFBBF24),
                    contentColor = Color(0xFF1C1917),
                ),
            ) {
                Text(
                    text = when {
                        session.error?.startsWith("Đang tìm") == true -> "ĐANG TÌM LỐI THOÁT…"
                        !session.error.isNullOrBlank() -> "THỬ LẠI CHỈ ĐƯỜNG"
                        session.needsQr -> "CHỈ ĐƯỜNG — chọn vị trí đứng"
                        else -> "CHỈ ĐƯỜNG RA LỐI THOÁT"
                    },
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                )
            }
            if (onSwitchToExitFloor != null && session.suggestedExitFloor != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Button(
                    onClick = onSwitchToExitFloor,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFFEF3C7),
                        contentColor = Color(0xFF1C1917),
                    ),
                ) {
                    val fl = session.suggestedExitFloor!!
                    Text(
                        text = "XUỐNG TẦNG LỐI THOÁT (${if (fl == 0) "GF" else fl})",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                    )
                }
            }
            if (onDismiss != null) {
                Spacer(modifier = Modifier.height(8.dp))
                TextButton(onClick = onDismiss) {
                    Text("Đóng — mở lại sau trên map", color = Color(0xFFFDA4AF))
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Sẽ dẫn bạn tới lối thoát hiểm gần nhất, tránh vùng nguy hiểm.",
                color = Color(0xFFFECDD3).copy(alpha = 0.7f),
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}
