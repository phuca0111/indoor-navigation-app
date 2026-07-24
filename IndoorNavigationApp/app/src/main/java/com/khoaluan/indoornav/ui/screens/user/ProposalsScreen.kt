package com.khoaluan.indoornav.ui.screens.user

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.i18n.proposalStatusVi
import com.khoaluan.indoornav.ui.viewmodel.UserHubViewModel
import com.khoaluan.indoornav.ui.viewmodel.UserListUiState

/** #20 Proposal — đề xuất Place / Indoor + theo dõi trạng thái. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProposalsScreen(
    viewModel: UserHubViewModel,
    onBack: () -> Unit,
    defaultLat: Double? = null,
    defaultLng: Double? = null,
) {
    var tab by remember { mutableIntStateOf(0) }
    val proposals by viewModel.proposals.collectAsState()
    var name by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("OTHER") }
    var description by remember { mutableStateOf("") }
    var lat by remember { mutableStateOf(defaultLat?.toString().orEmpty()) }
    var lng by remember { mutableStateOf(defaultLng?.toString().orEmpty()) }
    var indoor by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.loadProposals() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Đề xuất") },
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
                FilterChip(selected = tab == 0, onClick = { tab = 0 }, label = { Text("Theo dõi") })
                Spacer(Modifier.padding(4.dp))
                FilterChip(selected = tab == 1, onClick = { tab = 1 }, label = { Text("Gửi mới") })
            }
            Spacer(Modifier.height(8.dp))
            when (tab) {
                0 -> when (val s = proposals) {
                    is UserListUiState.Loading -> Text("Đang tải…")
                    is UserListUiState.Error -> Text(s.message, color = Color(0xFFD93025))
                    is UserListUiState.Success -> {
                        if (s.data.isEmpty()) Text("Chưa có đề xuất.", color = Color(0xFF80868B))
                        else LazyColumn {
                            items(s.data, key = { it.id ?: it.hashCode().toString() }) { p ->
                                Column(Modifier.padding(vertical = 10.dp).fillMaxWidth()) {
                                    Text(p.displayName(), fontWeight = FontWeight.SemiBold)
                                    Text(proposalStatusVi(p.status), color = Color(0xFF1A73E8), fontSize = 13.sp)
                                    if (!p.address.isNullOrBlank()) {
                                        Text(p.address!!, color = Color(0xFF5F6368), fontSize = 12.sp)
                                    }
                                    Text(p.createdAt.orEmpty(), color = Color(0xFF80868B), fontSize = 11.sp)
                                }
                            }
                        }
                    }
                    else -> Unit
                }
                else -> Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(
                        if (indoor) "Đề xuất bản đồ trong nhà (gắn địa điểm mới)"
                        else "Đề xuất địa điểm mới",
                        fontWeight = FontWeight.Medium,
                        fontSize = 14.sp,
                    )
                    Spacer(Modifier.height(8.dp))
                    FilterChip(
                        selected = indoor,
                        onClick = {
                            indoor = !indoor
                            category = if (indoor) "INDOOR" else "OTHER"
                        },
                        label = { Text(if (indoor) "Loại: Trong nhà" else "Loại: Địa điểm") },
                    )
                    OutlinedTextField(name, { name = it }, label = { Text("Tên") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(address, { address = it }, label = { Text("Địa chỉ") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(lat, { lat = it }, label = { Text("Vĩ độ") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(lng, { lng = it }, label = { Text("Kinh độ") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(
                        description,
                        { description = it },
                        label = { Text(if (indoor) "Mô tả nhu cầu bản đồ trong nhà" else "Mô tả") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = {
                            val la = lat.toDoubleOrNull()
                            val lo = lng.toDoubleOrNull()
                            if (name.isBlank() || la == null || lo == null) {
                                viewModel.postNotice("Nhập tên + lat/lng hợp lệ")
                                return@Button
                            }
                            viewModel.createProposal(
                                name = name.trim(),
                                latitude = la,
                                longitude = lo,
                                address = address.ifBlank { null },
                                category = category,
                                description = if (indoor) {
                                    "[INDOOR] ${description.trim()}"
                                } else description.ifBlank { null },
                            )
                            tab = 0
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("Gửi đề xuất") }
                }
            }
        }
    }
}
