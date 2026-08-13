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
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.rememberCoroutineScope
import androidx.activity.compose.BackHandler
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.launch
import kotlin.math.roundToInt
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import com.khoaluan.indoornav.data.live.LiveShareClient
import com.khoaluan.indoornav.data.local.SessionManager
import com.khoaluan.indoornav.navigation.voice.NavigationTtsController
import com.khoaluan.indoornav.ui.components.BottomInfoCard
import com.khoaluan.indoornav.ui.components.CompassButton
import com.khoaluan.indoornav.ui.icons.QrScanIcon
import com.khoaluan.indoornav.ui.components.CrosshairButton
import com.khoaluan.indoornav.ui.components.DestinationFocusButton
import com.khoaluan.indoornav.ui.components.EmptyStateOverlay
import com.khoaluan.indoornav.ui.components.FloorSelectorSheet
import com.khoaluan.indoornav.ui.components.HeadingCalibrateBar
import com.khoaluan.indoornav.ui.components.IndoorMapHitTest
import com.khoaluan.indoornav.ui.components.MapLayerPanel
import com.khoaluan.indoornav.ui.components.MapLayerVisibility
import com.khoaluan.indoornav.ui.components.MapView
import com.khoaluan.indoornav.ui.components.PlaceCardModel
import com.khoaluan.indoornav.ui.components.PlaceDetailSheet
import com.khoaluan.indoornav.ui.components.PoiCategory
import com.khoaluan.indoornav.ui.components.PoiFilterChips
import com.khoaluan.indoornav.ui.components.resolveCategory
import com.khoaluan.indoornav.ui.i18n.LocalAppLocale
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.i18n.trStatic
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
    val emergencySession by viewModel.emergencySession.collectAsState()
    val mapHazardZones by viewModel.mapHazardZones.collectAsState()
    val buildingActiveEmergency by viewModel.buildingActiveEmergency.collectAsState()
    /** Khẩn cấp (đang phiên hoặc banner sự cố còn ACTIVE) → ẩn overlay “Xác định vị trí”. */
    val hideEmptyStateForEmergency =
        emergencySession.active || buildingActiveEmergency != null
    val awaitingEmergencyStanding =
        emergencySession.active &&
            emergencySession.phase == com.khoaluan.indoornav.navigation.emergency.EmergencyPhase.AWAITING_LOCATION

    val snackbarHostState = remember { SnackbarHostState() }
    val mapScope = rememberCoroutineScope()
    val indoorTarget by viewModel.indoorTarget.collectAsState()
    val indoorReviews by viewModel.indoorReviews.collectAsState()
    val placeNotice by viewModel.placeNotice.collectAsState()

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
    var showIndoorReportDialog by remember { mutableStateOf(false) }
    var showIndoorReviewDialog by remember { mutableStateOf(false) }
    var indoorReviewStars by remember { mutableStateOf(5) }
    var showExitEmergencyConfirm by remember { mutableStateOf(false) }

    // Khẩn cấp: chặn Back hệ thống / nút ← — tránh “văng” ra list vì bấm nhầm
    BackHandler(enabled = emergencySession.active) {
        showExitEmergencyConfirm = true
    }

    // Khi buildingId thay doi -> tai ban do tu backend voi floor tu QR (neu co) hoac 0
    LaunchedEffect(buildingId) {
        val current = viewModel.uiState.value
        // Đã đúng tòa + đang khẩn cấp / đã Success → không refreshMap(…, 0) (tránh văng về GF)
        if (current is MapUiState.Success && current.buildingId == buildingId) {
            val floor = viewModel.consumeInitialFloor()
            if (floor != current.floorNumber &&
                viewModel.emergencySession.value.active.not()
            ) {
                viewModel.refreshMap(buildingId, floor)
            }
            return@LaunchedEffect
        }
        val floor = viewModel.consumeInitialFloor()
        viewModel.refreshMap(buildingId, floor)
    }

    // Snackbar khi QR scan thất bại — báo lỗi rõ ràng cho user
    // Snackbar hien thi loi khi quet QR that bai
    LaunchedEffect(qrError) {
        val msg = qrError ?: return@LaunchedEffect
        snackbarHostState.showSnackbar(
            message = msg,
            duration = SnackbarDuration.Short,
            withDismissAction = true,
        )
        viewModel.clearQrError()
    }

    // W5 — Voice TTS tiếng Việt (ưu tiên Google TTS engine như Maps)
    val context = LocalContext.current
    val sessionManager = remember { SessionManager(context) }
    val isLoggedIn = sessionManager.isLoggedIn
    val settingsStore = remember { com.khoaluan.indoornav.data.local.AppSettingsStore(context) }
    var voiceEnabled by remember { mutableStateOf(settingsStore.voiceGuidance) }
    val ttsHolder = remember { arrayOfNulls<NavigationTtsController>(1) }
    val ttsController = remember {
        NavigationTtsController(context) {
            mapScope.launch {
                val result = snackbarHostState.showSnackbar(
                    message = "Máy chưa có giọng tiếng Việt. Cài gói Việt (như Google Maps) để nghe chỉ đường.",
                    actionLabel = "Cài Việt",
                    duration = SnackbarDuration.Long,
                )
                if (result == SnackbarResult.ActionPerformed) {
                    ttsHolder[0]?.openInstallVietnameseData(context)
                }
            }
        }.also { ttsHolder[0] = it }
    }
    DisposableEffect(Unit) {
        onDispose { ttsController.shutdown() }
    }
    LaunchedEffect(navState.isNavigatingMode, voiceEnabled) {
        ttsController.setEnabled(voiceEnabled)
        if (!navState.isNavigatingMode || !voiceEnabled) {
            ttsController.resetLastSpoken()
        }
    }
    // Một nguồn TTS: chỉ khi đổi loại manoeuvre (đã debounce). Không bucket mét.
    LaunchedEffect(
        navState.isNavigatingMode,
        voiceEnabled,
        navState.nextManeuverType,
    ) {
        if (!navState.isNavigatingMode || !voiceEnabled) return@LaunchedEffect
        val type = navState.nextManeuverType?.takeIf { it.isNotBlank() } ?: return@LaunchedEffect
        // Gần đích: debounce dài hơn — tránh nói lại khi type nhấp ARRIVE↔TURN
        val settleMs = if (type.contains("ARRIVE", ignoreCase = true)) 900L else 650L
        kotlinx.coroutines.delay(settleMs)
        if (!navState.isNavigatingMode || !voiceEnabled) return@LaunchedEffect
        val stableType = navState.nextManeuverType?.takeIf { it.isNotBlank() } ?: return@LaunchedEffect
        if (stableType != type) return@LaunchedEffect
        val text = navState.currentInstructionText ?: return@LaunchedEffect
        ttsController.speakTurnByTurn(
            instruction = text,
            distanceM = navState.distanceToNextManeuverMeters,
            segmentId = stableType,
            scale = NavigationTtsController.Scale.INDOOR,
        )
    }
    LaunchedEffect(navState.hasArrived) {
        if (!navState.hasArrived) return@LaunchedEffect
        if (voiceEnabled) {
            ttsController.resetLastSpoken()
            ttsController.speakInstruction("Đã đến nơi")
        }
        snackbarHostState.showSnackbar(
            message = "Đã đến nơi",
            duration = SnackbarDuration.Short,
        )
        viewModel.recordNavigationCompleted()
        viewModel.clearArrivalFlag()
    }

    // W2 — gợi ý lệch đường: hiện trong BottomInfoCard (không dùng snackbar đen đè card)
    // (navHint được truyền xuống BottomInfoCard)

    // W3 — gần connector: toast nhắc chọn tầng (một lần mỗi hint)
    var lastFloorHint by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(navState.floorTransitionHint) {
        val hint = navState.floorTransitionHint ?: return@LaunchedEffect
        if (hint == lastFloorHint) return@LaunchedEffect
        lastFloorHint = hint
        snackbarHostState.showSnackbar(
            message = hint,
            duration = SnackbarDuration.Short,
            withDismissAction = true,
        )
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
            // Đặt trên cùng — không đè card điều hướng phía dưới
            Box(modifier = Modifier.fillMaxSize()) {
                SnackbarHost(
                    hostState = snackbarHostState,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 100.dp, start = 12.dp, end = 12.dp),
                ) { data ->
                    Snackbar(
                        snackbarData = data,
                        shape = RoundedCornerShape(10.dp),
                        containerColor = Color(0xFFF1F3F4),
                        contentColor = Color(0xFF202124),
                        actionColor = NavBlue,
                        dismissActionContentColor = Color(0xFF5F6368),
                        actionOnNewLine = false,
                    )
                }
            }
        },
        containerColor = Color(0xFFF8F9FA),
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
                            onClick = {
                                val floor = viewModel.lastFloorFor(buildingId)
                                    .takeIf { it >= 0 }
                                    ?: emergencySession.suggestedExitFloor
                                    ?: 0
                                if (emergencySession.active) {
                                    viewModel.switchFloorDuringEmergency(floor)
                                } else {
                                    viewModel.refreshMap(buildingId, floor)
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = NavBlue),
                        ) {
                            Text(tr("Thử lại", "Retry"))
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
                    var voiceOn by remember { mutableStateOf(settingsStore.voiceGuidance) }
                    LaunchedEffect(voiceOn) {
                        voiceEnabled = voiceOn
                        settingsStore.voiceGuidance = voiceOn
                        ttsController.setEnabled(voiceOn)
                    }
                    var centerTrigger    by remember { mutableStateOf(0) }
                    var centerDestTrigger by remember { mutableStateOf(0) }
                    fun focusCameraOnDestination() {
                        centerDestTrigger++
                    }
                    // ViewModel yêu cầu snap camera về user (Start / sơ tán / đổi tầng)
                    LaunchedEffect(navState.centerOnUserRequest) {
                        if (navState.centerOnUserRequest > 0) {
                            centerTrigger++
                        }
                    }
                    // Chọn cửa ra / phòng / POI → camera nhảy tới pin đỏ (không chỉ khi bấm nút pin)
                    // Khẩn cấp: không zoom pin (thường là cầu thang/EXIT xa) — giữ follow user
                    LaunchedEffect(
                        navState.destinationNodeId,
                        navState.destinationMarkerPos,
                        navState.destinationPoiId,
                        emergencySession.active,
                    ) {
                        if (emergencySession.active) return@LaunchedEffect
                        if (navState.destinationMarkerPos != null && !navState.isNavigatingMode) {
                            focusCameraOnDestination()
                        }
                    }
                    val currentFloor = state.floorNumber
                    var showFloorSheet   by remember { mutableStateOf(false) }
                    var mapLayers by remember { mutableStateOf(MapLayerVisibility()) }
                    var showLayerPanel by remember { mutableStateOf(false) }
                    var poiFilter by remember { mutableStateOf<PoiCategory?>(null) }
                    var poiFilterNotice by remember { mutableStateOf<String?>(null) }
                    var liveShareOn by remember { mutableStateOf(false) }

                    // #10 — đang navigate + sẵn sàng đổi tầng: gợi ý sheet (preview dùng nút CTA)
                    LaunchedEffect(navState.readyForFloorSwitch, navState.isNavigatingMode) {
                        if (navState.isNavigatingMode &&
                            navState.readyForFloorSwitch &&
                            navState.suggestedTargetFloor != null
                        ) {
                            showFloorSheet = true
                        }
                    }
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

                    // Empty state: chỉ hiện khi chưa có vị trí. Key theo boolean để không reset
                    // loạn khi Offset userPos đổi từng frame (sau khi đã quét).
                    var showEmptyState by remember { mutableStateOf(false) }
                    var pendingMapPick by remember { mutableStateOf<androidx.compose.ui.geometry.Offset?>(null) }
                    /** Điểm chạm map khi mở sheet phòng/POI — dùng cho «Đặt vị trí đứng». */
                    var lastMapTapPos by remember {
                        mutableStateOf<androidx.compose.ui.geometry.Offset?>(null)
                    }
                    LaunchedEffect(navState.userPos != null, hideEmptyStateForEmergency) {
                        showEmptyState = navState.userPos == null &&
                            pendingMapPick == null &&
                            !hideEmptyStateForEmergency
                    }
                    LaunchedEffect(hideEmptyStateForEmergency) {
                        if (hideEmptyStateForEmergency) {
                            showEmptyState = false
                            pendingMapPick = null
                        }
                    }
                    LaunchedEffect(awaitingEmergencyStanding) {
                        if (awaitingEmergencyStanding) {
                            showEmptyState = false
                            pendingMapPick = null
                            // Khẩn cấp chọn lại vị trí: bỏ mọi đích chọn cũ trên UI card.
                            selectedRoomId = null
                            selectedRoomName = null
                        }
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
                    val poiDestName = (uiState as? MapUiState.Success)?.mapData?.pois
                        ?.firstOrNull { it.id == navState.destinationPoiId }
                        ?.name
                        ?.takeIf { it.isNotBlank() }
                    val currentDestinationName = when {
                        isParkingDest -> "Bãi đỗ xe"
                        !selectedRoomName.isNullOrBlank() -> selectedRoomName
                        !navState.destinationLabel.isNullOrBlank() -> navState.destinationLabel
                        !poiDestName.isNullOrBlank() -> poiDestName
                        else -> null
                    }
                    val uiFlags = com.khoaluan.indoornav.ui.navigation.computeNavigationUiFlags(
                        destinationName = currentDestinationName,
                        path = navState.path,
                        isNavigatingMode = navState.isNavigatingMode,
                    )
                    val showBottomCard = uiFlags.showBottomCard
                    val isSearchingPath = uiFlags.isSearchingPath
                    val isPathPreview = uiFlags.isPathPreview

                    // Data class dùng chung cho danh sách tìm kiếm
                    data class SearchItem(
                        val id: Int,
                        val name: String,
                        val isRoom: Boolean,
                        val floor: Int? = null,
                        /** GĐ1 POI Platform — keyword phụ: loại POI + mô tả + search_tags */
                        val keywords: List<String> = emptyList(),
                    )

                    val crossFloorRooms by viewModel.crossFloorRooms.collectAsState()
                    val crossFloorPois by viewModel.crossFloorPois.collectAsState()
                    val knownFloorsFromCache = maxOf(
                        crossFloorRooms.maxOfOrNull { it.floor }?.plus(1) ?: 0,
                        crossFloorPois.maxOfOrNull { it.floor }?.plus(1) ?: 0,
                    )

                    // Tìm kiếm: Rooms + POIs tầng hiện tại + Rooms/POIs mọi tầng khác
                    val searchItems = remember(
                        state.mapData,
                        crossFloorRooms,
                        crossFloorPois,
                        state.floorNumber,
                    ) {
                        val roomItems = state.mapData.rooms.map {
                            SearchItem(it.id, it.name, true, state.floorNumber)
                        }
                        val poiItems = state.mapData.pois.mapNotNull { poi ->
                            poi.name?.let { poiName ->
                                val category = poi.resolveCategory()
                                SearchItem(
                                    id = poi.id,
                                    name = poiName,
                                    isRoom = false,
                                    floor = state.floorNumber,
                                    keywords = buildList {
                                        add(category.labelVi)
                                        add(category.labelEn)
                                        poi.description?.takeIf { it.isNotBlank() }?.let { add(it) }
                                        poi.searchTags.orEmpty().forEach { add(it) }
                                    },
                                )
                            }
                        }
                        val otherFloorRooms = crossFloorRooms
                            .filter { it.floor != state.floorNumber }
                            .map {
                                SearchItem(
                                    id = it.room.id,
                                    name = it.room.name,
                                    isRoom = true,
                                    floor = it.floor,
                                )
                            }
                        val otherFloorPois = crossFloorPois
                            .filter { it.floor != state.floorNumber }
                            .mapNotNull { entry ->
                                val poi = entry.poi
                                val poiName = poi.name?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                                val category = poi.resolveCategory()
                                SearchItem(
                                    id = poi.id,
                                    name = poiName,
                                    isRoom = false,
                                    floor = entry.floor,
                                    keywords = buildList {
                                        add(category.labelVi)
                                        add(category.labelEn)
                                        poi.description?.takeIf { it.isNotBlank() }?.let { add(it) }
                                        poi.searchTags.orEmpty().forEach { add(it) }
                                    },
                                )
                            }
                        roomItems + poiItems + otherFloorRooms + otherFloorPois
                    }

                    // Mở ô tìm kiếm → đảm bảo đã prefetch đủ tầng
                    LaunchedEffect(isSearchActive, buildingId) {
                        if (isSearchActive) {
                            viewModel.prefetchFloorsForEmergencyUi(buildingId)
                        }
                    }

                    val filteredItems = remember(searchQuery, searchItems) {
                        if (searchQuery.isBlank()) emptyList()
                        else SearchFuzzy.filterRankedBy(
                            query = searchQuery,
                            items = searchItems,
                            nameOf = { it.name },
                            limit = 30,
                            keywordsOf = { it.keywords },
                        )
                    }

                    // Label vị trí hiện tại
                    val locale = LocalAppLocale.current
                    val scanToLocate = tr("Quét QR để xác định vị trí", "Scan QR to locate yourself")
                    val locating = tr("Đang xác định...", "Locating...")
                    val hallwayLabel = tr("Hành lang / khu vực chung", "Hallway / common area")
                    val nearPrefix = tr("Gần", "Near")
                    val currentLocationLabel = remember(
                        navState.userPos,
                        state.mapData.rooms,
                        locale,
                        scanToLocate,
                        locating,
                        hallwayLabel,
                        nearPrefix,
                    ) {
                        val pos = navState.userPos
                            ?: return@remember scanToLocate
                        val inside = state.mapData.rooms.firstOrNull { room ->
                            val left = room.x.toFloat()
                            val top = room.y.toFloat()
                            val right = left + room.width
                            val bottom = top + room.height
                            pos.x in left..right && pos.y in top..bottom
                        }
                        if (inside != null) return@remember inside.name
                        val nearest = state.mapData.rooms.minByOrNull { room ->
                            val cx = room.x + room.width / 2f
                            val cy = room.y + room.height / 2f
                            val dx = cx - pos.x
                            val dy = cy - pos.y
                            dx * dx + dy * dy
                        }
                        if (nearest == null) return@remember locating
                        val cx = nearest.x + nearest.width / 2f
                        val cy = nearest.y + nearest.height / 2f
                        val dist = kotlin.math.hypot((cx - pos.x).toDouble(), (cy - pos.y).toDouble())
                        if (dist < 120.0) {
                            "$nearPrefix ${nearest.name}"
                        } else {
                            hallwayLabel
                        }
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

                            // GĐ3 — fade khi đổi tầng
                            var floorFadeTrigger by remember { mutableFloatStateOf(1f) }
                            LaunchedEffect(state.floorNumber) {
                                // Khẩn cấp: không fade (tránh cảm giác lag/giật khi đổi tầng)
                                if (emergencySession.active) {
                                    floorFadeTrigger = 1f
                                    poiFilter = null
                                    poiFilterNotice = null
                                    return@LaunchedEffect
                                }
                                floorFadeTrigger = 0.35f
                                kotlinx.coroutines.delay(40)
                                floorFadeTrigger = 1f
                                // Đổi tầng: trả filter POI về mặc định để tránh cảm giác "mất POI".
                                poiFilter = null
                                poiFilterNotice = null
                            }
                            val floorAlpha by animateFloatAsState(
                                targetValue = floorFadeTrigger,
                                animationSpec = tween(320),
                                label = "floorAlpha",
                            )

                            androidx.compose.foundation.layout.Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .graphicsLayer { alpha = floorAlpha },
                            ) {
                                MapView(
                                    mapData = state.mapData,
                                    selectedRoomId = selectedRoomId,
                                    selectedPoiId = navState.destinationPoiId,
                                    navState = navState,
                                    mapRotationMode = mapRotationMode,
                                    centerOnUserTrigger = centerTrigger,
                                    centerOnDestinationTrigger = centerDestTrigger,
                                    layers = mapLayers,
                                    poiCategoryFilter = poiFilter,
                                    pendingPickPos = pendingMapPick,
                                    hazardZones = mapHazardZones.ifEmpty { emergencySession.hazardZones },
                                    currentFloorNumber = state.floorNumber,
                                    onMapTap = { mapPt ->
                                        if (awaitingEmergencyStanding) {
                                            showEmptyState = false
                                            pendingMapPick = null
                                            viewModel.localizeAtMapPoint(mapPt.x, mapPt.y)
                                        } else {
                                            showEmptyState = false
                                            val hitRoom = IndoorMapHitTest.findNamedRoomAt(
                                                state.mapData, mapPt.x, mapPt.y,
                                            )
                                            val hitPoi = if (hitRoom == null) {
                                                IndoorMapHitTest.findNamedPoiAt(
                                                    state.mapData, mapPt.x, mapPt.y,
                                                )
                                            } else {
                                                null
                                            }
                                            when {
                                                hitRoom != null -> {
                                                    pendingMapPick = null
                                                    lastMapTapPos = mapPt
                                                    selectedRoomId = hitRoom.id
                                                    selectedRoomName = hitRoom.name
                                                    viewModel.setDestination(hitRoom.id)
                                                    focusCameraOnDestination()
                                                    val roomName = hitRoom.name.trim()
                                                    placeCard = PlaceCardModel(
                                                        name = hitRoom.name,
                                                        kindLabel = hitRoom.type ?: "Phòng",
                                                        description = hitRoom.description,
                                                        rating = hitRoom.rating,
                                                        ratingCount = hitRoom.ratingCount,
                                                        openingHours = hitRoom.openingHours,
                                                        entityKind = if (roomName.isNotEmpty()) "ROOM" else null,
                                                        entityId = if (roomName.isNotEmpty()) {
                                                            hitRoom.id.toString()
                                                        } else {
                                                            null
                                                        },
                                                        floorNumber = state.floorNumber,
                                                    )
                                                    if (roomName.isNotEmpty()) {
                                                        viewModel.loadIndoorTarget(
                                                            buildingId = state.buildingId,
                                                            floorNumber = state.floorNumber,
                                                            entityKind = "ROOM",
                                                            entityId = hitRoom.id.toString(),
                                                            entityName = roomName,
                                                        )
                                                    } else {
                                                        viewModel.clearIndoorTarget()
                                                    }
                                                    showPlaceSheet = true
                                                    isSearchActive = false
                                                }
                                                hitPoi != null -> {
                                                    pendingMapPick = null
                                                    lastMapTapPos = mapPt
                                                    selectedRoomId = null
                                                    val poiName = hitPoi.name?.trim().orEmpty()
                                                    selectedRoomName = poiName.ifBlank { "POI" }
                                                    viewModel.setDestinationPoi(hitPoi.id)
                                                    focusCameraOnDestination()
                                                    placeCard = PlaceCardModel(
                                                        name = poiName.ifBlank { "POI" },
                                                        kindLabel = hitPoi.type
                                                            ?: hitPoi.poiType
                                                            ?: "Tiện ích",
                                                        description = hitPoi.description,
                                                        rating = null,
                                                        ratingCount = null,
                                                        openingHours = null,
                                                        entityKind = if (poiName.isNotEmpty()) "POI" else null,
                                                        entityId = if (poiName.isNotEmpty()) {
                                                            hitPoi.id.toString()
                                                        } else {
                                                            null
                                                        },
                                                        floorNumber = state.floorNumber,
                                                    )
                                                    if (poiName.isNotEmpty()) {
                                                        viewModel.loadIndoorTarget(
                                                            buildingId = state.buildingId,
                                                            floorNumber = state.floorNumber,
                                                            entityKind = "POI",
                                                            entityId = hitPoi.id.toString(),
                                                            entityName = poiName,
                                                        )
                                                    } else {
                                                        viewModel.clearIndoorTarget()
                                                    }
                                                    showPlaceSheet = true
                                                    isSearchActive = false
                                                }
                                                else -> {
                                                    lastMapTapPos = null
                                                    pendingMapPick = mapPt
                                                }
                                            }
                                        }
                                    },
                                )
                            }

                            if (mapHazardZones.any { z ->
                                    z.points.size >= 3 &&
                                        (z.floorNumber ?: 0) == state.floorNumber
                                }
                            ) {
                                Text(
                                    text = "⚠ Vùng nguy hiểm (tô đỏ) — tránh khu vực này",
                                    modifier = Modifier
                                        .align(Alignment.TopCenter)
                                        .padding(top = 8.dp, start = 12.dp, end = 12.dp)
                                        .background(Color(0xE0B91C1C), RoundedCornerShape(8.dp))
                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }

                            // GĐ3 — banner gợi ý đổi tầng (chỉ khi đang điều hướng; dưới hàng chip)
                            if (navState.isNavigatingMode) {
                                navState.floorTransitionHint?.takeIf { it.isNotBlank() }?.let { hint ->
                                    val canTapSwitch = navState.suggestedTargetFloor != null ||
                                        navState.readyForFloorSwitch
                                    Text(
                                        text = hint,
                                        modifier = Modifier
                                            .align(Alignment.TopCenter)
                                            .padding(top = 112.dp, start = 16.dp, end = 16.dp)
                                            .background(Color(0xE01A73E8), RoundedCornerShape(10.dp))
                                            .then(
                                                if (canTapSwitch) {
                                                    Modifier.clickable {
                                                        viewModel.switchToSuggestedFloor()
                                                        mapScope.launch {
                                                            val f = navState.suggestedTargetFloor
                                                            val label = when (f) {
                                                                null -> "tầng đích"
                                                                0 -> "GF"
                                                                else -> "tầng $f"
                                                            }
                                                            snackbarHostState.showSnackbar(
                                                                message = "Đã chuyển $label — neo cầu thang rồi chỉ đường tiếp",
                                                                duration = SnackbarDuration.Short,
                                                            )
                                                        }
                                                    }
                                                } else {
                                                    Modifier
                                                },
                                            )
                                            .padding(horizontal = 14.dp, vertical = 10.dp),
                                        color = Color.White,
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Medium,
                                    )
                                }
                            }

                            // #9 Layer toggle — chips POI đặt sau search bar (không bị che touch)
                            FloatingActionButton(
                                onClick = { showLayerPanel = !showLayerPanel },
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(top = 100.dp, end = 12.dp)
                                    .size(40.dp),
                                containerColor = Color.White,
                                contentColor = NavBlue,
                                elevation = FloatingActionButtonDefaults.elevation(4.dp),
                            ) {
                                Text(tr("Lớp", "Layers"), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = NavBlue)
                            }
                            if (showLayerPanel) {
                                MapLayerPanel(
                                    layers = mapLayers,
                                    onChange = { mapLayers = it },
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .padding(top = 148.dp, end = 12.dp)
                                        .width(168.dp),
                                )
                            }

                            // UX fix 1: EmptyStateOverlay — ẩn toàn bộ khi khẩn cấp
                            EmptyStateOverlay(
                                visible = showEmptyState &&
                                    !suppressEmptyState &&
                                    !hideEmptyStateForEmergency &&
                                    pendingMapPick == null,
                                onQrScan = {
                                    showEmptyState = false
                                    onScanQR()
                                },
                                onDismiss = { showEmptyState = false },
                            )

                            // Chạm map → hỏi: đặt vị trí đứng hay đi đến đây
                            val pick = pendingMapPick
                            if (pick != null) {
                                val pickedPointLabel = tr("Điểm đã chọn", "Selected point")
                                AlertDialog(
                                    onDismissRequest = { pendingMapPick = null },
                                    title = {
                                        Text(tr("Bạn muốn gì?", "What do you want?"))
                                    },
                                    text = {
                                        Text(
                                            tr(
                                                "Đặt làm vị trí đang đứng, hoặc đi đến điểm này.",
                                                "Set as your standing spot, or navigate here.",
                                            )
                                        )
                                    },
                                    confirmButton = {
                                        TextButton(
                                            onClick = {
                                                viewModel.localizeAtMapPoint(pick.x, pick.y)
                                                pendingMapPick = null
                                            }
                                        ) {
                                            Text(tr("Đặt vị trí đứng", "Set my location"))
                                        }
                                    },
                                    dismissButton = {
                                        Row {
                                            TextButton(
                                                onClick = {
                                                    viewModel.setDestinationAtMapPoint(pick.x, pick.y)
                                                    focusCameraOnDestination()
                                                    selectedRoomId = null
                                                    selectedRoomName = pickedPointLabel
                                                    pendingMapPick = null
                                                }
                                            ) {
                                                Text(tr("Đi đến đây", "Go here"))
                                            }
                                            TextButton(onClick = { pendingMapPick = null }) {
                                                Text(tr("Hủy", "Cancel"))
                                            }
                                        }
                                    },
                                )
                            }

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
                                placeholder = { Text(tr("Tìm phòng...", "Find room...")) },
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
                                                    text = if (voiceOn) {
                                                        tr("Giọng bật", "Voice on")
                                                    } else {
                                                        tr("Giọng tắt", "Voice off")
                                                    },
                                                    color = NavBlue,
                                                    fontSize = 12.sp,
                                                )
                                            }
                                            // Tạm ẩn Chia sẻ / Lưu (bật lại khi cần: đổi false → true)
                                            if (false) {
                                                TextButton(onClick = {
                                                    liveShareOn = !liveShareOn
                                                    if (liveShareOn) {
                                                        clipboard.setText(AnnotatedString(shareSessionId))
                                                        val shareMsg = trStatic(
                                                            "Chia sẻ bật · mã $shareSessionId (đã copy)",
                                                            "Sharing on · code $shareSessionId (copied)",
                                                        )
                                                        mapScope.launch {
                                                            snackbarHostState.showSnackbar(shareMsg)
                                                        }
                                                    }
                                                }) {
                                                    Text(
                                                        text = if (liveShareOn) {
                                                            tr("Chia sẻ ${livePeers.size}", "Share ${livePeers.size}")
                                                        } else {
                                                            tr("Chia sẻ", "Share")
                                                        },
                                                        color = if (liveShareOn) Color(0xFF10B981) else NavBlue,
                                                        fontSize = 12.sp,
                                                    )
                                                }
                                            }
                                            TextButton(onClick = { showFloorSheet = true }) {
                                                if (emergencySession.active) {
                                                    viewModel.prefetchFloorsForEmergencyUi(buildingId)
                                                }
                                                Text(
                                                    text = if (currentFloor == 0) "GF ▼" else "${currentFloor}F ▼",
                                                    color = NavBlue,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 13.sp
                                                )
                                            }
                                            if (false) {
                                                TextButton(
                                                    onClick = {
                                                        val store = com.khoaluan.indoornav.data.local.IndoorFavoritesStore(context)
                                                        val floors = viewModel.getTotalFloorsForBuilding(buildingId)
                                                        store.save(
                                                            com.khoaluan.indoornav.data.local.IndoorFavoritesStore.SavedIndoor(
                                                                buildingId = buildingId,
                                                                name = "Indoor $buildingId",
                                                                totalFloors = floors,
                                                            ),
                                                        )
                                                        mapScope.launch {
                                                            snackbarHostState.showSnackbar("Đã lưu Indoor vào Favorites")
                                                        }
                                                    },
                                                ) {
                                                    Text(tr("Lưu", "Save"), color = Color(0xFFE91E63), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                                }
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
                                                lastMapTapPos = null
                                                if (item.isRoom) {
                                                    selectedRoomId = item.id
                                                    val destFloor = item.floor ?: state.floorNumber
                                                    if (destFloor != state.floorNumber) {
                                                        viewModel.setDestinationOnFloor(destFloor, item.id)
                                                    } else {
                                                        viewModel.setDestination(item.id)
                                                    }
                                                    focusCameraOnDestination()
                                                    val room = if (destFloor == state.floorNumber) {
                                                        state.mapData.rooms.find { it.id == item.id }
                                                    } else {
                                                        crossFloorRooms.find {
                                                            it.floor == destFloor && it.room.id == item.id
                                                        }?.room
                                                    }
                                                    val roomName = item.name.trim()
                                                    placeCard = PlaceCardModel(
                                                        name = item.name,
                                                        kindLabel = room?.type ?: "Phòng",
                                                        description = room?.description,
                                                        rating = room?.rating,
                                                        ratingCount = room?.ratingCount,
                                                        openingHours = room?.openingHours,
                                                        entityKind = if (roomName.isNotEmpty()) "ROOM" else null,
                                                        entityId = if (roomName.isNotEmpty()) item.id.toString() else null,
                                                        floorNumber = destFloor,
                                                    )
                                                    if (roomName.isNotEmpty()) {
                                                        viewModel.loadIndoorTarget(
                                                            buildingId = state.buildingId,
                                                            floorNumber = destFloor,
                                                            entityKind = "ROOM",
                                                            entityId = item.id.toString(),
                                                            entityName = roomName,
                                                        )
                                                    } else {
                                                        viewModel.clearIndoorTarget()
                                                    }
                                                } else {
                                                    selectedRoomId = null
                                                    val destFloor = item.floor ?: state.floorNumber
                                                    if (destFloor != state.floorNumber) {
                                                        viewModel.setDestinationPoiOnFloor(destFloor, item.id)
                                                    } else {
                                                        viewModel.setDestinationPoi(item.id)
                                                    }
                                                    focusCameraOnDestination()
                                                    val poi = if (destFloor == state.floorNumber) {
                                                        state.mapData.pois.find { it.id == item.id }
                                                    } else {
                                                        crossFloorPois.find {
                                                            it.floor == destFloor && it.poi.id == item.id
                                                        }?.poi
                                                    }
                                                    val poiName = item.name.trim()
                                                    placeCard = PlaceCardModel(
                                                        name = item.name,
                                                        kindLabel = poi?.type ?: poi?.poiType ?: "Tiện ích",
                                                        description = null,
                                                        rating = null,
                                                        ratingCount = null,
                                                        openingHours = null,
                                                        entityKind = if (poiName.isNotEmpty()) "POI" else null,
                                                        entityId = if (poiName.isNotEmpty()) item.id.toString() else null,
                                                        floorNumber = destFloor,
                                                    )
                                                    if (poiName.isNotEmpty()) {
                                                        viewModel.loadIndoorTarget(
                                                            buildingId = state.buildingId,
                                                            floorNumber = destFloor,
                                                            entityKind = "POI",
                                                            entityId = item.id.toString(),
                                                            entityName = poiName,
                                                        )
                                                    } else {
                                                        viewModel.clearIndoorTarget()
                                                    }
                                                }
                                                showPlaceSheet = true
                                                isSearchActive   = false
                                                showEmptyState   = false
                                            },
                                        )
                                    }
                                }
                            }

                            // Chip lọc POI — ẩn khi đang search (tránh đè kết quả tìm)
                            if (!isSearchActive) {
                                Column(
                                    modifier = Modifier
                                        .align(Alignment.TopCenter)
                                        .padding(top = 64.dp)
                                        .fillMaxWidth()
                                        .zIndex(10f),
                                ) {
                                    PoiFilterChips(
                                        selected = poiFilter,
                                        onSelect = { cat ->
                                            poiFilter = cat
                                            isSearchActive = false
                                            if (cat != null) {
                                                val n = state.mapData.pois.count {
                                                    it.resolveCategory().matchesFilter(cat)
                                                }
                                                poiFilterNotice = if (n == 0) {
                                                    trStatic(
                                                        "Không có ${cat.labelVi} trên tầng này",
                                                        "No ${cat.labelEn} on this floor",
                                                    )
                                                } else {
                                                    trStatic(
                                                        "Có $n ${cat.labelVi} — chọn bên dưới để chỉ đường",
                                                        "$n ${cat.labelEn} — pick below for directions",
                                                    )
                                                }
                                            } else {
                                                poiFilterNotice = null
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                    poiFilterNotice?.let { notice ->
                                        LaunchedEffect(notice) {
                                            kotlinx.coroutines.delay(2200)
                                            if (poiFilterNotice == notice) poiFilterNotice = null
                                        }
                                        Surface(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 12.dp, vertical = 4.dp),
                                            shape = RoundedCornerShape(10.dp),
                                            color = Color(0xFFF1F3F4),
                                            shadowElevation = 0.dp,
                                        ) {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(start = 12.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                Text(
                                                    text = notice,
                                                    modifier = Modifier.weight(1f),
                                                    fontSize = 12.sp,
                                                    color = Color(0xFF3C4043),
                                                )
                                                IconButton(
                                                    onClick = { poiFilterNotice = null },
                                                    modifier = Modifier.size(28.dp),
                                                ) {
                                                    Icon(
                                                        Icons.Default.Close,
                                                        contentDescription = tr("Đóng", "Dismiss"),
                                                        tint = Color(0xFF5F6368),
                                                        modifier = Modifier.size(16.dp),
                                                    )
                                                }
                                            }
                                        }
                                    }
                                    val filterCat = poiFilter
                                    if (filterCat != null) {
                                        val matches = remember(state.mapData.pois, filterCat, state.floorNumber) {
                                            state.mapData.pois.filter {
                                                it.resolveCategory().matchesFilter(filterCat)
                                            }
                                        }
                                        if (matches.isNotEmpty()) {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .horizontalScroll(rememberScrollState())
                                                    .padding(horizontal = 8.dp, vertical = 4.dp),
                                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                            ) {
                                                matches.forEach { poi ->
                                                    val title = poi.name?.takeIf { it.isNotBlank() }
                                                        ?: filterCat.label
                                                    AssistChip(
                                                        onClick = {
                                                            selectedRoomName = title
                                                            selectedRoomId = null
                                                            viewModel.setDestinationPoi(poi.id)
                                                            focusCameraOnDestination()
                                                            showEmptyState = false
                                                            isSearchActive = false
                                                            poiFilterNotice = null
                                                        },
                                                        label = {
                                                            Text(
                                                                "${filterCat.emoji} $title",
                                                                maxLines = 1,
                                                            )
                                                        },
                                                        colors = AssistChipDefaults.assistChipColors(
                                                            containerColor = Color.White,
                                                            labelColor = Color(0xFF202124),
                                                        ),
                                                        border = AssistChipDefaults.assistChipBorder(
                                                            enabled = true,
                                                            borderColor = Color(0xFFDADCE0),
                                                        ),
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // Debug TPF đã tắt — nhãn đen TopStart đè lên chip 「Tất cả」.

                            // Banner nhiễu từ trường đã ẩn theo yêu cầu UX (xử lý nhiễu vẫn chạy nền).

                            // Cột phải: Dest focus / Crosshair / QR / La bàn (la bàn dưới QR)
                            var showHeadingDebug by remember { mutableStateOf(false) }
                            var headingMotionLogActive by remember { mutableStateOf(false) }
                            Column(
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .padding(end = 16.dp, bottom = 16.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                val hasDestination = navState.destinationMarkerPos != null ||
                                    (navState.path?.isNotEmpty() == true)
                                if (hasDestination) {
                                    DestinationFocusButton(onClick = { centerDestTrigger++ })
                                }
                                if (navState.userPos != null) {
                                    CrosshairButton(onClick = { centerTrigger++ })
                                }
                                if (!showBottomCard) {
                                    FloatingActionButton(
                                        onClick = onScanQR,
                                        shape = CircleShape,
                                        containerColor = NavBlue,
                                        contentColor = Color.White,
                                        elevation = FloatingActionButtonDefaults.elevation(6.dp),
                                    ) {
                                        Icon(
                                            imageVector = QrScanIcon,
                                            contentDescription = tr("Quét QR", "Scan QR"),
                                        )
                                    }
                                }
                                CompassButton(
                                    // Kim N = Bắc địa lý (device), không phải map heading tương đối
                                    rotation = viewModel.compassNeedleRotationDeg(),
                                    mapRotationMode = mapRotationMode,
                                    magneticInterference = navState.magneticInterference,
                                    onClick = { viewModel.toggleMapRotationMode() },
                                    onLongClick = { showHeadingDebug = !showHeadingDebug },
                                )
                            }

                            // Căn Bắc cơ bản — long-press la bàn; ghi số ổn định vào map_bearing_offset
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
                                    gridDebugText = viewModel.headingGridDebugSummary(),
                                    gridDeltaHereDeg = viewModel.currentGridHeadingDeltaDeg(),
                                    onResetGrid = { viewModel.resetHeadingCorrectionGrid() },
                                    motionLogActive = headingMotionLogActive,
                                    onToggleMotionLog = {
                                        val wasActive = headingMotionLogActive
                                        val path = viewModel.toggleHeadingMotionLog()
                                        headingMotionLogActive = viewModel.isHeadingMotionLogging()
                                        val msg = when {
                                            !wasActive && path != null ->
                                                "Đang ghi: …/heading_logs/\nXoay thử rồi bấm Dừng ghi"
                                            wasActive && path != null ->
                                                "Đã lưu: $path"
                                            else -> "Không ghi được file heading"
                                        }
                                        android.widget.Toast.makeText(
                                            context,
                                            msg,
                                            android.widget.Toast.LENGTH_LONG,
                                        ).show()
                                    },
                                    modifier = Modifier
                                        .align(Alignment.TopCenter)
                                        .padding(top = 72.dp),
                                )
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
                                        text = { Text(tr("Lưu xe", "Save car")) },
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
                                            text = { Text(tr("Tìm xe", "Find car")) },
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
                                            Icon(Icons.Default.Close, contentDescription = tr("Xóa điểm đỗ", "Clear parking"))
                                        }
                                    }
                                }
                            }
                        }

                        // ── BOTTOM INFO CARD (overlay, không đẩy layout MapView) ────────────────────────
                        AnimatedVisibility(
                            visible = showBottomCard,
                            modifier = Modifier.align(Alignment.BottomCenter),
                            enter = slideInVertically { it },
                            exit  = slideOutVertically { it },
                        ) {
                            BottomInfoCard(
                                currentLocation   = currentLocationLabel,
                                destination       = currentDestinationName
                                    ?: if (navState.isNavigatingMode) "Đích đã chọn" else "Đang tải...",
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
                                suggestedFloorLabel = navState.suggestedTargetFloor?.let { f ->
                                    if (f == 0) "tầng GF" else "tầng $f"
                                },
                                onSwitchSuggestedFloor = if (navState.readyForFloorSwitch || navState.suggestedTargetFloor != null) {
                                    {
                                        viewModel.switchToSuggestedFloor()
                                        mapScope.launch {
                                            val f = navState.suggestedTargetFloor
                                            val label = when (f) {
                                                null -> "tầng đích"
                                                0 -> "GF"
                                                else -> "tầng $f"
                                            }
                                            snackbarHostState.showSnackbar(
                                                message = "Đã chuyển $label — neo cầu thang rồi chỉ đường tiếp",
                                                duration = SnackbarDuration.Short,
                                            )
                                        }
                                    }
                                } else null,
                                onQrScan          = onScanQR,
                                onPreviewPath     = { viewModel.previewPath() },
                                onStartNavigation = {
                                    viewModel.startNavigationMode()
                                    centerTrigger++
                                },
                                onStopNavigation  = {
                                    // X: đóng chế độ xem đường / hủy đích
                                    viewModel.clearDestination()
                                    selectedRoomId   = null
                                    selectedRoomName = null
                                },
                                onRecalculate = if (navState.destinationNodeId != null) {
                                    { viewModel.recalculateRoute() }
                                } else null,
                                showRelocalize = navState.userPos != null || navState.startAnchorPos != null,
                                onRelocalize = {
                                    viewModel.requestRelocalization()
                                },
                                hintMessage = navState.navHint,
                                onDismissHint = { viewModel.clearNavHint() },
                            )
                        }
                    }

                    // UX fix 2: FloorSelectorSheet
                    if (showFloorSheet) {
                        LaunchedEffect(buildingId, showFloorSheet) {
                            viewModel.prefetchFloorsForEmergencyUi(buildingId)
                        }
                        val totalFloorsForSheet = maxOf(
                            viewModel.getTotalFloorsForBuilding(buildingId),
                            knownFloorsFromCache,
                            currentFloor + 1,
                            1,
                        )
                        FloorSelectorSheet(
                            currentFloor = currentFloor,
                            totalFloors = totalFloorsForSheet,
                            lastVisitedFloor = viewModel.lastFloorFor(buildingId),
                            onFloorSelected = { floor ->
                                val preserve = navState.suggestedTargetFloor == floor ||
                                    navState.pendingDestFloor == floor
                                when {
                                    emergencySession.active ->
                                        viewModel.switchFloorDuringEmergency(floor)
                                    preserve ->
                                        viewModel.switchToSuggestedFloor()
                                    else ->
                                        viewModel.refreshMap(buildingId, floor)
                                }
                                showFloorSheet = false
                                mapScope.launch {
                                    val floorLabel = if (floor == 0) "GF" else "$floor"
                                    val msg = when {
                                        emergencySession.active ->
                                            "Đã chuyển tầng $floorLabel — neo cầu thang rồi chỉ đường thoát hiểm"
                                        preserve ->
                                            "Đã chuyển tầng $floorLabel — neo cầu thang rồi chỉ đường tiếp"
                                        else -> "Đã chuyển tầng $floorLabel."
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
                        val standingTap = lastMapTapPos
                        PlaceDetailSheet(
                            place = placeCardValue,
                            summary = indoorTarget,
                            reviews = indoorReviews,
                            notice = placeNotice,
                            isLoggedIn = isLoggedIn,
                            onPreviewPath = {
                                showPlaceSheet = false
                                viewModel.previewPath()
                            },
                            onStartNavigation = {
                                showPlaceSheet = false
                                viewModel.previewPath()
                                viewModel.startNavigationMode()
                                centerTrigger++
                            },
                            onDismiss = {
                                showPlaceSheet = false
                                lastMapTapPos = null
                                viewModel.clearIndoorTarget()
                                viewModel.clearPlaceNotice()
                            },
                            onToggleFavorite = {
                                val kind = placeCardValue.entityKind ?: return@PlaceDetailSheet
                                val eid = placeCardValue.entityId ?: return@PlaceDetailSheet
                                val floor = placeCardValue.floorNumber ?: state.floorNumber
                                viewModel.toggleIndoorFavorite(
                                    buildingId = state.buildingId,
                                    floorNumber = floor,
                                    entityKind = kind,
                                    entityId = eid,
                                    currentlyFavorite = indoorTarget?.isFavorite == true,
                                    entityName = placeCardValue.name,
                                )
                            },
                            onRate = { stars ->
                                indoorReviewStars = stars
                                showIndoorReviewDialog = true
                            },
                            onReport = { showIndoorReportDialog = true },
                            onLoginRequired = { viewModel.requireAuth() },
                            onSetStandingLocation = standingTap?.let { tap ->
                                {
                                    viewModel.localizeAtMapPoint(tap.x, tap.y)
                                    showPlaceSheet = false
                                    lastMapTapPos = null
                                    viewModel.clearIndoorTarget()
                                    viewModel.clearPlaceNotice()
                                }
                            },
                        )
                    }

                    if (showIndoorReviewDialog && placeCard != null) {
                        var comment by remember(showIndoorReviewDialog) { mutableStateOf("") }
                        var rating by remember(showIndoorReviewDialog, indoorReviewStars) {
                            mutableStateOf(indoorReviewStars.coerceIn(1, 5))
                        }
                        AlertDialog(
                            onDismissRequest = { showIndoorReviewDialog = false },
                            title = { Text(tr("Đánh giá phòng", "Rate this place")) },
                            text = {
                                Column {
                                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        (1..5).forEach { n ->
                                            Text(
                                                text = if (n <= rating) "★" else "☆",
                                                fontSize = 28.sp,
                                                color = Color(0xFFF9AB00),
                                                modifier = Modifier
                                                    .clickable { rating = n }
                                                    .padding(2.dp),
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(8.dp))
                                    OutlinedTextField(
                                        value = comment,
                                        onValueChange = { comment = it.take(2000) },
                                        label = {
                                            Text(tr("Nhận xét (tuỳ chọn)", "Comment (optional)"))
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                        minLines = 2,
                                    )
                                }
                            },
                            confirmButton = {
                                TextButton(onClick = {
                                    val card = placeCard ?: return@TextButton
                                    val kind = card.entityKind ?: return@TextButton
                                    val eid = card.entityId ?: return@TextButton
                                    viewModel.submitIndoorReview(
                                        buildingId = state.buildingId,
                                        floorNumber = card.floorNumber ?: state.floorNumber,
                                        entityKind = kind,
                                        entityId = eid,
                                        rating = rating,
                                        comment = comment.trim().ifBlank { null },
                                        entityName = card.name,
                                    )
                                    showIndoorReviewDialog = false
                                }) { Text(tr("Gửi", "Submit")) }
                            },
                            dismissButton = {
                                TextButton(onClick = { showIndoorReviewDialog = false }) {
                                    Text(tr("Hủy", "Cancel"))
                                }
                            },
                        )
                    }

                    if (showIndoorReportDialog && placeCard != null) {
                        val reportReasons = listOf(
                            "WRONG_LOCATION" to tr("Sai vị trí", "Wrong location"),
                            "WRONG_NAME" to tr("Sai tên", "Wrong name"),
                            "WRONG_FLOOR" to tr("Sai tầng", "Wrong floor"),
                            "ROUTE_ERROR" to tr("Đường đi lỗi", "Route error"),
                            "SPAM" to tr("Nội dung rác", "Spam"),
                            "OTHER" to tr("Khác", "Other"),
                        )
                        AlertDialog(
                            onDismissRequest = { showIndoorReportDialog = false },
                            title = { Text(tr("Báo cáo phòng", "Report place")) },
                            text = { Text(tr("Chọn lý do báo cáo", "Choose a reason")) },
                            confirmButton = {
                                Column {
                                    reportReasons.forEach { (code, label) ->
                                        TextButton(onClick = {
                                            val card = placeCard ?: return@TextButton
                                            val kind = card.entityKind ?: return@TextButton
                                            val eid = card.entityId ?: return@TextButton
                                            viewModel.submitIndoorReport(
                                                buildingId = state.buildingId,
                                                floorNumber = card.floorNumber ?: state.floorNumber,
                                                entityKind = kind,
                                                entityId = eid,
                                                reasonCode = code,
                                                entityName = card.name,
                                            )
                                            showIndoorReportDialog = false
                                        }) { Text(label) }
                                    }
                                }
                            },
                            dismissButton = {
                                TextButton(onClick = { showIndoorReportDialog = false }) {
                                    Text(tr("Hủy", "Cancel"))
                                }
                            },
                        )
                    }

                    // ── DIALOGS ───────────────────────────────────────────────────
                    if (showLowConfidenceDialog) {
                        AlertDialog(
                            onDismissRequest = { showLowConfidenceDialog = false },
                            title = { Text(tr("Cảnh báo độ chính xác", "Accuracy warning")) },
                            text = {
                                Text(
                                    tr(
                                        "Độ chính xác hiện tại đang thấp. Vị trí xe có thể bị lệch vài mét so với thực tế do cảm biến trôi dạt.\nBạn vẫn muốn lưu vị trí này?",
                                        "Current accuracy is low. The car position may be off by a few meters due to sensor drift.\nSave this position anyway?",
                                    ),
                                )
                            },
                            confirmButton = {
                                TextButton(onClick = {
                                    showLowConfidenceDialog = false
                                    showNoteDialog = true
                                }) { Text(tr("Tiếp tục lưu", "Save anyway")) }
                            },
                            dismissButton = {
                                TextButton(onClick = { showLowConfidenceDialog = false }) {
                                    Text(tr("Hủy", "Cancel"))
                                }
                            },
                        )
                    }

                    if (showNoteDialog) {
                        AlertDialog(
                            onDismissRequest = { showNoteDialog = false },
                            title = { Text(tr("Ghi chú vị trí xe", "Car location note")) },
                            text = {
                                OutlinedTextField(
                                    value = parkingNote,
                                    onValueChange = { parkingNote = it },
                                    label = {
                                        Text(
                                            tr(
                                                "Ví dụ: Cạnh thang máy cuốn, Cột C3...",
                                                "E.g. Near escalator, Column C3...",
                                            ),
                                        )
                                    },
                                    singleLine = true,
                                )
                            },
                            confirmButton = {
                                Button(onClick = {
                                    viewModel.saveParkingPosition(parkingNote.takeIf { it.isNotBlank() })
                                    showNoteDialog = false
                                    parkingNote = ""
                                }) { Text(tr("Lưu lại", "Save")) }
                            },
                            dismissButton = {
                                TextButton(onClick = { showNoteDialog = false }) {
                                    Text(tr("Bỏ qua ghi chú", "Skip note"))
                                }
                            },
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
                IconButton(
                    onClick = {
                        if (emergencySession.active) {
                            showExitEmergencyConfirm = true
                        } else {
                            onBack()
                        }
                    },
                ) {
                    Icon(
                        Icons.Default.ArrowBack,
                        contentDescription = tr("Quay lại", "Back"),
                        tint = Color(0xFF424242),
                        modifier = Modifier.size(20.dp),
                    )
                }
            }

            if (showExitEmergencyConfirm) {
                AlertDialog(
                    onDismissRequest = { showExitEmergencyConfirm = false },
                    title = { Text("Thoát sơ tán?") },
                    text = {
                        Text("Bạn đang trong chế độ khẩn cấp. Thoát sẽ về danh sách tòa và dừng chỉ đường thoát hiểm.")
                    },
                    confirmButton = {
                        TextButton(
                            onClick = {
                                showExitEmergencyConfirm = false
                                viewModel.dismissEmergency()
                                onBack()
                            },
                        ) { Text("Thoát map") }
                    },
                    dismissButton = {
                        TextButton(onClick = { showExitEmergencyConfirm = false }) {
                            Text("Ở lại")
                        }
                    },
                )
            }
        }
    }
}
