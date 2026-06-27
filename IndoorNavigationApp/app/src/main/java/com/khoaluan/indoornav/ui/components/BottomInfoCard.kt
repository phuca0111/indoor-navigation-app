package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.theme.NavBlue
import com.khoaluan.indoornav.ui.theme.NavLightBlue

/**
 * Card thông tin điều hướng phía dưới màn hình.
 * Hiển thị vị trí hiện tại, điểm đến, tiến độ và nút Quét QR.
 *
 * @param currentLocation  Nhãn vị trí hiện tại (vd: "Hành lang A - Tầng 1")
 * @param destination      Nhãn điểm đến (vd: "Phòng 205 - Tầng 2")
 * @param isSearchingPath  True khi đang tính toán đường đi A* (spinner)
 * @param isNavigating     True khi đang có path điều hướng
 * @param progress         Tiến độ 0f–1f (chỉ hiện khi isNavigating = true)
 * @param distanceMeters   Tổng quãng đường đang điều hướng (mét)
 * @param etaSeconds       ETA ước lượng (giây)
 * @param rerouteCount     Số lần hệ thống đã tự tính lại đường
 * @param isRerouting      True trong lúc hệ thống vừa trigger tính lại đường
 * @param onQrScan         Callback nhấn nút Quét QR
 * @param onStopNavigation Callback nhấn nút Hủy điều hướng (chỉ hiện khi isNavigating)
 */
@Composable
fun BottomInfoCard(
    currentLocation: String,
    destination: String,
    isSearchingPath: Boolean = false,
    isNavigating: Boolean = false,
    progress: Float = 0f,
    distanceMeters: Float = 0f,
    etaSeconds: Int = 0,
    rerouteCount: Int = 0,
    isRerouting: Boolean = false,
    onQrScan: () -> Unit,
    onStartNavigation: (() -> Unit)? = null,
    onStopNavigation: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val etaMinutes = (etaSeconds / 60f).coerceAtLeast(0f)
    val etaLabel = if (etaMinutes < 1f) "< 1 phút" else "${etaMinutes.toInt()} phút"
    val distanceLabel = if (distanceMeters < 1000f) {
        "${distanceMeters.toInt()} m"
    } else {
        String.format("%.1f km", distanceMeters / 1000f)
    }
    val reroutePulse = rememberInfiniteTransition(label = "reroutePulse")
    val rerouteAlpha = reroutePulse.animateFloat(
        initialValue = 0.65f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 650),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "rerouteAlpha",
    )

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
        color = Color.White,
        shadowElevation = 12.dp,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 18.dp, top = 14.dp, bottom = 12.dp, end = 80.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                // Hàng vị trí + điểm đến
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Vị trí hiện tại
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Vị trí hiện tại",
                            fontSize = 11.sp,
                            color = Color(0xFF9E9E9E),
                        )
                        Text(
                            text = currentLocation,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF212121),
                            maxLines = 1,
                        )
                    }

                    // Đường kẻ phân cách
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 14.dp)
                            .width(1.dp)
                            .height(36.dp)
                            .background(Color(0xFFE0E0E0)),
                    )

                    // Điểm đến
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Điểm đến",
                            fontSize = 11.sp,
                            color = Color(0xFF9E9E9E),
                        )
                        Text(
                            text = destination,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = NavBlue,
                            maxLines = 1,
                        )
                    }
                }

                // Trạng thái: đang tìm đường / đang điều hướng
                when {
                    isSearchingPath -> {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(14.dp),
                                strokeWidth = 2.dp,
                                color = NavBlue,
                            )
                            Text(
                                text = "Đang tìm đường...",
                                fontSize = 11.sp,
                                color = NavBlue,
                            )
                        }
                    }
                    isNavigating -> {
                        Column {
                            Text(
                                text = "Đang điều hướng · ETA $etaLabel · $distanceLabel",
                                fontSize = 11.sp,
                                color = Color(0xFF9E9E9E),
                            )
                            Spacer(Modifier.height(4.dp))
                            LinearProgressIndicator(
                                progress = { progress.coerceIn(0f, 1f) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(5.dp)
                                    .clip(RoundedCornerShape(3.dp)),
                                color = NavLightBlue,
                                trackColor = Color(0xFFE3F2FD),
                            )

                            if (rerouteCount > 0) {
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    text = "Đã tự tính lại lộ trình $rerouteCount lần",
                                    fontSize = 10.sp,
                                    color = Color(0xFFEF6C00),
                                )
                            }

                            if (isRerouting) {
                                Spacer(Modifier.height(4.dp))
                                SuggestionChip(
                                    onClick = {},
                                    enabled = false,
                                    icon = {
                                        Icon(
                                            imageVector = Icons.Default.Refresh,
                                            contentDescription = null,
                                            modifier = Modifier.size(14.dp),
                                            tint = Color(0xFF1565C0),
                                        )
                                    },
                                    label = {
                                        Text(
                                            text = "Đang tính lại lộ trình...",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color(0xFF1565C0),
                                        )
                                    },
                                    modifier = Modifier.alpha(rerouteAlpha.value),
                                    colors = SuggestionChipDefaults.suggestionChipColors(
                                        containerColor = Color(0xFFE3F2FD),
                                        disabledContainerColor = Color(0xFFE3F2FD),
                                        disabledLabelColor = Color(0xFF1565C0),
                                        disabledIconContentColor = Color(0xFF1565C0),
                                    ),
                                )
                            }
                        }
                    }
                    destination != "Đang tải..." && destination.isNotEmpty() -> {
                        // Chế độ xem trước (Preview)
                        Column {
                            Text(
                                text = "Tổng khoảng cách: $distanceLabel · ETA $etaLabel",
                                fontSize = 12.sp,
                                color = Color(0xFF757575),
                            )
                            Spacer(Modifier.height(8.dp))
                            Button(
                                onClick = { onStartNavigation?.invoke() },
                                colors = ButtonDefaults.buttonColors(containerColor = NavBlue),
                                modifier = Modifier.fillMaxWidth().height(40.dp)
                            ) {
                                Text("Bắt đầu chỉ đường", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                    else -> {
                        Text(
                            text = "Nhấn Quét QR để xác định vị trí bắt đầu",
                            fontSize = 11.sp,
                            color = Color(0xFF9E9E9E),
                        )
                    }
                }
            }

            // FAB QR — căn giữa dọc, sát mép phải
            Column(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .offset(x = 64.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // Nút Quét QR
                FloatingActionButton(
                    onClick = onQrScan,
                    modifier = Modifier.size(52.dp),
                    shape = CircleShape,
                    containerColor = NavBlue,
                    contentColor = Color.White,
                    elevation = FloatingActionButtonDefaults.elevation(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Quét QR",
                        modifier = Modifier.size(24.dp),
                    )
                }

                // Nút Hủy điều hướng (chỉ hiện khi đang navigate)
                if (isNavigating && onStopNavigation != null) {
                    IconButton(
                        onClick = onStopNavigation,
                        modifier = Modifier
                            .size(36.dp)
                            .shadow(2.dp, CircleShape)
                            .clip(CircleShape)
                            .background(Color(0xFFFFEBEE)),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Hủy điều hướng",
                            tint = Color(0xFFE53935),
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}
