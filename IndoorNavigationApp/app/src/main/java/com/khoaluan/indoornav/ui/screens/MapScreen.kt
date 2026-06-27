package com.khoaluan.indoornav.ui.screens

// MapScreen.kt
// MUC DICH: Man hinh chinh hien thi ban do 2D, xu ly dinh vi, tim duong, chon tang
// Ket noi voi:
//   - MapViewModel.kt: doc state (uiState, navState, qrError) qua collectAsState()
//   - MapView.kt: component ve ban do Canvas 2D
//   - FloorSelectorSheet: bottom sheet chon tang
//   - BottomInfoCard: hien thi thong tin dinh vi / tim duong
//   - QRScanScreen: man hinh quet QR
//   - CompassButton / CrosshairButton: nut xoay ban do / canh giua user

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.khoaluan.indoornav.ui.components.BottomInfoCard
import com.khoaluan.indoornav.ui.components.CompassButton
import com.khoaluan.indoornav.ui.components.CrosshairButton
import com.khoaluan.indoornav.ui.components.EmptyStateOverlay
import com.khoaluan.indoornav.ui.components.FloorSelectorSheet
import com.khoaluan.indoornav.ui.components.MapView
import com.khoaluan.indoornav.ui.theme.NavBlue
import com.khoaluan.indoornav.ui.viewmodel.MapUiState
import com.khoaluan.indoornav.ui.viewmodel.MapViewModel

/**
 * UX fixes applied (UX_REVIEW_PROMPT):
 * 1. EmptyStateOverlay — hướng dẫn quét QR lần đầu
 * 2. FloorSelectorSheet — chọn tầng khi nhấn "Tầng X ▼"
 * 3. BottomInfoCard 3 states — tìm đường / điều hướng / idle
 * 4. Snackbar QR feedback — thông báo khi quét thành công
 * 5. BottomInfoCard ẩn khi idle (MAP_UI_SPECIAL)
 * 6. SearchBar không đè nút Back
 */
// MapScreen: Composable man hinh ban do
// buildingId: ID toa nha (truyen tu BuildingListScreen)
// viewModel: MapViewModel quan ly state
// onBack: callback quay lai
// onScanQR: callback mo man hinh quet QR
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(
    buildingId: String,
    viewModel: MapViewModel = viewModel(),
    onBack: () -> Unit,
    onScanQR: () -> Unit,
) {
    val uiState    by viewModel.uiState.collectAsState()
    val navState   by viewModel.navState.collectAsState()
    val qrError    by viewModel.qrScanError.collectAsState()
    val savedParking by viewModel.savedParking.collectAsState()

    val snackbarHostState = remember { SnackbarHostState() }

    // Dialog States
    var showLowConfidenceDialog by remember { mutableStateOf(false) }
    var showNoteDialog by remember { mutableStateOf(false) }
    var parkingNote by remember { mutableStateOf("") }

    // Khi buildingId thay doi -> tai ban do tu backend voi floor tu QR (neu co) hoac 0
    LaunchedEffect(buildingId) {
        val floor = viewModel.consumeInitialFloor()
        viewModel.refreshMap(buildingId, floor)
    }

    // Snackbar khi QR scan thất bại — báo lỗi rõ ràng cho user
    // Snackbar hien thi loi khi quet QR that bai
    LaunchedEffect(qrError) {
        val msg = qrError ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(message = msg, duration = SnackbarDuration.Long)
        viewModel.clearQrError()
    }

    // Snackbar khi vị trí được xác định lần đầu
    // FIX #9: Chỉ hiển thị 1 lần khi userPos chuyển từ null → non-null
    // Tránh spam snackbar do TPF update liên tục (~50Hz)
    var hasShownPositionSnackbar by remember { mutableStateOf(false) }
    LaunchedEffect(navState.userPos) {
        if (navState.userPos != null) {
            if (!hasShownPositionSnackbar) {
                snackbarHostState.showSnackbar(
                    message = "✓ Đã xác định vị trí",
                    duration = SnackbarDuration.Short,
                )
                hasShownPositionSnackbar = true
            }
        } else {
            // Reset khi userPos về null (sau exitIndoorNavigation)
            hasShownPositionSnackbar = false
        }
    }

    Scaffold(
        snackbarHost = {
            SnackbarHost(
                hostState = snackbarHostState,
                modifier = Modifier.padding(bottom = 120.dp),
            )
        },
        containerColor = Color(0xFFF0F4F8),
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
        ) {
            when (val state = uiState) {

                // ── LOADING ───────────────────────────────────────────────────
                is MapUiState.Loading -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CircularProgressIndicator(color = NavBlue)
                        Text(
                            text = "Đang tải bản đồ...",
                            color = Color.DarkGray,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                // ── ERROR ─────────────────────────────────────────────────────
                is MapUiState.Error -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center).padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Text(
                            text = state.message,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        Button(
                            onClick = { viewModel.refreshMap(buildingId, 0) },
                            colors = ButtonDefaults.buttonColors(containerColor = NavBlue),
                        ) {
                            Text("Thử lại")
                        }
                    }
                }

                // ── SUCCESS ───────────────────────────────────────────────────
                is MapUiState.Success -> {
                    var searchQuery      by remember { mutableStateOf("") }
                    var isSearchActive   by remember { mutableStateOf(false) }
                    var selectedRoomId   by remember { mutableStateOf<Int?>(null) }
                    var selectedRoomName by remember { mutableStateOf<String?>(null) }
                    var centerTrigger    by remember { mutableStateOf(0) }
                    var currentFloor     by remember { mutableStateOf(0) }
                    var showFloorSheet   by remember { mutableStateOf(false) }

                    // Sync currentFloor từ backend (đã có)
                    LaunchedEffect(Unit) {
                        snapshotFlow { viewModel.uiState.value }
                            .collect { state ->
                                if (state is MapUiState.Success && state.floorNumber != currentFloor) {
                                    currentFloor = state.floorNumber
                                }
                            }
                    }

                    // FIX #8: Reset showEmptyState mỗi khi navState.userPos thay đổi
                    // Tránh treo state khi quay lại từ QRScan sau khi exitIndoorNavigation
                    var showEmptyState by remember { mutableStateOf(false) }
                    LaunchedEffect(navState.userPos) {
                        showEmptyState = navState.userPos == null
                    }

                    // FIX #8: Reset search/selection khi buildingId thay đổi
                    // Khi chọn building mới từ BuildingList, clear search/room cũ
                    LaunchedEffect(buildingId) {
                        searchQuery = ""
                        selectedRoomId = null
                        selectedRoomName = null
                        isSearchActive = false
                        showFloorSheet = false
                        // KHÔNG reset currentFloor vì đã sync từ backend
                        // KHÔNG reset showEmptyState vì đã có LaunchedEffect(navState.userPos)
                    }

                    // UX fix 3: 3 trạng thái card
                    val isParkingDest = navState.destinationPoiId == -1
                    val currentDestinationName = if (isParkingDest) "Bãi đỗ xe" else selectedRoomName
                    
                    val showBottomCard   = currentDestinationName != null || navState.path != null
                    val isSearchingPath  = currentDestinationName != null && navState.path == null && navState.userPos != null

                    // Data class dùng chung cho danh sách tìm kiếm
                    data class SearchItem(val id: Int, val name: String, val isRoom: Boolean)

                    // Danh sach tim kiem: gop Rooms + POIs tu ban do
    val searchItems = remember(state.mapData) {
                        val roomItems = state.mapData.rooms.map { SearchItem(it.id, it.name, true) }
                        val poiItems = state.mapData.pois.mapNotNull { poi -> 
                            poi.name?.let { SearchItem(poi.id, it, false) }
                        }
                        roomItems + poiItems
                    }

                    val filteredItems = remember(searchQuery, searchItems) {
                        if (searchQuery.isBlank()) emptyList()
                        else searchItems.filter {
                            it.name.contains(searchQuery, ignoreCase = true)
                        }
                    }

                    // Label vị trí hiện tại
                    val currentLocationLabel = remember(navState.userPos, state.mapData.rooms) {
                        val pos = navState.userPos
                            ?: return@remember "Quét QR để xác định vị trí"
                        state.mapData.rooms.minByOrNull { room ->
                            val dx = (room.x + room.width / 2.0) - pos.x
                            val dy = (room.y + room.height / 2.0) - pos.y
                            dx * dx + dy * dy
                        }?.name ?: "Đang xác định..."
                    }

                    val navProgress = if (navState.isTpfActive) navState.confidence else 0f

                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(paddingValues)
                    ) {

                        // ── MAP AREA ─────────────────────────────────────────
                        // MapView: component ve ban do Canvas 2D
    //   - Nhan mapData (rooms, walls, nodes, edges, pois)
    //   - Nhan navState de ve user dot + duong di + heading arrow
    //   - Nhan mapRotationMode: NORTH_UP hoac HEADING_UP
    //   - centerOnUserTrigger: so lan user bam nut canh giua
    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {

                            val mapRotationMode by viewModel.mapRotationMode.collectAsState()

                            MapView(
                                mapData = state.mapData,
                                selectedRoomId = selectedRoomId,
                                selectedPoiId = navState.destinationPoiId,
                                navState = navState,
                                mapRotationMode = mapRotationMode,
                                centerOnUserTrigger = centerTrigger,
                            )

                            // UX fix 1: EmptyStateOverlay
                            EmptyStateOverlay(
                                visible = showEmptyState,
                                onQrScan = {
                                    showEmptyState = false
                                    onScanQR()
                                },
                                onDismiss = { showEmptyState = false },
                            )

                            // Search bar — start=52dp để không đè Back button
                            DockedSearchBar(
                                modifier = Modifier
                                    .align(Alignment.TopCenter)
                                    .padding(top = 8.dp, start = 52.dp, end = 8.dp)
                                    .fillMaxWidth(),
                                query = searchQuery,
                                onQueryChange = { searchQuery = it },
                                onSearch = { isSearchActive = false },
                                active = isSearchActive,
                                onActiveChange = { isSearchActive = it },
                                placeholder = { Text("Tìm phòng...") },
                                leadingIcon = {
                                    Icon(Icons.Default.Search, contentDescription = null)
                                },
                                trailingIcon = {
                                    if (isSearchActive) {
                                        IconButton(onClick = {
                                            if (searchQuery.isNotEmpty()) searchQuery = ""
                                            else isSearchActive = false
                                        }) {
                                            Icon(Icons.Default.Close, contentDescription = null)
                                        }
                                    } else {
                                        // Nút chọn tầng khi không tìm kiếm
                                        TextButton(onClick = { showFloorSheet = true }) {
                                            Text(
                                                text = if (currentFloor == 0) "GF ▼" else "${currentFloor}F ▼",
                                                color = NavBlue,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 13.sp
                                            )
                                        }
                                    }
                                },
                            ) {
                                LazyColumn(Modifier.fillMaxWidth()) {
                                    items(filteredItems) { item ->
                                        ListItem(
                                            headlineContent = { Text(item.name) },
                                            supportingContent = { Text(if (item.isRoom) "Phòng" else "Tiện ích") },
                                            modifier = Modifier.clickable {
                                                searchQuery      = item.name
                                                selectedRoomName = item.name
                                                if (item.isRoom) {
                                                    // WHY: Chỉ highlight room khi kết quả là phòng.
                                                    // Nếu là POI mà vẫn gán selectedRoomId thì sẽ vẽ 2 điểm cùng lúc.
                                                    selectedRoomId = item.id
                                                    viewModel.setDestination(item.id)
                                                } else {
                                                    // WHY: Clear room highlight để tránh trùng marker Room + POI.
                                                    selectedRoomId = null
                                                    viewModel.setDestinationPoi(item.id)
                                                }
                                                isSearchActive   = false
                                                showEmptyState   = false
                                            },
                                        )
                                    }
                                }
                            }

                            // Debug — chỉ hiện khi TPF chạy
                            if (navState.particles.isNotEmpty()) {
                                Text(
                                    text = "TPF ${(navState.confidence * 100).toInt()}%",
                                    modifier = Modifier
                                        .align(Alignment.TopStart)
                                        .padding(top = 64.dp, start = 8.dp)
                                        .background(Color.Black.copy(0.55f), MaterialTheme.shapes.extraSmall)
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                                    color = if (navState.isTpfActive) Color.Green else Color.Yellow,
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            }

                            // RULE 3: CompassButton — luôn hiển thị
                            CompassButton(
                                rotation = navState.userHeading,
                                mapRotationMode = mapRotationMode,
                                onClick = { viewModel.toggleMapRotationMode() },
                                modifier = Modifier
                                    .align(Alignment.BottomStart)
                                    .padding(start = 16.dp, bottom = 16.dp),
                            )

                            // RULE 2: CrosshairButton — chỉ khi biết vị trí
                            if (navState.userPos != null) {
                                CrosshairButton(
                                    onClick = { centerTrigger++ },
                                    modifier = Modifier
                                        .align(Alignment.BottomEnd)
                                        .padding(end = 16.dp, bottom = 16.dp),
                                )
                            }

                            // RULE 4: QR FAB standalone khi chưa có BottomCard
                            if (!showBottomCard) {
                                FloatingActionButton(
                                    onClick = onScanQR,
                                    modifier = Modifier
                                        .align(Alignment.BottomEnd)
                                        .padding(end = 16.dp, bottom = 72.dp),
                                    shape = CircleShape,
                                    containerColor = NavBlue,
                                    contentColor = Color.White,
                                    elevation = FloatingActionButtonDefaults.elevation(6.dp),
                                ) {
                                    Icon(Icons.Default.Search, contentDescription = "Quét QR")
                                }
                            }

                            // FAB Lưu xe / Tìm xe
                            if (navState.userPos != null && !showBottomCard) {
                                if (savedParking == null) {
                                    // Nút Lưu Xe
                                    ExtendedFloatingActionButton(
                                        onClick = {
                                            if (navState.confidence < 0.8f) {
                                                showLowConfidenceDialog = true
                                            } else {
                                                showNoteDialog = true
                                            }
                                        },
                                        modifier = Modifier
                                            .align(Alignment.BottomCenter)
                                            .padding(start = 16.dp, end = 16.dp, bottom = 72.dp),
                                        icon = { Icon(Icons.Default.LocationOn, contentDescription = null) },
                                        text = { Text("Lưu xe") },
                                        containerColor = Color(0xFF10B981),
                                        contentColor = Color.White
                                    )
                                } else {
                                    // Row chứa Tìm xe và Xóa đỗ xe
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(start = 16.dp, end = 16.dp, bottom = 72.dp)
                                            .align(Alignment.BottomCenter),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.Bottom
                                    ) {
                                        // Nút Tìm Xe (chiếm không gian còn lại)
                                        ExtendedFloatingActionButton(
                                            onClick = { viewModel.findMyCar() },
                                            modifier = Modifier.weight(1f),
                                            icon = { Icon(Icons.Default.Star, contentDescription = null) },
                                            text = { Text("Tìm xe") },
                                            containerColor = Color(0xFFF59E0B),
                                            contentColor = Color.White
                                        )
                                        // Nút Xóa đỗ xe (dấu x nhỏ)
                                        FloatingActionButton(
                                            onClick = { viewModel.clearParkingPosition() },
                                            modifier = Modifier
                                                .size(40.dp)
                                                .padding(start = 8.dp),
                                            containerColor = Color.LightGray,
                                            contentColor = Color.Black
                                        ) {
                                            Icon(Icons.Default.Close, contentDescription = "Xóa điểm đỗ")
                                        }
                                    }
                                }
                            }
                        }

                        // ── BOTTOM INFO CARD (animate) ────────────────────────
                        AnimatedVisibility(
                            visible = showBottomCard,
                            enter = slideInVertically { it },
                            exit  = slideOutVertically { it },
                        ) {
                            BottomInfoCard(
                                currentLocation   = currentLocationLabel,
                                destination       = currentDestinationName ?: "Đang tải...",
                                isSearchingPath   = isSearchingPath,
                                isNavigating      = navState.isNavigatingMode,
                                progress          = navProgress,
                                distanceMeters    = navState.totalDistanceMeters,
                                etaSeconds        = navState.etaSeconds,
                                rerouteCount      = navState.rerouteCount,
                                isRerouting       = navState.isRerouting,
                                onQrScan          = onScanQR,
                                onStartNavigation = { viewModel.startNavigationMode() },
                                onStopNavigation  = {
                                    viewModel.stopNavigation()
                                    selectedRoomId   = null
                                    selectedRoomName = null
                                },
                            )
                        }
                    }

                    // UX fix 2: FloorSelectorSheet
                    if (showFloorSheet) {
                        FloorSelectorSheet(
                            currentFloor = currentFloor,
                            onFloorSelected = { floor ->
                                currentFloor = floor
                                viewModel.refreshMap(buildingId, floor)
                            },
                            onDismiss = { showFloorSheet = false },
                        )
                    }

                    // ── DIALOGS ───────────────────────────────────────────────────
                    if (showLowConfidenceDialog) {
                        AlertDialog(
                            onDismissRequest = { showLowConfidenceDialog = false },
                            title = { Text("⚠️ Cảnh báo độ chính xác") },
                            text = { Text("Độ chính xác hiện tại đang thấp. Vị trí xe có thể bị lệch vài mét so với thực tế do cảm biến trôi dạt.\nBạn vẫn muốn lưu vị trí này?") },
                            confirmButton = {
                                TextButton(onClick = { 
                                    showLowConfidenceDialog = false
                                    showNoteDialog = true
                                }) { Text("Tiếp tục lưu") }
                            },
                            dismissButton = {
                                TextButton(onClick = { showLowConfidenceDialog = false }) { Text("Hủy") }
                            }
                        )
                    }

                    if (showNoteDialog) {
                        AlertDialog(
                            onDismissRequest = { showNoteDialog = false },
                            title = { Text("Ghi chú vị trí xe") },
                            text = {
                                OutlinedTextField(
                                    value = parkingNote,
                                    onValueChange = { parkingNote = it },
                                    label = { Text("Ví dụ: Cạnh thang máy cuốn, Cột C3...") },
                                    singleLine = true
                                )
                            },
                            confirmButton = {
                                Button(onClick = {
                                    viewModel.saveParkingPosition(parkingNote.takeIf { it.isNotBlank() })
                                    showNoteDialog = false
                                    parkingNote = ""
                                }) { Text("Lưu lại") }
                            },
                            dismissButton = {
                                TextButton(onClick = { showNoteDialog = false }) { Text("Bỏ qua ghi chú") }
                            }
                        )
                    }
                }
            }

            // Back button — luôn hiển thị, có nền mờ
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(top = 8.dp, start = 8.dp)
                    .shadow(4.dp, CircleShape)
                    .clip(CircleShape)
                    .background(Color.White)
                    .size(40.dp),
                contentAlignment = Alignment.Center,
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.Default.ArrowBack,
                        contentDescription = "Quay lại",
                        tint = Color(0xFF424242),
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }
    }
}
