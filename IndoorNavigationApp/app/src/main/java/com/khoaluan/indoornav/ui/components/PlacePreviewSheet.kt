package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.ui.i18n.LocalAppLocale
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.i18n.tr

private val GmapsBlue = Color(0xFF1A73E8)
private val GmapsInk = Color(0xFF202124)
private val GmapsMuted = Color(0xFF5F6368)
private val GmapsGreen = Color(0xFF188038)
private val GmapsChipBg = Color(0xFFE8F0FE)
private val GmapsStar = Color(0xFFF9AB00)

/**
 * Place Preview — bottom card kiểu Google Maps (action chips tròn + CTA chính).
 */
@Composable
fun PlacePreviewSheet(
    building: Building,
    explorer: com.khoaluan.indoornav.data.api.BuildingExplorerDto? = null,
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
    onPropose: () -> Unit = {},
    onEnterIndoor: () -> Unit,
    onLoginRequired: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val category = PlaceCategoryLabels.display(building.category, LocalAppLocale.current)
        .takeIf { it.isNotBlank() }
    val address = building.address?.takeIf { it.isNotBlank() }
    val ratingAvg = explorer?.ratingAvg?.takeIf { (explorer.ratingCount) > 0 }
    val ratingCount = explorer?.ratingCount ?: 0

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp, vertical = 8.dp),
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = 16.dp, bottomEnd = 16.dp),
        color = Color.White,
        shadowElevation = 10.dp,
        tonalElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 14.dp),
        ) {
            // Handle kéo (Google Maps)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .width(36.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color(0xFFDADCE0)),
                )
            }

            // Tiêu đề + đóng
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, end = 4.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = building.name,
                        fontWeight = FontWeight.Bold,
                        fontSize = 22.sp,
                        color = GmapsInk,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        lineHeight = 26.sp,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    // category · ★ rating (số) · address — một dòng meta
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (ratingAvg != null) {
                            Text(
                                text = "%.1f".format(ratingAvg),
                                fontSize = 13.sp,
                                color = GmapsMuted,
                                fontWeight = FontWeight.Medium,
                            )
                            Icon(
                                imageVector = Icons.Rounded.Star,
                                contentDescription = null,
                                tint = GmapsStar,
                                modifier = Modifier
                                    .padding(horizontal = 2.dp)
                                    .size(14.dp),
                            )
                            if (ratingCount > 0) {
                                Text(
                                    text = "($ratingCount)",
                                    fontSize = 13.sp,
                                    color = GmapsMuted,
                                )
                            }
                            Text(
                                text = " · ",
                                fontSize = 13.sp,
                                color = GmapsMuted,
                            )
                        }
                        Text(
                            text = listOfNotNull(category, address).joinToString(" · ")
                                .ifBlank { tr("Chưa có địa chỉ", "No address yet") },
                            fontSize = 13.sp,
                            color = GmapsMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                    }
                    if (building.hasPublishedIndoor == true) {
                        Text(
                            text = tr("Đang mở · Có bản đồ trong nhà", "Open · Indoor map available"),
                            fontSize = 13.sp,
                            color = GmapsGreen,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    if (explorer != null) {
                        val bits = buildList {
                            add(tr("${explorer.totalFloors} tầng", "${explorer.totalFloors} floors"))
                            if (explorer.poisCount > 0) {
                                add(tr("${explorer.poisCount} điểm", "${explorer.poisCount} places"))
                            }
                        }
                        if (bits.isNotEmpty()) {
                            Text(
                                text = bits.joinToString(" · "),
                                fontSize = 12.sp,
                                color = GmapsMuted,
                                modifier = Modifier.padding(top = 2.dp),
                            )
                        }
                    }
                }
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = tr("Đóng", "Close"),
                        tint = GmapsMuted,
                    )
                }
            }

            if (!notice.isNullOrBlank()) {
                Text(
                    text = notice,
                    fontSize = 12.sp,
                    color = GmapsMuted,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }

            // Hàng action tròn kiểu Google Maps
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                GmapsActionChip(
                    icon = Icons.Rounded.LocationOn,
                    label = tr("Chỉ đường", "Directions"),
                    filled = true,
                    enabled = building.gpsLocation != null,
                    onClick = onDirections,
                )
                if (!building.placeId.isNullOrBlank()) {
                    GmapsActionChip(
                        icon = if (isFavorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        label = if (isFavorite) tr("Đã lưu", "Saved") else tr("Lưu", "Save"),
                        filled = isFavorite,
                        accent = if (isFavorite) Color(0xFFD93025) else GmapsBlue,
                        onClick = {
                            if (!isLoggedIn) onLoginRequired() else onToggleFavorite()
                        },
                    )
                    GmapsActionChip(
                        icon = Icons.Rounded.Notifications,
                        label = if (isFollowing) {
                            tr("Đang theo", "Following")
                        } else {
                            tr("Theo dõi", "Follow")
                        },
                        filled = isFollowing,
                        onClick = {
                            if (!isLoggedIn) onLoginRequired() else onToggleFollow()
                        },
                    )
                }
                GmapsActionChip(
                    icon = Icons.Rounded.Share,
                    label = tr("Chia sẻ", "Share"),
                    filled = false,
                    onClick = onShare,
                )
            }

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 16.dp),
                color = Color(0xFFE8EAED),
                thickness = 1.dp,
            )

            if (!building.placeId.isNullOrBlank()) {
                TextButton(
                    onClick = {
                        if (!isLoggedIn) onLoginRequired() else onPropose()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Edit,
                        contentDescription = null,
                        tint = GmapsBlue,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = tr("Đề xuất chỉnh sửa", "Suggest an edit"),
                        color = GmapsBlue,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            Text(
                text = tr("Xem chi tiết địa điểm", "View place details"),
                color = GmapsBlue,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onOpenDetail)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            )

            Button(
                onClick = onEnterIndoor,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .height(48.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = GmapsBlue,
                    contentColor = Color.White,
                ),
                shape = RoundedCornerShape(24.dp),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Place,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (building.hasPublishedIndoor == true) {
                        tr("Xem bản đồ trong nhà", "View indoor map")
                    } else {
                        tr("Vào bản đồ trong nhà", "Enter indoor map")
                    },
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                )
            }
        }
    }
}

@Composable
private fun GmapsActionChip(
    icon: ImageVector,
    label: String,
    filled: Boolean,
    enabled: Boolean = true,
    accent: Color = GmapsBlue,
    onClick: () -> Unit,
) {
    val bg = when {
        !enabled -> Color(0xFFF1F3F4)
        filled -> accent
        else -> GmapsChipBg
    }
    val fg = when {
        !enabled -> Color(0xFF9AA0A6)
        filled -> Color.White
        else -> accent
    }
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(72.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 4.dp),
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .background(bg, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = fg,
                modifier = Modifier.size(22.dp),
            )
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = label,
            fontSize = 12.sp,
            color = if (enabled) GmapsInk else Color(0xFF9AA0A6),
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
