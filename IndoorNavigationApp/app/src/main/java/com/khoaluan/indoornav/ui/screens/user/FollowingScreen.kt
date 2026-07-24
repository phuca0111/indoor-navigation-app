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
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.viewmodel.UserHubViewModel
import com.khoaluan.indoornav.ui.viewmodel.UserListUiState

/**
 * #21 Follow — Place (API). Creator / Organization: theo dõi qua Place sở hữu
 * (BE hiện chỉ có PlaceFollow).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FollowingScreen(
    viewModel: UserHubViewModel,
    onBack: () -> Unit,
    onOpenPlace: (String) -> Unit,
) {
    val following by viewModel.following.collectAsState()
    LaunchedEffect(Unit) { viewModel.loadFollowing() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Đang theo dõi") },
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
            Text(
                "Địa điểm · Người tạo / Tổ chức gắn với địa điểm (theo dõi cộng đồng)",
                color = Color(0xFF80868B),
                fontSize = 12.sp,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            when (val s = following) {
                is UserListUiState.Loading -> Text("Đang tải…")
                is UserListUiState.Error -> Text(s.message, color = Color(0xFFD93025))
                is UserListUiState.Success -> {
                    if (s.data.isEmpty()) Text("Chưa theo dõi địa điểm nào.", color = Color(0xFF80868B))
                    else LazyColumn {
                        items(s.data, key = { it.placeId ?: it.hashCode().toString() }) { item ->
                            val place = item.place
                            val title = place?.name ?: item.placeId.orEmpty()
                            val pid = item.placeId ?: place?.id
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable(enabled = !pid.isNullOrBlank()) {
                                        pid?.let(onOpenPlace)
                                    }
                                    .padding(vertical = 12.dp),
                            ) {
                                Text(title, fontWeight = FontWeight.SemiBold)
                                Text(
                                    listOfNotNull(
                                        PlaceCategoryLabels.display(place?.category).takeIf { it.isNotBlank() },
                                        place?.address,
                                    ).joinToString(" · "),
                                    color = Color(0xFF5F6368),
                                    fontSize = 12.sp,
                                )
                                if (!pid.isNullOrBlank()) {
                                    TextButton(onClick = { viewModel.unfollowPlace(pid) }) {
                                        Text("Bỏ theo dõi", color = Color(0xFFD93025))
                                    }
                                }
                            }
                        }
                    }
                }
                else -> Unit
            }
        }
    }
}
