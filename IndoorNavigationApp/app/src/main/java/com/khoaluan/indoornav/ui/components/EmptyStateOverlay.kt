package com.khoaluan.indoornav.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.theme.NavBlue
import com.khoaluan.indoornav.ui.theme.NavLightBlue

/**
 * Overlay hướng dẫn lần đầu — hiển thị khi chưa quét QR và chưa chọn điểm đến.
 *
 * UX fix: User phải biết phải làm gì khi mở app lần đầu.
 * Rule: "Navigation must be clear" (MAP_UI_SPECIAL_PROMPT)
 *
 * @param visible     Hiện/ẩn overlay (animate fade)
 * @param onQrScan    Callback khi nhấn nút "Quét QR"
 * @param onDismiss   Callback khi nhấn "Bỏ qua" — MapScreen set showEmptyState = false
 */
@Composable
fun EmptyStateOverlay(
    visible: Boolean,
    onQrScan: () -> Unit,
    onDismiss: () -> Unit,   // WHY: thiếu prop này khiến nút "Bỏ qua" không có hiệu lực
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(),
        exit  = fadeOut(),
        modifier = modifier,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.45f)),
            contentAlignment = Alignment.Center,
        ) {
            Card(
                modifier = Modifier
                    .padding(horizontal = 32.dp)
                    .fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(12.dp),
            ) {
                Column(
                    modifier = Modifier.padding(28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    // Icon QR lớn với nền tròn
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(CircleShape)
                            .background(NavBlue.copy(alpha = 0.1f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null,
                            tint = NavBlue,
                            modifier = Modifier.size(36.dp),
                        )
                    }

                    // Tiêu đề
                    Text(
                        text = "Xác định vị trí của bạn",
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF212121),
                        textAlign = TextAlign.Center,
                    )

                    // Mô tả
                    Text(
                        text = "Quét mã QR gần bạn để bắt đầu điều hướng trong tòa nhà",
                        fontSize = 13.sp,
                        color = Color(0xFF757575),
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp,
                    )

                    // Divider mỏng
                    HorizontalDivider(color = Color(0xFFEEEEEE))

                    // Hướng dẫn tìm kiếm
                    Text(
                        text = "Hoặc dùng ô Tìm phòng phía trên để chọn điểm đến trước",
                        fontSize = 12.sp,
                        color = Color(0xFF9E9E9E),
                        textAlign = TextAlign.Center,
                        lineHeight = 17.sp,
                    )

                    // Nút Quét QR
                    Button(
                        onClick = onQrScan,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = NavBlue,
                            contentColor = Color.White,
                        ),
                        elevation = ButtonDefaults.buttonElevation(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            text = "Quét QR ngay",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }

                    // Nút phụ — bỏ qua, gọi onDismiss để MapScreen ẩn overlay
                    TextButton(
                        onClick = onDismiss,
                        colors = ButtonDefaults.textButtonColors(contentColor = NavLightBlue),
                    ) {
                        Text("Bỏ qua, tôi tự tìm trên bản đồ", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
