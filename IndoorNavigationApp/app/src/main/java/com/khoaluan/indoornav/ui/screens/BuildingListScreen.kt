package com.khoaluan.indoornav.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.viewmodel.BuildingListUiState
import com.khoaluan.indoornav.ui.viewmodel.MapViewModel

/**
 * FILE: BuildingListScreen.kt
 * MỤC ĐÍCH: Màn hình chọn tòa nhà (Dashboard).
 * THIẾT KẾ: Sạch sẽ, Tươi sáng, chuẩn phong cách Google Material 3 (Tập trung tính ứng dụng).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BuildingListScreen(
    viewModel: MapViewModel,
    onBuildingClick: (String) -> Unit,
    onTestPDR: () -> Unit = {}
) {
    val state by viewModel.buildingListState.collectAsState()

    Scaffold(
        containerColor = Color(0xFFF8F9FA), // Nền sáng sạch sẽ
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        "Địa điểm", 
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF202124)
                    ) 
                },
                actions = {
                    // Chuyển nút PDR lên góc phải gọn gàng
                    IconButton(onClick = onTestPDR) {
                        Icon(
                            imageVector = Icons.Rounded.Build,
                            contentDescription = "PDR Test",
                            tint = Color(0xFF5F6368)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Thanh thông báo trạng thái GPS ngầm
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Rounded.LocationOn,
                        contentDescription = null,
                        tint = Color(0xFF188038), // Xanh lá
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Hệ thống tự động quét nhận diện tòa nhà",
                        color = Color(0xFF188038),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                HorizontalDivider(color = Color(0xFFE8EAED), thickness = 1.dp)

                when (val s = state) {
                    is BuildingListUiState.Loading -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Color(0xFF1A73E8))
                        }
                    }
                    is BuildingListUiState.Error -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("Lỗi kết nối: ${s.message}", color = Color(0xFFD93025), fontSize = 15.sp)
                        }
                    }
                    is BuildingListUiState.Success -> {
                        if (s.buildings.isEmpty()) {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Text("Chưa có tòa nhà nào", color = Color(0xFF5F6368), fontSize = 16.sp)
                            }
                        } else {
                            LazyColumn(
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier.fillMaxSize()
                            ) {
                                items(s.buildings) { building ->
                                    CleanBuildingCard(
                                        name = building.name,
                                        address = building.address ?: "Không có thông tin địa chỉ",
                                        onClick = { onBuildingClick(building.id) }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Thẻ hiển thị phong cách phẳng, shadow viền nhẹ (Material 3 Card)
 */
@Composable
fun CleanBuildingCard(
    name: String,
    address: String,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Icon tòa nhà
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(Color(0xFFE8F0FE), CircleShape), // Nền xanh nhạt
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Rounded.Place,
                    contentDescription = null,
                    tint = Color(0xFF1A73E8), // Xanh đậm Google
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = name,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF202124), // Đen xám chuẩn
                    maxLines = 1
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = address,
                    fontSize = 13.sp,
                    color = Color(0xFF5F6368), // Xám nhạt
                    maxLines = 2,
                    lineHeight = 18.sp
                )
            }
        }
    }
}
