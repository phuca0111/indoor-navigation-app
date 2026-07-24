package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import com.khoaluan.indoornav.ui.i18n.LocalAppLocale
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.i18n.tr
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.model.Building

/**
 * Module #6 Place Preview — Bottom sheet ngắn (Google Maps style).
 * Không thay Place Detail (#7).
 */
@Composable
fun PlacePreviewSheet(
    building: Building,
    isFavorite: Boolean,
    isFollowing: Boolean,
    notice: String?,
    isLoggedIn: Boolean,
    onDismiss: () -> Unit,
    onDirections: () -> Unit,
    onToggleFavorite: () -> Unit,
    onShare: () -> Unit,
    onToggleFollow: () -> Unit,
    onOpenDetail: () -> Unit,
    onEnterIndoor: () -> Unit,
    onLoginRequired: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(12.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(Color(0xFFE8F0FE), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Place,
                        contentDescription = null,
                        tint = Color(0xFF1A73E8),
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = building.name,
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = Color(0xFF202124),
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = listOfNotNull(
                            PlaceCategoryLabels.display(building.category, LocalAppLocale.current)
                                .takeIf { it.isNotBlank() },
                            building.address?.takeIf { it.isNotBlank() }
                                ?: tr("Chưa có địa chỉ", "No address yet"),
                        ).joinToString(" · "),
                        fontSize = 13.sp,
                        color = Color(0xFF5F6368),
                        lineHeight = 18.sp,
                    )
                    if (building.hasPublishedIndoor == true) {
                        Text(
                            text = tr("Đang mở · Có bản đồ trong nhà", "Open · Indoor map available"),
                            fontSize = 12.sp,
                            color = Color(0xFF188038),
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
                if (!building.placeId.isNullOrBlank()) {
                    IconButton(onClick = {
                        if (!isLoggedIn) onLoginRequired() else onToggleFavorite()
                    }) {
                        Icon(
                            imageVector = if (isFavorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                            contentDescription = if (isFavorite) {
                                tr("Bỏ yêu thích", "Remove favorite")
                            } else {
                                tr("Lưu", "Save")
                            },
                            tint = if (isFavorite) Color(0xFFD93025) else Color(0xFF5F6368),
                        )
                    }
                }
                IconButton(onClick = onShare) {
                    Icon(
                        imageVector = Icons.Rounded.Share,
                        contentDescription = tr("Chia sẻ", "Share"),
                        tint = Color(0xFF5F6368),
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = tr("Đóng", "Close"),
                        tint = Color(0xFF5F6368),
                    )
                }
            }

            if (!notice.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(text = notice, fontSize = 12.sp, color = Color(0xFF5F6368))
            }

            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = onDirections,
                    enabled = building.gpsLocation != null,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(tr("Chỉ đường", "Directions"), fontSize = 12.sp)
                }
                if (!building.placeId.isNullOrBlank()) {
                    OutlinedButton(
                        onClick = {
                            if (!isLoggedIn) onLoginRequired() else onToggleFollow()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            if (isFollowing) {
                                tr("Đang theo dõi", "Following")
                            } else {
                                tr("Theo dõi", "Follow")
                            },
                            fontSize = 12.sp,
                        )
                    }
                }
            }

            TextButton(
                onClick = onOpenDetail,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(tr("Xem chi tiết địa điểm", "View place details"), color = Color(0xFF1A73E8))
            }

            Button(
                onClick = onEnterIndoor,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1A73E8)),
                shape = RoundedCornerShape(24.dp),
            ) {
                Text(
                    text = if (building.hasPublishedIndoor == true) {
                        tr("▶ Xem bản đồ trong nhà", "▶ View indoor map")
                    } else {
                        tr("Vào bản đồ trong nhà", "Enter indoor map")
                    },
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}
