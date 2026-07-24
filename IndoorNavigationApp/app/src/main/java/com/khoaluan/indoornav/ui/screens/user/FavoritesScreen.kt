package com.khoaluan.indoornav.ui.screens.user

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.viewmodel.UserHubViewModel
import com.khoaluan.indoornav.ui.viewmodel.UserListUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen(
    viewModel: UserHubViewModel,
    onBack: () -> Unit,
    onOpenPlace: (placeId: String) -> Unit,
    onOpenIndoor: (buildingId: String) -> Unit,
) {
    var tab by remember { mutableIntStateOf(0) }
    var newCollectionName by remember { mutableStateOf("") }
    val favorites by viewModel.favorites.collectAsState()
    val indoor by viewModel.indoorFavorites.collectAsState()
    val collections by viewModel.collections.collectAsState()

    LaunchedEffect(Unit) { viewModel.loadFavorites() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(tr("Đã lưu", "Saved")) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = tr("Quay lại", "Back"))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            ScrollableTabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text(tr("Địa điểm", "Places")) })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text(tr("Trong nhà", "Indoor")) })
                Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text(tr("Bộ sưu tập", "Collections")) })
            }

            when (tab) {
                0 -> when (val s = favorites) {
                    is UserListUiState.Loading -> {
                        Text("Đang tải…", Modifier.padding(16.dp))
                    }
                    is UserListUiState.Error -> {
                        Text(s.message, Modifier.padding(16.dp), color = Color.Red)
                    }
                    is UserListUiState.Success -> {
                        if (s.data.isEmpty()) {
                            Text("Chưa lưu địa điểm nào.", Modifier.padding(16.dp), color = Color.Gray)
                        } else {
                            LazyColumn {
                                items(s.data, key = { it.id ?: it.placeId.orEmpty() }) { item ->
                                    val place = item.place
                                    val title = place?.name ?: item.placeId ?: "Địa điểm"
                                    val pid = place?.id ?: item.placeId
                                    Row(
                                        Modifier
                                            .fillMaxWidth()
                                            .clickable { pid?.let(onOpenPlace) }
                                            .padding(16.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Column(Modifier.weight(1f)) {
                                            Text(title, fontWeight = FontWeight.SemiBold)
                                            Text(
                                                listOfNotNull(
                                                    place?.address,
                                                    PlaceCategoryLabels.display(place?.category).takeIf { it.isNotBlank() },
                                                ).joinToString(" · "),
                                                fontSize = 12.sp,
                                                color = Color.Gray,
                                            )
                                        }
                                        TextButton(onClick = { pid?.let { viewModel.removeFavoritePlace(it) } }) {
                                            Text("Bỏ", color = Color(0xFFD93025))
                                        }
                                    }
                                }
                            }
                        }
                    }
                    else -> Unit
                }
                1 -> {
                    if (indoor.isEmpty()) {
                        Text(
                            "Chưa lưu bản đồ trong nhà. Mở bản đồ rồi nhấn Lưu.",
                            Modifier.padding(16.dp),
                            color = Color.Gray,
                        )
                    } else {
                        LazyColumn {
                            items(indoor, key = { it.buildingId }) { item ->
                                Row(
                                    Modifier
                                        .fillMaxWidth()
                                        .clickable { onOpenIndoor(item.buildingId) }
                                        .padding(16.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column {
                                        Text(item.name, fontWeight = FontWeight.SemiBold)
                                        Text("${item.totalFloors} tầng", fontSize = 12.sp, color = Color.Gray)
                                    }
                                    TextButton(onClick = { viewModel.removeIndoor(item.buildingId) }) {
                                        Text("Bỏ", color = Color(0xFFD93025))
                                    }
                                }
                            }
                        }
                    }
                }
                else -> {
                    Column(Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = newCollectionName,
                                onValueChange = { newCollectionName = it },
                                modifier = Modifier.weight(1f),
                                singleLine = true,
                                label = { Text("Tên bộ sưu tập") },
                            )
                            TextButton(
                                onClick = {
                                    viewModel.createCollection(newCollectionName)
                                    newCollectionName = ""
                                },
                            ) {
                                Text("Tạo")
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        if (collections.isEmpty()) {
                            Text(
                                "Chưa có bộ sưu tập. Tạo bộ sưu tập để nhóm địa điểm đã lưu.",
                                color = Color.Gray,
                            )
                        } else {
                            collections.forEach { col ->
                                Row(
                                    Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column {
                                        Text(col.name, fontWeight = FontWeight.SemiBold)
                                        Text("${col.placeIds.size} địa điểm", fontSize = 12.sp, color = Color.Gray)
                                    }
                                    TextButton(onClick = { viewModel.deleteCollection(col.id) }) {
                                        Text("Xóa", color = Color(0xFFD93025))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
