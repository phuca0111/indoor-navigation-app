package com.khoaluan.indoornav.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.api.BuildingExplorerDto
import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.i18n.workspaceStatusVi

/**
 * GĐ2 Building Explorer — tổng quan kiểu Google Maps trước Enter Indoor.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceDetailScreen(
    building: Building,
    explorer: BuildingExplorerDto? = null,
    explorerLoading: Boolean = false,
    isFavorite: Boolean,
    isFollowing: Boolean,
    isLoggedIn: Boolean,
    onBack: () -> Unit,
    onDirections: () -> Unit,
    onToggleFavorite: () -> Unit,
    onShare: () -> Unit,
    onToggleFollow: () -> Unit,
    onReview: () -> Unit,
    onReport: () -> Unit,
    onEnterIndoor: () -> Unit,
    onLoginRequired: () -> Unit,
) {
    val floors = explorer?.totalFloors ?: building.totalFloors
    val pois = explorer?.poisCount
    val ratingAvg = explorer?.ratingAvg
    val ratingCount = explorer?.ratingCount ?: 0
    val creatorName = explorer?.creator?.fullName
    val updatedLabel = formatExplorerDate(explorer?.updatedAt)
    val hasIndoor = explorer?.hasPublishedIndoor
        ?: (building.hasPublishedIndoor == true)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(building.name, maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = "Quay lại")
                    }
                },
                actions = {
                    if (!building.placeId.isNullOrBlank()) {
                        IconButton(onClick = {
                            if (!isLoggedIn) onLoginRequired() else onToggleFavorite()
                        }) {
                            Icon(
                                imageVector = if (isFavorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                                contentDescription = "Yêu thích",
                                tint = if (isFavorite) Color(0xFFD93025) else Color(0xFF5F6368),
                            )
                        }
                    }
                    IconButton(onClick = onShare) {
                        Icon(Icons.Rounded.Share, contentDescription = "Chia sẻ")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
            )
        },
        containerColor = Color(0xFFF8F9FA),
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = building.name,
                fontWeight = FontWeight.Bold,
                fontSize = 22.sp,
                color = Color(0xFF202124),
            )
            if (ratingAvg != null && ratingCount > 0) {
                Text(
                    text = "★ %.1f · %d %s".format(
                        ratingAvg,
                        ratingCount,
                        tr("đánh giá", "reviews"),
                    ),
                    fontSize = 14.sp,
                    color = Color(0xFFF9AB00),
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Text(
                text = listOfNotNull(
                    PlaceCategoryLabels.display(explorer?.category ?: building.category)
                        .takeIf { it.isNotBlank() },
                    (explorer?.address ?: building.address)?.takeIf { it.isNotBlank() },
                ).joinToString(" · ").ifBlank { tr("Chưa có địa chỉ", "No address yet") },
                fontSize = 14.sp,
                color = Color(0xFF5F6368),
            )

            if (explorerLoading && explorer == null) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(28.dp),
                        strokeWidth = 2.dp,
                        color = Color(0xFF1A73E8),
                    )
                }
            }

            // KPI strip — tầng · POI · phòng
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White, RoundedCornerShape(12.dp))
                    .padding(vertical = 14.dp, horizontal = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                ExplorerStat(tr("Tầng", "Floors"), "$floors")
                ExplorerStat(tr("POI", "POIs"), pois?.toString() ?: "—")
                ExplorerStat(
                    tr("Phòng", "Rooms"),
                    explorer?.roomsCount?.toString() ?: "—",
                )
            }

            SectionTitle(tr("Tổng quan", "Overview"))
            DetailRow(
                tr("Bản đồ trong nhà", "Indoor map"),
                when {
                    hasIndoor -> tr("Có bản đồ đã xuất bản", "Published indoor map")
                    else -> tr("Chưa có bản đồ trong nhà", "No indoor map yet")
                },
            )
            DetailRow(
                tr("Trạng thái", "Status"),
                workspaceStatusVi(building.workspaceStatus ?: building.status),
            )
            if (!creatorName.isNullOrBlank()) {
                DetailRow(tr("Creator", "Creator"), creatorName)
            }
            if (!updatedLabel.isNullOrBlank()) {
                DetailRow(tr("Cập nhật", "Updated"), updatedLabel)
            }
            explorer?.description?.takeIf { it.isNotBlank() }?.let {
                DetailRow(tr("Mô tả", "Description"), it)
            }

            HorizontalDivider(color = Color(0xFFE8EAED))
            SectionTitle(tr("Hành động", "Actions"))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = onDirections,
                    enabled = building.gpsLocation != null || explorer?.gpsLocation != null,
                    modifier = Modifier.weight(1f),
                ) { Text(tr("Chỉ đường", "Directions")) }
                if (!building.placeId.isNullOrBlank()) {
                    OutlinedButton(
                        onClick = {
                            if (!isLoggedIn) onLoginRequired() else onToggleFollow()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            if (isFollowing) tr("Bỏ theo dõi", "Unfollow")
                            else tr("Theo dõi", "Follow"),
                        )
                    }
                }
            }

            if (!building.placeId.isNullOrBlank()) {
                HorizontalDivider(color = Color(0xFFE8EAED))
                SectionTitle(tr("Cộng đồng", "Community"))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = {
                        if (!isLoggedIn) onLoginRequired() else onReview()
                    }) { Text(tr("Đánh giá", "Rate")) }
                    TextButton(onClick = {
                        if (!isLoggedIn) onLoginRequired() else onReport()
                    }) { Text(tr("Báo cáo", "Report")) }
                }
            }

            HorizontalDivider(color = Color(0xFFE8EAED))
            SectionTitle(tr("Bản đồ trong nhà", "Indoor map"))
            Text(
                text = tr(
                    "Xem sơ đồ tầng, điểm POI và điều hướng trong công trình.",
                    "View floor plans, POIs and indoor navigation.",
                ),
                fontSize = 13.sp,
                color = Color(0xFF5F6368),
            )
            Spacer(Modifier.height(4.dp))
            Button(
                onClick = onEnterIndoor,
                modifier = Modifier.fillMaxWidth(),
                enabled = hasIndoor || building.id.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1A73E8)),
            ) {
                Text(
                    tr("▶ Vào bản đồ trong nhà", "▶ Enter Indoor"),
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun ExplorerStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color(0xFF1A73E8))
        Text(label, fontSize = 12.sp, color = Color(0xFF5F6368))
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp,
        color = Color(0xFF202124),
    )
}

@Composable
private fun DetailRow(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(text = label, fontSize = 12.sp, color = Color(0xFF5F6368))
        Text(text = value, fontSize = 15.sp, color = Color(0xFF202124))
    }
}

private fun formatExplorerDate(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    // ISO: 2026-07-25T12:00:00.000Z → dd/MM/yyyy
    val day = iso.take(10)
    if (day.length == 10 && day[4] == '-' && day[7] == '-') {
        return "${day.substring(8, 10)}/${day.substring(5, 7)}/${day.substring(0, 4)}"
    }
    return day
}
