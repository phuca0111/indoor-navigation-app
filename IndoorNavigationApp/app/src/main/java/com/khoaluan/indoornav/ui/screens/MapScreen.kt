package com.khoaluan.indoornav.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import androidx.lifecycle.viewmodel.compose.viewModel
import com.khoaluan.indoornav.ui.components.MapView
import com.khoaluan.indoornav.ui.viewmodel.MapUiState
import com.khoaluan.indoornav.ui.viewmodel.MapViewModel

/**
 * Giao diện chính: Lắng nghe trạng thái ViewModel để điều hướng giao diện (Loading, Thành công, Lỗi)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(
    buildingId: String,
    viewModel: MapViewModel = viewModel(),
    onBack: () -> Unit,
    onScanQR: () -> Unit // New callback for QR Scanning
) {
    val uiState by viewModel.uiState.collectAsState()
    val navState by viewModel.navState.collectAsState()

    // Tự động tải bản đồ của tòa nhà được chọn
    LaunchedEffect(buildingId) {
        viewModel.refreshMap(buildingId, 1)
    }

    Box(modifier = Modifier.fillMaxSize()) {
        when (val state = uiState) {
            is MapUiState.Loading -> {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = MaterialTheme.colorScheme.primary
                )
            }
            is MapUiState.Success -> {
                var searchQuery by remember { mutableStateOf("") }
                var isSearchActive by remember { mutableStateOf(false) }
                var selectedRoomId by remember { mutableStateOf<Int?>(null) }
                
                // Lọc danh sách phòng theo query
                val filteredRooms = remember(searchQuery, state.mapData.rooms) {
                    if (searchQuery.isBlank()) emptyList()
                    else state.mapData.rooms.filter { 
                        it.name.contains(searchQuery, ignoreCase = true) 
                    }
                }

                Box(modifier = Modifier.fillMaxSize()) {
                    MapView(
                        mapData = state.mapData,
                        selectedRoomId = selectedRoomId,
                        navState = navState
                    )

                    // Overlay: Search Bar
                    DockedSearchBar(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(top = 80.dp)
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp),
                        query = searchQuery,
                        onQueryChange = { searchQuery = it },
                        onSearch = { isSearchActive = false },
                        active = isSearchActive,
                        onActiveChange = { isSearchActive = it },
                        placeholder = { Text("Tìm tên phòng (Loại, Tên...)") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        trailingIcon = {
                            if (isSearchActive) {
                                IconButton(onClick = { 
                                    if (searchQuery.isNotEmpty()) searchQuery = "" 
                                    else isSearchActive = false 
                                }) {
                                    Icon(Icons.Default.Close, contentDescription = null)
                                }
                            }
                        }
                    ) {
                        LazyColumn(modifier = Modifier.fillMaxWidth()) {
                            items(filteredRooms) { room ->
                                ListItem(
                                    headlineContent = { Text(room.name) },
                                    supportingContent = { Text("ID: ${room.id}") },
                                    modifier = Modifier.clickable {
                                        searchQuery = room.name
                                        selectedRoomId = room.id
                                        viewModel.setDestination(room.id) // Tìm đường ngay khi chọn phòng
                                        isSearchActive = false
                                    }
                                )
                            }
                        }
                    }
                } // Đóng Box ở dòng 64
                
                // Thanh trạng thái Debug góc trên
                 Column(
                    modifier = Modifier.align(Alignment.TopStart)
                        .padding(top = 85.dp, start = 16.dp)
                        .background(Color.Black.copy(alpha = 0.5f), shape = MaterialTheme.shapes.small)
                        .padding(8.dp)
                ) {
                    Text("Tòa nhà: ${state.buildingId.takeLast(6)}", color = Color.White, style = MaterialTheme.typography.labelSmall)
                    Text("Điểm: ${state.mapData.nodes.size}", color = Color.White, style = MaterialTheme.typography.labelSmall)
                    if (navState.userPos != null) {
                        val confidencePercent = (navState.confidence * 100).toInt()
                        Text("Độ tin cậy: $confidencePercent%", 
                            color = if (navState.isTpfActive) Color.Green else Color.Yellow, 
                            style = MaterialTheme.typography.labelSmall)
                    }
                }

                // --- HUD CHỈ ĐƯỜNG ---
                if (navState.path != null) {
                    Card(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 100.dp)
                            .padding(horizontal = 24.dp)
                            .fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1E2E).copy(alpha = 0.95f)),
                        elevation = CardDefaults.cardElevation(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, tint = Color(0xFF00E5FF))
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text("Đang dẫn đường...", color = Color.Gray, fontSize = 11.sp)
                                Text("Đi dọc hành lang theo chỉ dẫn neon", color = Color.White, fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.weight(1f))
                            IconButton(onClick = { viewModel.stopNavigation() }) {
                                Icon(Icons.Default.Close, contentDescription = "Dừng", tint = Color.Red)
                            }
                        }
                    }
                }
            }
            is MapUiState.Error -> {
                Text(
                    modifier = Modifier.align(Alignment.Center),
                    text = state.message,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyLarge
                )
            }
        }

        IconButton(
            onClick = onBack,
            modifier = Modifier.align(Alignment.TopStart).padding(top = 40.dp, start = 8.dp)
        ) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
        }

        // Nhóm nút FAB bên phải
        Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Nút Quét QR (Màu Neon nổi bật)
            FloatingActionButton(
                onClick = onScanQR,
                containerColor = Color(0xFF00E5FF),
                contentColor = Color.Black
            ) {
                Icon(Icons.Default.Search, contentDescription = "Quét QR")
            }

            // Nút Refresh
            FloatingActionButton(
                onClick = { viewModel.refreshMap(buildingId, 1) },
                containerColor = MaterialTheme.colorScheme.primaryContainer
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = "Làm mới bản đồ"
                )
            }
        }
    }
}
