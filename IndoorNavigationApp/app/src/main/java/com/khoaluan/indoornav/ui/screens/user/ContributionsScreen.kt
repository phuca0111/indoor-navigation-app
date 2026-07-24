package com.khoaluan.indoornav.ui.screens.user

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import com.khoaluan.indoornav.ui.i18n.reportStatusVi
import com.khoaluan.indoornav.ui.viewmodel.UserHubViewModel
import com.khoaluan.indoornav.ui.viewmodel.UserListUiState

/** #18 Review + #19 Report — danh sách đóng góp của tôi. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContributionsScreen(
    viewModel: UserHubViewModel,
    onBack: () -> Unit,
) {
    var tab by remember { mutableIntStateOf(0) }
    val reviews by viewModel.myReviews.collectAsState()
    val reports by viewModel.myReports.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.loadMyReviews()
        viewModel.loadMyReports()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Đóng góp") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { pad ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(pad)
                .padding(horizontal = 16.dp),
        ) {
            androidx.compose.foundation.layout.Row {
                FilterChip(selected = tab == 0, onClick = { tab = 0 }, label = { Text("Đánh giá") })
                Spacer(Modifier.padding(4.dp))
                FilterChip(selected = tab == 1, onClick = { tab = 1 }, label = { Text("Báo cáo") })
            }
            Spacer(Modifier.height(8.dp))
            when (tab) {
                0 -> when (val s = reviews) {
                    is UserListUiState.Loading -> Text("Đang tải…")
                    is UserListUiState.Error -> Text(s.message, color = Color(0xFFD93025))
                    is UserListUiState.Success -> {
                        if (s.data.isEmpty()) Text("Chưa có đánh giá.", color = Color(0xFF80868B))
                        else LazyColumn {
                            items(s.data, key = { it.id ?: it.hashCode().toString() }) { r ->
                                Column(Modifier.padding(vertical = 10.dp).fillMaxWidth()) {
                                    Text("★".repeat(r.rating.coerceIn(1, 5)) + "☆".repeat((5 - r.rating).coerceAtLeast(0)), color = Color(0xFFF9AB00))
                                    if (!r.comment.isNullOrBlank()) {
                                        Text(r.comment, fontSize = 14.sp)
                                    }
                                    Text("Địa điểm: ${r.placeId.orEmpty()}", color = Color(0xFF80868B), fontSize = 12.sp)
                                }
                            }
                        }
                    }
                    else -> Unit
                }
                else -> when (val s = reports) {
                    is UserListUiState.Loading -> Text("Đang tải…")
                    is UserListUiState.Error -> Text(s.message, color = Color(0xFFD93025))
                    is UserListUiState.Success -> {
                        if (s.data.isEmpty()) Text("Chưa có báo cáo.", color = Color(0xFF80868B))
                        else LazyColumn {
                            items(s.data, key = { it.id ?: it.hashCode().toString() }) { r ->
                                Column(Modifier.padding(vertical = 10.dp).fillMaxWidth()) {
                                    Text(reasonLabel(r.reasonCode), fontWeight = FontWeight.SemiBold)
                                    if (!r.detail.isNullOrBlank()) Text(r.detail!!, fontSize = 13.sp)
                                    Text(
                                        "${reportStatusVi(r.status)} · ${r.createdAt.orEmpty()}",
                                        color = Color(0xFF80868B),
                                        fontSize = 12.sp,
                                    )
                                }
                            }
                        }
                    }
                    else -> Unit
                }
            }
        }
    }
}

private fun reasonLabel(code: String?): String = when (code) {
    "WRONG_LOCATION" -> "Sai vị trí"
    "WRONG_FLOOR" -> "Sai tầng"
    "QR_INVALID" -> "Mã QR lỗi"
    "ROUTE_ERROR" -> "Đường đi lỗi"
    "WRONG_NAME" -> "Sai tên"
    "SPAM" -> "Nội dung rác"
    "DUPLICATE" -> "Trùng lặp"
    "CLOSED" -> "Đã đóng cửa"
    else -> code ?: "Khác"
}
