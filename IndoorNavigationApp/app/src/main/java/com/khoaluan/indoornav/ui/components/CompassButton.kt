package com.khoaluan.indoornav.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.theme.NavBlue
import com.khoaluan.indoornav.ui.theme.NavWall
import com.khoaluan.indoornav.ui.viewmodel.MapRotationMode
import kotlin.math.roundToInt

/**
 * La bàn chỉ hướng Bắc — xoay theo cảm biến sensor.
 * Long-press: mở panel debug căn Bắc (không phải UX người dùng cuối).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun CompassButton(
    rotation: Float = 0f,
    mapRotationMode: MapRotationMode = MapRotationMode.NORTH_UP,
    onClick: () -> Unit = {},
    onLongClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    var unwrappedRotation by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(rotation) {
        var delta = (rotation - unwrappedRotation) % 360f
        if (delta > 180f) delta -= 360f
        if (delta < -180f) delta += 360f
        unwrappedRotation += delta
    }

    val animatedRotation by animateFloatAsState(
        targetValue = unwrappedRotation,
        animationSpec = tween(durationMillis = 50),
        label = "CompassRotation"
    )

    // Kim Bắc chỉ về hướng Bắc thật trên màn hình
    val compassRotation = -animatedRotation

    Box(
        modifier = modifier
            .shadow(4.dp, CircleShape)
            .size(56.dp)
            .clip(CircleShape)
            .background(Color.White)
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        // Chỉ báo dot (HEADING_UP mode)
        if (mapRotationMode == MapRotationMode.HEADING_UP) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 2.dp)
                    .background(NavBlue, CircleShape)
            )
        }

        // Kim + chữ N xoay như một khối
        Box(
            modifier = Modifier
                .size(36.dp)
                .rotate(compassRotation),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(modifier = Modifier.matchParentSize()) {
                val cx = size.width / 2f
                val cy = size.height / 2f
                val r = size.minDimension / 2f * 0.88f

                drawCircle(Color.White, radius = r, center = center)
                drawCircle(NavWall.copy(alpha = 0.35f), radius = r, center = center, style = Stroke(1.5f))

                // Kim Bắc — tam giác đối xứng
                val northTip = cy - r * 0.72f
                val northBase = cy - r * 0.08f
                val northHalfW = r * 0.22f
                drawPath(
                    Path().apply {
                        moveTo(cx, northTip)
                        lineTo(cx - northHalfW, northBase)
                        lineTo(cx + northHalfW, northBase)
                        close()
                    },
                    NavBlue
                )

                // Kim Nam — tam giác đối xứng
                val southTip = cy + r * 0.72f
                val southBase = cy + r * 0.08f
                val southHalfW = r * 0.18f
                drawPath(
                    Path().apply {
                        moveTo(cx, southTip)
                        lineTo(cx - southHalfW, southBase)
                        lineTo(cx + southHalfW, southBase)
                        close()
                    },
                    Color(0xFFCFD8DC)
                )

                drawCircle(Color.White, radius = r * 0.12f, center = center)
                drawCircle(NavWall, radius = r * 0.12f, center = center, style = Stroke(1.2f))
            }

            // Chữ N xoay cùng kim (đặt gần đỉnh kim Bắc)
            Text(
                text = "N",
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1565C0),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset(y = 2.dp),
            )
        }

        // Hiển thị góc độ hiện tại (đã làm tròn)
        Text(
            text = "${rotation.roundToInt()}°",
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF1565C0),
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp)
        )
    }
}
