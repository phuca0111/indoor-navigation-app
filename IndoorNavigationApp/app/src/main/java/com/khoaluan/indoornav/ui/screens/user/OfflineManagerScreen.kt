package com.khoaluan.indoornav.ui.screens.user

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.viewmodel.UserHubViewModel

/** #25 Offline Manager — Download Indoor · Cache · Sync queue. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OfflineManagerScreen(
    viewModel: UserHubViewModel,
    buildingsForOffline: List<Pair<String, String>>,
    onBack: () -> Unit,
) {
    val cached by viewModel.cachedMaps.collectAsState()
    val pending by viewModel.syncPending.collectAsState()
    var buildingId by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        viewModel.refreshCachedMaps()
        viewModel.refreshSyncPending()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ngoại tuyến") },
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
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            Text("Đồng bộ", fontWeight = FontWeight.Bold)
            Text("$pending việc đang chờ đồng bộ", color = Color(0xFF5F6368), fontSize = 13.sp)
            Button(onClick = { viewModel.flushSyncQueue() }, modifier = Modifier.fillMaxWidth()) {
                Text("Đồng bộ ngay")
            }

            Spacer(Modifier.height(16.dp))
            Text("Tải bản đồ trong nhà", fontWeight = FontWeight.Bold)
            OutlinedTextField(
                buildingId,
                { buildingId = it },
                label = { Text("Mã tòa nhà") },
                modifier = Modifier.fillMaxWidth(),
            )
            buildingsForOffline.take(8).forEach { (id, name) ->
                TextButton(onClick = { buildingId = id }) {
                    Text("$name ($id)", fontSize = 12.sp)
                }
            }
            Button(
                onClick = {
                    if (buildingId.isNotBlank()) viewModel.downloadBuildingOffline(buildingId.trim())
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Tải về") }

            Spacer(Modifier.height(16.dp))
            Text("Bộ nhớ đệm (${cached.size} tầng)", fontWeight = FontWeight.Bold)
            cached.groupBy { it.buildingId }.forEach { (bid, floors) ->
                Column(Modifier.padding(vertical = 6.dp)) {
                    Text(bid, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Text("Tầng: ${floors.map { it.floor }.sorted().joinToString()}", fontSize = 12.sp, color = Color(0xFF5F6368))
                    TextButton(onClick = { viewModel.clearCachedBuilding(bid) }) {
                        Text("Xóa bộ nhớ đệm tòa này", color = Color(0xFFD93025))
                    }
                }
            }
            if (cached.isNotEmpty()) {
                TextButton(onClick = { viewModel.clearAllCache() }) {
                    Text("Xóa toàn bộ bộ nhớ đệm", color = Color(0xFFD93025))
                }
            }
        }
    }
}
