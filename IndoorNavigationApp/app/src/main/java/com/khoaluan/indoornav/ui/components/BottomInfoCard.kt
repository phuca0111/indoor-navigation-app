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
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.theme.NavBlue
import com.khoaluan.indoornav.ui.theme.NavLightBlue

/**
 * Card thông tin điều hướng phía dưới màn hình.
 *
 * @param rerouteCount     Số lần hệ thống đã tự tính lại đường
 * @param isRerouting      True trong lúc hệ thống vừa trigger tính lại đường
 * @param onQrScan         Callback nhấn nút Quét QR
 * @param isPathPreview    True khi đã có đường preview, chưa bắt đầu điều hướng
 * @param navigationError  Thông báo lỗi khi không tìm được đường
 * @param onPreviewPath    Callback nút "Xem đường"
 * @param instructionText  W1 — chỉ dẫn rẽ / đi thẳng
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
    isPathPreview: Boolean = false,
    navigationError: String? = null,
    onQrScan: () -> Unit,
    onPreviewPath: (() -> Unit)? = null,
    onStartNavigation: (() -> Unit)? = null,
    onStopNavigation: (() -> Unit)? = null,
    /** W1 — chỉ dẫn text (“Rẽ trái sau 12 m”…). */
    instructionText: String? = null,
    /** W3 — path có cầu thang/thang máy. */
    pathHasFloorConnector: Boolean = false,
    /** W3 — mở sheet chọn tầng. */
    onOpenFloorPicker: (() -> Unit)? = null,
    /** #10 — CTA chuyển tầng gợi ý. */
    suggestedFloorLabel: String? = null,
    onSwitchSuggestedFloor: (() -> Unit)? = null,
    /** #11 — Sửa vị trí (giữ đích, quét QR lại). */
    onRelocalize: (() -> Unit)? = null,
    showRelocalize: Boolean = false,
    /** #12 — tính lại đường thủ công. */
    onRecalculate: (() -> Unit)? = null,
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
                            if (!instructionText.isNullOrBlank()) {
                                Text(
                                    text = instructionText,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF1A73E8),
                                    maxLines = 2,
                                )
                                Spacer(modifier.height(4.dp))
                            }
                            if (pathHasFloorConnector && onOpenFloorPicker != null) {
                                TextButton(
                                    onClick = onOpenFloorPicker,
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                                ) {
                                    Text(
                                        text = "Lộ trình có đổi tầng · Chọn tầng",
                                        fontSize = 12.sp,
                                        color = NavBlue,
                                    )
                                }
                            }
                            if (onSwitchSuggestedFloor != null && !suggestedFloorLabel.isNullOrBlank()) {
                                Button(
                                    onClick = onSwitchSuggestedFloor,
                                    colors = ButtonDefaults.buttonColors(containerColor = NavBlue),
                                    modifier = Modifier.height(36.dp),
                                    contentPadding = PaddingValues(horizontal = 12.dp),
                                ) {
                                    Text(
                                        text = "Chuyển $suggestedFloorLabel",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
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
                                            tint = Color(0xFF1A73E8),
                                        )
                                    },
                                    label = {
                                        Text(
                                            text = tr("Đang tính lại lộ trình...", "Recalculating route..."),
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            color = Color(0xFF1A73E8),
                                        )
                                    },
                                    modifier = Modifier.alpha(rerouteAlpha.value),
                                    colors = SuggestionChipDefaults.suggestionChipColors(
                                        containerColor = Color(0xFFE3F2FD),
                                        disabledContainerColor = Color(0xFFE3F2FD),
                                        disabledLabelColor = Color(0xFF1A73E8),
                                        disabledIconContentColor = Color(0xFF1A73E8),
                                    ),
                                )
                            }

                            if (onRecalculate != null) {
                                Spacer(Modifier.height(6.dp))
                                TextButton(
                                    onClick = onRecalculate,
                                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                                ) {
                                    Icon(
                                        Icons.Default.Refresh,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp),
                                        tint = NavBlue,
                                    )
                                    Spacer(Modifier.width(4.dp))
                                    Text(tr("Tính lại đường", "Recalculate"), fontSize = 12.sp, color = NavBlue)
                                }
                            }
                            if (showRelocalize && onRelocalize != null) {
                                TextButton(
                                    onClick = onRelocalize,
                                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                                ) {
                                    Text(tr("Sửa vị trí · Quét QR", "Fix location · Scan QR"), fontSize = 12.sp, color = Color(0xFFEF6C00))
                                }
                            }
                        }
                    }
                    isPathPreview -> {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (!instructionText.isNullOrBlank() && distanceMeters > 0f) {
                                Text(
                                    text = instructionText,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Color(0xFF1A73E8),
                                    maxLines = 2,
                                )
                            }
                            if (distanceMeters <= 0f && navigationError == null) {
                                Text(
                                    text = "Đã chọn điểm đến. Nhấn \"Xem đường\" để hiện lộ trình.",
                                    fontSize = 12.sp,
                                    color = Color(0xFF757575),
                                )
                            } else {
                                Text(
                                    text = "Tổng khoảng cách: $distanceLabel · ETA $etaLabel",
                                    fontSize = 12.sp,
                                    color = Color(0xFF757575),
                                )
                            }
                            navigationError?.let { err ->
                                Text(
                                    text = err,
                                    fontSize = 11.sp,
                                    color = Color(0xFFE53935),
                                )
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                OutlinedButton(
                                    onClick = { onPreviewPath?.invoke() },
                                    modifier = Modifier.weight(1f).height(40.dp),
                                    enabled = onPreviewPath != null,
                                ) {
                                    Text(tr("Xem đường", "Preview"), fontWeight = FontWeight.SemiBold)
                                }
                                Button(
                                    onClick = { onStartNavigation?.invoke() },
                                    colors = ButtonDefaults.buttonColors(containerColor = NavBlue),
                                    modifier = Modifier.weight(1f).height(40.dp),
                                    enabled = onStartNavigation != null
                                        && navigationError == null
                                        && distanceMeters > 0f,
                                ) {
                                    Text(tr("Bắt đầu", "Start"), fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                    else -> {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = tr(
                                "Nhấn Quét QR để xác định vị trí bắt đầu",
                                "Tap Scan QR to set your start location",
                            ),
                                fontSize = 11.sp,
                                color = Color(0xFF9E9E9E),
                            )
                            if (showRelocalize && onRelocalize != null) {
                                TextButton(
                                    onClick = onRelocalize,
                                    contentPadding = PaddingValues(horizontal = 0.dp, vertical = 0.dp),
                                ) {
                                    Text(tr("Sửa vị trí · Quét QR", "Fix location · Scan QR"), fontSize = 12.sp, color = Color(0xFFEF6C00))
                                }
                            }
                        }
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
                        contentDescription = tr("Quét QR", "Scan QR"),
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
                            contentDescription = tr("Hủy điều hướng", "Stop navigation"),
                            tint = Color(0xFFE53935),
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}
