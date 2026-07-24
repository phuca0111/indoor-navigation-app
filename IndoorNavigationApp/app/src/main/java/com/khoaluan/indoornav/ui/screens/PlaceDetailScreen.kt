package com.khoaluan.indoornav.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.i18n.workspaceStatusVi

/**
 * Module #7 Place Detail — Overview đầy đủ (tách khỏi Preview Bottom Sheet).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceDetailScreen(
    building: Building,
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
            SectionTitle("Tổng quan")
            DetailRow("Danh mục", PlaceCategoryLabels.display(building.category).ifBlank { "—" })
            DetailRow("Địa chỉ", building.address ?: "Chưa có địa chỉ")
            DetailRow(
                "Bản đồ trong nhà",
                when (building.hasPublishedIndoor) {
                    true -> "Có bản đồ đã xuất bản"
                    false -> "Chưa có bản đồ trong nhà"
                    null -> "—"
                },
            )
            DetailRow(
                "Trạng thái không gian làm việc",
                workspaceStatusVi(building.workspaceStatus ?: building.status),
            )
            if (building.gpsLocation != null) {
                DetailRow(
                    "Tọa độ",
                    "%.5f, %.5f".format(building.gpsLocation.lat, building.gpsLocation.lng),
                )
            }

            HorizontalDivider(color = Color(0xFFE8EAED))
            SectionTitle("Hành động")
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = onDirections,
                    enabled = building.gpsLocation != null,
                    modifier = Modifier.weight(1f),
                ) { Text("Chỉ đường") }
                if (!building.placeId.isNullOrBlank()) {
                    OutlinedButton(
                        onClick = {
                            if (!isLoggedIn) onLoginRequired() else onToggleFollow()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(if (isFollowing) "Bỏ theo dõi" else "Theo dõi")
                    }
                }
            }

            if (!building.placeId.isNullOrBlank()) {
                HorizontalDivider(color = Color(0xFFE8EAED))
                SectionTitle("Cộng đồng")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = {
                        if (!isLoggedIn) onLoginRequired() else onReview()
                    }) { Text("Đánh giá") }
                    TextButton(onClick = {
                        if (!isLoggedIn) onLoginRequired() else onReport()
                    }) { Text("Báo cáo") }
                }
            }

            HorizontalDivider(color = Color(0xFFE8EAED))
            SectionTitle("Bản đồ trong nhà")
            Text(
                text = "Xem sơ đồ tầng, mã QR và điều hướng trong công trình.",
                fontSize = 13.sp,
                color = Color(0xFF5F6368),
            )
            Spacer(Modifier.height(4.dp))
            Button(
                onClick = onEnterIndoor,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1A73E8)),
            ) {
                Text("▶ Xem bản đồ trong nhà", fontWeight = FontWeight.SemiBold)
            }
        }
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
