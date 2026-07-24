package com.khoaluan.indoornav.ui.screens.user

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.api.NotificationDto
import com.khoaluan.indoornav.ui.theme.NavBlue
import com.khoaluan.indoornav.ui.viewmodel.UserHubViewModel
import com.khoaluan.indoornav.ui.viewmodel.UserListUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    viewModel: UserHubViewModel,
    onBack: () -> Unit,
) {
    val state by viewModel.notifications.collectAsState()
    LaunchedEffect(Unit) { viewModel.loadNotifications() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Thông báo") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    TextButton(onClick = { viewModel.markAllRead() }) {
                        Text("Đọc hết")
                    }
                },
            )
        },
    ) { pad ->
        when (val s = state) {
            is UserListUiState.Loading -> Text("Đang tải…", Modifier.padding(pad).padding(16.dp))
            is UserListUiState.Error -> Text(s.message, Modifier.padding(pad).padding(16.dp), color = Color.Red)
            is UserListUiState.Success -> {
                if (s.data.isEmpty()) {
                    Text(
                        "Chưa có thông báo (Đề xuất · Bản đồ mới · Lời mời · Cập nhật).",
                        Modifier.padding(pad).padding(16.dp),
                        color = Color.Gray,
                    )
                } else {
                    LazyColumn(Modifier.fillMaxSize().padding(pad)) {
                        items(s.data, key = { it.id.orEmpty() }) { n ->
                            NotificationRow(n) {
                                n.id?.let { viewModel.markRead(it) }
                            }
                        }
                    }
                }
            }
            else -> Unit
        }
    }
}

@Composable
private fun NotificationRow(n: NotificationDto, onClick: () -> Unit) {
    val unread = n.readAt.isNullOrBlank()
    val typeLabel = when {
        n.type?.contains("PROPOSAL", ignoreCase = true) == true -> "Đề xuất"
        n.type?.contains("MAP", ignoreCase = true) == true ||
            n.type?.contains("INDOOR", ignoreCase = true) == true -> "Bản đồ trong nhà"
        n.type?.contains("INVITE", ignoreCase = true) == true ||
            n.type?.contains("ORG", ignoreCase = true) == true -> "Lời mời tổ chức"
        n.type?.contains("VERSION", ignoreCase = true) == true ||
            n.type?.contains("UPDATE", ignoreCase = true) == true -> "Cập nhật"
        else -> n.type ?: "Hệ thống"
    }
    Column(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(
            n.title ?: typeLabel,
            fontWeight = if (unread) FontWeight.Bold else FontWeight.Medium,
            color = if (unread) NavBlue else Color(0xFF202124),
        )
        if (!n.body.isNullOrBlank()) {
            Text(n.body, fontSize = 13.sp, color = Color(0xFF5F6368))
        }
        Text(
            listOfNotNull(typeLabel, n.createdAt).joinToString(" · "),
            fontSize = 11.sp,
            color = Color.Gray,
        )
    }
}
