package com.khoaluan.indoornav.ui.screens.user

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.api.HubHistoryItemDto
import com.khoaluan.indoornav.ui.viewmodel.UserHubViewModel
import com.khoaluan.indoornav.ui.viewmodel.UserListUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    viewModel: UserHubViewModel,
    onBack: () -> Unit,
) {
    var tab by remember { mutableIntStateOf(0) }
    val history by viewModel.history.collectAsState()
    LaunchedEffect(Unit) { viewModel.loadHistory() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Lịch sử") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    TextButton(onClick = { viewModel.clearAllHistory() }) {
                        Text("Xóa hết", color = Color(0xFFD93025))
                    }
                },
            )
        },
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            ScrollableTabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Đã xem") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Đã điều hướng") })
                Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("Tất cả") })
            }
            when (val s = history) {
                is UserListUiState.Loading -> Text("Đang tải…", Modifier.padding(16.dp))
                is UserListUiState.Error -> Text(s.message, Modifier.padding(16.dp), color = Color.Red)
                is UserListUiState.Success -> {
                    val filtered = when (tab) {
                        0 -> s.data.filter {
                            it.type == "VIEW_PLACE" || it.type == "VIEW_INDOOR" || it.type == "FAVORITE_PLACE"
                        }
                        1 -> s.data.filter {
                            it.type == "NAVIGATE_PLACE" || it.type == "NAVIGATE_INDOOR"
                        }
                        else -> s.data
                    }
                    if (filtered.isEmpty()) {
                        Text("Chưa có mục nào.", Modifier.padding(16.dp), color = Color.Gray)
                    } else {
                        LazyColumn {
                            items(filtered, key = { it.id ?: "${it.type}-${it.createdAt}-${it.label}" }) { item ->
                                HistoryRow(item)
                            }
                        }
                    }
                }
                else -> Unit
            }
        }
    }
}

@Composable
private fun HistoryRow(item: HubHistoryItemDto) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(
            item.label?.takeIf { it.isNotBlank() } ?: historyTypeVi(item.type),
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            listOfNotNull(historyTypeVi(item.type), item.createdAt).joinToString(" · "),
            fontSize = 12.sp,
            color = Color.Gray,
        )
    }
}

private fun historyTypeVi(type: String?): String = when (type?.uppercase()) {
    "VIEW_PLACE" -> "Xem địa điểm"
    "VIEW_INDOOR" -> "Xem bản đồ trong nhà"
    "NAVIGATE_PLACE" -> "Điều hướng địa điểm"
    "NAVIGATE_INDOOR" -> "Điều hướng trong nhà"
    "FAVORITE_PLACE" -> "Đã lưu địa điểm"
    "REVIEW_PLACE" -> "Đánh giá địa điểm"
    "REPORT_PLACE" -> "Báo cáo địa điểm"
    "OPEN_WORKSPACE" -> "Mở không gian làm việc"
    else -> type ?: "Hoạt động"
}
