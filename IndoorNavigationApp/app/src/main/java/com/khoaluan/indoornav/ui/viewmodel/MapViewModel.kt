package com.khoaluan.indoornav.ui.viewmodel
// MapViewModel.kt
// MUC DICH: Quan ly toan bo trang thai UI va logic cua man hinh ban do
// Ket noi voi:
//   - ApiService.kt: goi REST API de lay du lieu ban do, QR, buildings
//   - LocationEngine.kt (TPF): quan ly dinh vi PDR + Particle Filter
//   - GraphModel + AStarPathfinder: tinh duong di ngan nhat
//   - MapScreen.kt: UI doc state tu ViewModel qua collectAsState()
//   - ParkingManager: luu/tim vi tri xe da do
import android.app.Application
import android.util.Log
import androidx.compose.ui.geometry.Offset
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.sanitized
import com.khoaluan.indoornav.navigation.graph.AStarPathfinder
import com.khoaluan.indoornav.navigation.graph.GraphEdge
import com.khoaluan.indoornav.navigation.graph.GraphModel
import com.khoaluan.indoornav.navigation.graph.MultiFloorPathPlanner
import com.khoaluan.indoornav.navigation.instruction.FloorTransitionDetector
import com.khoaluan.indoornav.navigation.instruction.TurnByTurnEngine
import com.khoaluan.indoornav.navigation.pdr.PositionConfidenceEngine
import com.khoaluan.indoornav.navigation.tpf.LocationEngine
import com.khoaluan.indoornav.navigation.tpf.TopologicalParticle
import com.khoaluan.indoornav.data.local.MapCacheManager
import com.khoaluan.indoornav.data.local.ParkingManager
import com.khoaluan.indoornav.data.model.Room
import com.khoaluan.indoornav.data.model.SavedParkingSpot
import com.khoaluan.indoornav.ui.navigation.buildMapSessionKey
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
// Trang thai UI cua ban do - 3 trang thai: Loading / Success / Error
// Success.floorNumber: so tang hien tai, dung de sync currentFloor trong MapScreen
sealed interface MapUiState {
    object Loading : MapUiState
    data class Success(val mapData: MapData, val buildingId: String, val floorNumber: Int) : MapUiState
    data class Error(val message: String) : MapUiState
}
enum class MapRotationMode {
    NORTH_UP,
    HEADING_UP
}
data class NavigationState(
    val userPos: Offset? = null,
    val userHeading: Float = 0f,
    val path: List<Offset>? = null,
    val confidence: Float = 0f,
    val isTpfActive: Boolean = false,
    val particles: List<com.khoaluan.indoornav.navigation.tpf.TopologicalParticle> = emptyList(),
    val destinationNodeId: String? = null,
    val totalDistanceMeters: Float = 0f,
    val etaSeconds: Int = 0,
    val rerouteCount: Int = 0,
    val isRerouting: Boolean = false,
    val isNavigatingMode: Boolean = false,
    val destinationPoiId: Int? = null,
    /** Pin đích khi đã chọn phòng/POI nhưng chưa bấm "Xem đường" (G1). */
    val destinationMarkerPos: Offset? = null,
    val navigationError: String? = null,
    val rerouteSourceNodeId: String? = null,
    /** W1 — câu chỉ dẫn text hiện tại (null khi chưa navigate / chưa có path). */
    val currentInstructionText: String? = null,
    /** Mét còn lại tới manoeuvre tiếp theo. */
    val distanceToNextManeuverMeters: Float = 0f,
    /** Mét còn lại tới đích (ước lượng dọc path). */
    val remainingDistanceMeters: Float = 0f,
    /** Tiến độ route 0f–1f (không phải TPF confidence). */
    val routeProgress: Float = 0f,
    /** W2 — vừa đến đích (UI hiện snackbar rồi clear). */
    val hasArrived: Boolean = false,
    /** W2 — gợi ý khi lệch đường nặng / cần re-anchor. */
    val navHint: String? = null,
    /** W3 — true khi path có cầu thang/thang máy (hiện badge / mở sheet tầng). */
    val pathHasFloorConnector: Boolean = false,
    /** W3 — gợi ý đổi tầng (override instruction tạm khi gần connector). */
    val floorTransitionHint: String? = null,
    /** W3 — gợi ý đổi sang tầng này (path đang tới connector). */
    val suggestedTargetFloor: Int? = null,
    /** W3 — đích cuối cùng trên tầng khác (sau khi đổi tầng tiếp tục A*). */
    val pendingDestFloor: Int? = null,
    val pendingDestNodeId: String? = null,
)
sealed interface BuildingListUiState {
    object Loading : BuildingListUiState
    data class Success(val buildings: List<com.khoaluan.indoornav.data.model.Building>) : BuildingListUiState
    data class Error(val message: String) : BuildingListUiState
}

/** GĐ8 — danh sách Place Registry (có/không indoor). */
sealed interface PlaceListUiState {
    object Idle : PlaceListUiState
    object Loading : PlaceListUiState
    data class Success(val places: List<com.khoaluan.indoornav.data.api.PlaceDto>) : PlaceListUiState
    data class Error(val message: String) : PlaceListUiState
    /** Place tồn tại nhưng chưa có Indoor Workspace publish. */
    data class NoIndoor(val placeName: String, val placeId: String) : PlaceListUiState
}
data class MapCameraState(
    val scale: Float = 1f,
    val offset: Offset = Offset.Zero,
    val isAutoFollow: Boolean = false
)
class MapViewModel(application: Application) : AndroidViewModel(application) {
    private val context = application.applicationContext
    // LocationEngine: bo dinh vi PDR + TPF (nhan du lieu cam bien, tinh toa do)
    private var locationEngine: LocationEngine? = null
    // GraphModel: do thi duong di duoc tao tu MapData (nodes + edges)
    private var graphModel: GraphModel? = null
    // AStarPathfinder: thuat toan tim duong ngan nhat tren do thi
    private var pathfinder: AStarPathfinder? = null
    // activePath: duong di hien tai (dung cho distanceToPath de kiem tra lo route)
    private var activePath: List<Offset> = emptyList()
    /** W1 — edges path A* để sinh manoeuvre + ước lượng mét đã đi. */
    private var activePathEdges: List<GraphEdge> = emptyList()
    private var activeManeuvers: List<TurnByTurnEngine.Maneuver> = emptyList()
    private var activeFloorConnectors: List<FloorTransitionDetector.ConnectorHint> = emptyList()
    // lastRerouteAtMs: thoi gian lan cuoi reroute (de cooldown 3s)
    private var lastRerouteAtMs: Long = 0L
    private val parkingManager = ParkingManager(context)
    val confidenceEngine = PositionConfidenceEngine()
    private val _savedParking = MutableStateFlow<SavedParkingSpot?>(parkingManager.getSavedParkingPosition())
    val savedParking: StateFlow<SavedParkingSpot?> = _savedParking.asStateFlow()
    // GPSGeofenceManager: theo doi vi tri GPS de phat hien user dang o toa nha nao
    // Khi user di vao vung toa nha -> tu dong chuyen sang Indoor Navigation
    private val gpsGeofenceManager = com.khoaluan.indoornav.navigation.gps.GPSGeofenceManager(context)
    private val _detectedBuilding = MutableStateFlow<com.khoaluan.indoornav.data.model.Building?>(null)
    val detectedBuilding: StateFlow<com.khoaluan.indoornav.data.model.Building?> = _detectedBuilding.asStateFlow()
    // FIX #10: Lưu floor mục tiêu từ QR scan để load đúng tầng
    private val _initialFloor = MutableStateFlow<Int?>(null)
    val initialFloor: StateFlow<Int?> = _initialFloor.asStateFlow()
    fun setInitialFloor(floor: Int) {
        _initialFloor.value = floor
    }
    fun consumeInitialFloor(): Int {
        val floor = _initialFloor.value ?: 0
        _initialFloor.value = null
        return floor
    }
    /**
     * Course GPS ngoài trời (Bắc thật) đã chụp trước khi tắt geofence —
     * seed Map Heading một lần sau QR. Null nếu đứng yên / GPS yếu.
     */
    private var cachedOutdoorGpsCourseDeg: Float? = null

    // Bat dau theo doi GPS: nhan list buildings tu API, khi user vao vung -> cap nhat detectedBuilding
    fun startGpsGeofencing(buildings: List<com.khoaluan.indoornav.data.model.Building>) {
        gpsGeofenceManager.startMonitoring(buildings) { building ->
            _detectedBuilding.value = building
        }
    }
    // Huy thong bao geofence (khi user da chon toa nha thu cong)
    fun dismissGeofence() {
        _detectedBuilding.value = null
    }
    // Dung theo doi GPS (goi khi chuyen sang Indoor Navigation de tiet kiem pin)
    fun stopGpsGeofencing() {
        // Chụp bearing trước khi tắt listener — handoff vào indoor lúc quét QR
        gpsGeofenceManager.takeReliableOutdoorCourseDeg()?.let { course ->
            cachedOutdoorGpsCourseDeg = course
            Log.d("MapViewModel", "Cached outdoor GPS course=$course° trước khi vào indoor")
        }
        gpsGeofenceManager.stopMonitoring(clearOutdoorCache = false)
    }

    /** Seed hướng từ GPS ngoài trời (nếu có) ngay sau startWithQR / startWithPosition. */
    private fun applyOutdoorGpsHeadingHandoff(engine: LocationEngine) {
        val course = cachedOutdoorGpsCourseDeg ?: return
        cachedOutdoorGpsCourseDeg = null
        engine.seedFromOutdoorGpsCourse(course)
        syncMapNorthOffsetFromEngine()
        Log.i("MapViewModel", "Handoff outdoor GPS course → MapHeading seed=$course°")
    }
    fun getTotalFloorsForBuilding(buildingId: String): Int {
        val listState = _buildingListState.value
        if (listState is BuildingListUiState.Success) {
            val b = listState.buildings.find { it.id == buildingId }
            if (b != null) return b.totalFloors.coerceAtLeast(1)
        }
        return 1
    }

    /**
     * G1b: khóa map đã quét QR / localize.
     * null = chưa định vị trên map hiện tại → không chấp nhận cập nhật userPos từ engine cũ.
     */
    private var localizationMapKey: String? = null
    /** Hủy fetchMap trước đó khi đổi map/tầng liên tục (tránh 2 LocationEngine sống song song). */
    private var fetchMapJob: Job? = null
    /**
     * G1b — dừng PDR/TPF và xóa vị trí/path khi đổi building, tầng, hoặc thoát indoor.
     * Tránh chấm xanh "dính" tọa độ map cũ giữa khoảng trống map mới.
     */
    fun clearLocalizationSession(clearCrossFloorPending: Boolean = true) {
        locationEngine?.stop()
        locationEngine = null
        localizationMapKey = null
        graphModel = null
        pathfinder = null
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        lastRerouteAtMs = 0L
        if (clearCrossFloorPending) {
            pendingCrossFloor = null
            buildingFloorCache.clear()
            _crossFloorRooms.value = emptyList()
        }
        val pending = pendingCrossFloor
        _navState.value = if (pending != null && !clearCrossFloorPending) {
            NavigationState(
                pendingDestFloor = pending.floor,
                pendingDestNodeId = pending.nodeId,
                destinationNodeId = pending.nodeId,
                destinationMarkerPos = Offset(pending.markerX, pending.markerY),
                suggestedTargetFloor = pending.floor,
            )
        } else {
            NavigationState()
        }
    }

    private data class PendingCrossFloor(
        val floor: Int,
        val nodeId: String,
        val markerX: Float,
        val markerY: Float,
    )

    /** W3 — giữ đích khi đổi tầng giữa chừng. */
    private var pendingCrossFloor: PendingCrossFloor? = null
    /** W3 — cache MapData theo floor của building đang mở. */
    private val buildingFloorCache = mutableMapOf<Int, MapData>()
    private var cachedBuildingIdForFloors: String? = null
    private val _crossFloorRooms = MutableStateFlow<List<CrossFloorRoom>>(emptyList())
    val crossFloorRooms: StateFlow<List<CrossFloorRoom>> = _crossFloorRooms.asStateFlow()

    data class CrossFloorRoom(val floor: Int, val room: Room)
    fun exitIndoorNavigation() {
        clearLocalizationSession()
        cachedOutdoorGpsCourseDeg = null
        val listState = _buildingListState.value
        if (listState is BuildingListUiState.Success) {
            startGpsGeofencing(listState.buildings)
        }
    }
    // Tham so reroute (tu dong tinh lai duong khi user lo route)
    private val rerouteCooldownMs = 3000L // Cooldown 3s giua 2 lan reroute
    private val offRouteThresholdMeters = 2.0f // 2.0 met = nguong "lac duong"
private val HEADING_CHANGE_OFFROUTE_MULTIPLIER = 2.0f
    private val lowConfidenceThreshold = 0.25f // Reroute neu confidence TPF < 0.25
    private val rerouteBadgeDurationMs = 1400L // Thoi gian hien badge "Dang tinh lai duong..."
    private val MAX_REROUTE_ATTEMPTS = 5 // Toi da 5 lan reroute, sau do yeu cau quet lai QR
    /** W2 — dưới ngưỡng này (mét) → Đã đến nơi. */
    private val arriveThresholdMeters = 4.0f
    /** W2 — từ lần reroute này trở lên → gợi ý Sửa vị trí / Quét QR. */
    private val heavyRerouteHintAfter = 2
    private val GRID_SIZE_PX = 40f // 1 grid = 40px (tu Web Editor)
    // pixelsPerMeter: ty le chuyen doi pixel sang met
    // Duoc tinh tu scaleRatio cua ban do tu backend (40.0 / scaleRatio)
    // Cap nhat moi khi fetchMap thanh cong
    private var pixelsPerMeter: Float = 80f // Gia tri mac dinh neu scaleRatio khong hop le
    private val gridUnitsPerMeter: Float get() = pixelsPerMeter / GRID_SIZE_PX
    private val _uiState = MutableStateFlow<MapUiState>(MapUiState.Loading)
    val uiState: StateFlow<MapUiState> = _uiState.asStateFlow()
    private val _cameraState = MutableStateFlow(MapCameraState())
    val cameraState: StateFlow<MapCameraState> = _cameraState.asStateFlow()
    fun updateCamera(scale: Float, offset: Offset, isAutoFollow: Boolean = false) {
        _cameraState.value = MapCameraState(scale, offset, isAutoFollow)
    }
    private val _buildingListState = MutableStateFlow<BuildingListUiState>(BuildingListUiState.Loading)
    val buildingListState: StateFlow<BuildingListUiState> = _buildingListState.asStateFlow()

    private val _placeListState = MutableStateFlow<PlaceListUiState>(PlaceListUiState.Idle)
    val placeListState: StateFlow<PlaceListUiState> = _placeListState.asStateFlow()

    private val _placeNotice = MutableStateFlow<String?>(null)
    val placeNotice: StateFlow<String?> = _placeNotice.asStateFlow()
    fun clearPlaceNotice() { _placeNotice.value = null }
    private val _navState = MutableStateFlow(NavigationState())
    val navState: StateFlow<NavigationState> = _navState.asStateFlow()
    private val _qrScanError = MutableStateFlow<String?>(null)
    val qrScanError: StateFlow<String?> = _qrScanError.asStateFlow()
    /** true khi đang gọi API QR / khởi tạo định vị — UI giữ màn camera, không flash EmptyState. */
    private val _isResolvingQr = MutableStateFlow(false)
    val isResolvingQr: StateFlow<Boolean> = _isResolvingQr.asStateFlow()
    private val _mapRotationMode = MutableStateFlow(MapRotationMode.NORTH_UP)
    val mapRotationMode: StateFlow<MapRotationMode> = _mapRotationMode.asStateFlow()

    /** Phase 0.5 — offset Bắc map hiệu dụng (base từ API + hiệu chỉnh tay). */
    private val _mapNorthOffsetDeg = MutableStateFlow(0f)
    val mapNorthOffsetDeg: StateFlow<Float> = _mapNorthOffsetDeg.asStateFlow()

    fun toggleMapRotationMode() {
        _mapRotationMode.value = if (_mapRotationMode.value == MapRotationMode.NORTH_UP) {
            MapRotationMode.HEADING_UP
        } else {
            MapRotationMode.NORTH_UP
        }
    }

    /** Xoay căn Bắc ±delta (vd. ±15°) — áp dụng cho mũi tên + PDR/TPF. */
    fun adjustMapNorthOffset(deltaDeg: Float) {
        val engine = locationEngine ?: return
        engine.adjustHeadingCalibration(deltaDeg)
        syncMapNorthOffsetFromEngine()
        val mapHeading = engine.currentNavigationHeadingDeg()
        _navState.update { it.copy(userHeading = mapHeading) }
    }

    fun resetMapNorthOffsetCalibration() {
        val engine = locationEngine ?: return
        engine.resetHeadingCalibration()
        syncMapNorthOffsetFromEngine()
        val mapHeading = engine.currentNavigationHeadingDeg()
        _navState.update { it.copy(userHeading = mapHeading) }
    }

    /**
     * App về foreground (đổi tab / app khác): snap lại heading từ Rotation Vector,
     * tránh trôi 40–90° do smoother/gyro giữ góc cũ.
     */
    fun onForegroundResume() {
        val engine = locationEngine ?: return
        if (!engine.isRunning) return
        engine.requestHeadingResync(reason = "resume")
        Log.d("MapViewModel", "Foreground resume → heading resync")
    }

    /** Nút Snap tay: bỏ Movement cũ, lấy lại hướng cảm biến tuyệt đối. */
    fun resyncHeadingFromSensors() {
        val engine = locationEngine ?: return
        engine.requestHeadingResync(reason = "manual_snap")
        // UI cập nhật khi mẫu RV tới; sync offset hiện tại
        syncMapNorthOffsetFromEngine()
    }

    private fun syncMapNorthOffsetFromEngine() {
        _mapNorthOffsetDeg.value = locationEngine?.effectiveMapNorthOffsetDeg ?: 0f
    }
    init {
        // Không fetchBuildings ở đây — chờ user qua Login/Guest rồi MainActivity gọi
        // (tránh geofence “Phát hiện tòa nhà” đè màn đăng nhập).
    }
    fun refreshMap(buildingId: String, level: Int = 0) {
        // Tránh reload cùng map (vd. thoát QR → MapScreen remount) — giữ nguyên định vị
        val current = _uiState.value
        if (current is MapUiState.Success &&
            current.buildingId == buildingId &&
            current.floorNumber == level &&
            locationEngine != null &&
            graphModel != null
        ) {
            Log.d("MapViewModel", "refreshMap skipped — same building/floor already loaded")
            return
        }
        val preserveCross = pendingCrossFloor?.floor == level
        fetchMap(buildingId, level, preserveCrossFloorPending = preserveCross)
    }
    fun fetchBuildings(enableGeofence: Boolean = true) {
        viewModelScope.launch {
            _buildingListState.value = BuildingListUiState.Loading
            try {
                val api = RetrofitClient.getApiService()
                val response = api.getBuildings()
                if (response.isSuccessful) {
                    val buildings = response.body() ?: emptyList()
                    _buildingListState.value = BuildingListUiState.Success(buildings)
                    if (enableGeofence) {
                        startGpsGeofencing(buildings)
                    } else {
                        stopGpsGeofencing()
                        _detectedBuilding.value = null
                    }
                } else {
                    _buildingListState.value = BuildingListUiState.Error("Lỗi: ${response.code()}")
                }
            } catch (e: Exception) {
                _buildingListState.value = BuildingListUiState.Error("Lỗi mạng: ${e.message}")
            }
        }
    }

    /** GĐ8 — tải Place Registry (song song / thay discovery). */
    fun fetchPlaces(query: String? = null) {
        viewModelScope.launch {
            _placeListState.value = PlaceListUiState.Loading
            try {
                val api = RetrofitClient.getApiService()
                val places = if (query.isNullOrBlank()) {
                    val response = api.getPlaces(limit = 50)
                    if (!response.isSuccessful) {
                        // Place Registry là bổ sung — không chặn list tòa nhà
                        val msg = when (response.code()) {
                            401, 403 -> "Place Registry chưa public trên server (cần restart Backend GĐ2+)."
                            else -> "Lỗi Place: ${response.code()}"
                        }
                        _placeListState.value = PlaceListUiState.Error(msg)
                        return@launch
                    }
                    response.body()?.places.orEmpty()
                } else {
                    val response = api.searchPlaces(
                        com.khoaluan.indoornav.data.api.PlaceSearchBody(q = query, limit = 50)
                    )
                    if (!response.isSuccessful) {
                        val msg = when (response.code()) {
                            401, 403 -> "Place Registry chưa public trên server (cần restart Backend GĐ2+)."
                            else -> "Lỗi Place: ${response.code()}"
                        }
                        _placeListState.value = PlaceListUiState.Error(msg)
                        return@launch
                    }
                    response.body()?.places.orEmpty()
                }
                _placeListState.value = PlaceListUiState.Success(places)
            } catch (e: Exception) {
                _placeListState.value = PlaceListUiState.Error("Lỗi mạng Place: ${e.message}")
            }
        }
    }

    /**
     * GĐ8 — mở indoor từ Place: nếu có workspace publish → trả buildingId;
     * nếu chưa → NoIndoor notice (không crash).
     */
    fun resolveIndoorBuildingFromPlace(placeId: String, onBuilding: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val api = RetrofitClient.getApiService()
                val res = api.getPlace(placeId)
                if (!res.isSuccessful) {
                    _placeNotice.value = "Không tải được Place (${res.code()})"
                    return@launch
                }
                val body = res.body()
                val place = body?.place
                val indoor = body?.indoorWorkspaces.orEmpty()
                if (indoor.isEmpty()) {
                    _placeListState.value = PlaceListUiState.NoIndoor(
                        placeName = place?.name ?: "Place",
                        placeId = placeId
                    )
                    _placeNotice.value =
                        "${place?.name ?: placeId} chưa có bản đồ trong nhà. Hãy đề xuất / tạo workspace trên web."
                    return@launch
                }
                val buildingId = indoor.first().id
                onBuilding(buildingId)
            } catch (e: Exception) {
                _placeNotice.value = "Lỗi Place: ${e.message}"
            }
        }
    }

    // Lay ban do 1 tang tu backend, khoi tao GraphModel + LocationEngine
    // Goi khi: MapScreen vua vao (buildingId, floor=0) hoac user chon tang khac
    private fun fetchMap(buildingId: String, floor: Int, preserveCrossFloorPending: Boolean = false) {
        stopGpsGeofencing() // Tat GPS geofence de tiet kiem pin khi da vao Indoor
        // G1b: mỗi lần tải map mới → dừng engine cũ + xóa userPos (kể cả đổi tầng)
        // W3: giữ pending đích đa tầng khi user chuyển đúng suggested floor
        clearLocalizationSession(clearCrossFloorPending = !preserveCrossFloorPending)
        fetchMapJob?.cancel()
        fetchMapJob = viewModelScope.launch {
            loadMapInternal(buildingId, floor)
        }
    }

    /**
     * Suspend tải map + tạo engine. Dùng chung cho [fetchMap] và [startNavigation] (đổi tầng theo QR).
     * @return true nếu Success và LocationEngine sẵn sàng
     */
    private suspend fun loadMapInternal(buildingId: String, floor: Int): Boolean {
        stopGpsGeofencing()
        clearLocalizationSession()
        _uiState.value = MapUiState.Loading
        val cache = MapCacheManager(context)
        try {
            val api = RetrofitClient.getApiService()
            val response = api.getMapByFloor(buildingId, floor)
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    cache.save(buildingId, body.floorNumber, body)
                    return applyLoadedMap(body, buildingId)
                }
                _uiState.value = MapUiState.Error("Du lieu trong!")
            } else if (response.code() == 404) {
                val cached = cache.load(buildingId, floor)
                if (cached != null) {
                    Log.i("MapViewModel", "W4 offline cache after 404")
                    return applyLoadedMap(cached, buildingId)
                }
                _uiState.value = MapUiState.Error("Tang $floor chua co ban do.\nHay ve va Publish tu Web Editor.")
            } else {
                val cached = cache.load(buildingId, floor)
                if (cached != null) {
                    Log.i("MapViewModel", "W4 offline cache after HTTP ${response.code()}")
                    return applyLoadedMap(cached, buildingId)
                }
                _uiState.value = MapUiState.Error("Loi ket noi: ${response.code()}")
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.e("MapViewModel", "Loi Exception", e)
            val cached = cache.load(buildingId, floor)
            if (cached != null) {
                Log.i("MapViewModel", "W4 offline cache after network error")
                return applyLoadedMap(cached, buildingId)
            }
            _uiState.value = MapUiState.Error("Loi mang: ${e.message}")
        }
        return false
    }

    private fun applyLoadedMap(
        body: com.khoaluan.indoornav.data.model.MapResponse,
        buildingId: String,
    ): Boolean {
        val mapData = body.mapData.sanitized()
        pixelsPerMeter = if (mapData.scaleRatio > 0.0) {
            (40.0 / mapData.scaleRatio).toFloat()
        } else {
            80f
        }
        val floorNumber = body.floorNumber
        val sessionKey = buildMapSessionKey(buildingId, floorNumber)
        _uiState.value = MapUiState.Success(mapData, buildingId, floorNumber)
        val gModel = GraphModel(mapData)
        graphModel = gModel
        pathfinder = AStarPathfinder(gModel)
        Log.d(
            "MapViewModel",
            "scaleRatio=${mapData.scaleRatio}, pixelsPerMeter=$pixelsPerMeter, mapBearingOffset=${mapData.mapBearingOffset}"
        )
        locationEngine = LocationEngine(context, mapData).apply {
            onLocationUpdated = { x, y, heading, confidence, isTpf ->
                if (localizationMapKey == sessionKey) {
                    _navState.update { current ->
                        var newState = current.copy(
                            userPos = Offset(x, y),
                            userHeading = heading,
                            confidence = minOf(confidence, confidenceEngine.calculateCurrentConfidence()),
                            isTpfActive = isTpf,
                            particles = getParticles()
                        )
                        if (newState.isNavigatingMode && activePathEdges.isNotEmpty()) {
                            newState = applyTurnGuidance(newState, x, y)
                        }
                        if (locationEngine?.consumeHeadingConflictQrSuggestion() == true) {
                            newState = newState.copy(
                                navHint = "Hướng la bàn lệch với hướng đi. Hãy Snap hướng hoặc Quét lại QR."
                            )
                        }
                        newState.destinationNodeId?.let { destinationNodeId ->
                            maybeTriggerReroute(destinationNodeId)
                        }
                        newState
                    }
                    syncMapNorthOffsetFromEngine()
                }
            }
        }
        _mapNorthOffsetDeg.value = mapData.mapBearingOffset
        Log.d("MapViewModel", "Tai ban do & Khoi dong Engine thanh cong! sessionKey=$sessionKey")
        buildingFloorCache[floorNumber] = mapData
        viewModelScope.launch { prefetchBuildingFloors(buildingId) }
        resumeCrossFloorIfNeeded(floorNumber)
        return true
    }

    private fun resumeCrossFloorIfNeeded(floorNumber: Int) {
        val pending = pendingCrossFloor ?: return
        if (pending.floor != floorNumber) return
        _navState.update {
            it.copy(
                destinationNodeId = pending.nodeId,
                destinationMarkerPos = Offset(pending.markerX, pending.markerY),
                pendingDestFloor = pending.floor,
                pendingDestNodeId = pending.nodeId,
                suggestedTargetFloor = null,
            )
        }
        updatePath(pending.nodeId, force = true)
        if (activePath.isNotEmpty()) {
            pendingCrossFloor = null
            Log.i("MapViewModel", "W3 resumed path on floor $floorNumber → ${pending.nodeId}")
        }
    }

    private suspend fun prefetchBuildingFloors(buildingId: String) {
        if (cachedBuildingIdForFloors == buildingId && buildingFloorCache.size > 1) {
            rebuildCrossFloorRoomIndex()
            return
        }
        try {
            val api = RetrofitClient.getApiService()
            val resp = api.getFullBuildingMap(buildingId)
            if (!resp.isSuccessful) return
            val body = resp.body() ?: return
            cachedBuildingIdForFloors = buildingId
            body.floors.forEach { doc ->
                val md = doc.map_data?.sanitized() ?: return@forEach
                buildingFloorCache[doc.floor_number] = md
            }
            rebuildCrossFloorRoomIndex()
            Log.d("MapViewModel", "W3 prefetch floors=${buildingFloorCache.keys}")
        } catch (e: Exception) {
            Log.w("MapViewModel", "W3 prefetch floors failed: ${e.message}")
        }
    }

    private fun rebuildCrossFloorRoomIndex() {
        _crossFloorRooms.value = buildingFloorCache.flatMap { (floor, md) ->
            md.rooms.map { CrossFloorRoom(floor, it) }
        }
    }

    /**
     * W3 — Chọn phòng trên tầng khác (search đa tầng). Chưa tính path đến khi previewPath.
     */
    fun setDestinationOnFloor(targetFloor: Int, roomId: Int) {
        val state = _uiState.value as? MapUiState.Success ?: return
        val mapOnFloor = buildingFloorCache[targetFloor] ?: return
        val room = mapOnFloor.rooms.find { it.id == roomId } ?: return
        val gOnFloor = GraphModel(mapOnFloor)
        val roomCenterX = room.x + room.width / 2.0
        val roomCenterY = room.y + room.height / 2.0
        val markerPos = Offset(roomCenterX.toFloat(), roomCenterY.toFloat())
        val targetNode = gOnFloor.nodeMap.values.minByOrNull {
            val dx = it.x - roomCenterX
            val dy = it.y - roomCenterY
            dx * dx + dy * dy
        } ?: return
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        pendingCrossFloor = PendingCrossFloor(
            floor = targetFloor,
            nodeId = targetNode.nodeId,
            markerX = markerPos.x,
            markerY = markerPos.y,
        )
        _navState.value = _navState.value.copy(
            destinationPoiId = null,
            destinationNodeId = targetNode.nodeId,
            destinationMarkerPos = if (targetFloor == state.floorNumber) markerPos else null,
            path = null,
            totalDistanceMeters = 0f,
            etaSeconds = 0,
            isNavigatingMode = false,
            navigationError = null,
            rerouteCount = 0,
            currentInstructionText = if (targetFloor != state.floorNumber) {
                "Đích tầng ${if (targetFloor == 0) "GF" else targetFloor} — bấm Xem đường"
            } else null,
            pathHasFloorConnector = false,
            floorTransitionHint = null,
            suggestedTargetFloor = if (targetFloor != state.floorNumber) targetFloor else null,
            pendingDestFloor = targetFloor,
            pendingDestNodeId = targetNode.nodeId,
        )
        Log.d("MapViewModel", "W3 setDestinationOnFloor floor=$targetFloor room=$roomId node=${targetNode.nodeId}")
    }

    // Xu ly khi user quet ma QR: goi API de lay toa do, roi bat dau dinh vi
    // Flow: QRScanScreen.scanQR() -> MapViewModel.startNavigation(qrCode)
    //  1. QR scanner doc rawValue -> truyen vao day
    //  2. Goi ApiService.getQrInfo(qrCode) -> backend tra ve {x, y, node_id, floor_number}
    //  3. Neu floor/building khac map hien tai -> loadMapInternal dung tang
    //  4. Neu co node_id -> engine.startWithQR(nodeId) (TPF khoi tao tai node)
    //  5. Neu khong co node_id -> tim node gan nhat -> engine.startWithQR(nearestNodeId)
    //  6. Fallback: engine.startWithPosition(x, y) (PDR thuan, khong co TPF)
    fun startNavigation(qrCode: String) {
        _qrScanError.value = null
        val trimmedQr = qrCode.trim()
        Log.i("MapViewModel", "QR scan raw=[$qrCode] trimmed=[$trimmedQr]")
        viewModelScope.launch {
            _isResolvingQr.value = true
            try {
                // Đợi map đang load (vd. vừa mở từ geofence) — tránh lỗi "chua tai xong" spam
                var wait = 0
                while (_uiState.value is MapUiState.Loading && wait < 40) {
                    delay(100)
                    wait++
                }

                val api = RetrofitClient.getApiService()
                val response = api.getQrInfo(trimmedQr)
                if (!response.isSuccessful) {
                    val errMsg = response.errorBody()?.string() ?: "Loi ${response.code()}"
                    _qrScanError.value = "Khong tim thay ma QR: $errMsg"
                    return@launch
                }
                val body = response.body()
                if (body == null) {
                    _qrScanError.value = "Phan hoi tu may chu trong"
                    return@launch
                }

                val needReload = when (val s = _uiState.value) {
                    is MapUiState.Success ->
                        s.buildingId != body.building_id ||
                            s.floorNumber != body.floor_number ||
                            locationEngine == null ||
                            graphModel == null
                    else -> true
                }
                if (needReload) {
                    Log.i(
                        "MapViewModel",
                        "QR map switch → building=${body.building_id} floor=${body.floor_number}"
                    )
                    fetchMapJob?.cancel()
                    val loaded = loadMapInternal(body.building_id, body.floor_number)
                    if (!loaded) {
                        _qrScanError.value =
                            "Khong tai duoc ban do tang ${body.floor_number}. Kiem tra Publish Web Editor."
                        return@launch
                    }
                }

                val state = _uiState.value as? MapUiState.Success
                val engine = locationEngine
                if (state == null || engine == null) {
                    _qrScanError.value = "He thong dinh vi chua san sang, thu lai"
                    return@launch
                }

                confidenceEngine.updateGroundTruth()
                val mapKey = buildMapSessionKey(state.buildingId, state.floorNumber)
                fun markLocalizedAndStart(block: () -> Boolean): Boolean {
                    localizationMapKey = mapKey
                    val ok = block()
                    if (!ok) localizationMapKey = null
                    return ok
                }
                fun seedUserPos(x: Float, y: Float) {
                    _navState.update {
                        it.copy(
                            userPos = Offset(x, y),
                            confidence = maxOf(it.confidence, 0.5f),
                        )
                    }
                }
                val nodeId = body.node_id?.takeIf { it.isNotBlank() }
                if (nodeId != null) {
                    val ok = markLocalizedAndStart { engine.startWithQR(nodeId) }
                    if (!ok) {
                        _qrScanError.value =
                            "Vi tri QR khong hop le (node '$nodeId' khong co tren tang ${state.floorNumber})"
                        return@launch
                    }
                    applyOutdoorGpsHeadingHandoff(engine)
                    val node = graphModel?.nodeMap?.get(nodeId)
                    if (node != null) {
                        seedUserPos(node.x.toFloat(), node.y.toFloat())
                    } else {
                        seedUserPos(body.x, body.y)
                    }
                } else {
                    val nearestNodeId = findNearestNodeId(body.x, body.y, state.mapData)
                    if (nearestNodeId != null) {
                        val ok = markLocalizedAndStart { engine.startWithQR(nearestNodeId) }
                        if (!ok) {
                            _qrScanError.value = "Vi tri QR khong hop le (node gan nhat khong ton tai)"
                            return@launch
                        }
                        applyOutdoorGpsHeadingHandoff(engine)
                        val node = graphModel?.nodeMap?.get(nearestNodeId)
                        if (node != null) {
                            seedUserPos(node.x.toFloat(), node.y.toFloat())
                        } else {
                            seedUserPos(body.x, body.y)
                        }
                    } else {
                        Log.i("MapViewModel", "QR fallback to PDR-only at (${body.x}, ${body.y})")
                        localizationMapKey = mapKey
                        engine.startWithPosition(body.x, body.y)
                        applyOutdoorGpsHeadingHandoff(engine)
                        seedUserPos(body.x, body.y)
                    }
                }
            } catch (e: Exception) {
                Log.e("MapViewModel", "Loi tra cuu QR", e)
                _qrScanError.value = "Loi ket noi: ${e.message}"
            } finally {
                _isResolvingQr.value = false
            }
        }
    }
    /**
     * Tìm node gần nhất với vị trí (x, y) - đơn giản nhất quán, không lọc connectivity.
     * Lý do: Khi user đang trong phòng, node trong phòng thường là leaf (degree=1).
     * Hàm cũ ưu tiên connected nodes (degree>=2) đã gây sai: user trong phòng nhưng
     * lại trả về node ở hành lang bên ngoài (connected node) → path bắt đầu từ hành lang,
     * không nối với vị trí user thực tế.
     */
    private fun findNearestNodeIdWithConnectivity(
 mapData: MapData,
 graphModel: GraphModel?,
 x: Float,
 y: Float
 ): String? {
 val candidates = mapData.nodes.map { node ->
 val dx = node.x - x
 val dy = node.y - y
 Triple(node.nodeId, node.x, node.y) to (dx * dx + dy * dy)
 }.sortedBy { it.second }.take(3)
 Log.d("MapViewModel", "findNearestNode: userPos=(" + "%.1f".format(x) + "," + "%.1f".format(y) + "), pxPerM=" + pixelsPerMeter)
 for (c in candidates) {
 val id = c.first.first
 val nx = c.first.second
 val ny = c.first.third
 val dist = sqrt(c.second.toDouble()).toFloat()
 Log.d("MapViewModel", " candidate: " + id + " at (" + nx + "," + ny + "), dist=" + "%.1f".format(dist) + "px (" + "%.2f".format(dist / pixelsPerMeter) + "m)")
 }
 return mapData.nodes.minByOrNull { node ->
 val dx = node.x - x
 val dy = node.y - y
 dx * dx + dy * dy
 }?.nodeId
}
    private fun findNearestNodeId(x: Float, y: Float, mapData: MapData): String? {
        return findNearestNodeIdWithConnectivity(mapData, graphModel, x, y)
    }
    fun clearQrError() {
        _qrScanError.value = null
    }
    /**
     * G1: Chỉ chọn đích (pin + tên). KHÔNG tính/vẽ path.
     * Path chỉ khi [previewPath] ("Xem đường") hoặc [startNavigationMode].
     */
    fun setDestination(roomId: Int) {
        val state = _uiState.value as? MapUiState.Success ?: return
        val room = state.mapData.rooms.find { it.id == roomId } ?: return
        val gModel = graphModel ?: return
        val roomCenterX = room.x + room.width / 2.0
        val roomCenterY = room.y + room.height / 2.0
        val markerPos = Offset(roomCenterX.toFloat(), roomCenterY.toFloat())
        val targetNode = gModel.nodeMap.values.minByOrNull {
            val dx = it.x - roomCenterX
            val dy = it.y - roomCenterY
            dx * dx + dy * dy
        } ?: return
        Log.d(
            "MapViewModel",
            "setDestination(G1 select-only): roomId=$roomId, roomName=${room.name}, " +
                "targetNodeId=${targetNode.nodeId}, path NOT computed"
        )
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        pendingCrossFloor = null
        _navState.value = _navState.value.copy(
            destinationPoiId = null,
            destinationNodeId = targetNode.nodeId,
            destinationMarkerPos = markerPos,
            path = null,
            totalDistanceMeters = 0f,
            etaSeconds = 0,
            isNavigatingMode = false,
            navigationError = null,
            rerouteCount = 0,
            rerouteSourceNodeId = null,
            currentInstructionText = null,
            distanceToNextManeuverMeters = 0f,
            remainingDistanceMeters = 0f,
            routeProgress = 0f,
            pathHasFloorConnector = false,
            floorTransitionHint = null,
            suggestedTargetFloor = null,
            pendingDestFloor = state.floorNumber,
            pendingDestNodeId = targetNode.nodeId,
        )
    }

    /** G1: Chọn POI làm đích — chưa tính path. */
    fun setDestinationPoi(poiId: Int) {
        val state = _uiState.value as? MapUiState.Success ?: return
        val poi = state.mapData.pois.find { it.id == poiId } ?: return
        val gModel = graphModel ?: return
        val markerPos = Offset(poi.x.toFloat(), poi.y.toFloat())
        val targetNode = gModel.nodeMap.values.minByOrNull {
            val dx = it.x - poi.x
            val dy = it.y - poi.y
            dx * dx + dy * dy
        } ?: return
        Log.d(
            "MapViewModel",
            "setDestinationPoi(G1 select-only): poiId=$poiId, poiName=${poi.name}, " +
                "targetNodeId=${targetNode.nodeId}, path NOT computed"
        )
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        _navState.value = _navState.value.copy(
            destinationPoiId = poiId,
            destinationNodeId = targetNode.nodeId,
            destinationMarkerPos = markerPos,
            path = null,
            totalDistanceMeters = 0f,
            etaSeconds = 0,
            isNavigatingMode = false,
            navigationError = null,
            rerouteCount = 0,
            rerouteSourceNodeId = null,
            currentInstructionText = null,
            distanceToNextManeuverMeters = 0f,
            remainingDistanceMeters = 0f,
            routeProgress = 0f,
            pathHasFloorConnector = false,
            floorTransitionHint = null,
        )
    }
    /** Tính lại đường preview tới đích hiện tại (nút "Xem đường"). */
    fun previewPath() {
        val dest = _navState.value.destinationNodeId ?: return
        updatePath(dest, force = true)
    }
    fun startNavigationMode() {
        val nav = _navState.value
        // FIX #6: Đảm bảo path tồn tại trước khi bật navigation mode
        // Nếu path rỗng (ví dụ: sau khi exitIndoorNavigation/reset) và có destination,
        // tính lại đường đi để tránh UX: bấm "Bắt đầu" mà không thấy đường vẽ
        if ((nav.path.isNullOrEmpty() || activePath.isEmpty()) && nav.destinationNodeId != null) {
            Log.d("MapViewModel", "startNavigationMode: path empty, recalculating to ${nav.destinationNodeId}")
            updatePath(nav.destinationNodeId)
            // Kiểm tra sau khi updatePath (activePath được set bất đồng bộ)
            // activePath sẽ có giá trị sau khi updatePath hoàn thành
            // Tuy nhiên, updatePath là sync nên có thể kiểm tra ngay
            if (activePath.isEmpty()) {
                Log.w("MapViewModel", "Cannot start navigation: path still empty after updatePath")
                return  // Không bật mode nếu vẫn không có path
            }
        }
        // Chỉ bật mode nếu có path hợp lệ
        if (activePath.isNotEmpty() || !nav.path.isNullOrEmpty()) {
            var next = _navState.value.copy(isNavigatingMode = true)
            val pos = next.userPos
            if (pos != null && activePathEdges.isNotEmpty()) {
                next = applyTurnGuidance(next, pos.x, pos.y)
            } else if (activeManeuvers.isNotEmpty()) {
                val g = TurnByTurnEngine.guidance(
                    activeManeuvers,
                    next.totalDistanceMeters,
                    traveledMeters = 0f,
                )
                next = next.copy(
                    currentInstructionText = g.instructionText,
                    distanceToNextManeuverMeters = g.distanceToNextManeuverMeters,
                    remainingDistanceMeters = g.remainingDistanceMeters,
                    routeProgress = g.routeProgress,
                )
            }
            _navState.value = next
        } else {
            Log.w("MapViewModel", "Cannot start navigation: no destination or path unavailable")
        }
    }
    private fun updatePath(targetNodeId: String) {
        updatePath(targetNodeId, force = false)
    }
    private fun updatePath(targetNodeId: String, force: Boolean) {
        val pFinder = pathfinder ?: return
        val gModel = graphModel ?: return
        val ui = _uiState.value as? MapUiState.Success ?: return
        val currentUserNodeId = findNearestNodeIdFromCurrentPosition(gModel)
            ?: locationEngine
                ?.getParticles()
                ?.firstOrNull()
                ?.edgeId
                ?.split("->")
                ?.firstOrNull()
            ?: return
        if (!force && _navState.value.destinationNodeId == targetNodeId && activePath.isNotEmpty()) {
            return
        }

        val destFloor = _navState.value.pendingDestFloor
            ?: pendingCrossFloor?.floor
            ?: ui.floorNumber
        val destNode = _navState.value.pendingDestNodeId ?: targetNodeId

        if (destFloor != ui.floorNumber) {
            val destMap = buildingFloorCache[destFloor]
            if (destMap == null) {
                viewModelScope.launch {
                    prefetchBuildingFloors(ui.buildingId)
                    if (buildingFloorCache[destFloor] != null) {
                        updatePath(targetNodeId, force = true)
                    } else {
                        _navState.value = _navState.value.copy(
                            navigationError = "Chưa tải được bản đồ tầng $destFloor",
                            path = emptyList(),
                        )
                    }
                }
                return
            }
            val destGraph = GraphModel(destMap)
            val plan = MultiFloorPathPlanner.plan(
                startFloor = ui.floorNumber,
                destFloor = destFloor,
                startNodeId = currentUserNodeId,
                destNodeId = destNode,
                startGraph = gModel,
                destGraph = destGraph,
            )
            if (plan == null) {
                Log.e("MapViewModel", "W3 no multi-floor path $currentUserNodeId → F$destFloor/$destNode")
                activePathEdges = emptyList()
                activeManeuvers = emptyList()
                activeFloorConnectors = emptyList()
                _navState.value = _navState.value.copy(
                    path = emptyList(),
                    navigationError = "Không tìm được đường xuyên tầng (cần connector cùng tọa độ).",
                    suggestedTargetFloor = destFloor,
                    pathHasFloorConnector = false,
                    floorTransitionHint = null,
                )
                return
            }
            applyComputedPath(
                result = plan.currentFloorPath,
                gModel = gModel,
                currentUserNodeId = currentUserNodeId,
                targetNodeId = plan.via?.fromNodeId ?: destNode,
                force = force,
                totalDistanceOverride = plan.totalDistanceMeters,
                suggestedFloor = plan.targetFloor,
                pendingFloor = plan.targetFloor,
                pendingNode = plan.destNodeId,
            )
            val destNodeObj = destGraph.nodeMap[plan.destNodeId]
            pendingCrossFloor = PendingCrossFloor(
                floor = plan.targetFloor,
                nodeId = plan.destNodeId,
                markerX = destNodeObj?.x?.toFloat() ?: 0f,
                markerY = destNodeObj?.y?.toFloat() ?: 0f,
            )
            val viaLabel = when (plan.via?.kind) {
                FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR -> "thang máy"
                FloorTransitionDetector.ConnectorHint.Kind.STAIRS -> "cầu thang"
                else -> "connector"
            }
            val floorLabel = if (plan.targetFloor == 0) "GF" else plan.targetFloor.toString()
            _navState.update {
                it.copy(
                    currentInstructionText = "Đến $viaLabel rồi lên tầng $floorLabel",
                    floorTransitionHint = "Đổi tầng $floorLabel rồi quét QR gần $viaLabel để tiếp tục",
                    destinationMarkerPos = Offset(pendingCrossFloor!!.markerX, pendingCrossFloor!!.markerY),
                )
            }
            return
        }

        val result = pFinder.findPath(currentUserNodeId, destNode)
        if (result != null) {
            applyComputedPath(
                result = result,
                gModel = gModel,
                currentUserNodeId = currentUserNodeId,
                targetNodeId = destNode,
                force = force,
            )
            pendingCrossFloor = null
        } else {
            Log.e("MapViewModel", "Khong tim thay duong tu $currentUserNodeId den $destNode")
            activePathEdges = emptyList()
            activeManeuvers = emptyList()
            activeFloorConnectors = emptyList()
            _navState.value = _navState.value.copy(
                path = emptyList(),
                destinationNodeId = destNode,
                totalDistanceMeters = 0f,
                etaSeconds = 0,
                currentInstructionText = null,
                distanceToNextManeuverMeters = 0f,
                remainingDistanceMeters = 0f,
                routeProgress = 0f,
                pathHasFloorConnector = false,
                floorTransitionHint = null,
                suggestedTargetFloor = null,
                pendingDestFloor = null,
                pendingDestNodeId = null,
                navigationError = "Không tìm thấy đường từ vị trí hiện tại đến điểm đến"
            )
        }
    }

    private fun applyComputedPath(
        result: AStarPathfinder.PathResult,
        gModel: GraphModel,
        currentUserNodeId: String,
        targetNodeId: String,
        force: Boolean,
        totalDistanceOverride: Float? = null,
        suggestedFloor: Int? = null,
        pendingFloor: Int? = null,
        pendingNode: String? = null,
    ) {
        val pathOffsets = if (result.edges.isEmpty()) {
            val node = gModel.nodeMap[targetNodeId]
            if (node != null) listOf(Offset(node.x.toFloat(), node.y.toFloat())) else emptyList()
        } else {
            result.edges.map { edge ->
                Offset(edge.sourceX, edge.sourceY)
            } + Offset(result.edges.last().targetX, result.edges.last().targetY)
        }
        activePath = pathOffsets
        activePathEdges = result.edges
        activeManeuvers = TurnByTurnEngine.buildManeuvers(result.edges)
        activeFloorConnectors = FloorTransitionDetector.findConnectorsOnPath(
            result.edges,
            gModel.nodeMap,
        )
        val totalDist = totalDistanceOverride ?: result.totalDistanceMeters
        Log.d(
            "MapViewModel",
            "Path computed: startNode=$currentUserNodeId, targetNode=$targetNodeId, dist=${"%.2f".format(totalDist.toDouble())}m, nodes=${result.nodeIds.size}, edges=${result.edges.size}"
        )
        val etaSeconds = estimateEtaSeconds(totalDist, _navState.value.confidence)
        val rerouteCount = if (force) _navState.value.rerouteCount + 1 else _navState.value.rerouteCount
        val markerPos = pathOffsets.lastOrNull() ?: _navState.value.destinationMarkerPos
        var next = _navState.value.copy(
            path = pathOffsets,
            destinationNodeId = targetNodeId,
            destinationMarkerPos = markerPos,
            totalDistanceMeters = totalDist,
            etaSeconds = etaSeconds,
            remainingDistanceMeters = totalDist,
            rerouteCount = rerouteCount,
            rerouteSourceNodeId = if (force) currentUserNodeId else _navState.value.rerouteSourceNodeId,
            isNavigatingMode = _navState.value.isNavigatingMode,
            navigationError = null,
            routeProgress = 0f,
            pathHasFloorConnector = activeFloorConnectors.isNotEmpty() || suggestedFloor != null,
            floorTransitionHint = null,
            suggestedTargetFloor = suggestedFloor,
            pendingDestFloor = pendingFloor,
            pendingDestNodeId = pendingNode,
        )
        val pos = next.userPos
        if (next.isNavigatingMode && pos != null) {
            next = applyTurnGuidance(next, pos.x, pos.y)
        } else if (activeManeuvers.isNotEmpty()) {
            val g = TurnByTurnEngine.guidance(activeManeuvers, result.totalDistanceMeters, 0f)
            next = next.copy(
                currentInstructionText = g.instructionText,
                distanceToNextManeuverMeters = g.distanceToNextManeuverMeters,
                remainingDistanceMeters = totalDist,
            )
        }
        _navState.value = next
        if (force) {
            lastRerouteAtMs = System.currentTimeMillis()
            if (next.rerouteCount >= heavyRerouteHintAfter && next.isNavigatingMode) {
                _navState.value = _navState.value.copy(
                    navHint = "Lệch đường nhiều lần. Hãy Sửa vị trí hoặc Quét lại QR."
                )
            }
        }
    }

    private fun applyTurnGuidance(state: NavigationState, x: Float, y: Float): NavigationState {
        if (activePathEdges.isEmpty() || activeManeuvers.isEmpty()) return state
        val traveled = TurnByTurnEngine.traveledMetersAlongEdges(activePathEdges, x, y)
        val g = TurnByTurnEngine.guidance(
            maneuvers = activeManeuvers,
            totalDistanceMeters = state.totalDistanceMeters,
            traveledMeters = traveled,
        )
        // W2 — Đã đến nơi
        if (state.isNavigatingMode && g.remainingDistanceMeters <= arriveThresholdMeters) {
            Log.i("MapViewModel", "W2 arrived: remaining=${g.remainingDistanceMeters}m")
            activePath = emptyList()
            activePathEdges = emptyList()
            activeManeuvers = emptyList()
            activeFloorConnectors = emptyList()
            return state.copy(
                isNavigatingMode = false,
                path = null,
                currentInstructionText = "Đã đến nơi",
                distanceToNextManeuverMeters = 0f,
                remainingDistanceMeters = 0f,
                routeProgress = 1f,
                etaSeconds = 0,
                hasArrived = true,
                navHint = null,
                pathHasFloorConnector = false,
                floorTransitionHint = null,
            )
        }
        val floorHint = FloorTransitionDetector.approachInstruction(
            activeFloorConnectors,
            traveledMeters = traveled,
            targetFloor = state.suggestedTargetFloor ?: state.pendingDestFloor,
        )
        val instruction = floorHint ?: g.instructionText
        val eta = estimateEtaSeconds(g.remainingDistanceMeters, state.confidence)
        return state.copy(
            currentInstructionText = instruction,
            distanceToNextManeuverMeters = g.distanceToNextManeuverMeters,
            remainingDistanceMeters = g.remainingDistanceMeters,
            routeProgress = g.routeProgress,
            etaSeconds = eta,
            hasArrived = false,
            floorTransitionHint = floorHint,
            pathHasFloorConnector = activeFloorConnectors.isNotEmpty(),
        )
    }

    /** UI gọi sau khi đã hiện snackbar “Đã đến nơi”. */
    fun clearArrivalFlag() {
        if (_navState.value.hasArrived) {
            _navState.value = _navState.value.copy(hasArrived = false)
        }
    }

    fun clearNavHint() {
        if (_navState.value.navHint != null) {
            _navState.value = _navState.value.copy(navHint = null)
        }
    }

    private fun maybeTriggerReroute(destinationNodeId: String) {
        if (!_navState.value.isNavigatingMode) return
        val nav = _navState.value
        val userPos = nav.userPos ?: return
        val now = System.currentTimeMillis()
        if (now - lastRerouteAtMs < rerouteCooldownMs) return
        // CHECK 1: Max reroute attempts
        if (nav.rerouteCount >= MAX_REROUTE_ATTEMPTS) {
            Log.w("MapViewModel", "Max reroute attempts (${MAX_REROUTE_ATTEMPTS}) reached. Forcing QR re-scan.")
            _qrScanError.value = "Đã thử tìm đường quá nhiều lần. Vui lòng quét lại mã QR."
            _navState.value = _navState.value.copy(isNavigatingMode = false)
            return
        }
        if (activePath.size < 2) {
            updatePath(destinationNodeId, force = true)
            return
        }
        val minDistToPathPx = distanceToPath(userPos, activePath)
        val minDistToPathMeters = minDistToPathPx / pixelsPerMeter
        // FIX 4: Relax off-route threshold during heading changes (user turning)
 val effectiveOffRouteThreshold = if (locationEngine?.isHeadingChangeRelaxed() == true) {
 offRouteThresholdMeters * HEADING_CHANGE_OFFROUTE_MULTIPLIER
 } else {
 offRouteThresholdMeters
 }
 val isOffRoute = minDistToPathMeters > effectiveOffRouteThreshold
        val isLowConfidence = nav.confidence < lowConfidenceThreshold
        if (isOffRoute || isLowConfidence) {
            val reason = if (isOffRoute) "off_route" else "low_confidence"
            Log.w(
                "MapViewModel",
                "Trigger re-route reason=$reason, distM=${minDistToPathMeters.roundTo(1)}, conf=${nav.confidence}, count=${nav.rerouteCount}"
            )
            // CHECK 2: Kiểm tra xem new path có khác old path không
            val gModel = graphModel ?: run {
                Log.w("MapViewModel", "graphModel null, cannot check path similarity")
                triggerReroutingPulse()
                updatePath(destinationNodeId, force = true)
                return
            }
            val currentUserNodeId = findNearestNodeIdFromCurrentPosition(gModel)
            if (currentUserNodeId != null) {
        // CHECK 3: Skip reroute if nearest node unchanged since last reroute
        // Prevents infinite loops when coordinate mismatch selects same wrong node
        val lastRerouteNodeId = nav.rerouteSourceNodeId
        if (currentUserNodeId == lastRerouteNodeId) {
            Log.w("MapViewModel", "Reroute skipped: nearest node unchanged (" + currentUserNodeId + ")")
            return
        }
                val newPathResult = pathfinder?.findPath(currentUserNodeId, destinationNodeId)
                if (newPathResult != null) {
                    val newPathOffsets = if (newPathResult.edges.isEmpty()) {
                        val node = gModel.nodeMap[destinationNodeId]
                        if (node != null) listOf(Offset(node.x.toFloat(), node.y.toFloat())) else emptyList()
                    } else {
                        newPathResult.edges.map { edge ->
                            Offset(edge.sourceX, edge.sourceY)
                        } + Offset(newPathResult.edges.last().targetX, newPathResult.edges.last().targetY)
                    }
                    // Kiểm tra similarity
                    val pathSimilarity = calculatePathSimilarity(activePath, newPathOffsets)
                    if (pathSimilarity > 0.9f) {
                        Log.i("MapViewModel", "Path similar (${(pathSimilarity*100).toInt()}%), skipping reroute")
                        return
                    }
                }
            }
            triggerReroutingPulse()
            updatePath(destinationNodeId, force = true)
        }
    }
    private fun triggerReroutingPulse() {
        viewModelScope.launch {
            _navState.value = _navState.value.copy(isRerouting = true)
            delay(rerouteBadgeDurationMs)
            _navState.value = _navState.value.copy(isRerouting = false)
        }
    }
    private fun distanceToPath(point: Offset, path: List<Offset>): Float {
        if (path.isEmpty()) return Float.MAX_VALUE
        if (path.size == 1) return hypot(point.x - path[0].x, point.y - path[0].y)
        var best = Float.MAX_VALUE
        for (i in 0 until path.size - 1) {
            val d = distancePointToSegment(point, path[i], path[i + 1])
            if (d < best) best = d
        }
        return best
    }
    private fun distancePointToSegment(p: Offset, a: Offset, b: Offset): Float {
        val abX = b.x - a.x
        val abY = b.y - a.y
        val abLenSq = abX * abX + abY * abY
        if (abLenSq <= 1e-6f) return hypot(p.x - a.x, p.y - a.y)
        val apX = p.x - a.x
        val apY = p.y - a.y
        val t = ((apX * abX + apY * abY) / abLenSq).coerceIn(0f, 1f)
        val projX = a.x + t * abX
        val projY = a.y + t * abY
        return hypot(p.x - projX, p.y - projY)
    }
    private fun estimateEtaSeconds(totalDistanceMeters: Float, confidence: Float): Int {
        val confidenceFactor = max(0.65f, min(1f, confidence + 0.2f))
        val walkingSpeedMps = 1.25f * confidenceFactor
        return (totalDistanceMeters / walkingSpeedMps).toInt().coerceAtLeast(0)
    }
    /**
     * Tính % similarity giữa 2 path (0.0 = khác hoàn toàn, 1.0 = giống hệt)
     */
    private fun calculatePathSimilarity(oldPath: List<Offset>, newPath: List<Offset>): Float {
        if (oldPath.isEmpty() || newPath.isEmpty()) return 0f
        if (oldPath.size != newPath.size) return 0f
        // So sánh từng point trong path (fuzzy matching với tolerance)
        val tolerance = 50f * pixelsPerMeter // 50m tolerance
        var matches = 0
        for (i in oldPath.indices) {
            val dist = hypot(
                oldPath[i].x - newPath[i].x,
                oldPath[i].y - newPath[i].y
            )
            if (dist <= tolerance) {
                matches++
            }
        }
        return matches.toFloat() / oldPath.size
    }
    private fun findNearestNodeIdFromCurrentPosition(gModel: GraphModel): String? {
        val userPos = _navState.value.userPos ?: return null
        val mapData = (_uiState.value as? MapUiState.Success)?.mapData ?: return null
        val nodeId = findNearestNodeIdWithConnectivity(mapData, gModel, userPos.x, userPos.y)
        Log.d("MapViewModel", "findNearestNodeIdFromCurrentPosition: userPos=(${"%.1f".format(userPos.x)},${"%.1f".format(userPos.y)}) -> nodeId=$nodeId")
        return nodeId
    }
    fun stopNavigation() {
        locationEngine?.stop()
        localizationMapKey = null
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        lastRerouteAtMs = 0L
        _navState.value = NavigationState()
    }
    fun saveParkingPosition(note: String?) {
        val state = _uiState.value as? MapUiState.Success ?: return
        val nav = _navState.value
        val userPos = nav.userPos ?: return
        val edgeId = locationEngine?.getParticles()?.firstOrNull()?.edgeId ?: ""
        val progress = locationEngine?.getParticles()?.firstOrNull()?.progress ?: 0f
        val spot = SavedParkingSpot(
            x = userPos.x,
            y = userPos.y,
            edgeId = edgeId,
            progress = progress,
            floorId = state.floorNumber.toString(), // FIX: floorId la String trong SavedParkingSpot, floorNumber la Int -> can convert
        // Truoc day sai: floorId = state.buildingId (gan buildingId vao floorId)
        // Bay gio dung: floorId = so tang hien tai (vd: "1", "2", ...)
            confidence = nav.confidence,
            estimatedDriftRadius = confidenceEngine.estimateDriftRadiusMeters(),
            timestamp = System.currentTimeMillis(),
            optionalNote = note
        )
        parkingManager.saveParkingPosition(spot)
        _savedParking.value = spot
    }
    fun clearParkingPosition() {
        parkingManager.clearParkingPosition()
        _savedParking.value = null
    }
    fun findMyCar() {
        val spot = _savedParking.value ?: return
        if (_navState.value.userPos == null || confidenceEngine.needsRelocalization()) {
            _qrScanError.value = "Vui long quet ma QR gan nhat de he thong xac dinh duong den bai xe."
            return
        }
        val gModel = graphModel ?: return
        val targetNodeId = if (spot.edgeId.isNotEmpty()) {
            spot.edgeId.split("->").firstOrNull() ?: findNearestNodeIdFromPos(spot.x, spot.y, gModel)
        } else {
            findNearestNodeIdFromPos(spot.x, spot.y, gModel)
        }
        if (targetNodeId != null) {
            val node = gModel.nodeMap[targetNodeId]
            val marker = if (node != null) {
                Offset(node.x.toFloat(), node.y.toFloat())
            } else {
                Offset(spot.x, spot.y)
            }
            _navState.value = _navState.value.copy(
                destinationPoiId = -1,
                destinationMarkerPos = marker,
            )
            updatePath(targetNodeId, force = true)
        } else {
            _qrScanError.value = "Khong the dinh tuyen den vi tri xe da luu."
        }
    }
    private fun findNearestNodeIdFromPos(x: Float, y: Float, gModel: GraphModel): String? {
        return gModel.nodeMap.values.minByOrNull { node ->
            val dx = node.x.toFloat() - x
            val dy = node.y.toFloat() - y
            dx * dx + dy * dy
        }?.nodeId
    }
    // Extension function: lam tron Float den N chu so thap phan
    // Dung trong log de hien thi met dep hon (vd: 2.3m thay vi 2.3423423m)
    // Su dung Math.round() de lam tron dung (khong phai cat so)
    private fun Float.roundTo(decimals: Int): Float {
        val multiplier = Math.pow(10.0, decimals.toDouble())
        return Math.round(this * multiplier.toFloat()).toFloat() / multiplier.toFloat()
    }
    // Khi ViewModel bi destroy (user thoat man hinh):
    //  1. Dung LocationEngine (tat cam bien, dung TPF/PDR)
    //  2. Dung GPS geofence (tiet kiem pin, khong leak background service)
    //  3. Clear detectedBuilding state (tranh memory leak)
    override fun onCleared() {
        super.onCleared()
        locationEngine?.stop()
        stopGpsGeofencing()
        _detectedBuilding.value = null
    }
}

