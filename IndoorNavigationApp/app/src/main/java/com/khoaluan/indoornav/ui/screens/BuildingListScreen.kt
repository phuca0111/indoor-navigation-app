package com.khoaluan.indoornav.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.khoaluan.indoornav.ui.viewmodel.BuildingListUiState
import com.khoaluan.indoornav.ui.viewmodel.MapViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BuildingListScreen(
    viewModel: MapViewModel,
    onBuildingClick: (String) -> Unit,
    onTestPDR: () -> Unit = {}
) {
    val state by viewModel.buildingListState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Chọn tòa nhà") })
        },
        bottomBar = {
            androidx.compose.foundation.layout.Column(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                OutlinedButton(
                    onClick = onTestPDR,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = androidx.compose.ui.graphics.Color(0xFFFFB300)
                    ),
                    border = androidx.compose.foundation.BorderStroke(
                        1.dp,
                        androidx.compose.ui.graphics.Color(0xFFFFB300)
                    )
                ) {
                    Text("🧪  PDR Calibration Test", style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (val s = state) {
                is BuildingListUiState.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                is BuildingListUiState.Error -> Text("Lỗi: ${s.message}", color = Color.Red, modifier = Modifier.align(Alignment.Center))
                is BuildingListUiState.Success -> {
                    if (s.buildings.isEmpty()) {
                        Text("Chưa có tòa nhà nào được Publish!", modifier = Modifier.align(Alignment.Center))
                    } else {
                        LazyColumn {
                            items(s.buildings) { building ->
                                ListItem(
                                    headlineContent = { Text(building.name) },
                                    supportingContent = { Text(building.address ?: "Không có địa chỉ") },
                                    modifier = Modifier.clickable { onBuildingClick(building.id) }
                                )
                                Divider()
                            }
                        }
                    }
                }
            }
        }
    }
}
