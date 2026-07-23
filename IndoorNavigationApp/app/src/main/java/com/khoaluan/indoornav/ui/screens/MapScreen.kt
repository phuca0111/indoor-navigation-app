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
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import com.khoaluan.indoornav.data.live.LiveShareClient
import com.khoaluan.indoornav.navigation.voice.NavigationTtsController
import com.khoaluan.indoornav.ui.components.BottomInfoCard
import com.khoaluan.indoornav.ui.components.CompassButton
import com.khoaluan.indoornav.ui.components.CrosshairButton
import com.khoaluan.indoornav.ui.components.DestinationFocusButton
import com.khoaluan.indoornav.ui.components.EmptyStateOverlay
import com.khoaluan.indoornav.ui.components.FloorSelectorSheet
import com.khoaluan.indoornav.ui.components.HeadingCalibrateBar
import com.khoaluan.indoornav.ui.components.MapView
import com.khoaluan.indoornav.ui.components.PlaceCardModel
import com.khoaluan.indoornav.ui.components.PlaceDetailSheet
import com.khoaluan.indoornav.ui.search.SearchFuzzy
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
    /** Ẩn overlay "Xác định vị trí" khi đang mở / xử lý QR (tránh flash 0.5s). */
    suppressEmptyState: Boolean = false,
) {
    val uiState    by viewModel.uiState.collectAsState()
    val navState   by viewModel.navState.collectAsState()
    val qrError    by viewModel.qrScanError.collectAsState()
    val savedParking by viewModel.savedParking.collectAsState()

    val snackbarHostState = remember { SnackbarHostState() }
    val mapScope = rememberCoroutineScope()

    // Đổi tab / app khác rồi quay lại → snap heading từ Rotation Vector (chống trôi 40–90°)
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.onForegroundResume()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

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

    // W5 — Voice TTS
    val context = LocalContext.current
    val ttsController = remember { NavigationTtsController(context) }
    var voiceEnabled by remember { mutableStateOf(true) }
    DisposableEffect(Unit) {
        onDispose { ttsController.shutdown() }
    }
    LaunchedEffect(navState.currentInstructionText, navState.isNavigatingMode, voiceEnabled) {
        ttsController.setEnabled(voiceEnabled)
        if (navState.isNavigatingMode) {
            ttsController.speakInstruction(navState.currentInstructionText)
        }
    }

    // W2 — Đã đến nơi
    LaunchedEffect(navState.hasArrived) {
        if (!navState.hasArrived) return@LaunchedEffect
        snackbarHostState.showSnackbar(
            message = "Đã đến nơi",
            duration = SnackbarDuration.Short,
        )
        viewModel.clearArrivalFlag()
    }

    // W2 — gợi ý khi lệch đường nặng
    LaunchedEffect(navState.navHint) {
        val hint = navState.navHint ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(message = hint, duration = SnackbarDuration.Long)
        viewModel.clearNavHint()
    }

    // W3 — gần connector: toast nhắc chọn tầng (một lần mỗi hint)
    var lastFloorHint by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(navState.floorTransitionHint) {
        val hint = navState.floorTransitionHint ?: return@LaunchedEffect
        if (hint == lastFloorHint) return@LaunchedEffect
        lastFloorHint = hint
        snackbarHostState.showSnackbar(message = hint, duration = SnackbarDuration.Short)
    }

    // Snackbar khi vị trí được xác định lần đầu (null → có vị trí).
    // FIX: chỉ key theo nullability; set flag TRƯỚC showSnackbar.
    // Trước đây LaunchedEffect(userPos) restart mỗi frame PDR + flag sau suspend → spam ~3 lần/giây.
    var hasShownPositionSnackbar by remember { mutableStateOf(false) }
    val hasUserPos = navState.userPos != null
    LaunchedEffect(hasUserPos) {
        if (hasUserPos) {
            if (!hasShownPositionSnackbar) {
                hasShownPositionSnackbar = true
                snackbarHostState.showSnackbar(
                    message = "✓ Đã xác định vị trí",
                    duration = SnackbarDuration.Short,
                )
            }
        } else {
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
                    var placeCard by remember { mutableStateOf<PlaceCardModel?>(null) }
                    var showPlaceSheet by remember { mutableStateOf(false) }
                    var voiceOn by remember { mutableStateOf(true) }
                    LaunchedEffect(voiceOn) { voiceEnabled = voiceOn }
                    var centerTrigger    by remember { mutableStateOf(0) }
                    var centerDestTrigger by remember { mutableStateOf(0) }
                    var currentFloor     by remember { mutableStateOf(0) }
                    var showFloorSheet   by remember { mutableStateOf(false) }
                    var liveShareOn by remember { mutableStateOf(false) }
                    val liveShareClient = remember { LiveShareClient() }
                    val livePeers by liveShareClient.peers.collectAsState()
                    val clipboard = LocalClipboardManager.current
                    val shareSessionId = remember(buildingId, currentFloor) {
                        "b-${buildingId.takeLast(6)}-f$currentFloor"
                    }
                    LaunchedEffect(liveShareOn, shareSessionId) {
                        if (!liveShareOn) {
                            liveShareClient.clear()
                            return@LaunchedEffect
                        }
                        liveShareClient.loopWhileActive(
                            sessionId = shareSessionId,
                            name = "Guest",
                            getPose = {
                                val p = viewModel.navState.value.userPos ?: return@loopWhileActive null
                                Triple(p.x, p.y, currentFloor)
                            },
                            getHeading = { viewModel.navState.value.userHeading },
                        )
                    }

                    // Sync currentFloor từ backend (đã có)
                    LaunchedEffect(Unit) {
                        snapshotFlow { viewModel.uiState.value }
                            .collect { state ->
                                if (state is MapUiState.Success && state.floorNumber != currentFloor) {
                                    currentFloor = state.floorNumber
                                }
                            }
                    }

                    // Empty state: chỉ hiện khi chưa có vị trí. Key theo boolean để không reset
                    // loạn khi Offset userPos đổi từng frame (sau khi đã quét).
                    var showEmptyState by remember { mutableStateOf(false) }
                    LaunchedEffect(navState.userPos != null) {
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

                    // G1: chọn đích ≠ tự tính path; cờ UI qua computeNavigationUiFlags
                    val isParkingDest = navState.destinationPoiId == -1
                    val currentDestinationName = if (isParkingDest) "Bãi đỗ xe" else selectedRoomName
                    val uiFlags = com.khoaluan.indoornav.ui.navigation.computeNavigationUiFlags(
                        destinationName = currentDestinationName,
                        path = navState.path,
                        isNavigatingMode = navState.isNavigatingMode,
                    )
                    val showBottomCard = uiFlags.showBottomCard
                    val isSearchingPath = uiFlags.isSearchingPath
                    val isPathPreview = uiFlags.isPathPreview

                    // Data class dùng chung cho danh sách tìm kiếm
                    data class SearchItem(val id: Int, val name: String, val isRoom: Boolean, val floor: Int? = null)

                    val crossFloorRooms by viewModel.crossFloorRooms.collectAsState()

                    // Danh sach tim kiem: gop Rooms + POIs (tầng hiện tại) + phòng các tầng khác (W3)
                    val searchItems = remember(state.mapData, crossFloorRooms, state.floorNumber) {
                        val roomItems = state.mapData.rooms.map {
                            SearchItem(it.id, it.name, true, state.floorNumber)
                        }
                        val poiItems = state.mapData.pois.mapNotNull { poi ->
                            poi.name?.let { SearchItem(poi.id, it, false, state.floorNumber) }
                        }
                        val otherFloor = crossFloorRooms
                            .filter { it.floor != state.floorNumber }
                            .map {
                                SearchItem(
                                    id = it.room.id,
                                    name = it.room.name,
                                    isRoom = true,
                                    floor = it.floor,
                                )
                            }
                        roomItems + poiItems + otherFloor
                    }

                    val filteredItems = remember(searchQuery, searchItems) {
                        if (searchQuery.isBlank()) emptyList()
                        else SearchFuzzy.filterRankedBy(
                            query = searchQuery,
                            items = searchItems,
                            nameOf = { it.name },
                            limit = 30,
                        )
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

                    val navProgress = when {
                        navState.isNavigatingMode && navState.routeProgress > 0f -> navState.routeProgress
                        navState.isNavigatingMode -> navState.routeProgress
                        else -> 0f
                    }

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
                            val mapNorthOffsetDeg by viewModel.mapNorthOffsetDeg.collectAsState()

                            MapView(
                                mapData = state.mapData,
                                selectedRoomId = selectedRoomId,
                                selectedPoiId = navState.destinationPoiId,
                                navState = navState,
                                mapRotationMode = mapRotationMode,
                                centerOnUserTrigger = centerTrigger,
                                centerOnDestinationTrigger = centerDestTrigger,
                            )

                            // UX fix 1: EmptyStateOverlay
                            EmptyStateOverlay(
                                visible = showEmptyState && !suppressEmptyState,
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
                                        Row {
                                            TextButton(onClick = {
                                                voiceOn = !voiceOn
                                                ttsController.setEnabled(voiceOn)
                                            }) {
                                                Text(
                                                    text = if (voiceOn) "Giọng bật" else "Giọng tắt",
                                                    color = NavBlue,
                                                    fontSize = 12.sp,
                                                )
                                            }
                                            TextButton(onClick = {
                                                liveShareOn = !liveShareOn
                                                if (liveShareOn) {
                                                    clipboard.setText(AnnotatedString(shareSessionId))
                                                    mapScope.launch {
                                                        snackbarHostState.showSnackbar(
                                                            "Chia sẻ bật · mã $shareSessionId (đã copy)",
                                                        )
                                                    }
                                                }
                                            }) {
                                                Text(
                                                    text = if (liveShareOn) "Share ${livePeers.size}" else "Share",
                                                    color = if (liveShareOn) Color(0xFF10B981) else NavBlue,
                                                    fontSize = 12.sp,
                                                )
                                            }
                                            TextButton(onClick = { showFloorSheet = true }) {
                                                Text(
                                                    text = if (currentFloor == 0) "GF ▼" else "${currentFloor}F ▼",
                                                    color = NavBlue,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 13.sp
                                                )
                                            }
                                        }
                                    }
                                },
                            ) {
                                LazyColumn(Modifier.fillMaxWidth()) {
                                    items(filteredItems) { item ->
                                        ListItem(
                                            headlineContent = { Text(item.name) },
                                            supportingContent = {
                                                val floorBit = item.floor?.let { f ->
                                                    if (f == state.floorNumber) null
                                                    else if (f == 0) " · Tầng GF"
                                                    else " · Tầng $f"
                                                } ?: ""
                                                Text(
                                                    (if (item.isRoom) "Phòng" else "Tiện ích") + floorBit,
                                                )
                                            },
                                            modifier = Modifier.clickable {
                                                searchQuery      = item.name
                                                selectedRoomName = item.name
                                                if (item.isRoom) {
                                                    selectedRoomId = item.id
                                                    val destFloor = item.floor ?: state.floorNumber
                                                    if (destFloor != state.floorNumber) {
                                                        viewModel.setDestinationOnFloor(destFloor, item.id)
                                                    } else {
                                                        viewModel.setDestination(item.id)
                                                    }
                                                    val room = if (destFloor == state.floorNumber) {
                                                        state.mapData.rooms.find { it.id == item.id }
                                                    } else {
                                                        crossFloorRooms.find {
                                                            it.floor == destFloor && it.room.id == item.id
                                                        }?.room
                                                    }
                                                    placeCard = PlaceCardModel(
                                                        name = item.name,
                                                        kindLabel = room?.type ?: "Phòng",
                                                        description = room?.description,
                                                        rating = room?.rating,
                                                        ratingCount = room?.ratingCount,
                                                        openingHours = room?.openingHours,
                                                    )
                                                } else {
                                                    selectedRoomId = null
                                                    viewModel.setDestinationPoi(item.id)
                                                    val poi = state.mapData.pois.find { it.id == item.id }
                                                    placeCard = PlaceCardModel(
                                                        name = item.name,
                                                        kindLabel = poi?.type ?: poi?.poiType ?: "Tiện ích",
                                                        description = null,
                                                        rating = null,
                                                        ratingCount = null,
                                                        openingHours = null,
                                                    )
                                                }
                                                showPlaceSheet = true
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
                            // Long-press la bàn = bật/tắt panel debug căn Bắc (không hiện mặc định)
                            var showHeadingDebug by remember { mutableStateOf(false) }
                            Column(
                                modifier = Modifier
                                    .align(Alignment.BottomStart)
                                    .padding(start = 16.dp, bottom = 16.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                if (navState.userPos != null) {
                                    TextButton(
                                        onClick = { viewModel.resyncHeadingFromSensors() },
                                        modifier = Modifier
                                            .padding(bottom = 4.dp)
                                            .background(
                                                Color.Black.copy(alpha = 0.55f),
                                                MaterialTheme.shapes.small,
                                            ),
                                    ) {
                                        Text(
                                            "Snap hướng",
                                            color = Color(0xFF69F0AE),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }
                                CompassButton(
                                    rotation = navState.userHeading,
                                    mapRotationMode = mapRotationMode,
                                    onClick = { viewModel.toggleMapRotationMode() },
                                    onLongClick = { showHeadingDebug = !showHeadingDebug },
                                )
                            }

                            // Debug căn Bắc — chỉ khi long-press la bàn; đặt trên cùng, tránh đè Lưu xe
                            if (showHeadingDebug && navState.userPos != null) {
                                HeadingCalibrateBar(
                                    offsetDeg = mapNorthOffsetDeg,
                                    onMinus = { viewModel.adjustMapNorthOffset(-15f) },
                                    onPlus = { viewModel.adjustMapNorthOffset(15f) },
                                    onMinus90 = { viewModel.adjustMapNorthOffset(-90f) },
                                    onPlus90 = { viewModel.adjustMapNorthOffset(90f) },
                                    onInvert180 = { viewModel.adjustMapNorthOffset(180f) },
                                    onReset = { viewModel.resetMapNorthOffsetCalibration() },
                                    onSnapHeading = {
                                        viewModel.resyncHeadingFromSensors()
                                    },
                                    modifier = Modifier
                                        .align(Alignment.TopCenter)
                                        .padding(top = 72.dp),
                                )
                            }

                            // RULE 2: Crosshair = vị trí đang đứng; Pin đỏ = điểm đến
                            val hasDestination = navState.destinationMarkerPos != null ||
                                (navState.path?.isNotEmpty() == true)
                            if (hasDestination) {
                                DestinationFocusButton(
                                    onClick = { centerDestTrigger++ },
                                    modifier = Modifier
                                        .align(Alignment.BottomEnd)
                                        .padding(
                                            end = 16.dp,
                                            bottom = if (navState.userPos != null) 68.dp else 16.dp,
                                        ),
                                )
                            }
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
                                isPathPreview     = isPathPreview,
                                navigationError   = navState.navigationError,
                                progress          = navProgress,
                                distanceMeters    = if (navState.isNavigatingMode && navState.remainingDistanceMeters > 0f) {
                                    navState.remainingDistanceMeters
                                } else {
                                    navState.totalDistanceMeters
                                },
                                etaSeconds        = navState.etaSeconds,
                                rerouteCount      = navState.rerouteCount,
                                isRerouting       = navState.isRerouting,
                                instructionText   = navState.currentInstructionText,
                                pathHasFloorConnector = navState.pathHasFloorConnector,
                                onOpenFloorPicker = { showFloorSheet = true },
                                onQrScan          = onScanQR,
                                onPreviewPath     = { viewModel.previewPath() },
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
                            totalFloors = viewModel.getTotalFloorsForBuilding(buildingId),
                            onFloorSelected = { floor ->
                                currentFloor = floor
                                val preserve = navState.suggestedTargetFloor == floor ||
                                    navState.pendingDestFloor == floor
                                viewModel.refreshMap(buildingId, floor)
                                showFloorSheet = false
                                mapScope.launch {
                                    val msg = if (preserve) {
                                        "Đã lên tầng $floor — quét QR gần connector để tiếp tục đường đi."
                                    } else {
                                        "Đã chuyển tầng $floor."
                                    }
                                    snackbarHostState.showSnackbar(
                                        message = msg,
                                        duration = SnackbarDuration.Short,
                                    )
                                }
                            },
                            onDismiss = { showFloorSheet = false },
                        )
                    }

                    val placeCardValue = placeCard
                    if (showPlaceSheet && placeCardValue != null) {
                        PlaceDetailSheet(
                            place = placeCardValue,
                            onPreviewPath = {
                                showPlaceSheet = false
                                viewModel.previewPath()
                            },
                            onStartNavigation = {
                                showPlaceSheet = false
                                viewModel.previewPath()
                                viewModel.startNavigationMode()
                            },
                            onDismiss = { showPlaceSheet = false },
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
