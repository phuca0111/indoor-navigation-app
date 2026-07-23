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
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.model.IndoorBuildingSummary
import com.khoaluan.indoornav.data.model.PlaceSummary
import com.khoaluan.indoornav.ui.viewmodel.PlaceListUiState
import com.khoaluan.indoornav.ui.viewmodel.MapViewModel
import kotlinx.coroutines.delay

/**
 * Màn hình địa điểm: Place Registry search → mở Indoor (Building đã PUBLISHED).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BuildingListScreen(
    viewModel: MapViewModel,
    onBuildingClick: (String) -> Unit,
    onTestPDR: () -> Unit = {}
) {
    val placeState by viewModel.placeListState.collectAsState()
    val placeQuery by viewModel.placeQuery.collectAsState()
    val actionMsg by viewModel.placeActionMessage.collectAsState()
    var localQuery by remember { mutableStateOf(placeQuery) }
    var indoorChoices by remember { mutableStateOf<List<IndoorBuildingSummary>?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(localQuery) {
        delay(350)
        if (localQuery != placeQuery) {
            viewModel.searchPlaces(localQuery)
        }
    }

    LaunchedEffect(actionMsg) {
        val msg = actionMsg ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(msg)
        viewModel.clearPlaceActionMessage()
    }

    Scaffold(
        containerColor = Color(0xFFF8F9FA),
        snackbarHost = { SnackbarHost(snackbarHostState) },
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
                        tint = Color(0xFF188038),
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Tìm Place → mở bản đồ trong nhà",
                        color = Color(0xFF188038),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                OutlinedTextField(
                    value = localQuery,
                    onValueChange = { localQuery = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    placeholder = { Text("Tìm theo tên, địa chỉ…") },
                    leadingIcon = {
                        Icon(Icons.Rounded.Search, contentDescription = null)
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Color.White
                    )
                )

                HorizontalDivider(color = Color(0xFFE8EAED), thickness = 1.dp)

                when (val s = placeState) {
                    is PlaceListUiState.Loading -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Color(0xFF1A73E8))
                        }
                    }
                    is PlaceListUiState.Error -> {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("Lỗi: ${s.message}", color = Color(0xFFD93025), fontSize = 15.sp)
                                Spacer(modifier = Modifier.height(12.dp))
                                TextButton(onClick = { viewModel.searchPlaces(localQuery) }) {
                                    Text("Thử lại")
                                }
                            }
                        }
                    }
                    is PlaceListUiState.Success -> {
                        if (s.places.isEmpty()) {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Text(
                                    if (localQuery.isBlank()) "Chưa có Place công khai"
                                    else "Không tìm thấy Place phù hợp",
                                    color = Color(0xFF5F6368),
                                    fontSize = 16.sp
                                )
                            }
                        } else {
                            LazyColumn(
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier.fillMaxSize()
                            ) {
                                items(s.places, key = { it.id }) { place ->
                                    PlaceCard(
                                        place = place,
                                        onClick = {
                                            viewModel.openPlaceIndoor(
                                                idOrSlug = place.slug?.takeIf { it.isNotBlank() } ?: place.id,
                                                onSingleBuilding = onBuildingClick,
                                                onMultipleBuildings = { indoorChoices = it }
                                            )
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    val choices = indoorChoices
    if (choices != null) {
        AlertDialog(
            onDismissRequest = { indoorChoices = null },
            title = { Text("Chọn bản đồ trong nhà") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    choices.forEach { b ->
                        TextButton(
                            onClick = {
                                indoorChoices = null
                                onBuildingClick(b.id)
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(b.name, modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { indoorChoices = null }) {
                    Text("Đóng")
                }
            }
        )
    }
}

@Composable
fun PlaceCard(
    place: PlaceSummary,
    onClick: () -> Unit
) {
    val hasIndoor = (place.buildingCount ?: 0) > 0
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
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(Color(0xFFE8F0FE), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Rounded.Place,
                    contentDescription = null,
                    tint = Color(0xFF1A73E8),
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = place.name,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF202124),
                    maxLines = 1
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = listOfNotNull(
                        place.category?.takeIf { it.isNotBlank() },
                        place.address?.takeIf { it.isNotBlank() } ?: "Không có địa chỉ",
                        place.distanceM?.let { "${it.toInt()} m" }
                    ).joinToString(" · "),
                    fontSize = 13.sp,
                    color = Color(0xFF5F6368),
                    maxLines = 2,
                    lineHeight = 18.sp
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = if (hasIndoor) "Có Indoor" else "Chưa Indoor",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (hasIndoor) Color(0xFF188038) else Color(0xFFB06000)
                )
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
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(Color(0xFFE8F0FE), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Rounded.Place,
                    contentDescription = null,
                    tint = Color(0xFF1A73E8),
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = name,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF202124),
                    maxLines = 1
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = address,
                    fontSize = 13.sp,
                    color = Color(0xFF5F6368),
                    maxLines = 2,
                    lineHeight = 18.sp
                )
            }
        }
    }
}
