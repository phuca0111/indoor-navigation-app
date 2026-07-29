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
import com.khoaluan.indoornav.data.api.ActiveEmergencyHazardZoneDto
import com.khoaluan.indoornav.data.api.BuildingExplorerDto
import com.khoaluan.indoornav.data.api.IndoorSearchHitDto
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.isMarkedFinalExit
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
import com.khoaluan.indoornav.data.local.IndoorSessionStore
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
import com.khoaluan.indoornav.navigation.emergency.BuildingActiveEmergency
import com.khoaluan.indoornav.navigation.emergency.DefaultEmergencyRoutingAdapter
import com.khoaluan.indoornav.navigation.emergency.EmergencyPhase
import com.khoaluan.indoornav.navigation.emergency.EmergencySession
import com.khoaluan.indoornav.navigation.emergency.HazardZoneDraw
import com.khoaluan.indoornav.navigation.gps.OnSiteGate
import com.khoaluan.indoornav.navigation.graph.SafePoiLocator
import com.khoaluan.indoornav.ui.components.PoiCategory
import com.khoaluan.indoornav.ui.components.resolveCategory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
// Trang thai UI cua ban do - 3 trang thai: Loading / Success / Error
/** Chu kỳ poll REST fallback — FCM high-priority là kênh chính; poll chỉ đồng bộ zone / mất push. */
private const val EMERGENCY_POLL_INTERVAL_MS = 45_000L
/** Poll nhanh lần đầu sau khi vào tòa (bắt kịp sự cố ACTIVE nếu miss FCM). */
private const val EMERGENCY_POLL_FIRST_DELAY_MS = 1_500L

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
    /** Tên đích hiển thị (POI / lối thoát / điểm chọn trên map). */
    val destinationLabel: String? = null,
    /** Pin đích khi đã chọn phòng/POI nhưng chưa bấm "Xem đường" (G1). */
    val destinationMarkerPos: Offset? = null,
    /** Module #11 — điểm bắt đầu sau quét QR (giữ để vẽ pin). */
    val startAnchorPos: Offset? = null,
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
    /** #10 — trong ~2m connector → UI mở sheet / CTA đổi tầng. */
    val readyForFloorSwitch: Boolean = false,
    /** W3 — đích cuối cùng trên tầng khác (sau khi đổi tầng tiếp tục A*). */
    val pendingDestFloor: Int? = null,
    val pendingDestNodeId: String? = null,
    /** Điểm rẽ tiếp theo trên map (px) — vẽ chấm + mũi tên. */
    val nextManeuverPos: Offset? = null,
    /** TURN_LEFT / TURN_RIGHT / ARRIVE / … */
    val nextManeuverType: String? = null,
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

/** Module #8 — trạng thái chuyển Outdoor → Indoor. */
sealed interface IndoorEntryUiState {
    object Idle : IndoorEntryUiState
    data class Entering(val buildingId: String, val message: String) : IndoorEntryUiState
    data class Failed(val buildingId: String, val message: String) : IndoorEntryUiState
}

data class MapCameraState(
    val scale: Float = 1f,
    val offset: Offset = Offset.Zero,
    val isAutoFollow: Boolean = false
)
class MapViewModel(application: Application) : AndroidViewModel(application) {
    private val context = application.applicationContext
    private val indoorSessionStore = IndoorSessionStore(context)
    private val mapCacheManager = MapCacheManager(context)
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

    /** Đồng bộ cạnh path → LocationEngine để chấm user bám đường xanh khi đi. */
    private fun syncRouteSnapToEngine() {
        locationEngine?.setRouteSnapEdges(
            if (_navState.value.isNavigatingMode && activePathEdges.isNotEmpty()) {
                activePathEdges
            } else {
                emptyList()
            },
        )
    }

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

    /** Phiên khẩn cấp — overlay + sơ tán. */
    private val _emergencySession = MutableStateFlow(EmergencySession())
    val emergencySession: StateFlow<EmergencySession> = _emergencySession.asStateFlow()
    /**
     * Vùng nguy hiểm ACTIVE của tòa đang mở — luôn vẽ trên map
     * (kể cả khi user chưa bấm sơ tán / đã tắt màn đỏ).
     */
    private val _mapHazardZones = MutableStateFlow<List<HazardZoneDraw>>(emptyList())
    val mapHazardZones: StateFlow<List<HazardZoneDraw>> = _mapHazardZones.asStateFlow()
    /**
     * Sự cố ACTIVE tại tòa (kể cả sau khi user Đóng overlay) —
     * dùng hiện banner mở lại chỉ đường thoát hiểm.
     */
    private val _buildingActiveEmergency = MutableStateFlow<BuildingActiveEmergency?>(null)
    val buildingActiveEmergency: StateFlow<BuildingActiveEmergency?> =
        _buildingActiveEmergency.asStateFlow()
    private var emergencyWatchJob: Job? = null
    private var watchedEmergencyBuildingId: String? = null
    /** Sự cố user đã tắt — không auto bật lại overlay ở lần poll sau (vẫn có banner mở lại). */
    private val dismissedIncidentIds = mutableSetOf<String>()
    /** Đã thông báo “xem từ xa” cho incident này — tránh spam notice mỗi lần poll. */
    private val remoteViewNotifiedIncidentIds = mutableSetOf<String>()
    /** True nếu lần vào indoor này đã claim presence (on-site). */
    private var indoorPresenceClaimed: Boolean = false

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
        var lastFarClearAt = 0L
        gpsGeofenceManager.startMonitoring(
            buildings = buildings,
            onEnter = { building ->
                _detectedBuilding.value = building
                val gps = building.gpsLocation
                val fix = gpsGeofenceManager.getLastOutdoorFix()
                com.khoaluan.indoornav.navigation.gps.PresenceHintStore.markEnter(
                    getApplication(),
                    building.id
                )
                com.khoaluan.indoornav.fcm.PresenceSync.update(
                    context = getApplication(),
                    buildingId = building.id,
                    lat = fix?.latitude,
                    lng = fix?.longitude,
                    accuracy = fix?.accuracyMeters,
                    buildingLat = gps?.lat,
                    buildingLng = gps?.lng,
                    touchIndoor = true,
                    indoorSessionOpen = false,
                    includeRadio = true,
                )
            },
            onLocation = { loc ->
                // Snapshot GPS outdoor — không gắn building_lat ở đây (tránh L5 clear nhầm tòa khác)
                com.khoaluan.indoornav.fcm.PresenceSync.update(
                    context = getApplication(),
                    lat = loc.latitude,
                    lng = loc.longitude,
                    accuracy = if (loc.hasAccuracy()) loc.accuracy else null,
                )
            },
            onFarAway = { building, dist ->
                val now = System.currentTimeMillis()
                if (now - lastFarClearAt < 60_000L) return@startMonitoring
                lastFarClearAt = now
                val gps = building.gpsLocation
                val fix = gpsGeofenceManager.getLastOutdoorFix()
                Log.i("MapViewModel", "Spec D clear presence: ${building.name} dist=${dist}m")
                com.khoaluan.indoornav.fcm.PresenceSync.update(
                    context = getApplication(),
                    clearPresence = true,
                    lat = fix?.latitude,
                    lng = fix?.longitude,
                    accuracy = fix?.accuracyMeters,
                    buildingLat = gps?.lat,
                    buildingLng = gps?.lng,
                )
            },
        )
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
        var fromList = 1
        val listState = _buildingListState.value
        if (listState is BuildingListUiState.Success) {
            val b = listState.buildings.find { it.id == buildingId }
            if (b != null) fromList = b.totalFloors.coerceAtLeast(1)
        }
        // Prefetch / cache có thể biết nhiều tầng hơn field totalFloors trên Building
        val fromCache = if (cachedBuildingIdForFloors == buildingId && buildingFloorCache.isNotEmpty()) {
            (buildingFloorCache.keys.maxOrNull() ?: 0) + 1
        } else {
            0
        }
        val ui = _uiState.value as? MapUiState.Success
        val fromUi = if (ui?.buildingId == buildingId) ui.floorNumber + 1 else 0
        return maxOf(fromList, fromCache, fromUi, 1)
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
        stairsSeedHoldPos = null
        stairsSeedHoldUntilMs = 0L
        graphModel = null
        pathfinder = null
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        lastRerouteAtMs = 0L
        if (clearCrossFloorPending) {
            pendingCrossFloor = null
            stairsDepartHintX = null
            stairsDepartHintY = null
            buildingFloorCache.clear()
            _crossFloorRooms.value = emptyList()
        }
        val pending = pendingCrossFloor
        val emergencyLabel = _emergencySession.value.targetLabel
        val emergencyEvac = _emergencySession.value.active &&
            (_emergencySession.value.phase == EmergencyPhase.EVACUATING ||
                _emergencySession.value.phase == EmergencyPhase.ALERT)
        _navState.value = if ((pending != null && !clearCrossFloorPending) || emergencyEvac) {
            val realPending = pending?.takeIf { it.nodeId != "pending-exit" }
            val marker = realPending
                ?.takeIf { it.markerX != 0f || it.markerY != 0f }
                ?.let { Offset(it.markerX, it.markerY) }
            NavigationState(
                pendingDestFloor = pending?.floor,
                pendingDestNodeId = realPending?.nodeId,
                destinationNodeId = realPending?.nodeId,
                destinationMarkerPos = marker,
                suggestedTargetFloor = pending?.floor
                    ?: _emergencySession.value.suggestedExitFloor,
                destinationLabel = emergencyLabel,
                isNavigatingMode = emergencyEvac,
            )
        } else {
            NavigationState()
        }
    }

    private data class PendingCrossFloor(
        val floor: Int,
        /** Đích trên tầng đó (vd. EXIT). */
        val nodeId: String,
        val markerX: Float,
        val markerY: Float,
        /** Node cầu thang / thang máy vừa bước sang tầng này — neo định vị, không cần QR. */
        val arrivalNodeId: String? = null,
        /** Gợi ý XY chân cầu thang đích (khớp POI đầu/cuối giữa 2 tầng). */
        val arrivalHintX: Float? = null,
        val arrivalHintY: Float? = null,
    )

    /** W3 — giữ đích khi đổi tầng giữa chừng. */
    private var pendingCrossFloor: PendingCrossFloor? = null
    /** XY POI cầu thang tầng vừa rời — dùng chọn đúng đầu/cuối trên tầng mới. */
    private var stairsDepartHintX: Float? = null
    private var stairsDepartHintY: Float? = null

    /** Bán kính snap POI cầu thang → node đi được (POI có thể lệch ~80–100px). */
    private val stairsSnapPx2 = 120.0 * 120.0

    private fun isStairsOrElevatorPoi(poi: com.khoaluan.indoornav.data.model.Poi): Boolean =
        when (poi.resolveCategory()) {
            PoiCategory.STAIRS, PoiCategory.ELEVATOR, PoiCategory.ESCALATOR -> true
            else -> false
        }

    private fun listStairsPois(mapData: MapData): List<com.khoaluan.indoornav.data.model.Poi> =
        mapData.pois.filter { isStairsOrElevatorPoi(it) }

    /**
     * Chọn POI cầu thang phù hợp khi có nhiều mốc đầu/cuối:
     * ưu tiên gần hint (tọa độ tầng trước / pending), không thì gần node graph nhất.
     */
    private fun pickBestStairsPoi(
        mapData: MapData,
        gModel: GraphModel,
        hintX: Float? = null,
        hintY: Float? = null,
    ): com.khoaluan.indoornav.data.model.Poi? {
        val stairs = listStairsPois(mapData)
        if (stairs.isEmpty()) return null
        if (stairs.size == 1) return stairs.first()
        if (hintX != null && hintY != null) {
            return stairs.minByOrNull { p ->
                val dx = p.x.toFloat() - hintX
                val dy = p.y.toFloat() - hintY
                dx * dx + dy * dy
            }
        }
        // Không hint: chọn POI sát node đi được nhất (tránh icon giữa phòng)
        return stairs.minByOrNull { p ->
            val nid = SafePoiLocator.nearestNodeIdForPoi(gModel, p) ?: return@minByOrNull Float.MAX_VALUE
            val n = gModel.nodeMap[nid] ?: return@minByOrNull Float.MAX_VALUE
            val dx = (n.x - p.x).toDouble()
            val dy = (n.y - p.y).toDouble()
            (dx * dx + dy * dy).toFloat()
        }
    }
    /** W3 — cache MapData theo floor của building đang mở. */
    private val buildingFloorCache = mutableMapOf<Int, MapData>()
    private var cachedBuildingIdForFloors: String? = null
    private val _crossFloorRooms = MutableStateFlow<List<CrossFloorRoom>>(emptyList())
    val crossFloorRooms: StateFlow<List<CrossFloorRoom>> = _crossFloorRooms.asStateFlow()

    data class CrossFloorRoom(val floor: Int, val room: Room)

    private val _indoorEntryState = MutableStateFlow<IndoorEntryUiState>(IndoorEntryUiState.Idle)
    val indoorEntryState: StateFlow<IndoorEntryUiState> = _indoorEntryState.asStateFlow()

    /** GĐ2 — cache explorer theo buildingId (preview + detail). */
    private val _buildingExplorer = MutableStateFlow<BuildingExplorerDto?>(null)
    val buildingExplorer: StateFlow<BuildingExplorerDto?> = _buildingExplorer.asStateFlow()
    private val _buildingExplorerLoading = MutableStateFlow(false)
    val buildingExplorerLoading: StateFlow<Boolean> = _buildingExplorerLoading.asStateFlow()

    /** GĐ4 — kết quả tìm POI trong nhà từ outdoor. */
    private val _indoorSearchHits = MutableStateFlow<List<IndoorSearchHitDto>>(emptyList())
    val indoorSearchHits: StateFlow<List<IndoorSearchHitDto>> = _indoorSearchHits.asStateFlow()
    private val _indoorSearchLoading = MutableStateFlow(false)
    val indoorSearchLoading: StateFlow<Boolean> = _indoorSearchLoading.asStateFlow()

    /** POI cần focus sau khi load map (từ Indoor Search). */
    private var pendingFocusPoiId: Int? = null

    fun clearIndoorEntryState() {
        _indoorEntryState.value = IndoorEntryUiState.Idle
    }

    fun clearBuildingExplorer() {
        _buildingExplorer.value = null
        _buildingExplorerLoading.value = false
        _placeReviews.value = emptyList()
        _placeReviewsLoading.value = false
    }

    private val _placeReviews = MutableStateFlow<List<com.khoaluan.indoornav.data.api.PlaceReviewDto>>(emptyList())
    val placeReviews: StateFlow<List<com.khoaluan.indoornav.data.api.PlaceReviewDto>> = _placeReviews.asStateFlow()
    private val _placeReviewsLoading = MutableStateFlow(false)
    val placeReviewsLoading: StateFlow<Boolean> = _placeReviewsLoading.asStateFlow()

    fun fetchPlaceReviews(placeId: String?) {
        val id = placeId?.trim().orEmpty()
        if (id.isBlank()) {
            _placeReviews.value = emptyList()
            return
        }
        viewModelScope.launch {
            _placeReviewsLoading.value = true
            try {
                val res = RetrofitClient.getApiService().listPlaceReviews(id, limit = 20)
                _placeReviews.value = if (res.isSuccessful) {
                    res.body()?.reviews.orEmpty()
                } else {
                    emptyList()
                }
            } catch (_: Exception) {
                _placeReviews.value = emptyList()
            } finally {
                _placeReviewsLoading.value = false
            }
        }
    }

    fun fetchBuildingExplorer(buildingId: String) {
        if (buildingId.isBlank() || buildingId.startsWith("place:")) {
            clearBuildingExplorer()
            return
        }
        viewModelScope.launch {
            _buildingExplorerLoading.value = true
            try {
                val res = RetrofitClient.getApiService().getBuildingExplorer(buildingId)
                _buildingExplorer.value = if (res.isSuccessful) res.body() else null
            } catch (_: Exception) {
                _buildingExplorer.value = null
            } finally {
                _buildingExplorerLoading.value = false
            }
        }
    }

    fun searchIndoorPois(query: String) {
        val q = query.trim()
        if (q.length < 2) {
            _indoorSearchHits.value = emptyList()
            _indoorSearchLoading.value = false
            return
        }
        viewModelScope.launch {
            _indoorSearchLoading.value = true
            try {
                val res = RetrofitClient.getApiService().searchIndoorPois(q, limit = 30)
                _indoorSearchHits.value = if (res.isSuccessful) {
                    res.body()?.results.orEmpty()
                } else emptyList()
            } catch (_: Exception) {
                _indoorSearchHits.value = emptyList()
            } finally {
                _indoorSearchLoading.value = false
            }
        }
    }

    fun clearIndoorSearch() {
        _indoorSearchHits.value = emptyList()
        _indoorSearchLoading.value = false
    }

    fun lastFloorFor(buildingId: String): Int = indoorSessionStore.getLastFloor(buildingId)

    private fun resolveBuildingGps(buildingId: String): Pair<Double, Double>? {
        val list = (_buildingListState.value as? BuildingListUiState.Success)?.buildings ?: return null
        val g = list.firstOrNull { it.id == buildingId }?.gpsLocation ?: return null
        val lat = g.lat
        val lng = g.lng
        if (!lat.isFinite() || !lng.isFinite() || (lat == 0.0 && lng == 0.0)) return null
        return lat to lng
    }

    private fun siteStatusFor(buildingId: String): OnSiteGate.Status {
        val gps = resolveBuildingGps(buildingId)
        return OnSiteGate.evaluate(
            context = getApplication(),
            buildingId = buildingId,
            buildingLat = gps?.first,
            buildingLng = gps?.second,
            lastOutdoorFix = gpsGeofenceManager.getLastOutdoorFix(),
        )
    }

    /**
     * Module #8 — vào Indoor: nhớ tầng · load map · preload tầng lân cận · báo Ready qua callback.
     */
    fun enterIndoorSession(
        buildingId: String,
        totalFloors: Int = 1,
        preferredFloor: Int? = null,
        focusPoiId: Int? = null,
        onReady: (buildingId: String) -> Unit = {},
    ) {
        if (buildingId.isBlank()) return
        pendingFocusPoiId = focusPoiId
        viewModelScope.launch {
            val safeTotal = totalFloors.coerceAtLeast(1)
            val remembered = indoorSessionStore.getLastFloor(buildingId, 0)
            val startFloor = (preferredFloor ?: remembered).coerceIn(0, safeTotal - 1)
            _indoorEntryState.value = IndoorEntryUiState.Entering(
                buildingId = buildingId,
                message = "Đang tải tầng $startFloor · preload bản đồ…",
            )
            fetchMapJob?.cancel()
            val ok = loadMapInternal(buildingId, startFloor)
            if (!ok) {
                pendingFocusPoiId = null
                _indoorEntryState.value = IndoorEntryUiState.Failed(
                    buildingId = buildingId,
                    message = "Không tải được bản đồ tầng $startFloor. Kiểm tra xuất bản trên trình soạn thảo web hoặc mạng.",
                )
                return@launch
            }
            indoorSessionStore.saveLastFloor(buildingId, startFloor)
            _indoorEntryState.value = IndoorEntryUiState.Idle
            val site = siteStatusFor(buildingId)
            if (OnSiteGate.allowsPresenceClaim(site)) {
                // Spec D — chỉ claim presence khi đang tại / gần tòa
                indoorPresenceClaimed = true
                recordHistory(
                    type = "VIEW_INDOOR",
                    buildingId = buildingId,
                    label = buildingId,
                )
                com.khoaluan.indoornav.fcm.PresenceSync.update(
                    context = getApplication(),
                    buildingId = buildingId,
                    floor = startFloor,
                    indoorSessionOpen = true,
                    touchIndoor = true,
                    includeRadio = true,
                )
            } else {
                // Xem map từ xa: không presence / không học radio / không history broadcast
                indoorPresenceClaimed = false
                Log.i(
                    "MapViewModel",
                    "Remote/unknown map view building=$buildingId site=$site — skip presence+radio"
                )
            }
            val poiFocus = pendingFocusPoiId
            pendingFocusPoiId = null
            if (poiFocus != null) {
                setDestinationPoi(poiFocus)
            }
            onReady(buildingId)
            preloadAdjacentFloors(buildingId, startFloor, safeTotal)
        }
    }

    fun rememberCurrentFloor() {
        val s = _uiState.value as? MapUiState.Success ?: return
        indoorSessionStore.saveLastFloor(s.buildingId, s.floorNumber)
    }

    private fun preloadAdjacentFloors(buildingId: String, currentFloor: Int, totalFloors: Int) {
        viewModelScope.launch {
            val neighbors = listOf(currentFloor - 1, currentFloor + 1)
                .filter { it in 0 until totalFloors }
            for (f in neighbors) {
                preloadFloorToCache(buildingId, f)
            }
        }
    }

    private suspend fun preloadFloorToCache(buildingId: String, floor: Int) {
        if (mapCacheManager.has(buildingId, floor)) return
        try {
            val api = RetrofitClient.getApiService()
            val response = api.getMapByFloor(buildingId, floor)
            if (response.isSuccessful) {
                response.body()?.let { mapCacheManager.save(buildingId, it.floorNumber, it) }
                Log.i("MapViewModel", "Preloaded floor $floor for $buildingId")
            }
        } catch (e: Exception) {
            Log.w("MapViewModel", "Preload floor $floor failed: ${e.message}")
        }
    }

    fun exitIndoorNavigation() {
        rememberCurrentFloor()
        val s = _uiState.value as? MapUiState.Success
        if (indoorPresenceClaimed && s != null) {
            com.khoaluan.indoornav.fcm.PresenceSync.update(
                context = getApplication(),
                buildingId = s.buildingId,
                floor = s.floorNumber,
                indoorSessionOpen = false,
            )
        } else if (indoorPresenceClaimed) {
            com.khoaluan.indoornav.fcm.PresenceSync.update(
                context = getApplication(),
                indoorSessionOpen = false,
            )
        }
        indoorPresenceClaimed = false
        clearLocalizationSession()
        cachedOutdoorGpsCourseDeg = null
        _indoorEntryState.value = IndoorEntryUiState.Idle
        // Xóa Success để MainActivity không auto-restore currentBuildingId
        _uiState.value = MapUiState.Loading
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
    /** W2 — dưới ngưỡng này (mét) → Đã đến nơi. Trước 4m quá rộng với nhà nhỏ. */
    private val arriveThresholdMeters = 1.8f
    /** Tránh gọi lại updatePath liên tục khi chưa tới pin đỏ. */
    private var lastRepathToPinAtMs = 0L
    /** Early-turn: heading khớp hướng sau rẽ từ lúc nào (ms). */
    private var earlyTurnAlignSinceMs = 0L
    private var earlyTurnAlignManeuverAt = Float.NaN
    private val earlyTurnStableMs = 280L
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

    private val _indoorTarget =
        MutableStateFlow<com.khoaluan.indoornav.data.api.IndoorTargetSummaryDto?>(null)
    val indoorTarget: StateFlow<com.khoaluan.indoornav.data.api.IndoorTargetSummaryDto?> =
        _indoorTarget.asStateFlow()
    private val _indoorReviews =
        MutableStateFlow<List<com.khoaluan.indoornav.data.api.IndoorReviewItemDto>>(emptyList())
    val indoorReviews: StateFlow<List<com.khoaluan.indoornav.data.api.IndoorReviewItemDto>> =
        _indoorReviews.asStateFlow()
    fun clearIndoorTarget() {
        _indoorTarget.value = null
        _indoorReviews.value = emptyList()
    }

    /** Favorite/hub trả 401 → MainActivity mở lại Login. */
    private val _authRequired = MutableStateFlow(false)
    val authRequired: StateFlow<Boolean> = _authRequired.asStateFlow()
    fun consumeAuthRequired() { _authRequired.value = false }
    fun requireAuth() { _authRequired.value = true }

    /** placeId → đã yêu thích (Hub sync). */
    private val _favoritePlaceIds = MutableStateFlow<Set<String>>(emptySet())
    val favoritePlaceIds: StateFlow<Set<String>> = _favoritePlaceIds.asStateFlow()
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

    /** Snap lại từ Rotation Vector — không căn hành lang / không đổi mapNorthOffset. */
    fun resyncHeadingFromSensors() {
        val engine = locationEngine ?: return
        engine.requestHeadingResync(reason = "manual_snap")
        syncMapNorthOffsetFromEngine()
        _navState.update {
            it.copy(navHint = "Đã sync hướng cảm biến (căn Bắc = map_bearing_offset)")
        }
    }

    private fun syncMapNorthOffsetFromEngine() {
        _mapNorthOffsetDeg.value = locationEngine?.effectiveMapNorthOffsetDeg ?: 0f
    }
    init {
        // Không fetchBuildings ở đây — chờ user qua Login/Guest rồi MainActivity gọi
        // (tránh geofence “Phát hiện tòa nhà” đè màn đăng nhập).
    }
    fun refreshMap(buildingId: String, level: Int = 0) {
        // Khẩn cấp: KHÔNG đi softClear+fetchMap (xóa userPos rồi cancel job → kẹt
        // “Quét QR” + đích 0 m). Luôn swap in-place + neo cầu thang.
        val emergencyActive = _emergencySession.value.active &&
            (_emergencySession.value.phase == EmergencyPhase.EVACUATING ||
                _emergencySession.value.phase == EmergencyPhase.ALERT ||
                _emergencySession.value.phase == EmergencyPhase.AWAITING_FLOOR ||
                _emergencySession.value.phase == EmergencyPhase.AWAITING_LOCATION)
        if (emergencyActive) {
            Log.i("MapViewModel", "refreshMap → emergency in-place floor=$level")
            switchFloorDuringEmergency(level)
            return
        }
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
        fetchMap(buildingId, level, preserveCrossFloorPending = pendingCrossFloor?.floor == level)
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
                        // OS geofence: vào vùng tòa dù app đóng → PresenceSync (L1/L4)
                        com.khoaluan.indoornav.navigation.gps.BuildingGeofenceRegistrar
                            .registerForBuildings(getApplication(), buildings)
                    } else {
                        stopGpsGeofencing()
                        _detectedBuilding.value = null
                        com.khoaluan.indoornav.navigation.gps.BuildingGeofenceRegistrar
                            .removeAll(getApplication())
                    }
                    // Outdoor parity: gắn Place category/slug + marker Place-only
                    fetchPlaces()
                } else {
                    _buildingListState.value = BuildingListUiState.Error("Lỗi: ${response.code()}")
                }
            } catch (e: Exception) {
                _buildingListState.value = BuildingListUiState.Error("Lỗi mạng: ${e.message}")
            }
        }
    }

    /** GĐ8 — tải Place Registry (song song / thay discovery). */
    fun fetchPlaces(query: String? = null, category: String? = null) {
        viewModelScope.launch {
            _placeListState.value = PlaceListUiState.Loading
            try {
                val api = RetrofitClient.getApiService()
                val cat = category?.trim()?.takeIf { it.isNotEmpty() }
                val places = if (query.isNullOrBlank() && cat == null) {
                    val response = api.getPlaces(limit = 80)
                    if (!response.isSuccessful) {
                        val msg = when (response.code()) {
                            401, 403 -> "Place Registry chưa public trên server."
                            else -> "Lỗi Place: ${response.code()}"
                        }
                        _placeListState.value = PlaceListUiState.Error(msg)
                        return@launch
                    }
                    response.body()?.places.orEmpty()
                } else {
                    val pair = com.khoaluan.indoornav.ui.search.BuildingSearchText
                        .parseLatLngPair(query.orEmpty())
                    val response = api.searchPlaces(
                        com.khoaluan.indoornav.data.api.PlaceSearchBody(
                            q = if (pair == null) query?.takeIf { it.isNotBlank() } else null,
                            category = cat,
                            lat = pair?.first,
                            lng = pair?.second,
                            radiusM = if (pair != null) 400 else null,
                            limit = 80,
                        )
                    )
                    if (!response.isSuccessful) {
                        val msg = when (response.code()) {
                            401, 403 -> "Place Registry chưa public trên server."
                            else -> "Lỗi Place: ${response.code()}"
                        }
                        _placeListState.value = PlaceListUiState.Error(msg)
                        return@launch
                    }
                    response.body()?.places.orEmpty()
                }
                _placeListState.value = PlaceListUiState.Success(places)
                mergePlacesIntoBuildings(places)
            } catch (e: Exception) {
                _placeListState.value = PlaceListUiState.Error("Lỗi mạng Place: ${e.message}")
            }
        }
    }

    /** Gắn category/slug Place vào Building list (outdoor parity). */
    private fun mergePlacesIntoBuildings(places: List<com.khoaluan.indoornav.data.api.PlaceDto>) {
        val current = _buildingListState.value
        if (current !is BuildingListUiState.Success) return
        val byId = places.associateBy { it.id }
        val merged = current.buildings.map { b ->
            val p = b.placeId?.let { byId[it] } ?: return@map b
            b.copy(
                placeSlug = p.slug ?: b.placeSlug,
                category = p.category ?: b.category,
                description = p.description ?: b.description,
                aliases = p.aliases ?: b.aliases,
                address = b.address?.takeIf { it.isNotBlank() } ?: p.address,
                hasPublishedIndoor = p.hasPublishedIndoor,
            )
        }
        // Place chưa có building: thêm marker tạm (id = place:{id})
        val existingPlaceIds = merged.mapNotNull { it.placeId }.toSet()
        val extras = places.filter { it.id !in existingPlaceIds && (it.latitude != 0.0 || it.longitude != 0.0) }
            .map { p ->
                com.khoaluan.indoornav.data.model.Building(
                    id = "place:${p.id}",
                    name = p.name,
                    address = p.address,
                    description = p.description,
                    placeId = p.id,
                    placeSlug = p.slug,
                    category = p.category,
                    aliases = p.aliases,
                    gpsLocation = com.khoaluan.indoornav.data.model.GPSLocation(p.latitude, p.longitude),
                    totalFloors = 1,
                    hasPublishedIndoor = p.hasPublishedIndoor,
                )
            }
        _buildingListState.value = BuildingListUiState.Success(merged + extras)
    }

    /** Deep-link /outdoor/place/{slug} (alias /app/place) → chọn Place trên map. */
    fun openPlaceDeepLink(slugOrId: String, onFound: (com.khoaluan.indoornav.data.model.Building) -> Unit) {
        if (slugOrId.isBlank()) return
        viewModelScope.launch {
            try {
                val api = RetrofitClient.getApiService()
                var place = api.getPlaceBySlugOrId(slugOrId).body()?.place
                if (place == null) {
                    place = api.getPlacePublic(slugOrId).body()?.place
                        ?: api.getPlace(slugOrId).body()?.place
                }
                if (place == null) {
                    _placeNotice.value = "Không tìm thấy Place: $slugOrId"
                    return@launch
                }
                mergePlacesIntoBuildings(listOf(place))
                val current = _buildingListState.value
                val building = if (current is BuildingListUiState.Success) {
                    current.buildings.firstOrNull { it.placeId == place.id }
                } else null
                val target = building ?: com.khoaluan.indoornav.data.model.Building(
                    id = "place:${place.id}",
                    name = place.name,
                    address = place.address,
                    placeId = place.id,
                    placeSlug = place.slug,
                    category = place.category,
                    gpsLocation = com.khoaluan.indoornav.data.model.GPSLocation(place.latitude, place.longitude),
                    hasPublishedIndoor = place.hasPublishedIndoor,
                )
                refreshFavoriteState(place.id)
                recordHistory("VIEW_PLACE", place.id, null, place.name)
                recordPlaceView(place.slug ?: place.id)
                onFound(target)
            } catch (e: Exception) {
                _placeNotice.value = "Deep-link lỗi: ${e.message}"
            }
        }
    }

    /** Ghi Place.view_count (Creator analytics). */
    fun recordPlaceView(slugOrId: String) {
        if (slugOrId.isBlank()) return
        viewModelScope.launch {
            try {
                RetrofitClient.getApiService().recordPlaceView(slugOrId)
            } catch (_: Exception) {
                // fire-and-forget
            }
        }
    }

    private val _followingPlaceIds = MutableStateFlow<Set<String>>(emptySet())
    val followingPlaceIds: StateFlow<Set<String>> = _followingPlaceIds.asStateFlow()

    /** Sync Hub Community following → Outdoor map chips Follow. */
    fun refreshFollowingPlaces() {
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().listFollowing()
                if (!res.isSuccessful) return@launch
                val ids = res.body()?.following.orEmpty()
                    .mapNotNull { it.placeId?.takeIf { id -> id.isNotBlank() } }
                    .toSet()
                _followingPlaceIds.value = ids
            } catch (_: Exception) {
                // Guest / offline
            }
        }
    }

    fun toggleFollowPlace(placeId: String) {
        if (placeId.isBlank()) return
        viewModelScope.launch {
            try {
                val api = RetrofitClient.getApiService()
                val currently = placeId in _followingPlaceIds.value
                if (currently) {
                    val res = api.unfollowPlace(placeId)
                    if (res.isSuccessful) {
                        _followingPlaceIds.update { it - placeId }
                        _placeNotice.value = "Đã bỏ theo dõi"
                    } else if (res.code() == 401) {
                        _authRequired.value = true
                    } else {
                        _placeNotice.value = "Không bỏ follow (${res.code()})"
                    }
                } else {
                    val res = api.followPlace(
                        com.khoaluan.indoornav.data.api.PlaceFollowBody(placeId)
                    )
                    if (res.isSuccessful) {
                        _followingPlaceIds.update { it + placeId }
                        _placeNotice.value = "Đã theo dõi Place"
                    } else if (res.code() == 401) {
                        _authRequired.value = true
                    } else {
                        _placeNotice.value = "Không follow được (${res.code()})"
                    }
                }
            } catch (e: Exception) {
                _placeNotice.value = "Follow lỗi: ${e.message}"
            }
        }
    }

    fun submitPlaceReview(placeId: String, rating: Int, comment: String? = null) {
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().upsertPlaceReview(
                    com.khoaluan.indoornav.data.api.PlaceReviewBody(placeId, rating, comment)
                )
                if (res.isSuccessful) {
                    val saved = res.body()?.review
                    if (saved != null) {
                        val rest = _placeReviews.value.filterNot {
                            it.id != null && it.id == saved.id ||
                                (it.placeId == placeId && it.user?.id != null && it.user.id == saved.user?.id)
                        }
                        _placeReviews.value = listOf(saved) + rest
                    }
                    _placeNotice.value = "Đã gửi đánh giá ★$rating"
                    recordHistory("REVIEW_PLACE", placeId, null, "★$rating")
                    fetchPlaceReviews(placeId)
                    val bid = _buildingExplorer.value?.buildingId
                    if (!bid.isNullOrBlank()) fetchBuildingExplorer(bid)
                } else if (res.code() == 401) {
                    _authRequired.value = true
                } else {
                    val err = res.errorBody()?.string()?.take(120).orEmpty()
                    _placeNotice.value = "Review lỗi (${res.code()})" +
                        if (err.isNotBlank()) ": $err" else ""
                }
            } catch (e: Exception) {
                _placeNotice.value = "Review: ${e.message}"
            }
        }
    }

    fun submitPlaceReport(placeId: String, reasonCode: String, detail: String? = null) {
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().createPlaceReport(
                    com.khoaluan.indoornav.data.api.PlaceReportBody(placeId, reasonCode, detail)
                )
                if (res.isSuccessful) {
                    _placeNotice.value = "Đã gửi báo cáo"
                    recordHistory("REPORT_PLACE", placeId, null, reasonCode)
                } else if (res.code() == 401) {
                    _authRequired.value = true
                } else {
                    _placeNotice.value = "Report lỗi (${res.code()})"
                }
            } catch (e: Exception) {
                _placeNotice.value = "Report: ${e.message}"
            }
        }
    }

    /** Đề xuất cộng đồng (map ngoài trời / trong nhà) — chờ Platform duyệt. */
    fun submitMapContribution(
        placeId: String?,
        buildingId: String? = null,
        type: String,
        title: String,
        description: String? = null,
        mapScope: String = "OUTDOOR",
        latitude: Double? = null,
        longitude: Double? = null,
    ) {
        viewModelScope.launch {
            try {
                val trimmed = title.trim()
                if (trimmed.length < 2) {
                    _placeNotice.value = "Nhập tiêu đề đề xuất"
                    return@launch
                }
                val res = RetrofitClient.getApiService().createMapContribution(
                    com.khoaluan.indoornav.data.api.MapContributionBody(
                        type = type.trim().uppercase(),
                        mapScope = mapScope.trim().uppercase(),
                        title = trimmed.take(200),
                        description = description?.trim()?.take(2000),
                        placeId = placeId,
                        buildingId = buildingId,
                        latitude = latitude,
                        longitude = longitude,
                    )
                )
                if (res.isSuccessful) {
                    _placeNotice.value = "Đã gửi đề xuất — chờ kiểm duyệt"
                    recordHistory("MAP_CONTRIBUTION", placeId, buildingId, type)
                } else if (res.code() == 401) {
                    _authRequired.value = true
                } else {
                    val err = res.errorBody()?.string().orEmpty()
                    _placeNotice.value = "Đề xuất lỗi (${res.code()})" +
                        if (err.isNotBlank()) ": ${err.take(80)}" else ""
                }
            } catch (e: Exception) {
                _placeNotice.value = "Đề xuất: ${e.message}"
            }
        }
    }

    fun loadIndoorTarget(
        buildingId: String,
        floorNumber: Int,
        entityKind: String,
        entityId: String,
        entityName: String? = null,
    ) {
        viewModelScope.launch {
            try {
                val api = RetrofitClient.getApiService()
                val kind = entityKind.uppercase()
                val res = api.getIndoorTarget(
                    buildingId = buildingId,
                    floor = floorNumber,
                    kind = kind,
                    entityId = entityId,
                    name = entityName,
                )
                if (res.isSuccessful) {
                    _indoorTarget.value = res.body()
                    _placeNotice.value = null
                } else {
                    _indoorTarget.value = null
                }
                val rev = api.listIndoorReviews(
                    buildingId = buildingId,
                    floor = floorNumber,
                    kind = kind,
                    entityId = entityId,
                    name = entityName,
                    limit = 20,
                )
                _indoorReviews.value = if (rev.isSuccessful) {
                    rev.body()?.reviews.orEmpty()
                } else {
                    emptyList()
                }
            } catch (_: Exception) {
                _indoorTarget.value = null
                _indoorReviews.value = emptyList()
            }
        }
    }

    fun submitIndoorReview(
        buildingId: String,
        floorNumber: Int,
        entityKind: String,
        entityId: String,
        rating: Int,
        comment: String? = null,
        entityName: String? = null,
    ) {
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().upsertIndoorReview(
                    com.khoaluan.indoornav.data.api.IndoorReviewBody(
                        buildingId = buildingId,
                        floorNumber = floorNumber,
                        entityKind = entityKind.uppercase(),
                        entityId = entityId,
                        rating = rating,
                        comment = comment,
                        entityName = entityName,
                    )
                )
                if (res.isSuccessful) {
                    _placeNotice.value = "Đã gửi đánh giá"
                    loadIndoorTarget(buildingId, floorNumber, entityKind, entityId, entityName)
                } else if (res.code() == 401) {
                    _authRequired.value = true
                } else {
                    val err = res.errorBody()?.string().orEmpty()
                    _placeNotice.value = "Đánh giá lỗi (${res.code()})" +
                        if (err.isNotBlank()) ": ${err.take(60)}" else ""
                }
            } catch (e: Exception) {
                _placeNotice.value = "Đánh giá: ${e.message}"
            }
        }
    }

    fun submitIndoorReport(
        buildingId: String,
        floorNumber: Int,
        entityKind: String,
        entityId: String,
        reasonCode: String,
        detail: String? = null,
        entityName: String? = null,
    ) {
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().createIndoorReport(
                    com.khoaluan.indoornav.data.api.IndoorReportBody(
                        buildingId = buildingId,
                        floorNumber = floorNumber,
                        entityKind = entityKind.uppercase(),
                        entityId = entityId,
                        reasonCode = reasonCode,
                        detail = detail,
                        entityName = entityName,
                    )
                )
                if (res.isSuccessful) {
                    _placeNotice.value = "Đã gửi báo cáo"
                } else if (res.code() == 401) {
                    _authRequired.value = true
                } else {
                    _placeNotice.value = "Báo cáo lỗi (${res.code()})"
                }
            } catch (e: Exception) {
                _placeNotice.value = "Báo cáo: ${e.message}"
            }
        }
    }

    fun toggleIndoorFavorite(
        buildingId: String,
        floorNumber: Int,
        entityKind: String,
        entityId: String,
        currentlyFavorite: Boolean,
        entityName: String? = null,
    ) {
        viewModelScope.launch {
            try {
                val session = com.khoaluan.indoornav.data.local.SessionManager(getApplication())
                if (!session.isLoggedIn) {
                    _authRequired.value = true
                    return@launch
                }
                val api = RetrofitClient.getApiService()
                val res = if (currentlyFavorite) {
                    api.removeIndoorFavorite(buildingId, floorNumber, entityKind.uppercase(), entityId)
                } else {
                    api.addIndoorFavorite(
                        com.khoaluan.indoornav.data.api.IndoorFavoriteBody(
                            buildingId = buildingId,
                            floorNumber = floorNumber,
                            entityKind = entityKind.uppercase(),
                            entityId = entityId,
                            entityName = entityName,
                        )
                    )
                }
                if (res.isSuccessful) {
                    _placeNotice.value = if (currentlyFavorite) "Đã bỏ lưu" else "Đã lưu phòng"
                    loadIndoorTarget(buildingId, floorNumber, entityKind, entityId, entityName)
                } else if (res.code() == 401) {
                    _authRequired.value = true
                } else {
                    _placeNotice.value = "Lưu lỗi (${res.code()})"
                }
            } catch (e: Exception) {
                _placeNotice.value = "Lưu: ${e.message}"
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
                    com.khoaluan.indoornav.ui.error.ErrorCenter.noIndoor(place?.name ?: placeId)
                    return@launch
                }
                val buildingId = indoor.first().id
                onBuilding(buildingId)
            } catch (e: Exception) {
                _placeNotice.value = "Lỗi Place: ${e.message}"
            }
        }
    }

    /** Hub — ghi lịch sử (fire-and-forget; bỏ qua nếu chưa login). */
    fun recordHistory(
        type: String,
        placeId: String? = null,
        buildingId: String? = null,
        label: String? = null,
    ) {
        viewModelScope.launch {
            try {
                val api = RetrofitClient.getApiService()
                api.addHistory(
                    com.khoaluan.indoornav.data.api.HubHistoryBody(
                        type = type,
                        placeId = placeId,
                        buildingId = buildingId,
                        label = label,
                    )
                )
            } catch (_: Exception) {
                // Guest / offline — bỏ qua
            }
        }
    }

    /** Hub — kiểm tra + toggle favorite Place. */
    fun refreshFavoriteState(placeId: String) {
        if (placeId.isBlank()) return
        viewModelScope.launch {
            try {
                val api = RetrofitClient.getApiService()
                val res = api.checkFavorite(placeId)
                if (res.isSuccessful && res.body()?.favorited == true) {
                    _favoritePlaceIds.update { it + placeId }
                } else {
                    _favoritePlaceIds.update { it - placeId }
                }
            } catch (_: Exception) { /* guest */ }
        }
    }

    fun toggleFavorite(placeId: String, placeName: String? = null) {
        if (placeId.isBlank()) return
        viewModelScope.launch {
            try {
                val session = com.khoaluan.indoornav.data.local.SessionManager(getApplication())
                session.bindToHttpClient()
                if (!session.isLoggedIn) {
                    _placeNotice.value = "Cần đăng nhập để lưu yêu thích"
                    _authRequired.value = true
                    return@launch
                }
                val api = RetrofitClient.getApiService()
                val currently = placeId in _favoritePlaceIds.value
                if (currently) {
                    val res = api.removeFavorite(placeId)
                    if (res.isSuccessful) {
                        _favoritePlaceIds.update { it - placeId }
                        _placeNotice.value = "Đã bỏ yêu thích"
                    } else if (res.code() == 401) {
                        session.clear()
                        _authRequired.value = true
                        _placeNotice.value = "Phiên đăng nhập hết hạn — vui lòng đăng nhập lại"
                    } else {
                        _placeNotice.value = "Không bỏ lưu được (${res.code()})"
                    }
                } else {
                    val res = api.addFavorite(
                        com.khoaluan.indoornav.data.api.HubPlaceIdBody(placeId)
                    )
                    if (res.isSuccessful) {
                        _favoritePlaceIds.update { it + placeId }
                        _placeNotice.value = "Đã thêm yêu thích"
                        recordHistory("FAVORITE_PLACE", placeId, null, placeName)
                    } else if (res.code() == 401) {
                        session.clear()
                        _authRequired.value = true
                        _placeNotice.value = "Phiên đăng nhập hết hạn — vui lòng đăng nhập lại"
                    } else {
                        _placeNotice.value = "Không lưu được (${res.code()})"
                    }
                }
            } catch (e: Exception) {
                _placeNotice.value = "Favorite lỗi: ${e.message}"
            }
        }
    }

    /** Tăng mỗi lần fetchMap — bỏ apply/resume của job đã cancel. */
    private var mapLoadGeneration: Int = 0

    // Lay ban do 1 tang tu backend, khoi tao GraphModel + LocationEngine
    // Goi khi: MapScreen vua vao (buildingId, floor=0) hoac user chon tang khac
    private fun fetchMap(buildingId: String, floor: Int, preserveCrossFloorPending: Boolean = false) {
        stopGpsGeofencing() // Tat GPS geofence de tiet kiem pin khi da vao Indoor
        val emergencyAtomic = _emergencySession.value.active &&
            (_emergencySession.value.phase == EmergencyPhase.EVACUATING ||
                _emergencySession.value.phase == EmergencyPhase.ALERT ||
                _emergencySession.value.phase == EmergencyPhase.AWAITING_LOCATION)
        if (emergencyAtomic) {
            // Khẩn cấp: KHÔNG clear graph/engine trước khi map mới apply (tránh “văng” / mất path)
            softClearPathForEmergencyFloorSwap(preserveCrossFloorPending)
        } else {
            // G1b: mỗi lần tải map mới → dừng engine cũ + xóa userPos
            clearLocalizationSession(clearCrossFloorPending = !preserveCrossFloorPending)
        }
        fetchMapJob?.cancel()
        val gen = ++mapLoadGeneration
        fetchMapJob = viewModelScope.launch {
            val ok = loadMapInternal(buildingId, floor, sessionAlreadyCleared = true)
            if (gen != mapLoadGeneration) return@launch
            if (!ok && emergencyAtomic && graphModel != null &&
                _uiState.value is MapUiState.Success &&
                _emergencySession.value.active
            ) {
                // Load fail nhưng còn map cũ → neo lại + chỉ đường trên tầng đang hiện
                seedAtStairsThenContinueEmergency()
            }
        }
    }

    /** Chỉ xóa path hiển thị; giữ GraphModel/LocationEngine đến applyLoadedMap. */
    private fun softClearPathForEmergencyFloorSwap(preserveCrossFloorPending: Boolean) {
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        localizationMapKey = null
        lastRerouteAtMs = 0L
        if (!preserveCrossFloorPending) {
            pendingCrossFloor = null
        }
        val pending = pendingCrossFloor
        val realPending = pending?.takeIf { it.nodeId != "pending-exit" }
        val marker = realPending
            ?.takeIf { it.markerX != 0f || it.markerY != 0f }
            ?.let { Offset(it.markerX, it.markerY) }
        _navState.update {
            it.copy(
                path = emptyList(),
                userPos = null,
                startAnchorPos = null,
                hasArrived = false,
                isRerouting = false,
                navigationError = null,
                isNavigatingMode = true,
                pendingDestFloor = pending?.floor ?: it.pendingDestFloor,
                pendingDestNodeId = realPending?.nodeId,
                destinationNodeId = realPending?.nodeId ?: it.destinationNodeId,
                destinationMarkerPos = marker ?: it.destinationMarkerPos,
                suggestedTargetFloor = pending?.floor
                    ?: _emergencySession.value.suggestedExitFloor
                    ?: it.suggestedTargetFloor,
                destinationLabel = _emergencySession.value.targetLabel ?: it.destinationLabel,
            )
        }
    }

    /**
     * Suspend tải map + tạo engine. Dùng chung cho [fetchMap] và [startNavigation] (đổi tầng theo QR).
     * #8 — ưu tiên cache để vào Indoor nhanh, rồi refresh mạng nền.
     * @return true nếu Success và LocationEngine sẵn sàng
     */
    private suspend fun loadMapInternal(
        buildingId: String,
        floor: Int,
        sessionAlreadyCleared: Boolean = false,
    ): Boolean {
        stopGpsGeofencing()
        if (!sessionAlreadyCleared) {
            clearLocalizationSession()
        }
        val cache = mapCacheManager
        val cachedHit = cache.load(buildingId, floor)
        if (cachedHit != null) {
            Log.i("MapViewModel", "#8 cache-first floor=$floor building=$buildingId")
            val ok = applyLoadedMap(cachedHit, buildingId)
            if (ok) {
                // Khẩn cấp: đừng reload mạng ngay (tránh applyLoadedMap lần 2 làm mất path)
                if (!_emergencySession.value.active) {
                    refreshMapFromNetwork(buildingId, floor)
                }
            }
            return ok
        }
        // Đổi tầng khẩn cấp: giữ Success cũ trên UI thay vì Loading (tránh cảm giác “văng”)
        if (!(_emergencySession.value.active && _uiState.value is MapUiState.Success)) {
            _uiState.value = MapUiState.Loading
        }
        try {
            val api = RetrofitClient.getApiService()
            val response = api.getMapByFloor(buildingId, floor)
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    cache.save(buildingId, body.floorNumber, body)
                    return applyLoadedMap(body, buildingId)
                }
                failLoadMap("Du lieu trong!", keepMapIfEmergency = true)
            } else if (response.code() == 404) {
                failLoadMap(
                    "Tang $floor chua co ban do.\nHay ve va Publish tu Web Editor.",
                    keepMapIfEmergency = true,
                )
            } else {
                failLoadMap("Loi ket noi: ${response.code()}", keepMapIfEmergency = true)
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.e("MapViewModel", "Loi Exception", e)
            failLoadMap("Loi mang: ${e.message}", keepMapIfEmergency = true)
        }
        return false
    }

    /** Khẩn cấp: giữ bản đồ Success thay vì Error (tránh cảm giác bị văng khỏi map). */
    private fun failLoadMap(message: String, keepMapIfEmergency: Boolean) {
        if (keepMapIfEmergency &&
            _emergencySession.value.active &&
            _uiState.value is MapUiState.Success
        ) {
            _emergencySession.update { it.copy(error = message) }
            _navState.update { it.copy(navHint = message) }
            return
        }
        _uiState.value = MapUiState.Error(message)
    }

    /** Refresh map từ API sau cache-first; không ghi đè nếu đã localize. */
    private fun refreshMapFromNetwork(buildingId: String, floor: Int) {
        viewModelScope.launch {
            try {
                val api = RetrofitClient.getApiService()
                val response = api.getMapByFloor(buildingId, floor)
                if (!response.isSuccessful) return@launch
                val body = response.body() ?: return@launch
                mapCacheManager.save(buildingId, body.floorNumber, body)
                val s = _uiState.value as? MapUiState.Success ?: return@launch
                if (s.buildingId != buildingId || s.floorNumber != floor) return@launch
                if (localizationMapKey != null) return@launch
                applyLoadedMap(body, buildingId)
                Log.i("MapViewModel", "#8 network refresh applied floor=$floor")
            } catch (e: Exception) {
                Log.w("MapViewModel", "#8 network refresh skipped: ${e.message}")
            }
        }
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
        indoorSessionStore.saveLastFloor(buildingId, floorNumber)
        // Atomic swap: dừng engine cũ ngay trước khi gắn map mới (không để graph=null giữa chừng)
        locationEngine?.stop()
        locationEngine = null
        localizationMapKey = null
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
                    val holdPos = stairsSeedHoldPos
                    val holding = holdPos != null &&
                        System.currentTimeMillis() < stairsSeedHoldUntilMs
                    val posX = if (holding) holdPos.x else x
                    val posY = if (holding) holdPos.y else y
                    _navState.update { current ->
                        var newState = current.copy(
                            userPos = Offset(posX, posY),
                            userHeading = heading,
                            confidence = minOf(confidence, confidenceEngine.calculateCurrentConfidence()),
                            isTpfActive = isTpf,
                            particles = getParticles()
                        )
                        if (newState.isNavigatingMode && activePathEdges.isNotEmpty()) {
                            newState = applyTurnGuidance(newState, posX, posY)
                        }
                        if (locationEngine?.consumeHeadingConflictQrSuggestion() == true) {
                            newState = newState.copy(
                                navHint = "Hướng la bàn lệch với hướng đi. Hãy Snap hướng hoặc Quét lại QR."
                            )
                        }
                        // Đừng reroute ngay sau đổi tầng — gây nhảy path liên tục
                        if (!holding && System.currentTimeMillis() >= emergencyArriveBlockedUntilMs) {
                            newState.destinationNodeId?.let { destinationNodeId ->
                                maybeTriggerReroute(destinationNodeId)
                            }
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

    private fun currentHazardPolygons(floorNumber: Int? = null): List<List<Pair<Float, Float>>> {
        val floor = floorNumber
            ?: (_uiState.value as? MapUiState.Success)?.floorNumber
        val zones = _mapHazardZones.value.ifEmpty { _emergencySession.value.hazardZones }
        return zones
            .filter { (it.floorNumber ?: 0) == floor }
            .map { it.points }
            .filter { it.size >= 3 }
    }

    private fun clearExitFloorHintIfArrived(floorNumber: Int) {
        val hint = _emergencySession.value.suggestedExitFloor
        if (hint != null && hint == floorNumber) {
            _emergencySession.update { it.copy(suggestedExitFloor = null) }
            _navState.update {
                it.copy(
                    suggestedTargetFloor = null,
                    readyForFloorSwitch = false,
                    floorTransitionHint = null,
                )
            }
        }
    }

    /** Chặn “Đã đến nơi” ngay sau đổi tầng (tránh neo nhầm EXIT → coi như tới đích). */
    private var emergencyArriveBlockedUntilMs: Long = 0L
    /** Giữ chấm xanh tại cầu thang vài giây sau đổi tầng — tránh PDR/reroute làm giật. */
    private var stairsSeedHoldUntilMs: Long = 0L
    private var stairsSeedHoldPos: Offset? = null

    /** Neo tới cầu thang / thang máy — ưu tiên POI khớp đầu/cuối (hint tầng trước). */
    private fun findStairsArrivalNode(gModel: GraphModel): com.khoaluan.indoornav.data.model.PathNode? {
        val ui = _uiState.value as? MapUiState.Success ?: return null
        val exitIds = ui.mapData.pois
            .filter { it.resolveCategory() == PoiCategory.EXIT }
            .mapNotNull { SafePoiLocator.nearestNodeIdForPoi(gModel, it) }
            .toSet()

        val hintX = pendingCrossFloor?.arrivalHintX ?: stairsDepartHintX
        val hintY = pendingCrossFloor?.arrivalHintY ?: stairsDepartHintY
        val stairsPoi = pickBestStairsPoi(ui.mapData, gModel, hintX, hintY)
        if (stairsPoi != null) {
            val nearPoi = gModel.nodeMap.values
                .asSequence()
                .filter { it.nodeId !in exitIds }
                .minByOrNull { n ->
                    val dx = n.x - stairsPoi.x
                    val dy = n.y - stairsPoi.y
                    dx * dx + dy * dy
                }
            if (nearPoi != null) {
                val dx = nearPoi.x - stairsPoi.x
                val dy = nearPoi.y - stairsPoi.y
                if (dx * dx + dy * dy <= stairsSnapPx2) {
                    return nearPoi
                }
            }
            return null // caller dùng đúng tọa độ POI
        }

        pendingCrossFloor?.arrivalNodeId?.let { id ->
            gModel.nodeMap[id]?.takeIf { it.nodeId !in exitIds }?.let { return it }
        }
        gModel.nodeMap.values.firstOrNull { it.isStairs && it.nodeId !in exitIds }?.let { return it }
        gModel.nodeMap.values.firstOrNull { it.isElevator && it.nodeId !in exitIds }?.let { return it }
        return null
    }

    private fun findStairsArrivalPoint(gModel: GraphModel): Offset? {
        val ui = _uiState.value as? MapUiState.Success
        val hintX = pendingCrossFloor?.arrivalHintX ?: stairsDepartHintX
        val hintY = pendingCrossFloor?.arrivalHintY ?: stairsDepartHintY
        val stairsPoi = ui?.let { pickBestStairsPoi(it.mapData, gModel, hintX, hintY) }
        if (stairsPoi != null) {
            findStairsArrivalNode(gModel)?.let { node ->
                val dx = node.x - stairsPoi.x
                val dy = node.y - stairsPoi.y
                if (dx * dx + dy * dy <= stairsSnapPx2) {
                    return Offset(node.x.toFloat(), node.y.toFloat())
                }
            }
            // Snap mềm: vẫn lấy node gần nhất nếu < 160px (đứng trên đường đi)
            val soft = SafePoiLocator.nearestNodeIdForPoi(gModel, stairsPoi)?.let { gModel.nodeMap[it] }
            if (soft != null) {
                val dx = soft.x - stairsPoi.x
                val dy = soft.y - stairsPoi.y
                if (dx * dx + dy * dy <= 160.0 * 160.0) {
                    return Offset(soft.x.toFloat(), soft.y.toFloat())
                }
            }
            return Offset(stairsPoi.x.toFloat(), stairsPoi.y.toFloat())
        }
        findStairsArrivalNode(gModel)?.let { return Offset(it.x.toFloat(), it.y.toFloat()) }
        if (ui == null) return null
        val exitNodes = ui.mapData.pois
            .filter { it.resolveCategory() == PoiCategory.EXIT }
            .mapNotNull { SafePoiLocator.nearestNodeIdForPoi(gModel, it) }
            .mapNotNull { gModel.nodeMap[it] }
        if (exitNodes.isEmpty()) {
            return gModel.nodeMap.values.firstOrNull()?.let { Offset(it.x.toFloat(), it.y.toFloat()) }
        }
        val farthest = gModel.nodeMap.values.maxByOrNull { n ->
            exitNodes.minOf { e ->
                val dx = n.x - e.x
                val dy = n.y - e.y
                dx * dx + dy * dy
            }
        }
        return farthest?.let { Offset(it.x.toFloat(), it.y.toFloat()) }
    }

    private fun resumeCrossFloorIfNeeded(floorNumber: Int) {
        val pending = pendingCrossFloor

        // Khẩn cấp đang sơ tán + vừa load tầng mới:
        // neo chân cầu thang rồi chỉ đường tiếp (user đã chọn tầng đích).
        if (_emergencySession.value.active &&
            _emergencySession.value.phase == EmergencyPhase.EVACUATING
        ) {
            if (pending != null && pending.floor == floorNumber) {
                clearExitFloorHintIfArrived(floorNumber)
            }
            // Giữ hint XY chân cầu thang đích trước khi xóa pending (seed cần để chọn đúng đầu/cuối)
            pending?.arrivalHintX?.let { stairsDepartHintX = it }
            pending?.arrivalHintY?.let { stairsDepartHintY = it }
            pendingCrossFloor = null
            seedAtStairsThenContinueEmergency()
            return
        }

        if (pending == null || pending.floor != floorNumber) {
            return
        }

        clearExitFloorHintIfArrived(floorNumber)

        val gModel = graphModel ?: return
        if (pending.nodeId == "pending-exit" || gModel.nodeMap[pending.nodeId] == null) {
            pendingCrossFloor = null
            return
        }

        // Giữ hint trước khi xóa pending — khớp đúng cầu thang vừa đi (không nhảy sang cầu kia)
        pending.arrivalHintX?.let { stairsDepartHintX = it }
        pending.arrivalHintY?.let { stairsDepartHintY = it }

        val ui = _uiState.value as? MapUiState.Success
        val engine = locationEngine
        val exitIds = ui?.mapData?.pois
            ?.filter { it.resolveCategory() == PoiCategory.EXIT }
            ?.mapNotNull { SafePoiLocator.nearestNodeIdForPoi(gModel, it) }
            ?.toSet()
            .orEmpty()

        // 1) Node connector đã ghép khi plan đa tầng (via.toNodeId)
        val plannedArrival = pending.arrivalNodeId
            ?.let { gModel.nodeMap[it] }
            ?.takeIf { it.nodeId !in exitIds }

        // 2) POI/node gần hint XY tầng trước (đầu ↔ cuối cầu thang cùng tọa độ)
        val hintedPoint = findStairsArrivalPoint(gModel)
        val hintedNode = findStairsArrivalNode(gModel)

        // Ưu tiên planned nếu gần hint; nếu lệch xa → tin hint (tránh nhảy sang cầu thang kia)
        val arrivalNode = when {
            plannedArrival != null && hintedPoint != null -> {
                val dx = plannedArrival.x - hintedPoint.x
                val dy = plannedArrival.y - hintedPoint.y
                if (dx * dx + dy * dy <= 160.0 * 160.0) plannedArrival else hintedNode ?: plannedArrival
            }
            plannedArrival != null -> plannedArrival
            else -> hintedNode
        }

        val visual = when {
            arrivalNode != null && hintedPoint != null -> {
                val dx = arrivalNode.x - hintedPoint.x
                val dy = arrivalNode.y - hintedPoint.y
                if (dx * dx + dy * dy <= 120.0 * 120.0) {
                    Offset(arrivalNode.x.toFloat(), arrivalNode.y.toFloat())
                } else {
                    hintedPoint
                }
            }
            arrivalNode != null -> Offset(arrivalNode.x.toFloat(), arrivalNode.y.toFloat())
            hintedPoint != null -> hintedPoint
            else -> null
        }

        pendingCrossFloor = null

        if (visual != null && engine != null && ui != null) {
            val mapKey = buildMapSessionKey(ui.buildingId, ui.floorNumber)
            localizationMapKey = mapKey
            confidenceEngine.updateGroundTruth()
            // Neo đúng icon cầu thang vừa xuống — không snap sang phòng / cầu thang kia
            engine.startWithPosition(visual.x, visual.y)
            if (arrivalNode != null) {
                val dx = arrivalNode.x - visual.x
                val dy = arrivalNode.y - visual.y
                if (dx * dx + dy * dy <= 55.0 * 55.0) {
                    engine.startWithQR(arrivalNode.nodeId)
                }
            }
            engine.lockPositionFor(4_000L)
            engine.requestHeadingResync(reason = "cross_floor_stairs_seed")
            stairsSeedHoldPos = visual
            stairsSeedHoldUntilMs = System.currentTimeMillis() + 4_000L
            _navState.update {
                it.copy(
                    userPos = visual,
                    startAnchorPos = visual,
                )
            }
            Log.i(
                "MapViewModel",
                "W3 stairs seed floor=$floorNumber visual=(${visual.x},${visual.y}) " +
                    "node=${arrivalNode?.nodeId} hint=($stairsDepartHintX,$stairsDepartHintY)",
            )
        } else if (visual != null) {
            localizeAtMapPoint(
                visual.x,
                visual.y,
                resumeEmergency = false,
                hint = "Đã sang tầng — tiếp tục từ cầu thang",
                preferExactPosition = true,
            )
        }

        _navState.update {
            it.copy(
                destinationNodeId = pending.nodeId,
                destinationMarkerPos = Offset(pending.markerX, pending.markerY),
                pendingDestFloor = null,
                pendingDestNodeId = null,
                suggestedTargetFloor = null,
                readyForFloorSwitch = false,
                isNavigatingMode = true,
                hasArrived = false,
                destinationLabel = it.destinationLabel
                    ?: _emergencySession.value.targetLabel,
                navHint = "Tiếp tục chỉ đường từ cầu thang tới điểm đến",
                floorTransitionHint = null,
            )
        }
        if (!startEmergencyEvacuation(forceRecalculate = true)) {
            updatePath(pending.nodeId, force = true)
            if (activePath.isEmpty()) {
                _navState.update {
                    it.copy(
                        navigationError = "Chạm gần đúng cầu thang vừa xuống rồi bấm 「Tính lại đường」",
                    )
                }
            }
        }
        Log.i("MapViewModel", "W3 resumed on floor $floorNumber → ${pending.nodeId}")
    }

    /** Sau đổi tầng khẩn cấp: đứng tại cầu thang rồi chỉ đường — ổn định, không giật. */
    private fun seedAtStairsThenContinueEmergency() {
        val gModel = graphModel ?: run {
            Log.w("MapViewModel", "seedAtStairs: graphModel=null")
            return
        }
        val ui = _uiState.value as? MapUiState.Success ?: run {
            Log.w("MapViewModel", "seedAtStairs: ui not Success")
            return
        }
        val engine = locationEngine ?: run {
            Log.w("MapViewModel", "seedAtStairs: locationEngine=null")
            return
        }
        clearExitFloorHintIfArrived(ui.floorNumber)
        emergencyArriveBlockedUntilMs = System.currentTimeMillis() + 5_000L

        // Xóa path tầng trước (giữ session sơ tán)
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()

        _emergencySession.update {
            it.copy(
                phase = EmergencyPhase.EVACUATING,
                floorConfirmed = true,
                needsQr = false,
                error = null,
            )
        }

        val exitIds = ui.mapData.pois
            .filter { it.resolveCategory() == PoiCategory.EXIT }
            .mapNotNull { SafePoiLocator.nearestNodeIdForPoi(gModel, it) }
            .toSet()

        val visual = findStairsArrivalPoint(gModel)
            ?: run {
                val exitNodes = exitIds.mapNotNull { gModel.nodeMap[it] }
                val candidates = gModel.nodeMap.values.filter { it.nodeId !in exitIds }
                val farthest = if (exitNodes.isEmpty()) {
                    candidates.firstOrNull()
                } else {
                    candidates.maxByOrNull { n ->
                        exitNodes.minOf { e ->
                            val dx = (n.x - e.x).toDouble()
                            val dy = (n.y - e.y).toDouble()
                            dx * dx + dy * dy
                        }
                    }
                }
                farthest?.let { Offset(it.x.toFloat(), it.y.toFloat()) }
            }
            ?: gModel.nodeMap.values.firstOrNull()
                ?.let { Offset(it.x.toFloat(), it.y.toFloat()) }

        if (visual == null) {
            Log.w("MapViewModel", "seedAtStairs: no nodes on floor ${ui.floorNumber}")
            _emergencySession.update {
                it.copy(error = "Tầng này chưa có đường đi — chạm map gần cầu thang")
            }
            _navState.update {
                it.copy(
                    userPos = null,
                    isNavigatingMode = true,
                    navHint = "Chạm gần cầu thang trên bản đồ để neo vị trí",
                )
            }
            return
        }

        val nearStairs = findStairsArrivalNode(gModel)
            ?: gModel.nodeMap.values
                .asSequence()
                .filter { it.nodeId !in exitIds }
                .minByOrNull { n ->
                    val dx = n.x - visual.x
                    val dy = n.y - visual.y
                    dx * dx + dy * dy
                }

        val mapKey = buildMapSessionKey(ui.buildingId, ui.floorNumber)
        localizationMapKey = mapKey
        confidenceEngine.updateGroundTruth()

        // Ưu tiên neo đúng icon cầu thang (tránh snap sang phòng ngủ / EXIT)
        engine.startWithPosition(visual.x, visual.y)
        if (nearStairs != null) {
            val dx = nearStairs.x - visual.x
            val dy = nearStairs.y - visual.y
            if (dx * dx + dy * dy <= 55.0 * 55.0) {
                engine.startWithQR(nearStairs.nodeId)
            }
        }
        engine.lockPositionFor(4_000L)
        engine.requestHeadingResync(reason = "stairs_seed")
        stairsSeedHoldPos = visual
        stairsSeedHoldUntilMs = System.currentTimeMillis() + 4_000L

        _navState.update {
            it.copy(
                userPos = visual,
                startAnchorPos = visual,
                destinationPoiId = null,
                path = null,
                hasArrived = false,
                isRerouting = false,
                rerouteCount = 0,
                navigationError = null,
                confidence = 0.55f,
                userHeading = engine.currentNavigationHeadingDeg(),
                navHint = "Đã xuống tầng — từ cầu thang tới lối thoát",
            )
        }

        val routed = startEmergencyEvacuation(forceRecalculate = true)
        if (!routed || _navState.value.userPos == null) {
            // Khôi phục neo nếu startEmergency / softClear race làm mất chấm xanh
            _navState.update {
                it.copy(
                    userPos = visual,
                    startAnchorPos = visual,
                    isNavigatingMode = true,
                    navHint = "Đã neo cầu thang — bấm 「Tính lại đường」 nếu chưa có đường",
                )
            }
            localizationMapKey = mapKey
            stairsSeedHoldPos = visual
            stairsSeedHoldUntilMs = System.currentTimeMillis() + 4_000L
        }
        Log.i(
            "MapViewModel",
            "seedAtStairs floor=${ui.floorNumber} visual=(${visual.x},${visual.y}) " +
                "node=${nearStairs?.nodeId} routed=$routed pois=${ui.mapData.pois.size}",
        )
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
        if (trimmedQr.isEmpty() || trimmedQr.length < 3) {
            _qrScanError.value = "Mã QR không hợp lệ (quá ngắn)"
            com.khoaluan.indoornav.ui.error.ErrorCenter.qrInvalid("Mã QR không hợp lệ (quá ngắn)")
            return
        }
        // Soft-validate: từ chối payload rõ ràng không phải mã định vị (URL web thuần, wifi, v.v.)
        val lower = trimmedQr.lowercase()
        if (lower.startsWith("WIFI:") || lower.startsWith("BEGIN:VCARD") ||
            (lower.startsWith("http://") || lower.startsWith("https://")) &&
            !lower.contains("qr") && !lower.contains("indoor")
        ) {
            _qrScanError.value = "Đây không phải mã QR định vị IndoorNav"
            com.khoaluan.indoornav.ui.error.ErrorCenter.qrInvalid("Đây không phải mã QR định vị IndoorNav")
            return
        }
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
                    val anchor = Offset(x, y)
                    _navState.update {
                        it.copy(
                            userPos = anchor,
                            startAnchorPos = it.startAnchorPos ?: anchor,
                            confidence = maxOf(it.confidence, 0.5f),
                            navigationError = null,
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
                // Spec D L3 — QR neo = đang tại chỗ (không phụ thuộc GPS)
                indoorPresenceClaimed = true
                com.khoaluan.indoornav.navigation.gps.PresenceHintStore.markEnter(
                    getApplication(),
                    body.building_id
                )
                com.khoaluan.indoornav.fcm.PresenceSync.update(
                    context = getApplication(),
                    buildingId = body.building_id,
                    floor = body.floor_number,
                    qrId = trimmedQr,
                    indoorSessionOpen = true,
                    touchIndoor = true,
                    includeRadio = true,
                )
                com.khoaluan.indoornav.fcm.EmergencyHeartbeat.updateIndoorContext(
                    buildingId = body.building_id,
                    floor = body.floor_number,
                    qrAnchor = trimmedQr,
                )
                tryResumeEmergencyEvacuationAfterLocalize()
            } catch (e: Exception) {
                Log.e("MapViewModel", "Loi tra cuu QR", e)
                _qrScanError.value = "Loi ket noi: ${e.message}"
            } finally {
                _isResolvingQr.value = false
            }
        }
    }
    /**
     * Tìm node gần nhất với vị trí (x, y).
     * Ưu tiên node có ít nhất 1 cạnh (đi được trên đồ thị); nếu không có trong bán kính
     * hợp lý thì fallback node gần nhất tuyệt đối (hành vi cũ).
     */
    private fun findNearestNodeIdWithConnectivity(
        mapData: MapData,
        graphModel: GraphModel?,
        x: Float,
        y: Float,
    ): String? {
        val g = graphModel
        if (g != null) {
            val routable = nearestRoutableNodeId(g, x, y)
            if (routable != null) {
                Log.d(
                    "MapViewModel",
                    "findNearestNode: userPos=(${"%.1f".format(x)},${"%.1f".format(y)}) -> routable=$routable",
                )
                return routable
            }
        }
        val candidates = mapData.nodes.map { node ->
            val dx = node.x - x
            val dy = node.y - y
            Triple(node.nodeId, node.x, node.y) to (dx * dx + dy * dy)
        }.sortedBy { it.second }.take(3)
        Log.d(
            "MapViewModel",
            "findNearestNode: userPos=(${"%.1f".format(x)},${"%.1f".format(y)}), pxPerM=$pixelsPerMeter",
        )
        for (c in candidates) {
            val id = c.first.first
            val nx = c.first.second
            val ny = c.first.third
            val dist = sqrt(c.second.toDouble()).toFloat()
            Log.d(
                "MapViewModel",
                " candidate: $id at ($nx,$ny), dist=${"%.1f".format(dist)}px " +
                    "(${"%.2f".format(dist / pixelsPerMeter)}m)",
            )
        }
        return mapData.nodes.minByOrNull { node ->
            val dx = node.x - x
            val dy = node.y - y
            dx * dx + dy * dy
        }?.nodeId
    }

    /**
     * Node gần nhất có cạnh ra vào (không cô lập).
     * Giới hạn bán kính ~12 m (theo pixelsPerMeter) để tránh nhảy sang phòng xa.
     */
    private fun nearestRoutableNodeId(gModel: GraphModel, x: Float, y: Float): String? {
        val maxDistPx = (pixelsPerMeter * 12f).coerceIn(80f, 800f)
        val maxDist2 = maxDistPx * maxDistPx
        return gModel.nodeMap.values
            .asSequence()
            .filter { gModel.adjacency[it.nodeId].orEmpty().isNotEmpty() }
            .map { node ->
                val dx = node.x.toFloat() - x
                val dy = node.y.toFloat() - y
                node to (dx * dx + dy * dy)
            }
            .filter { it.second <= maxDist2 }
            .minByOrNull { it.second }
            ?.first
            ?.nodeId
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
        val targetNodeId = nearestRoutableNodeId(gModel, roomCenterX.toFloat(), roomCenterY.toFloat())
            ?: gModel.nodeMap.values.minByOrNull {
                val dx = it.x - roomCenterX
                val dy = it.y - roomCenterY
                dx * dx + dy * dy
            }?.nodeId
            ?: return
        Log.d(
            "MapViewModel",
            "setDestination(G1 select-only): roomId=$roomId, roomName=${room.name}, " +
                "targetNodeId=$targetNodeId, path NOT computed"
        )
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        pendingCrossFloor = null
        _navState.value = _navState.value.copy(
            destinationPoiId = null,
            destinationLabel = room.name,
            destinationNodeId = targetNodeId,
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
            pendingDestNodeId = targetNodeId,
            readyForFloorSwitch = false,
        )
    }

    /** G1: Chọn POI làm đích — chưa tính path. */
    fun setDestinationPoi(poiId: Int) {
        val state = _uiState.value as? MapUiState.Success ?: return
        val poi = state.mapData.pois.find { it.id == poiId } ?: return
        val gModel = graphModel ?: return
        val markerPos = Offset(poi.x.toFloat(), poi.y.toFloat())
        // Ưu tiên node có cạnh (đi được); tránh neo vào node cô lập gần icon POI
        val targetNodeId = nearestRoutableNodeId(gModel, poi.x.toFloat(), poi.y.toFloat())
            ?: gModel.nodeMap.values.minByOrNull {
                val dx = it.x - poi.x
                val dy = it.y - poi.y
                dx * dx + dy * dy
            }?.nodeId
            ?: return
        Log.d(
            "MapViewModel",
            "setDestinationPoi(G1 select-only): poiId=$poiId, poiName=${poi.name}, " +
                "targetNodeId=$targetNodeId, path NOT computed"
        )
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        pendingCrossFloor = null
        _navState.value = _navState.value.copy(
            destinationPoiId = poiId,
            destinationLabel = poi.name?.takeIf { it.isNotBlank() },
            destinationNodeId = targetNodeId,
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
            // Bắt buộc đồng bộ tầng/node đích — tránh giữ pendingDest* cũ (phòng trước)
            // khiến A* tìm sang tầng/node sai → "Không tìm thấy đường".
            pendingDestFloor = state.floorNumber,
            pendingDestNodeId = targetNodeId,
            readyForFloorSwitch = false,
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
                    edges = activePathEdges,
                )
                val mPos = if (g.nextManeuverMapX != null && g.nextManeuverMapY != null) {
                    Offset(g.nextManeuverMapX, g.nextManeuverMapY)
                } else null
                next = next.copy(
                    currentInstructionText = g.instructionText,
                    distanceToNextManeuverMeters = g.distanceToNextManeuverMeters,
                    remainingDistanceMeters = g.remainingDistanceMeters,
                    routeProgress = g.routeProgress,
                    nextManeuverPos = mPos,
                    nextManeuverType = g.nextType.name,
                )
            }
            _navState.value = next
            syncRouteSnapToEngine()
        } else {
            Log.w("MapViewModel", "Cannot start navigation: no destination or path unavailable")
        }
    }

    /**
     * Bật màn hình cảnh báo full-screen (chưa tính path).
     * [buildingId] dùng khi đang outdoor — MainActivity sẽ mở indoor trước.
     */
    fun triggerEmergencyAlert(
        incidentType: String,
        title: String? = null,
        body: String? = null,
        buildingId: String? = null,
        incidentId: String? = null,
        blockedNodeIds: Set<String> = emptySet(),
        blockedEdgeKeys: Set<String> = emptySet(),
        hazardZones: List<HazardZoneDraw> = emptyList(),
    ) {
        val type = incidentType.trim().uppercase().ifBlank { "FIRE" }
        val ui = _uiState.value as? MapUiState.Success
        val incomingId = incidentId?.takeIf { it.isNotBlank() }
        val current = _emergencySession.value

        // Admin gửi lại broadcast cùng sự cố khi user đã nhận / đang sơ tán → không reset màn hình
        if (current.active &&
            !incomingId.isNullOrBlank() &&
            current.incidentId == incomingId
        ) {
            _emergencySession.update {
                it.copy(
                    title = EmergencySession.defaultTitle(type, title).ifBlank { it.title },
                    body = body?.takeIf { b -> b.isNotBlank() } ?: it.body,
                    blockedNodeIds = if (blockedNodeIds.isNotEmpty()) blockedNodeIds else it.blockedNodeIds,
                    blockedEdgeKeys = if (blockedEdgeKeys.isNotEmpty()) blockedEdgeKeys else it.blockedEdgeKeys,
                    hazardZones = if (hazardZones.isNotEmpty()) hazardZones else it.hazardZones,
                )
            }
            Log.i(
                "MapViewModel",
                "Emergency rebroadcast ignored (same incident=$incomingId phase=${current.phase})",
            )
            return
        }

        _emergencySession.value = EmergencySession(
            active = true,
            phase = EmergencyPhase.ALERT,
            incidentType = type,
            title = EmergencySession.defaultTitle(type, title),
            body = body?.takeIf { it.isNotBlank() } ?: EmergencySession.bodyForType(type),
            buildingId = buildingId ?: ui?.buildingId,
            incidentId = incomingId,
            needsQr = true,
            floorConfirmed = false,
            blockedNodeIds = blockedNodeIds,
            blockedEdgeKeys = blockedEdgeKeys,
            hazardZones = hazardZones,
        )
        if (!incomingId.isNullOrBlank()) {
            dismissedIncidentIds.remove(incomingId)
            _buildingActiveEmergency.value = BuildingActiveEmergency(
                incidentId = incomingId,
                incidentType = type,
                title = EmergencySession.defaultTitle(type, title),
                body = body?.takeIf { it.isNotBlank() } ?: EmergencySession.bodyForType(type),
                buildingId = buildingId ?: ui?.buildingId ?: "",
            )
        }
        if (hazardZones.isNotEmpty()) {
            _mapHazardZones.value = hazardZones
        }
        com.khoaluan.indoornav.fcm.EmergencyNotifier.markActiveIncident(getApplication(), incomingId)
        com.khoaluan.indoornav.fcm.EmergencySirenPlayer.start(getApplication())
        if (!incomingId.isNullOrBlank()) {
            com.khoaluan.indoornav.fcm.EmergencyConsentHelper.startHeartbeatIfAllowed(
                context = getApplication(),
                incidentId = incomingId,
                buildingId = buildingId ?: ui?.buildingId,
                floor = ui?.floorNumber,
            )
        }
    }

    fun dismissEmergency() {
        _emergencySession.value.incidentId?.let { dismissedIncidentIds += it }
        _emergencySession.value = EmergencySession()
        stairsSeedHoldPos = null
        stairsSeedHoldUntilMs = 0L
        emergencyArriveBlockedUntilMs = 0L
        // Giữ _mapHazardZones + _buildingActiveEmergency nếu sự cố vẫn ACTIVE
        // → user bấm banner để chỉ đường thoát hiểm lại
        com.khoaluan.indoornav.fcm.EmergencyNotifier.clearActiveIncident(getApplication())
        com.khoaluan.indoornav.fcm.EmergencySirenPlayer.stop()
        com.khoaluan.indoornav.fcm.EmergencyHeartbeat.stop(getApplication())
        com.khoaluan.indoornav.fcm.EmergencyNotifier.cancel(getApplication())
    }

    /**
     * User đã Đóng overlay nhưng sự cố vẫn ACTIVE → mở lại cảnh báo / chỉ đường thoát hiểm.
     */
    fun resumeEmergencyGuidance() {
        val summary = _buildingActiveEmergency.value ?: return
        dismissedIncidentIds.remove(summary.incidentId)
        val zones = _mapHazardZones.value
        val blocked = blockedNodesFromHazardDraws(zones)
        triggerEmergencyAlert(
            incidentType = summary.incidentType,
            title = summary.title,
            body = summary.body,
            buildingId = summary.buildingId,
            incidentId = summary.incidentId,
            blockedNodeIds = blocked,
            hazardZones = zones,
        )
    }

    /**
     * Chưa mở map / chưa có vị trí: chuyển sang chờ chọn vị trí đứng trên bản đồ.
     */
    fun requestEmergencyStandingPick() {
        if (!_emergencySession.value.active) return
        _emergencySession.update {
            it.copy(
                phase = EmergencyPhase.AWAITING_LOCATION,
                needsQr = true,
                error = null,
            )
        }
        // Bắt buộc user chọn lại vị trí hiện tại, không dùng vị trí cũ gây chỉ đường sai.
        stairsSeedHoldPos = null
        stairsSeedHoldUntilMs = 0L
        activePath = emptyList()
        activePathEdges = emptyList()
        _navState.update {
            it.copy(
                userPos = null,
                startAnchorPos = null,
                path = null,
                isNavigatingMode = false,
                hasArrived = false,
                navigationError = null,
                destinationPoiId = null,
                destinationNodeId = null,
                destinationMarkerPos = null,
                destinationLabel = null,
                pendingDestFloor = null,
                pendingDestNodeId = null,
                suggestedTargetFloor = null,
                readyForFloorSwitch = false,
            )
        }
        _navState.update {
            it.copy(
                navHint = "Chạm bản đồ để chọn vị trí đang đứng — sẽ chỉ đường ra lối thoát hiểm gần nhất",
            )
        }
    }

    /** Chưa chắc tầng (máy túi / chưa QR) → hỏi chọn tầng trước khi sơ tán. */
    fun requestEmergencyFloorConfirm() {
        if (!_emergencySession.value.active) return
        if (_emergencySession.value.floorConfirmed) return
        _emergencySession.update {
            it.copy(
                phase = EmergencyPhase.AWAITING_FLOOR,
                floorConfirmed = false,
                error = null,
                needsQr = false,
            )
        }
        _navState.update {
            it.copy(navHint = "Chọn tầng bạn đang đứng để sơ tán đúng bản đồ")
        }
    }

    /**
     * User chọn tầng đang đứng trong cảnh báo.
     * Load đúng bản đồ tầng đó rồi chờ chạm vị trí đứng.
     */
    fun confirmEmergencyFloor(floor: Int) {
        if (!_emergencySession.value.active) return
        val session = _emergencySession.value
        val ui = _uiState.value as? MapUiState.Success
        val bid = session.buildingId ?: ui?.buildingId ?: return
        val safeFloor = floor.coerceAtLeast(0)
        val floorLabel = if (safeFloor == 0) "GF" else "${safeFloor}F"
        localizationMapKey = null
        pendingCrossFloor = null
        activePath = emptyList()
        activePathEdges = emptyList()
        _emergencySession.update {
            it.copy(
                floorConfirmed = true,
                phase = EmergencyPhase.AWAITING_LOCATION,
                needsQr = true,
                error = null,
                targetLabel = null,
                suggestedExitFloor = null,
            )
        }
        _navState.update {
            it.copy(
                userPos = null,
                startAnchorPos = null,
                path = null,
                isNavigatingMode = false,
                hasArrived = false,
                destinationNodeId = null,
                destinationMarkerPos = null,
                destinationLabel = null,
                navHint = "Đã chọn tầng $floorLabel — chạm bản đồ (hoặc quét QR) để chọn vị trí đang đứng",
            )
        }
        indoorSessionStore.saveLastFloor(bid, safeFloor)
        // Luôn load đúng tầng (kể cả đang đứng cùng số tầng — reset map/engine)
        viewModelScope.launch {
            loadFloorMapInPlace(bid, safeFloor, reason = "confirmEmergencyFloor")
        }
        Log.i("MapViewModel", "Emergency floor confirmed → $safeFloor building=$bid")
    }

    /**
     * Đổi map tầng mà không teardown session / không Loading.
     * Dùng cho chọn tầng khẩn cấp & sơ tán đa tầng.
     */
    private suspend fun loadFloorMapInPlace(
        buildingId: String,
        target: Int,
        reason: String,
    ): Boolean {
        try {
            Log.i("MapViewModel", "loadFloorMapInPlace reason=$reason → floor=$target")
            prefetchBuildingFloors(buildingId)
            var body: com.khoaluan.indoornav.data.model.MapResponse? = null
            // Khẩn cấp / đổi tầng: ưu tiên mạng để nhận POI cầu thang mới publish (tránh cache cũ)
            val preferNetwork = _emergencySession.value.active ||
                reason == "goToEmergencyFloor" ||
                reason == "confirmEmergencyFloor"
            if (preferNetwork) {
                try {
                    val api = RetrofitClient.getApiService()
                    val resp = api.getMapByFloor(buildingId, target)
                    if (resp.isSuccessful) {
                        body = resp.body()
                        body?.let { mapCacheManager.save(buildingId, it.floorNumber, it) }
                    }
                } catch (e: Exception) {
                    Log.w("MapViewModel", "loadFloorMapInPlace network: ${e.message}")
                }
            }
            if (body == null) {
                body = mapCacheManager.load(buildingId, target)
            }
            if (body == null) {
                val md = buildingFloorCache[target]
                if (md != null) {
                    body = com.khoaluan.indoornav.data.model.MapResponse(
                        mapData = md,
                        buildingId = buildingId,
                        floorNumber = target,
                        version = 1,
                    )
                }
            }
            if (body == null && !preferNetwork) {
                try {
                    val api = RetrofitClient.getApiService()
                    val resp = api.getMapByFloor(buildingId, target)
                    if (resp.isSuccessful) {
                        body = resp.body()
                        body?.let { mapCacheManager.save(buildingId, it.floorNumber, it) }
                    }
                } catch (e: Exception) {
                    Log.w("MapViewModel", "loadFloorMapInPlace network: ${e.message}")
                }
            }
            if (body == null) {
                _emergencySession.update {
                    it.copy(error = "Không tải được tầng ${if (target == 0) "GF" else target}")
                }
                _navState.update {
                    it.copy(navHint = "Không tải được tầng — kiểm tra mạng rồi chọn lại")
                }
                return false
            }
            // Ép floorNumber = target (tránh cache/body lệch số tầng → POI tầng cũ)
            val forcedBody = if (body.floorNumber == target) {
                body
            } else {
                body.copy(floorNumber = target)
            }
            buildingFloorCache[target] = forcedBody.mapData.sanitized()
            applyLoadedMap(forcedBody, buildingId)
            val loaded = (_uiState.value as? MapUiState.Success)?.floorNumber
            Log.i(
                "MapViewModel",
                "loadFloorMapInPlace OK reason=$reason loadedFloor=$loaded " +
                    "pois=${forcedBody.mapData.pois.size} rooms=${forcedBody.mapData.rooms.size}",
            )
            return loaded == target
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.e("MapViewModel", "loadFloorMapInPlace failed reason=$reason", e)
            _emergencySession.update {
                it.copy(error = "Lỗi tải tầng — thử lại")
            }
            return false
        }
    }

    /**
     * Fallback REST khi miss FCM (pin tiết kiệm / OEM chặn).
     * Kênh chính: FCM data-only priority=high → EmergencyMessagingService takeover.
     * Poll thưa (45s) để đồng bộ hazard zone và bắt sự cố ACTIVE nếu push không tới.
     */
    fun startEmergencyWatch(buildingId: String?) {
        val id = buildingId?.trim().orEmpty()
        if (id == watchedEmergencyBuildingId && emergencyWatchJob?.isActive == true) return
        emergencyWatchJob?.cancel()
        watchedEmergencyBuildingId = id
        if (id.isBlank()) return

        emergencyWatchJob = viewModelScope.launch {
            var first = true
            while (isActive) {
                if (first) {
                    delay(EMERGENCY_POLL_FIRST_DELAY_MS)
                    first = false
                }
                try {
                    val res = RetrofitClient.getApiService().getActiveEmergency(id)
                    val body = res.body()
                    val incident = body?.incident
                    if (res.isSuccessful && body?.active == true && incident != null) {
                        val incidentId = incident.id.orEmpty()
                        val current = _emergencySession.value
                        val alreadyShown = current.active && current.incidentId == incidentId
                        val zonesDraw = hazardZonesFromDto(body.hazard_zones)
                        val blocked = blockedNodesFromHazardZones(body.hazard_zones)
                        // Luôn hiện vùng đỏ trên map khi tòa có sự cố ACTIVE + zone đã bật
                        _mapHazardZones.value = zonesDraw
                        if (incidentId.isNotBlank()) {
                            _buildingActiveEmergency.value = BuildingActiveEmergency(
                                incidentId = incidentId,
                                incidentType = (incident.type ?: "FIRE").uppercase(),
                                title = incident.title.orEmpty(),
                                body = incident.description.orEmpty(),
                                buildingId = incident.building_id ?: id,
                            )
                        }
                        if (alreadyShown) {
                            // Admin bật/tắt zone sau khi đã báo → đồng bộ overlay + blocked nodes
                            _emergencySession.update {
                                it.copy(
                                    hazardZones = zonesDraw,
                                    blockedNodeIds = blocked,
                                )
                            }
                        } else if (incidentId !in dismissedIncidentIds) {
                            val site = siteStatusFor(id)
                            if (OnSiteGate.allowsEmergencyTakeover(site)) {
                                triggerEmergencyAlert(
                                    incidentType = incident.type ?: "FIRE",
                                    title = incident.title,
                                    body = incident.description,
                                    buildingId = incident.building_id ?: id,
                                    incidentId = incidentId.takeIf { it.isNotBlank() },
                                    blockedNodeIds = blocked,
                                    hazardZones = zonesDraw,
                                )
                            } else {
                                Log.i(
                                    "MapViewModel",
                                    "Emergency ACTIVE building=$id nhưng site=$site — chỉ xem map, không takeover"
                                )
                                if (incidentId.isNotBlank() && incidentId !in remoteViewNotifiedIncidentIds) {
                                    remoteViewNotifiedIncidentIds += incidentId
                                    _placeNotice.value =
                                        "Tòa đang có sự cố. Bạn đang xem từ xa — cảnh báo đầy đủ chỉ khi tại khu vực."
                                }
                            }
                        }
                    } else if (res.isSuccessful && body?.active != true) {
                        _mapHazardZones.value = emptyList()
                        val prevId = _buildingActiveEmergency.value?.incidentId
                        if (!prevId.isNullOrBlank()) dismissedIncidentIds.remove(prevId)
                        _buildingActiveEmergency.value = null
                    }
                } catch (e: Exception) {
                    Log.d("MapViewModel", "Emergency watch: ${e.message}")
                }
                delay(EMERGENCY_POLL_INTERVAL_MS)
            }
        }
    }

    fun stopEmergencyWatch() {
        emergencyWatchJob?.cancel()
        emergencyWatchJob = null
        watchedEmergencyBuildingId = null
        _mapHazardZones.value = emptyList()
    }

    /** Node nằm trong vùng nguy hiểm (tầng hiện tại hoặc vùng toàn tòa) → chặn khi tìm đường. */
    private fun blockedNodesFromHazardZones(zones: List<ActiveEmergencyHazardZoneDto>): Set<String> {
        val gModel = graphModel ?: return emptySet()
        val currentFloor = (_uiState.value as? MapUiState.Success)?.floorNumber
        val polygons = zones
            .filter { (it.floor_number ?: 0) == currentFloor }
            .map { zone -> zone.polygon.map { it.x.toFloat() to it.y.toFloat() } }
            .filter { it.size >= 3 }
        if (polygons.isEmpty()) return emptySet()

        return gModel.nodeMap.values
            .filter { node ->
                polygons.any { poly ->
                    pointInPolygon(node.x.toFloat(), node.y.toFloat(), poly)
                }
            }
            .map { it.nodeId }
            .toSet()
    }

    private fun hazardZonesFromDto(zones: List<ActiveEmergencyHazardZoneDto>): List<HazardZoneDraw> {
        return zones.mapNotNull { z ->
            val pts = z.polygon.map { it.x.toFloat() to it.y.toFloat() }
            if (pts.size < 3) return@mapNotNull null
            HazardZoneDraw(
                id = z.id.orEmpty(),
                hazardType = z.hazard_type ?: "OTHER",
                name = z.name.orEmpty(),
                floorNumber = z.floor_number,
                points = pts,
            )
        }
    }

    private fun blockedNodesFromHazardDraws(zones: List<HazardZoneDraw>): Set<String> {
        val gModel = graphModel ?: return emptySet()
        val currentFloor = (_uiState.value as? MapUiState.Success)?.floorNumber
        val polygons = zones
            .filter { (it.floorNumber ?: 0) == currentFloor }
            .map { it.points }
            .filter { it.size >= 3 }
        if (polygons.isEmpty()) return emptySet()
        return gModel.nodeMap.values
            .filter { node ->
                polygons.any { poly ->
                    pointInPolygon(node.x.toFloat(), node.y.toFloat(), poly)
                }
            }
            .map { it.nodeId }
            .toSet()
    }

    private fun pointInPolygon(x: Float, y: Float, poly: List<Pair<Float, Float>>): Boolean {
        var inside = false
        var j = poly.size - 1
        for (i in poly.indices) {
            val (xi, yi) = poly[i]
            val (xj, yj) = poly[j]
            if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi + 1e-9f) + xi) {
                inside = !inside
            }
            j = i
        }
        return inside
    }

    /**
     * Tìm lối thoát / điểm tập trung gần nhất (tránh blocked) và bật chỉ đường.
     * @param forceRecalculate true sau đổi tầng — bỏ path cũ, tính lại từ cầu thang.
     */
    fun startEmergencyEvacuation(forceRecalculate: Boolean = false): Boolean {
        val session = _emergencySession.value
        if (!session.active) return false
        // Đã đang sơ tán + còn path → không tính lại (tránh “Đã tự tính lại lộ trình”)
        // Sau đổi tầng phải forceRecalculate vì path/cạnh thuộc tầng cũ.
        if (!forceRecalculate && session.phase == EmergencyPhase.EVACUATING) {
            val nav = _navState.value
            if (!nav.path.isNullOrEmpty() || activePath.isNotEmpty()) return true
        }
        if (forceRecalculate) {
            // Chỉ reset cờ — KHÔNG xóa path ngay (tránh khoảng trống path nếu tính lại fail)
            _navState.update {
                it.copy(
                    navigationError = null,
                    hasArrived = false,
                    isRerouting = false,
                    rerouteCount = 0,
                )
            }
        }
        if (session.phase == EmergencyPhase.AWAITING_FLOOR) return false

        // Chưa xác nhận tầng trong phiên khẩn cấp → hỏi chọn tầng (không tin vị trí map cũ)
        if (!forceRecalculate && !session.floorConfirmed) {
            _emergencySession.update {
                it.copy(
                    phase = EmergencyPhase.AWAITING_FLOOR,
                    floorConfirmed = false,
                    error = null,
                )
            }
            _navState.update {
                it.copy(navHint = "Chọn tầng bạn đang đứng để sơ tán đúng bản đồ")
            }
            return false
        }

        // force=true trong applyComputedPath làm +1 rerouteCount — reset về 0 sau khi gán đích
        val ui = _uiState.value as? MapUiState.Success
        if (ui == null) {
            // Đổi tầng / force: giữ EVACUATING, chờ map (không đẩy overlay “chọn vị trí”)
            if (forceRecalculate || session.phase == EmergencyPhase.EVACUATING) {
                _emergencySession.update {
                    it.copy(
                        phase = EmergencyPhase.EVACUATING,
                        needsQr = false,
                        error = "Đang tải bản đồ tầng…",
                    )
                }
                return false
            }
            _emergencySession.update {
                it.copy(
                    phase = EmergencyPhase.AWAITING_LOCATION,
                    needsQr = true,
                    error = null,
                )
            }
            _navState.update {
                it.copy(
                    navHint = "Chạm bản đồ để chọn vị trí đang đứng — sẽ chỉ đường ra lối thoát hiểm gần nhất",
                )
            }
            return false
        }
        val gModel = graphModel
        if (gModel == null) {
            if (forceRecalculate || session.phase == EmergencyPhase.EVACUATING) {
                _emergencySession.update {
                    it.copy(
                        phase = EmergencyPhase.EVACUATING,
                        needsQr = false,
                        error = "Đang chuẩn bị chỉ đường trên tầng này…",
                    )
                }
                return false
            }
            _emergencySession.update {
                it.copy(
                    phase = EmergencyPhase.AWAITING_LOCATION,
                    needsQr = true,
                    error = null,
                )
            }
            return false
        }
        // Graph vừa sẵn sàng → tính lại node bị chặn từ polygon zone
        if (_emergencySession.value.hazardZones.isNotEmpty()) {
            val blocked = blockedNodesFromHazardDraws(_emergencySession.value.hazardZones)
            _emergencySession.update { it.copy(blockedNodeIds = blocked) }
        }
        val blockedNodes = _emergencySession.value.blockedNodeIds
        val blockedEdges = _emergencySession.value.blockedEdgeKeys
        // Sau đổi tầng: không lấy node bừa (thường trúng EXIT → path 0 m, không có chấm xanh)
        if (forceRecalculate && _navState.value.userPos == null) {
            val stairsPt = findStairsArrivalPoint(gModel)
            if (stairsPt != null) {
                val eng = locationEngine
                if (eng != null) {
                    val mapKey = buildMapSessionKey(ui.buildingId, ui.floorNumber)
                    localizationMapKey = mapKey
                    eng.startWithPosition(stairsPt.x, stairsPt.y)
                    eng.lockPositionFor(4_000L)
                    stairsSeedHoldPos = stairsPt
                    stairsSeedHoldUntilMs = System.currentTimeMillis() + 4_000L
                    _navState.update {
                        it.copy(userPos = stairsPt, startAnchorPos = stairsPt, confidence = 0.5f)
                    }
                }
            }
            if (_navState.value.userPos == null) {
                _emergencySession.update {
                    it.copy(
                        phase = EmergencyPhase.EVACUATING,
                        needsQr = false,
                        error = "Chạm gần cầu thang trên bản đồ rồi bấm 「Tính lại đường」",
                    )
                }
                _navState.update {
                    it.copy(
                        isNavigatingMode = true,
                        navHint = "Chạm gần cầu thang — hệ thống sẽ chỉ đường ra lối thoát",
                    )
                }
                return false
            }
        }
        val startNodeId = findNearestNodeIdFromCurrentPosition(gModel)
            ?: locationEngine?.getParticles()?.firstOrNull()?.edgeId?.split("->")?.firstOrNull()
            ?: _navState.value.startAnchorPos?.let { anchor ->
                SafePoiLocator.nearestNodeIdFromPosition(gModel, anchor.x, anchor.y)
            }
            ?: findStairsArrivalNode(gModel)?.nodeId
            ?: _navState.value.userPos?.let { pos ->
                SafePoiLocator.nearestNodeIdFromPosition(gModel, pos.x, pos.y)
            }
        if (startNodeId == null) {
            // Đổi tầng / force: không đẩy về AWAITING_LOCATION (trông như bị văng)
            if (forceRecalculate) {
                _emergencySession.update {
                    it.copy(
                        phase = EmergencyPhase.EVACUATING,
                        needsQr = false,
                        error = "Chạm gần cầu thang trên bản đồ rồi bấm 「Tính lại đường」",
                    )
                }
                _navState.update {
                    it.copy(
                        isNavigatingMode = true,
                        navHint = "Chạm gần cầu thang — hệ thống sẽ chỉ đường ra lối thoát",
                    )
                }
                return false
            }
            _emergencySession.update {
                it.copy(
                    phase = EmergencyPhase.AWAITING_LOCATION,
                    needsQr = true,
                    error = null,
                    targetLabel = null,
                )
            }
            _navState.update {
                it.copy(
                    navHint = "Chạm bản đồ để chọn vị trí đang đứng — sẽ chỉ đường ra lối thoát hiểm gần nhất",
                )
            }
            return false
        }
        val adapter = DefaultEmergencyRoutingAdapter(
            currentFloorGraph = gModel,
            floorGraphProvider = { floor ->
                buildingFloorCache[floor]?.let { GraphModel(it) }
            },
            currentFloor = ui.floorNumber,
            floorPoisProvider = { floor ->
                when (floor) {
                    ui.floorNumber -> ui.mapData.pois
                    else -> buildingFloorCache[floor]?.pois.orEmpty()
                }
            },
            hazardPolygonsProvider = { currentHazardPolygons(ui.floorNumber) },
        )

        val inHazard = startNodeId in blockedNodes
        if (inHazard) {
            _navState.update {
                it.copy(
                    navHint = "Bạn đang trong vùng nguy hiểm — thoát vùng đỏ rồi tới lối sơ tán",
                )
            }
        }

        val avoidElevator = _emergencySession.value.incidentType.equals("FIRE", ignoreCase = true) ||
            _emergencySession.value.incidentType.equals("GAS", ignoreCase = true)

        // Đích: EXIT (tránh đỏ) → nếu tầng có EXIT nhưng bị đỏ chặn → xuyên zone tới EXIT
        // → chỉ dùng cầu thang khi tầng này KHÔNG có lối thoát (cần xuống tầng khác)
        val exitCandidate = adapter.findNearestExit(
            startNodeId = startNodeId,
            pois = ui.mapData.pois,
            blockedNodeIds = blockedNodes,
            blockedEdgeKeys = blockedEdges,
        )
        val floorHasExit = ui.mapData.pois.any { it.resolveCategory() == PoiCategory.EXIT }
        val stairsTarget = findNearestStairsNodeForEvacuation(
            gModel = gModel,
            startNodeId = startNodeId,
            blockedNodeIds = blockedNodes,
            blockedEdgeKeys = blockedEdges,
            preferStairsOnly = avoidElevator,
        )
        val safeCandidate = adapter.findNearestSafePoi(
            startNodeId = startNodeId,
            pois = ui.mapData.pois,
            kinds = setOf(
                SafePoiLocator.SafeKind.ASSEMBLY_POINT,
                SafePoiLocator.SafeKind.SAFETY,
            ),
            blockedNodeIds = blockedNodes,
            blockedEdgeKeys = blockedEdges,
        )

        if (exitCandidate != null) {
            applyEmergencyEvacuationToPoi(
                gModel = gModel,
                startNodeId = startNodeId,
                candidate = exitCandidate,
                floorNumber = ui.floorNumber,
                inHazard = inHazard,
            )
            return true
        }

        // Đã ở tầng có cửa ra: đừng chỉ đường tới cầu thang — buộc tìm EXIT (kể cả xuyên vùng đỏ)
        if (floorHasExit) {
            if (tryForcedHazardEvacuation(
                    gModel = gModel,
                    startNodeId = startNodeId,
                    blockedNodeIds = blockedNodes,
                    blockedEdgeKeys = blockedEdges,
                    preferStairsOnly = avoidElevator,
                    floorNumber = ui.floorNumber,
                    exitOnly = true,
                )
            ) {
                return true
            }
        }

        // Chỉ khi tầng này không có EXIT mới hướng tới cầu thang để đổi tầng
        if (stairsTarget != null && !floorHasExit) {
            val (stairsNodeId, path, viaLabel) = stairsTarget
            applyEmergencyEvacuationToStairs(
                gModel = gModel,
                startNodeId = startNodeId,
                stairsNodeId = stairsNodeId,
                path = path,
                viaLabel = viaLabel,
                floorNumber = ui.floorNumber,
                inHazard = inHazard,
            )
            return true
        }

        if (safeCandidate != null) {
            applyEmergencyEvacuationToPoi(
                gModel = gModel,
                startNodeId = startNodeId,
                candidate = safeCandidate,
                floorNumber = ui.floorNumber,
                inHazard = inHazard,
            )
            return true
        }

        // Fallback: chỉ ra khỏi zone, rồi nối tiếp tới cầu thang nếu được
        if (inHazard) {
            val escaped = tryEscapeHazardZone(
                gModel = gModel,
                startNodeId = startNodeId,
                blockedNodeIds = blockedNodes,
                blockedEdgeKeys = blockedEdges,
            )
            if (escaped != null) {
                if (floorHasExit) {
                    // Ra khỏi đỏ rồi tính lại EXIT từ node an toàn
                    val safeNode = gModel.nodeMap[escaped.first]
                    if (safeNode != null) {
                        localizeAtMapPoint(
                            safeNode.x.toFloat(),
                            safeNode.y.toFloat(),
                            resumeEmergency = false,
                            hint = "Đã thoát vùng đỏ — đang chỉ đường ra lối thoát",
                        )
                    }
                    if (tryForcedHazardEvacuation(
                            gModel = gModel,
                            startNodeId = escaped.first,
                            blockedNodeIds = blockedNodes,
                            blockedEdgeKeys = blockedEdges,
                            preferStairsOnly = avoidElevator,
                            floorNumber = ui.floorNumber,
                            exitOnly = true,
                        )
                    ) {
                        return true
                    }
                }
                val extended = extendEscapePathToStairs(
                    gModel = gModel,
                    escapeSafeNodeId = escaped.first,
                    escapePath = escaped.second,
                    blockedNodeIds = blockedNodes,
                    blockedEdgeKeys = blockedEdges,
                    preferStairsOnly = avoidElevator,
                )
                if (extended != null && !floorHasExit) {
                    applyEmergencyEvacuationToStairs(
                        gModel = gModel,
                        startNodeId = startNodeId,
                        stairsNodeId = extended.first,
                        path = extended.second,
                        viaLabel = extended.third,
                        floorNumber = ui.floorNumber,
                        inHazard = true,
                    )
                    return true
                }
                applyHazardEscapePath(gModel, startNodeId, escaped.first, escaped.second, ui.floorNumber)
                return true
            }
        }

        // Lối duy nhất bị vùng đỏ chặn → vẫn chỉ đường xuyên zone + cảnh báo
        if (blockedNodes.isNotEmpty() || currentHazardPolygons(ui.floorNumber).isNotEmpty()) {
            if (tryForcedHazardEvacuation(
                    gModel = gModel,
                    startNodeId = startNodeId,
                    blockedNodeIds = blockedNodes,
                    blockedEdgeKeys = blockedEdges,
                    preferStairsOnly = avoidElevator,
                    floorNumber = ui.floorNumber,
                    exitOnly = floorHasExit,
                )
            ) {
                return true
            }
        }

        // Tầng hiện tại không có đích → tìm tầng khác
        _emergencySession.update {
            it.copy(
                error = "Vùng nguy hiểm chặn đường sơ tán trên tầng này — đang tìm tầng khác…",
            )
        }
        viewModelScope.launch {
            prefetchBuildingFloors(ui.buildingId)
            val exitFloorHint = buildingFloorCache.entries
                .asSequence()
                .filter { it.key != ui.floorNumber }
                .firstOrNull { (_, md) ->
                    md.pois.any { it.resolveCategory() == PoiCategory.EXIT }
                }?.key
            if (exitFloorHint != null) {
                _emergencySession.update { it.copy(suggestedExitFloor = exitFloorHint) }
            }
            resolveEmergencyExitOnOtherFloors(
                ui = ui,
                gModel = gModel,
                startNodeId = startNodeId,
                session = _emergencySession.value,
                adapter = adapter,
            )
        }
        return false
    }

    private fun applyEmergencyEvacuationToPoi(
        gModel: GraphModel,
        startNodeId: String,
        candidate: SafePoiLocator.SafePoiCandidate,
        floorNumber: Int,
        inHazard: Boolean,
        throughHazardWarning: Boolean = false,
    ) {
        val kindLabel = when (candidate.kind) {
            SafePoiLocator.SafeKind.EXIT ->
                if (candidate.poi.isMarkedFinalExit()) "Lối thoát hiểm (cửa ngoài)"
                else "Lối thoát hiểm"
            SafePoiLocator.SafeKind.ASSEMBLY_POINT -> "Điểm tập trung"
            SafePoiLocator.SafeKind.SAFETY -> "Điểm an toàn"
        }
        val poiName = candidate.poi.name?.takeIf { it.isNotBlank() } ?: kindLabel
        applyComputedPath(
            result = candidate.path,
            gModel = gModel,
            currentUserNodeId = startNodeId,
            targetNodeId = candidate.nearestNodeId,
            force = true,
        )
        val label = "$poiName · $kindLabel"
        val warn = "⚠ Lối duy nhất đi qua vùng nguy hiểm — đi nhanh, cẩn thận"
        // Khôi phục path nếu applyTurnGuidance “đến nơi” giả vừa xóa (đổi tầng / pin (0,0))
        if ((_navState.value.path.isNullOrEmpty() && activePath.isEmpty()) &&
            candidate.path.edges.isNotEmpty()
        ) {
            applyComputedPath(
                result = candidate.path,
                gModel = gModel,
                currentUserNodeId = startNodeId,
                targetNodeId = candidate.nearestNodeId,
                force = true,
            )
        }
        _navState.update {
            it.copy(
                destinationPoiId = candidate.poi.id,
                destinationLabel = label,
                destinationMarkerPos = Offset(candidate.poi.x.toFloat(), candidate.poi.y.toFloat()),
                path = if (it.path.isNullOrEmpty() && activePath.isNotEmpty()) activePath else it.path,
                isNavigatingMode = true,
                hasArrived = false,
                rerouteCount = 0,
                isRerouting = false,
                navHint = when {
                    throughHazardWarning -> warn
                    inHazard -> "Thoát vùng đỏ → $label — làm theo đường màu xanh"
                    else -> "Sơ tán → $label — làm theo đường màu xanh"
                },
                currentInstructionText = when {
                    throughHazardWarning -> "Đi qua vùng nguy hiểm → $poiName"
                    inHazard -> "Thoát vùng nguy hiểm → $poiName"
                    else -> "Đi tới $poiName"
                },
                navigationError = if (throughHazardWarning) warn else null,
            )
        }
        if (_navState.value.path.isNullOrEmpty() && activePath.isEmpty()) {
            startNavigationMode()
        } else {
            val nav = _navState.value
            val pos = nav.userPos
            if (pos != null && activePathEdges.isNotEmpty()) {
                _navState.value = applyTurnGuidance(nav, pos.x, pos.y)
            }
        }
        com.khoaluan.indoornav.fcm.EmergencySirenPlayer.stop()
        val floorTag = if (floorNumber == 0) "GF" else "${floorNumber}F"
        _emergencySession.update {
            it.copy(
                phase = EmergencyPhase.EVACUATING,
                targetLabel = "$poiName · $kindLabel · từ $floorTag",
                needsQr = false,
                error = if (throughHazardWarning) warn else null,
            )
        }
        Log.i(
            "MapViewModel",
            "Emergency evacuation → ${candidate.nearestNodeId} ($kindLabel), " +
                "dist=${candidate.path.totalDistanceMeters}m",
        )
    }

    /**
     * Phương án cuối: không còn đường tránh vùng đỏ → vẫn chỉ đường xuyên zone kèm cảnh báo.
     * Ưu tiên EXIT / cầu thang trên cùng tầng.
     * @param exitOnly true khi tầng đã có lối thoát — không fallback sang cầu thang.
     */
    private fun tryForcedHazardEvacuation(
        gModel: GraphModel,
        startNodeId: String,
        blockedNodeIds: Set<String>,
        blockedEdgeKeys: Set<String>,
        preferStairsOnly: Boolean,
        floorNumber: Int,
        exitOnly: Boolean = false,
    ): Boolean {
        val ui = _uiState.value as? MapUiState.Success ?: return false
        val pathfinder = AStarPathfinder(gModel)
        val forcedOpts = AStarPathfinder.RoutingOptions(
            blockedNodeIds = blockedNodeIds,
            blockedEdgeKeys = blockedEdgeKeys,
            softBridgeMaxPx = DefaultEmergencyRoutingAdapter.EMERGENCY_SOFT_BRIDGE_PX,
            escapeFromHazard = true,
            hazardPolygons = currentHazardPolygons(floorNumber),
            allowHazardTraversal = true,
        )

        // Thử EXIT — ưu tiên cửa ra ngoài (final) ngoài vùng đỏ; xuyên zone chỉ khi bắt buộc
        var bestExit: SafePoiLocator.SafePoiCandidate? = null
        val exitPois = ui.mapData.pois.filter { it.resolveCategory() == PoiCategory.EXIT }
        val polys = currentHazardPolygons(floorNumber)

        fun considerExits(
            pool: List<com.khoaluan.indoornav.data.model.Poi>,
            allowThroughHazard: Boolean,
        ): SafePoiLocator.SafePoiCandidate? {
            var best: SafePoiLocator.SafePoiCandidate? = null
            val opts = if (allowThroughHazard) forcedOpts else forcedOpts.copy(
                allowHazardTraversal = false,
                escapeFromHazard = startNodeId in blockedNodeIds,
            )
            for (exitPoi in pool) {
                val nid = SafePoiLocator.nearestNodeIdForPoi(gModel, exitPoi) ?: continue
                if (!allowThroughHazard) {
                    if (nid in blockedNodeIds) continue
                    if (SafePoiLocator.poiInsideHazard(exitPoi, polys)) continue
                }
                val path = pathfinder.findPath(startNodeId, nid, opts) ?: continue
                val cand = SafePoiLocator.SafePoiCandidate(
                    poi = exitPoi,
                    category = PoiCategory.EXIT,
                    kind = SafePoiLocator.SafeKind.EXIT,
                    nearestNodeId = nid,
                    path = path,
                    distanceMeters = path.totalDistanceMeters,
                )
                if (best == null || cand.distanceMeters < best.distanceMeters) {
                    best = cand
                }
            }
            return best
        }

        val hasFinal = exitPois.any { it.isMarkedFinalExit() }
        val finals = if (hasFinal) exitPois.filter { it.isMarkedFinalExit() } else emptyList()
        val internals = if (hasFinal) exitPois.filter { !it.isMarkedFinalExit() } else exitPois

        // 1) Final ngoài đỏ → 2) Internal ngoài đỏ → 3) Final xuyên đỏ → 4) Internal xuyên đỏ
        bestExit = considerExits(if (hasFinal) finals else exitPois, allowThroughHazard = false)
            ?: considerExits(internals, allowThroughHazard = false)
            ?: considerExits(if (hasFinal) finals else exitPois, allowThroughHazard = true)
            ?: considerExits(internals, allowThroughHazard = true)
        if (bestExit != null) {
            applyEmergencyEvacuationToPoi(
                gModel = gModel,
                startNodeId = startNodeId,
                candidate = bestExit,
                floorNumber = floorNumber,
                inHazard = startNodeId in blockedNodeIds,
                throughHazardWarning = true,
            )
            _emergencySession.update {
                it.copy(
                    error = "Lối duy nhất đi qua vùng nguy hiểm — đi nhanh, cẩn thận",
                )
            }
            return true
        }

        if (exitOnly) return false

        // Cầu thang (chỉ khi tầng không có EXIT dùng được)
        val stairs = findNearestStairsNodeForEvacuationForced(
            gModel = gModel,
            startNodeId = startNodeId,
            options = forcedOpts,
            preferStairsOnly = preferStairsOnly,
        )
        if (stairs != null) {
            applyEmergencyEvacuationToStairs(
                gModel = gModel,
                startNodeId = startNodeId,
                stairsNodeId = stairs.first,
                path = stairs.second,
                viaLabel = stairs.third,
                floorNumber = floorNumber,
                inHazard = startNodeId in blockedNodeIds,
                throughHazardWarning = true,
            )
            _emergencySession.update {
                it.copy(
                    error = "Lối duy nhất đi qua vùng nguy hiểm — đi nhanh, cẩn thận",
                )
            }
            return true
        }
        return false
    }

    private fun findNearestStairsNodeForEvacuationForced(
        gModel: GraphModel,
        startNodeId: String,
        options: AStarPathfinder.RoutingOptions,
        preferStairsOnly: Boolean,
    ): Triple<String, AStarPathfinder.PathResult, String>? {
        val pathfinder = AStarPathfinder(gModel)
        val ui = _uiState.value as? MapUiState.Success

        fun tryCandidates(
            nodes: Sequence<Pair<String, String>>,
        ): Triple<String, AStarPathfinder.PathResult, String>? {
            var bestId: String? = null
            var bestPath: AStarPathfinder.PathResult? = null
            var bestLabel = "cầu thang"
            for ((nodeId, label) in nodes) {
                val path = pathfinder.findPath(startNodeId, nodeId, options) ?: continue
                if (bestPath == null || path.totalDistanceMeters < bestPath!!.totalDistanceMeters) {
                    bestPath = path
                    bestId = nodeId
                    bestLabel = label
                }
            }
            val id = bestId ?: return null
            val path = bestPath ?: return null
            return Triple(id, path, bestLabel)
        }

        tryCandidates(
            gModel.nodeMap.values.asSequence().mapNotNull { node ->
                when {
                    node.isStairs -> node.nodeId to "cầu thang"
                    !preferStairsOnly && node.isElevator -> node.nodeId to "thang máy"
                    else -> null
                }
            },
        )?.let { return it }

        if (ui != null) {
            tryCandidates(
                ui.mapData.pois.asSequence().mapNotNull { poi ->
                    when (poi.resolveCategory()) {
                        PoiCategory.STAIRS -> {
                            val nid = SafePoiLocator.nearestNodeIdForPoi(gModel, poi) ?: return@mapNotNull null
                            nid to "cầu thang"
                        }
                        else -> null
                    }
                },
            )?.let { return it }

            if (!preferStairsOnly) {
                tryCandidates(
                    ui.mapData.pois.asSequence().mapNotNull { poi ->
                        when (poi.resolveCategory()) {
                            PoiCategory.ELEVATOR, PoiCategory.ESCALATOR -> {
                                val nid = SafePoiLocator.nearestNodeIdForPoi(gModel, poi) ?: return@mapNotNull null
                                nid to "thang máy"
                            }
                            else -> null
                        }
                    },
                )?.let { return it }
            }
        }
        return null
    }

    private fun applyEmergencyEvacuationToStairs(
        gModel: GraphModel,
        startNodeId: String,
        stairsNodeId: String,
        path: AStarPathfinder.PathResult,
        viaLabel: String,
        floorNumber: Int,
        inHazard: Boolean,
        throughHazardWarning: Boolean = false,
    ) {
        val stairsPoi = (_uiState.value as? MapUiState.Success)?.mapData?.pois
            ?.filter { it.resolveCategory() == PoiCategory.STAIRS }
            ?.minByOrNull { poi ->
                val node = gModel.nodeMap[stairsNodeId]
                if (node != null) {
                    hypot((poi.x - node.x).toDouble(), (poi.y - node.y).toDouble())
                } else {
                    Double.MAX_VALUE
                }
            }
        val fullPath = if (stairsPoi != null) {
            appendPathLegToPoint(
                path = path,
                gModel = gModel,
                destX = stairsPoi.x.toFloat(),
                destY = stairsPoi.y.toFloat(),
            )
        } else {
            path
        }
        applyComputedPath(
            result = fullPath,
            gModel = gModel,
            currentUserNodeId = startNodeId,
            targetNodeId = stairsNodeId,
            force = true,
        )
        val stairsNode = gModel.nodeMap[stairsNodeId]
        val marker = stairsPoi?.let { Offset(it.x.toFloat(), it.y.toFloat()) }
            ?: stairsNode?.let { Offset(it.x.toFloat(), it.y.toFloat()) }
        val label = viaLabel.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        fun resolveExitFloorHint(): Int? = buildingFloorCache.entries
            .asSequence()
            .filter { it.key != floorNumber }
            .firstOrNull { (_, md) ->
                md.pois.any { it.resolveCategory() == PoiCategory.EXIT }
            }?.key

        var exitFloorHint = resolveExitFloorHint()
        // Cache tầng chưa có → prefetch rồi gắn nút chuyển tầng
        if (exitFloorHint == null) {
            val bid = (_uiState.value as? MapUiState.Success)?.buildingId
            if (!bid.isNullOrBlank()) {
                viewModelScope.launch {
                    prefetchBuildingFloors(bid)
                    val hint = resolveExitFloorHint() ?: return@launch
                    val flLabel = if (hint == 0) "GF / tầng trệt" else "tầng $hint"
                    _emergencySession.update { it.copy(suggestedExitFloor = hint) }
                    _navState.update {
                        it.copy(
                            suggestedTargetFloor = hint,
                            readyForFloorSwitch = true,
                            floorTransitionHint = "Tới $viaLabel xong chạm 「Chuyển $flLabel」",
                            navHint = if (inHazard) {
                                "Thoát vùng đỏ → $label → xuống $flLabel"
                            } else {
                                "Sơ tán → $label rồi xuống $flLabel"
                            },
                        )
                    }
                }
            }
        }
        val floorLabel = when (exitFloorHint) {
            null -> null
            0 -> "GF / tầng trệt"
            else -> "tầng $exitFloorHint"
        }
        val warn = "⚠ Lối duy nhất đi qua vùng nguy hiểm — đi nhanh, cẩn thận"
        _navState.update {
            it.copy(
                destinationPoiId = stairsPoi?.id,
                destinationLabel = label,
                destinationMarkerPos = marker,
                isNavigatingMode = true,
                hasArrived = false,
                rerouteCount = 0,
                isRerouting = false,
                navHint = when {
                    throughHazardWarning -> warn
                    inHazard && floorLabel != null ->
                        "Thoát vùng đỏ → $label → xuống $floorLabel"
                    inHazard ->
                        "Thoát vùng đỏ → $label — làm theo đường màu xanh"
                    floorLabel != null ->
                        "Sơ tán → $label rồi xuống $floorLabel"
                    else ->
                        "Sơ tán → $label — làm theo đường màu xanh"
                },
                currentInstructionText = when {
                    throughHazardWarning -> "Đi qua vùng nguy hiểm → $viaLabel"
                    inHazard -> "Thoát vùng nguy hiểm → $viaLabel"
                    else -> "Đi tới $viaLabel"
                },
                pathHasFloorConnector = true,
                floorTransitionHint = floorLabel?.let { "Tới $viaLabel xong chạm 「Chuyển $it」" },
                suggestedTargetFloor = exitFloorHint,
                readyForFloorSwitch = exitFloorHint != null,
                navigationError = if (throughHazardWarning) warn else null,
            )
        }
        if (_navState.value.path.isNullOrEmpty() && activePath.isEmpty()) {
            startNavigationMode()
        } else {
            val nav = _navState.value
            val pos = nav.userPos
            if (pos != null && activePathEdges.isNotEmpty()) {
                _navState.value = applyTurnGuidance(nav, pos.x, pos.y)
            }
        }
        com.khoaluan.indoornav.fcm.EmergencySirenPlayer.stop()
        _emergencySession.update {
            it.copy(
                phase = EmergencyPhase.EVACUATING,
                targetLabel = if (floorLabel != null) "$label · xuống $floorLabel" else label,
                needsQr = false,
                error = if (throughHazardWarning) warn else null,
                suggestedExitFloor = exitFloorHint,
            )
        }
        Log.i(
            "MapViewModel",
            "Emergency stairs floor=$floorNumber → $stairsNodeId ($viaLabel) " +
                "exitFloor=$exitFloorHint dist=${fullPath.totalDistanceMeters}m",
        )
    }

    /**
     * Nối thêm đoạn cuối từ node path cuối → tọa độ POI (vd. icon cầu thang),
     * khi Editor chưa đặt path node sát POI.
     */
    private fun appendPathLegToPoint(
        path: AStarPathfinder.PathResult,
        gModel: GraphModel,
        destX: Float,
        destY: Float,
    ): AStarPathfinder.PathResult {
        val lastId = path.nodeIds.lastOrNull() ?: return path
        val last = gModel.nodeMap[lastId] ?: return path
        val dx = destX - last.x
        val dy = destY - last.y
        val distPx = hypot(dx, dy)
        if (distPx < 28f) return path
        // Cho phép đoạn cuối tới icon POI kể cả cắt nhẹ tường phòng (POI thường sát tường)
        val distM = gModel.pixelsToMeters(distPx.toFloat())
        val angle = kotlin.math.atan2(dx, -dy)
        val rev = kotlin.math.atan2(-dx, dy)
        val synth = GraphEdge(
            id = "evac-poi:$lastId",
            sourceNodeId = lastId,
            targetNodeId = "__evac_poi__",
            sourceX = last.x.toFloat(),
            sourceY = last.y.toFloat(),
            targetX = destX,
            targetY = destY,
            angleRad = angle,
            reverseAngleRad = rev,
            distanceMeters = distM,
        )
        return AStarPathfinder.PathResult(
            nodeIds = path.nodeIds + "__evac_poi__",
            edges = path.edges + synth,
            totalDistanceMeters = path.totalDistanceMeters + distM,
        )
    }

    /** Nối đoạn thoát zone + đoạn tiếp tới cầu thang. */
    private fun extendEscapePathToStairs(
        gModel: GraphModel,
        escapeSafeNodeId: String,
        escapePath: AStarPathfinder.PathResult,
        blockedNodeIds: Set<String>,
        blockedEdgeKeys: Set<String>,
        preferStairsOnly: Boolean,
    ): Triple<String, AStarPathfinder.PathResult, String>? {
        val fromSafe = findNearestStairsNodeForEvacuation(
            gModel = gModel,
            startNodeId = escapeSafeNodeId,
            blockedNodeIds = blockedNodeIds,
            blockedEdgeKeys = blockedEdgeKeys,
            preferStairsOnly = preferStairsOnly,
        ) ?: return null
        val (stairsId, leg2, label) = fromSafe
        if (stairsId == escapeSafeNodeId) {
            return Triple(stairsId, escapePath, label)
        }
        if (escapePath.nodeIds.isEmpty() || escapePath.nodeIds.last() != escapeSafeNodeId) {
            return null
        }
        return Triple(
            stairsId,
            AStarPathfinder.PathResult(
                nodeIds = escapePath.nodeIds + leg2.nodeIds.drop(1),
                edges = escapePath.edges + leg2.edges,
                totalDistanceMeters = escapePath.totalDistanceMeters + leg2.totalDistanceMeters,
            ),
            label,
        )
    }

    /**
     * Khi tầng hiện tại không có EXIT: chỉ đường tới cầu thang / lộ trình xuyên tầng,
     * luôn giữ bản đồ tầng đang đứng (không tự load tầng trệt).
     */
    private suspend fun resolveEmergencyExitOnOtherFloors(
        ui: MapUiState.Success,
        gModel: GraphModel,
        startNodeId: String,
        session: EmergencySession,
        adapter: DefaultEmergencyRoutingAdapter,
    ) {
        prefetchBuildingFloors(ui.buildingId)

        val avoidElevator = session.incidentType.equals("FIRE", ignoreCase = true) ||
            session.incidentType.equals("GAS", ignoreCase = true)
        val avoidKinds = if (avoidElevator) {
            setOf(FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR)
        } else {
            emptySet()
        }

        data class CrossExit(
            val floor: Int,
            val poi: com.khoaluan.indoornav.data.model.Poi,
            val kind: SafePoiLocator.SafeKind,
            val destNodeId: String,
            val plan: MultiFloorPathPlanner.Plan,
        )

        var best: CrossExit? = null
        for ((floor, md) in buildingFloorCache) {
            if (floor == ui.floorNumber) continue
            val destGraph = GraphModel(md)
            for (poi in md.pois) {
                val kind = when (poi.resolveCategory()) {
                    PoiCategory.EXIT -> SafePoiLocator.SafeKind.EXIT
                    PoiCategory.ASSEMBLY_POINT -> SafePoiLocator.SafeKind.ASSEMBLY_POINT
                    PoiCategory.SAFETY -> SafePoiLocator.SafeKind.SAFETY
                    else -> continue
                }
                // Không chọn EXIT nằm trong vùng nguy hiểm tầng hiện tại (node/POI bị block)
                if (kind == SafePoiLocator.SafeKind.EXIT) {
                    if (SafePoiLocator.poiInsideHazard(poi, currentHazardPolygons(ui.floorNumber))) continue
                }
                // Ưu tiên EXIT trước ASSEMBLY/SAFETY khi so khoảng cách
                val kindRank = when (kind) {
                    SafePoiLocator.SafeKind.EXIT -> 0
                    SafePoiLocator.SafeKind.ASSEMBLY_POINT -> 1
                    SafePoiLocator.SafeKind.SAFETY -> 2
                }
                val destNodeId = SafePoiLocator.nearestNodeIdForPoi(destGraph, poi) ?: continue
                if (kind == SafePoiLocator.SafeKind.EXIT && destNodeId in session.blockedNodeIds) continue
                val plan = adapter.planMultiFloor(
                    startFloor = ui.floorNumber,
                    destFloor = floor,
                    startNodeId = startNodeId,
                    destNodeId = destNodeId,
                    blockedNodeIds = session.blockedNodeIds,
                    blockedEdgeKeys = session.blockedEdgeKeys,
                    avoidConnectorKinds = avoidKinds,
                ) ?: continue
                val cand = CrossExit(floor, poi, kind, destNodeId, plan)
                val bestKindRank = when (best?.kind) {
                    SafePoiLocator.SafeKind.EXIT -> 0
                    SafePoiLocator.SafeKind.ASSEMBLY_POINT -> 1
                    SafePoiLocator.SafeKind.SAFETY -> 2
                    null -> Int.MAX_VALUE
                }
                val better = when {
                    best == null -> true
                    kindRank < bestKindRank -> true
                    kindRank > bestKindRank -> false
                    kind == SafePoiLocator.SafeKind.EXIT &&
                        poi.isMarkedFinalExit() && !best!!.poi.isMarkedFinalExit() -> true
                    kind == SafePoiLocator.SafeKind.EXIT &&
                        !poi.isMarkedFinalExit() && best!!.poi.isMarkedFinalExit() -> false
                    else -> cand.plan.totalDistanceMeters < best!!.plan.totalDistanceMeters
                }
                if (better) best = cand
            }
        }

        if (best != null) {
            val plan = best.plan
            applyComputedPath(
                result = plan.currentFloorPath,
                gModel = gModel,
                currentUserNodeId = startNodeId,
                targetNodeId = plan.via?.fromNodeId ?: best.destNodeId,
                force = true,
                totalDistanceOverride = plan.totalDistanceMeters,
                suggestedFloor = plan.targetFloor,
                pendingFloor = plan.targetFloor,
                pendingNode = plan.destNodeId,
            )
            val destMap = buildingFloorCache[best.floor]
            val destGraph = destMap?.let { GraphModel(it) }
            val destNodeObj = destGraph?.nodeMap?.get(best.destNodeId)
            pendingCrossFloor = PendingCrossFloor(
                floor = plan.targetFloor,
                nodeId = plan.destNodeId,
                markerX = destNodeObj?.x?.toFloat() ?: best.poi.x.toFloat(),
                markerY = destNodeObj?.y?.toFloat() ?: best.poi.y.toFloat(),
                arrivalNodeId = plan.via?.toNodeId,
            )
            val kindLabel = when (best.kind) {
                SafePoiLocator.SafeKind.EXIT ->
                    if (best.poi.isMarkedFinalExit()) "Lối thoát hiểm (cửa ngoài)"
                    else "Lối thoát hiểm"
                SafePoiLocator.SafeKind.ASSEMBLY_POINT -> "Điểm tập trung"
                SafePoiLocator.SafeKind.SAFETY -> "Điểm an toàn"
            }
            val poiName = best.poi.name?.takeIf { it.isNotBlank() } ?: kindLabel
            val floorLabel = if (best.floor == 0) "GF" else best.floor.toString()
            val viaLabel = when (plan.via?.kind) {
                FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR -> "thang máy"
                FloorTransitionDetector.ConnectorHint.Kind.STAIRS -> "cầu thang"
                else -> "connector"
            }
            val label = "$poiName · $kindLabel (tầng $floorLabel)"
            val finalExitMarker = Offset(
                pendingCrossFloor!!.markerX,
                pendingCrossFloor!!.markerY,
            )
            _navState.update {
                it.copy(
                    destinationPoiId = best.poi.id,
                    destinationLabel = label,
                    // Pin đỏ = lối thoát thật (đích cuối), không phải cầu thang
                    destinationMarkerPos = finalExitMarker,
                    isNavigatingMode = true,
                    hasArrived = false,
                    rerouteCount = 0,
                    isRerouting = false,
                    navHint = "Sơ tán → $label — đi tới $viaLabel rồi xuống tầng $floorLabel",
                    currentInstructionText = "Đến $viaLabel rồi xuống tầng $floorLabel",
                    floorTransitionHint = "Xuống tầng $floorLabel rồi tiếp tục tới lối thoát",
                    suggestedTargetFloor = plan.targetFloor,
                    pendingDestFloor = plan.targetFloor,
                    pendingDestNodeId = plan.destNodeId,
                    pathHasFloorConnector = true,
                )
            }
            if (_navState.value.path.isNullOrEmpty() && activePath.isEmpty()) {
                startNavigationMode()
            } else {
                val nav = _navState.value
                val pos = nav.userPos
                if (pos != null && activePathEdges.isNotEmpty()) {
                    _navState.value = applyTurnGuidance(nav, pos.x, pos.y)
                }
            }
            com.khoaluan.indoornav.fcm.EmergencySirenPlayer.stop()
            _emergencySession.update {
                it.copy(
                    phase = EmergencyPhase.EVACUATING,
                    targetLabel = label,
                    needsQr = false,
                    error = null,
                )
            }
            Log.i(
                "MapViewModel",
                "Emergency multi-floor → F${best.floor}/${best.destNodeId} via $viaLabel",
            )
            return
        }

        // Không đổi bản đồ sang tầng khác — giữ tầng đang đứng.
        // Fallback: chỉ đường tới cầu thang gần nhất trên tầng hiện tại.
        val stairsTarget = findNearestStairsNodeForEvacuation(
            gModel = gModel,
            startNodeId = startNodeId,
            blockedNodeIds = session.blockedNodeIds,
            blockedEdgeKeys = session.blockedEdgeKeys,
            preferStairsOnly = avoidElevator,
        )
        if (stairsTarget != null) {
            val (stairsNodeId, path, viaLabel) = stairsTarget
            val exitFloorHint = buildingFloorCache.entries
                .asSequence()
                .filter { it.key != ui.floorNumber }
                .firstOrNull { (_, md) ->
                    md.pois.any { it.resolveCategory() == PoiCategory.EXIT }
                }?.key
            val floorLabel = when (exitFloorHint) {
                null -> "dưới"
                0 -> "GF / tầng trệt"
                else -> "tầng $exitFloorHint"
            }
            applyComputedPath(
                result = path,
                gModel = gModel,
                currentUserNodeId = startNodeId,
                targetNodeId = stairsNodeId,
                force = true,
            )
            val stairsNode = gModel.nodeMap[stairsNodeId]
            val marker = stairsNode?.let { Offset(it.x.toFloat(), it.y.toFloat()) }
            val label = "$viaLabel · xuống $floorLabel"
            _navState.update {
                it.copy(
                    destinationPoiId = null,
                    destinationLabel = label,
                    destinationMarkerPos = marker,
                    isNavigatingMode = true,
                    hasArrived = false,
                    rerouteCount = 0,
                    isRerouting = false,
                    navHint = "Tầng này không có lối thoát — đi tới $viaLabel rồi xuống $floorLabel",
                    currentInstructionText = "Đi tới $viaLabel",
                    floorTransitionHint = "Xuống $floorLabel để tới lối thoát hiểm",
                    suggestedTargetFloor = exitFloorHint,
                    pathHasFloorConnector = true,
                )
            }
            if (_navState.value.path.isNullOrEmpty() && activePath.isEmpty()) {
                startNavigationMode()
            } else {
                val nav = _navState.value
                val pos = nav.userPos
                if (pos != null && activePathEdges.isNotEmpty()) {
                    _navState.value = applyTurnGuidance(nav, pos.x, pos.y)
                }
            }
            com.khoaluan.indoornav.fcm.EmergencySirenPlayer.stop()
            _emergencySession.update {
                it.copy(
                    phase = EmergencyPhase.EVACUATING,
                    targetLabel = label,
                    needsQr = false,
                    error = null,
                )
            }
            Log.i(
                "MapViewModel",
                "Emergency stay on floor ${ui.floorNumber} → $viaLabel $stairsNodeId (EXIT on other floor)",
            )
            return
        }

        // Fallback cuối: đang trong vùng nguy hiểm → chỉ đường ra ngoài zone
        if (startNodeId in session.blockedNodeIds) {
            val escaped = tryEscapeHazardZone(
                gModel = gModel,
                startNodeId = startNodeId,
                blockedNodeIds = session.blockedNodeIds,
                blockedEdgeKeys = session.blockedEdgeKeys,
            )
            if (escaped != null) {
                applyHazardEscapePath(gModel, startNodeId, escaped.first, escaped.second, ui.floorNumber)
                return
            }
        }

        val exitFloorHint = buildingFloorCache.entries
            .asSequence()
            .filter { it.key != ui.floorNumber }
            .firstOrNull { (_, md) ->
                md.pois.any { it.resolveCategory() == PoiCategory.EXIT }
            }?.key
        _emergencySession.update {
            it.copy(
                phase = EmergencyPhase.EVACUATING,
                needsQr = false,
                suggestedExitFloor = exitFloorHint,
                error = "Đường đi trên tầng này bị đứt đoạn (node/edge chưa nối hết tới cầu thang). " +
                    "Chạm 「Tính lại đường」, 「Xuống tầng lối thoát」, hoặc nối lại edges trong Web Editor rồi Publish.",
            )
        }
        if (exitFloorHint != null) {
            _navState.update {
                it.copy(
                    suggestedTargetFloor = exitFloorHint,
                    readyForFloorSwitch = true,
                    isNavigatingMode = true,
                    navHint = "Sơ tán: chọn tầng ${if (exitFloorHint == 0) "GF" else exitFloorHint} " +
                        "hoặc chạm vị trí đứng — lối thoát ở tầng đó.",
                )
            }
        } else {
            _navState.update {
                it.copy(
                    isNavigatingMode = true,
                    navHint = "Chạm gần hành lang chính rồi bấm 「Tính lại đường」",
                )
            }
        }
    }

    /**
     * User đang trong vùng nguy hiểm → tìm node ngoài zone gần nhất và chỉ đường thoát ra.
     * Ưu tiên đường ra cửa nhanh (ít mét trong vùng đỏ), không đi sâu vào phòng khác trong zone.
     */
    private fun tryEscapeHazardZone(
        gModel: GraphModel,
        startNodeId: String,
        blockedNodeIds: Set<String>,
        blockedEdgeKeys: Set<String>,
    ): Pair<String, AStarPathfinder.PathResult>? {
        if (startNodeId !in blockedNodeIds) return null
        val pathfinder = AStarPathfinder(gModel)
        val options = AStarPathfinder.RoutingOptions(
            blockedNodeIds = blockedNodeIds,
            blockedEdgeKeys = blockedEdgeKeys,
            softBridgeMaxPx = DefaultEmergencyRoutingAdapter.EMERGENCY_SOFT_BRIDGE_PX,
            escapeFromHazard = true,
            hazardPolygons = currentHazardPolygons(),
        )
        val portalIds = linkedSetOf<String>()
        for (blockedId in blockedNodeIds) {
            gModel.adjacency[blockedId].orEmpty().forEach { e ->
                if (e.targetNodeId !in blockedNodeIds) portalIds.add(e.targetNodeId)
            }
        }

        val hazardPolys = _mapHazardZones.value
            .ifEmpty { _emergencySession.value.hazardZones }
            .map { it.points }
            .filter { it.size >= 3 }
        val doors = (_uiState.value as? MapUiState.Success)?.mapData?.doors.orEmpty()
        val maxPx = DefaultEmergencyRoutingAdapter.EMERGENCY_SOFT_BRIDGE_PX
        val maxPx2 = maxPx * maxPx
        val startNode = gModel.nodeMap[startNodeId]

        fun nearestUnblocked(px: Float, py: Float): String? {
            var bestId: String? = null
            var bestD = Float.MAX_VALUE
            for (node in gModel.nodeMap.values) {
                if (node.nodeId in blockedNodeIds) continue
                val dx = node.x - px
                val dy = node.y - py
                val d = dx * dx + dy * dy
                if (d < bestD) {
                    bestD = d
                    bestId = node.nodeId
                }
            }
            return bestId
        }

        // Lối đi thật = cửa: lấy điểm vừa ra ngoài zone theo pháp tuyến cửa
        for (door in doors) {
            val rot = Math.toRadians(door.rotation.toDouble())
            val nx = (-kotlin.math.sin(rot)).toFloat()
            val ny = kotlin.math.cos(rot).toFloat()
            val offset = (door.width.takeIf { it > 0 } ?: 40) * 0.75f + 36f
            for (sign in floatArrayOf(1f, -1f)) {
                val ex = door.x + sign * nx * offset
                val ey = door.y + sign * ny * offset
                val outside = hazardPolys.isEmpty() || hazardPolys.none { poly ->
                    pointInPolygon(ex, ey, poly)
                }
                if (!outside) continue
                val nid = nearestUnblocked(ex, ey) ?: continue
                portalIds.add(nid)
            }
        }

        if (startNode != null) {
            for (node in gModel.nodeMap.values) {
                if (node.nodeId in blockedNodeIds || node.nodeId == startNodeId) continue
                val dx = (node.x - startNode.x).toFloat()
                val dy = (node.y - startNode.y).toFloat()
                if (dx * dx + dy * dy > maxPx2) continue
                if (!gModel.crossesWall(
                        startNode.x.toFloat(), startNode.y.toFloat(),
                        node.x.toFloat(), node.y.toFloat(),
                    )
                ) {
                    portalIds.add(node.nodeId)
                }
            }
        }

        fun better(
            path: AStarPathfinder.PathResult,
            bestPath: AStarPathfinder.PathResult?,
        ): Boolean {
            if (bestPath == null) return true
            val exp = path.hazardExposureMeters(blockedNodeIds)
            val bestExp = bestPath.hazardExposureMeters(blockedNodeIds)
            if (exp < bestExp - 0.05f) return true
            if (kotlin.math.abs(exp - bestExp) <= 0.05f &&
                path.totalDistanceMeters < bestPath.totalDistanceMeters
            ) {
                return true
            }
            return false
        }

        var bestId: String? = null
        var bestPath: AStarPathfinder.PathResult? = null

        fun considerGoals(ids: Iterable<String>) {
            for (id in ids) {
                if (id == startNodeId || id in blockedNodeIds) continue
                val path = pathfinder.findPath(startNodeId, id, options) ?: continue
                if (better(path, bestPath)) {
                    bestPath = path
                    bestId = id
                }
            }
        }

        considerGoals(portalIds)
        considerGoals(gModel.nodeMap.keys)

        val id = bestId ?: return null
        val path = bestPath ?: return null
        return id to path
    }

    private fun applyHazardEscapePath(
        gModel: GraphModel,
        startNodeId: String,
        safeNodeId: String,
        path: AStarPathfinder.PathResult,
        floorNumber: Int,
    ) {
        applyComputedPath(
            result = path,
            gModel = gModel,
            currentUserNodeId = startNodeId,
            targetNodeId = safeNodeId,
            force = true,
        )
        val safeNode = gModel.nodeMap[safeNodeId]
        val marker = safeNode?.let { Offset(it.x.toFloat(), it.y.toFloat()) }
        val label = "Thoát vùng nguy hiểm"
        _navState.update {
            it.copy(
                destinationPoiId = null,
                destinationLabel = label,
                destinationMarkerPos = marker,
                isNavigatingMode = true,
                hasArrived = false,
                rerouteCount = 0,
                isRerouting = false,
                navHint = "Bạn đang trong vùng nguy hiểm — đi theo đường xanh để ra ngoài khu vực tô đỏ",
                currentInstructionText = "Ra khỏi vùng nguy hiểm",
            )
        }
        if (_navState.value.path.isNullOrEmpty() && activePath.isEmpty()) {
            startNavigationMode()
        } else {
            val nav = _navState.value
            val pos = nav.userPos
            if (pos != null && activePathEdges.isNotEmpty()) {
                _navState.value = applyTurnGuidance(nav, pos.x, pos.y)
            }
        }
        com.khoaluan.indoornav.fcm.EmergencySirenPlayer.stop()
        _emergencySession.update {
            it.copy(
                phase = EmergencyPhase.EVACUATING,
                targetLabel = label,
                needsQr = false,
                error = null,
            )
        }
        Log.i(
            "MapViewModel",
            "Emergency escape hazard floor=$floorNumber → $safeNodeId dist=${path.totalDistanceMeters}m",
        )
    }

    /** Tìm node cầu thang (ưu tiên) / thang máy gần nhất trên tầng hiện tại để sơ tán. */
    private fun findNearestStairsNodeForEvacuation(
        gModel: GraphModel,
        startNodeId: String,
        blockedNodeIds: Set<String>,
        blockedEdgeKeys: Set<String>,
        preferStairsOnly: Boolean,
    ): Triple<String, AStarPathfinder.PathResult, String>? {
        val pathfinder = AStarPathfinder(gModel)
        val options = AStarPathfinder.RoutingOptions(
            blockedNodeIds = blockedNodeIds,
            blockedEdgeKeys = blockedEdgeKeys,
            softBridgeMaxPx = DefaultEmergencyRoutingAdapter.EMERGENCY_SOFT_BRIDGE_PX,
            escapeFromHazard = startNodeId in blockedNodeIds,
            hazardPolygons = currentHazardPolygons(),
        )
        val ui = _uiState.value as? MapUiState.Success

        fun tryCandidates(
            nodes: Sequence<Pair<String, String>>,
        ): Triple<String, AStarPathfinder.PathResult, String>? {
            var bestId: String? = null
            var bestPath: AStarPathfinder.PathResult? = null
            var bestLabel = "cầu thang"
            for ((nodeId, label) in nodes) {
                val path = pathfinder.findPath(startNodeId, nodeId, options) ?: continue
                if (bestPath == null || path.totalDistanceMeters < bestPath!!.totalDistanceMeters) {
                    bestPath = path
                    bestId = nodeId
                    bestLabel = label
                }
            }
            val id = bestId ?: return null
            val path = bestPath ?: return null
            return Triple(id, path, bestLabel)
        }

        // 1) Node gắn cờ is_stairs / is_elevator
        val flagged = tryCandidates(
            gModel.nodeMap.values.asSequence()
                .mapNotNull { node ->
                    when {
                        node.isStairs -> node.nodeId to "cầu thang"
                        !preferStairsOnly && node.isElevator -> node.nodeId to "thang máy"
                        else -> null
                    }
                },
        )
        if (flagged != null) return flagged

        // 2) POI STAIRS / ELEVATOR (kể cả tên "cầu thang" dù poi_type=OTHER)
        if (ui != null) {
            val stairPois = tryCandidates(
                ui.mapData.pois.asSequence()
                    .mapNotNull { poi ->
                        when (poi.resolveCategory()) {
                            PoiCategory.STAIRS -> {
                                val nid = SafePoiLocator.nearestNodeIdForPoi(gModel, poi) ?: return@mapNotNull null
                                nid to "cầu thang"
                            }
                            else -> null
                        }
                    },
            )
            if (stairPois != null) return stairPois

            // 3) Fallback cháy: dùng thang máy / thang cuốn nếu không có cầu thang
            val elevPois = tryCandidates(
                ui.mapData.pois.asSequence()
                    .mapNotNull { poi ->
                        when (poi.resolveCategory()) {
                            PoiCategory.ELEVATOR, PoiCategory.ESCALATOR -> {
                                val nid = SafePoiLocator.nearestNodeIdForPoi(gModel, poi) ?: return@mapNotNull null
                                nid to "thang máy/thang cuốn"
                            }
                            else -> null
                        }
                    },
            )
            if (elevPois != null) return elevPois
        }

        // 4) Node cờ thang máy (dù preferStairsOnly) — chỉ khi không còn lựa chọn
        return tryCandidates(
            gModel.nodeMap.values.asSequence()
                .filter { it.isElevator }
                .map { it.nodeId to "thang máy" },
        )
    }

    /**
     * User chọn 「Xuống tầng lối thoát」 từ màn cảnh báo khi tầng hiện tại không sơ tán được.
     */
    fun switchEmergencyToExitFloor() {
        val session = _emergencySession.value
        if (!session.active) return
        val ui = _uiState.value as? MapUiState.Success ?: return
        val target = session.suggestedExitFloor
            ?: buildingFloorCache.entries
                .asSequence()
                .filter { it.key != ui.floorNumber }
                .firstOrNull { (_, md) ->
                    md.pois.any { it.resolveCategory() == PoiCategory.EXIT }
                }?.key
            ?: return

        // Đã ở đúng tầng lối thoát → neo cầu thang + chỉ đường tiếp
        if (target == ui.floorNumber) {
            clearExitFloorHintIfArrived(ui.floorNumber)
            seedAtStairsThenContinueEmergency()
            return
        }
        goToEmergencyFloor(ui.buildingId, target)
    }

    /**
     * Chọn tầng từ sheet GF▼ khi đang khẩn cấp — giữ phiên sơ tán, neo cầu thang, chỉ đường lại.
     */
    fun switchFloorDuringEmergency(targetFloor: Int) {
        if (!_emergencySession.value.active) return
        val ui = _uiState.value as? MapUiState.Success ?: return
        val target = targetFloor.coerceAtLeast(0)
        _emergencySession.update {
            it.copy(
                suggestedExitFloor = target,
                floorConfirmed = true,
                phase = EmergencyPhase.EVACUATING,
                needsQr = false,
                error = null,
            )
        }
        if (target == ui.floorNumber) {
            clearExitFloorHintIfArrived(ui.floorNumber)
            seedAtStairsThenContinueEmergency()
            return
        }
        goToEmergencyFloor(ui.buildingId, target)
    }

    fun prefetchFloorsForEmergencyUi(buildingId: String) {
        if (buildingId.isBlank()) return
        viewModelScope.launch { prefetchBuildingFloors(buildingId) }
    }

    /**
     * Đổi tầng khi đang khẩn cấp — CHỈ swap map in-place.
     * Không gọi refreshMap / fetchMap / clearLocalization (tránh Loading / mất session / “văng”).
     */
    private fun goToEmergencyFloor(buildingId: String, target: Int) {
        viewModelScope.launch {
            try {
                Log.i("MapViewModel", "EMERGENCY in-place floor → $target")
                prefetchBuildingFloors(buildingId)

                // Prefetch có thể đã có map — chuẩn bị pending EXIT + khớp POI cầu thang đầu/cuối
                val fromUi = _uiState.value as? MapUiState.Success
                val fromMap = fromUi?.mapData
                val fromGraph = graphModel
                val userHintX = _navState.value.userPos?.x
                val userHintY = _navState.value.userPos?.y
                val departStairs = if (fromMap != null && fromGraph != null) {
                    pickBestStairsPoi(fromMap, fromGraph, userHintX, userHintY)
                } else null
                if (departStairs != null) {
                    stairsDepartHintX = departStairs.x.toFloat()
                    stairsDepartHintY = departStairs.y.toFloat()
                } else if (userHintX != null && userHintY != null) {
                    stairsDepartHintX = userHintX
                    stairsDepartHintY = userHintY
                }

                val destMapPreview = buildingFloorCache[target]
                    ?: mapCacheManager.load(buildingId, target)?.mapData
                if (destMapPreview != null) {
                    val destGraph = GraphModel(destMapPreview.sanitized())
                    val exitPoi = destMapPreview.pois.firstOrNull {
                        it.resolveCategory() == PoiCategory.EXIT
                    }
                    val exitNodeId = exitPoi?.let {
                        SafePoiLocator.nearestNodeIdForPoi(destGraph, it)
                    } ?: destGraph.nodeMap.keys.firstOrNull()
                    val exitNode = exitNodeId?.let { destGraph.nodeMap[it] }
                    val arrivalStairs = pickBestStairsPoi(
                        destMapPreview.sanitized(),
                        destGraph,
                        stairsDepartHintX,
                        stairsDepartHintY,
                    )
                    val arrivalId = arrivalStairs?.let {
                        SafePoiLocator.nearestNodeIdForPoi(destGraph, it)
                    }
                        ?: destGraph.nodeMap.values.firstOrNull { it.isStairs }?.nodeId
                        ?: destGraph.nodeMap.values.firstOrNull { it.isElevator }?.nodeId
                    pendingCrossFloor = PendingCrossFloor(
                        floor = target,
                        nodeId = exitNodeId ?: "pending-exit",
                        markerX = exitNode?.x?.toFloat() ?: exitPoi?.x?.toFloat() ?: 0f,
                        markerY = exitNode?.y?.toFloat() ?: exitPoi?.y?.toFloat() ?: 0f,
                        arrivalNodeId = arrivalId,
                        arrivalHintX = arrivalStairs?.x?.toFloat() ?: stairsDepartHintX,
                        arrivalHintY = arrivalStairs?.y?.toFloat() ?: stairsDepartHintY,
                    )
                    Log.i(
                        "MapViewModel",
                        "goToEmergencyFloor match stairs depart=" +
                            "(${stairsDepartHintX},${stairsDepartHintY}) arrival=" +
                            "(${arrivalStairs?.x},${arrivalStairs?.y}) node=$arrivalId",
                    )
                } else {
                    pendingCrossFloor = PendingCrossFloor(
                        floor = target,
                        nodeId = "pending-exit",
                        markerX = 0f,
                        markerY = 0f,
                        arrivalNodeId = null,
                        arrivalHintX = stairsDepartHintX,
                        arrivalHintY = stairsDepartHintY,
                    )
                }

                emergencyArriveBlockedUntilMs = System.currentTimeMillis() + 4_000L
                stairsSeedHoldPos = null
                stairsSeedHoldUntilMs = 0L
                _emergencySession.update {
                    it.copy(
                        phase = EmergencyPhase.EVACUATING,
                        needsQr = false,
                        error = null,
                        suggestedExitFloor = target,
                        floorConfirmed = true,
                        targetLabel = "Lối thoát hiểm (tầng ${if (target == 0) "GF" else target})",
                    )
                }
                _navState.update {
                    it.copy(
                        suggestedTargetFloor = target,
                        pendingDestFloor = target,
                        isNavigatingMode = true,
                        path = emptyList(),
                        hasArrived = false,
                        destinationPoiId = null,
                        destinationNodeId = null,
                        destinationMarkerPos = null,
                        destinationLabel = null,
                        userPos = null,
                        startAnchorPos = null,
                        navHint = "Đang chuyển tầng ${if (target == 0) "GF" else target}…",
                    )
                }

                val ok = loadFloorMapInPlace(buildingId, target, reason = "goToEmergencyFloor")
                if (!ok) {
                    _navState.update {
                        it.copy(navHint = "Đổi tầng thất bại — vẫn ở tầng cũ")
                    }
                    return@launch
                }
                // Đảm bảo neo cầu thang + path sau load (tránh kẹt “Quét QR” / 0 m)
                if (_navState.value.userPos == null ||
                    (_navState.value.path.isNullOrEmpty() && activePath.isEmpty())
                ) {
                    Log.w("MapViewModel", "goToEmergencyFloor: re-seed after load (pos/path missing)")
                    seedAtStairsThenContinueEmergency()
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e("MapViewModel", "EMERGENCY floor swap failed — stay on current floor", e)
                _emergencySession.update {
                    it.copy(
                        phase = EmergencyPhase.EVACUATING,
                        needsQr = false,
                        error = "Đổi tầng lỗi — vẫn ở tầng cũ. Thử lại.",
                    )
                }
                _navState.update {
                    it.copy(navHint = "Đổi tầng lỗi — map không bị đóng")
                }
            }
        }
    }

    /** Sau khi đặt vị trí đứng / quét QR khi đang chờ sơ tán → tự chỉ đường ra lối thoát. */
    private fun tryResumeEmergencyEvacuationAfterLocalize() {
        val session = _emergencySession.value
        if (!session.active) return
        _emergencySession.update { it.copy(floorConfirmed = true, needsQr = false, error = null) }
        when (_emergencySession.value.phase) {
            EmergencyPhase.AWAITING_LOCATION,
            EmergencyPhase.AWAITING_FLOOR,
            -> startEmergencyEvacuation()
            EmergencyPhase.EVACUATING -> {
                val nav = _navState.value
                if (nav.path.isNullOrEmpty() && activePath.isEmpty()) {
                    startEmergencyEvacuation()
                }
            }
            else -> Unit
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
                startPois = ui.mapData.pois,
                destPois = destMap.pois,
            )
            if (plan == null) {
                Log.e("MapViewModel", "W3 no multi-floor path $currentUserNodeId → F$destFloor/$destNode")
                activePathEdges = emptyList()
                activeManeuvers = emptyList()
                activeFloorConnectors = emptyList()
                val hasStairs =
                    gModel.nodeMap.values.any { it.isStairs || it.isElevator } ||
                        ui.mapData.pois.any {
                            when (it.resolveCategory()) {
                                PoiCategory.STAIRS, PoiCategory.ELEVATOR, PoiCategory.ESCALATOR -> true
                                else -> false
                            }
                        }
                _navState.value = _navState.value.copy(
                    path = emptyList(),
                    navigationError = if (hasStairs) {
                        "Đường đi đứt đoạn trên tầng này — nối edge từ vị trí bạn tới cầu thang trong Web Editor rồi Publish."
                    } else {
                        "Không tìm được đường xuyên tầng (cần connector cùng tọa độ)."
                    },
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
            val viaFrom = plan.via?.fromNodeId?.let { gModel.nodeMap[it] }
            val viaTo = plan.via?.toNodeId?.let { destGraph.nodeMap[it] }
            // Lưu XY chân cầu thang tầng hiện tại → chọn đúng đầu/cuối trên tầng đích
            if (viaFrom != null) {
                stairsDepartHintX = viaFrom.x.toFloat()
                stairsDepartHintY = viaFrom.y.toFloat()
            }
            pendingCrossFloor = PendingCrossFloor(
                floor = plan.targetFloor,
                nodeId = plan.destNodeId,
                markerX = destNodeObj?.x?.toFloat() ?: 0f,
                markerY = destNodeObj?.y?.toFloat() ?: 0f,
                arrivalNodeId = plan.via?.toNodeId,
                arrivalHintX = viaTo?.x?.toFloat() ?: stairsDepartHintX,
                arrivalHintY = viaTo?.y?.toFloat() ?: stairsDepartHintY,
            )
            val viaLabel = when (plan.via?.kind) {
                FloorTransitionDetector.ConnectorHint.Kind.ELEVATOR -> "thang máy"
                FloorTransitionDetector.ConnectorHint.Kind.STAIRS -> "cầu thang"
                else -> "connector"
            }
            val floorLabel = if (plan.targetFloor == 0) "GF" else plan.targetFloor.toString()
            val currentFloor = ui.floorNumber
            val goVerb = when {
                plan.targetFloor < currentFloor -> "xuống"
                plan.targetFloor > currentFloor -> "lên"
                else -> "sang"
            }
            _navState.update {
                it.copy(
                    currentInstructionText = "Đến $viaLabel rồi $goVerb tầng $floorLabel",
                    floorTransitionHint = "Chạm đây hoặc nút 「Chuyển tầng $floorLabel」 để tiếp tục",
                    destinationMarkerPos = Offset(pendingCrossFloor!!.markerX, pendingCrossFloor!!.markerY),
                    suggestedTargetFloor = plan.targetFloor,
                    pendingDestFloor = plan.targetFloor,
                    readyForFloorSwitch = true,
                    pathHasFloorConnector = true,
                )
            }
            return
        }

        val result = if (_emergencySession.value.active) {
            // Khẩn cấp: tránh vùng đỏ (kể cả cạnh cắt xuyên polygon)
            if (_emergencySession.value.hazardZones.isNotEmpty() || _mapHazardZones.value.isNotEmpty()) {
                val blocked = blockedNodesFromHazardDraws(
                    _mapHazardZones.value.ifEmpty { _emergencySession.value.hazardZones },
                )
                _emergencySession.update { it.copy(blockedNodeIds = blocked) }
            }
            val blocked = _emergencySession.value.blockedNodeIds
            val polys = currentHazardPolygons(ui.floorNumber)
            pFinder.findPath(
                currentUserNodeId,
                destNode,
                AStarPathfinder.RoutingOptions(
                    blockedNodeIds = blocked,
                    blockedEdgeKeys = _emergencySession.value.blockedEdgeKeys,
                    softBridgeMaxPx = DefaultEmergencyRoutingAdapter.EMERGENCY_SOFT_BRIDGE_PX,
                    escapeFromHazard = currentUserNodeId in blocked,
                    hazardPolygons = polys,
                ),
            )
        } else {
            // Thường: thử path cứng; nếu đứt đoạn map (POI/phòng gần node cô lập) → soft-bridge ngắn
            pFinder.findPath(currentUserNodeId, destNode)
                ?: pFinder.findPath(
                    currentUserNodeId,
                    destNode,
                    AStarPathfinder.RoutingOptions(softBridgeMaxPx = pixelsPerMeter * 3.5f),
                )
        }
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
        earlyTurnAlignSinceMs = 0L
        earlyTurnAlignManeuverAt = Float.NaN
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
        // Đa tầng: giữ pin đỏ = đích cuối (EXIT), không đổi thành điểm cầu thang trên path
        val isCrossFloorLeg = suggestedFloor != null || pendingFloor != null
        val markerPos = when {
            isCrossFloorLeg && _navState.value.destinationMarkerPos != null ->
                _navState.value.destinationMarkerPos
            else -> pathOffsets.lastOrNull() ?: _navState.value.destinationMarkerPos
        }
        var next = _navState.value.copy(
            path = pathOffsets,
            // Cross-floor: destinationNodeId tạm = connector; giữ pendingDestNodeId làm đích thật
            destinationNodeId = if (isCrossFloorLeg) {
                _navState.value.pendingDestNodeId ?: pendingNode ?: targetNodeId
            } else {
                targetNodeId
            },
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
            // Đa tầng: cho phép bấm 「Chuyển tầng」 ngay sau khi có path (không bắt buộc đứng sát cầu thang)
            readyForFloorSwitch = suggestedFloor != null || pendingFloor != null,
        )
        val pos = next.userPos
        if (next.isNavigatingMode && pos != null) {
            next = applyTurnGuidance(next, pos.x, pos.y)
        } else if (activeManeuvers.isNotEmpty()) {
            val g = TurnByTurnEngine.guidance(
                activeManeuvers,
                result.totalDistanceMeters,
                0f,
                edges = activePathEdges,
            )
            val mPos = if (g.nextManeuverMapX != null && g.nextManeuverMapY != null) {
                Offset(g.nextManeuverMapX, g.nextManeuverMapY)
            } else null
            next = next.copy(
                currentInstructionText = g.instructionText,
                distanceToNextManeuverMeters = g.distanceToNextManeuverMeters,
                remainingDistanceMeters = totalDist,
                nextManeuverPos = mPos,
                nextManeuverType = g.nextType.name,
            )
        }
        _navState.value = next
        syncRouteSnapToEngine()
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
        val rawTraveled = TurnByTurnEngine.traveledMetersAlongEdges(activePathEdges, x, y)
        val heading = state.userHeading
        val aligned = TurnByTurnEngine.isEarlyTurnHeadingAligned(
            maneuvers = activeManeuvers,
            edges = activePathEdges,
            traveledMeters = rawTraveled,
            userHeadingDeg = heading,
            totalDistanceMeters = state.totalDistanceMeters,
        )
        val nowAlign = System.currentTimeMillis()
        val nextAhead = activeManeuvers.firstOrNull {
            it.atDistanceMeters > rawTraveled + TurnByTurnEngine.MANEUVER_HYSTERESIS_M
        }
        val skipConfirmed = if (aligned && nextAhead != null) {
            if (earlyTurnAlignManeuverAt != nextAhead.atDistanceMeters) {
                earlyTurnAlignManeuverAt = nextAhead.atDistanceMeters
                earlyTurnAlignSinceMs = nowAlign
            }
            nowAlign - earlyTurnAlignSinceMs >= earlyTurnStableMs
        } else {
            earlyTurnAlignSinceMs = 0L
            earlyTurnAlignManeuverAt = Float.NaN
            false
        }
        val g = TurnByTurnEngine.guidance(
            maneuvers = activeManeuvers,
            totalDistanceMeters = state.totalDistanceMeters,
            traveledMeters = rawTraveled,
            edges = activePathEdges,
            userHeadingDeg = heading,
            skipEarlyTurnConfirmed = skipConfirmed,
        )
        val traveled = g.effectiveTraveledMeters
        val maneuverPos = if (g.nextManeuverMapX != null && g.nextManeuverMapY != null) {
            Offset(g.nextManeuverMapX, g.nextManeuverMapY)
        } else {
            null
        }
        val maneuverTypeName = g.nextType.name
        val end = activePathEdges.last()
        val distToPathEndM = hypot(x - end.targetX, y - end.targetY) / pixelsPerMeter
        // Ngưỡng động: đường ngắn (vd. 5m) không dùng 1.8m tuyệt đối nếu vẫn quá “rộng” so với pin
        val arriveTh = if (_emergencySession.value.active) {
            1.0f
        } else {
            val dynamic = (state.totalDistanceMeters * 0.22f).coerceIn(1.0f, arriveThresholdMeters)
            minOf(arriveThresholdMeters, dynamic)
        }
        // Phải đi được một đoạn thật — đường ≤ ngưỡng thì cần gần pin ngay từ đầu
        val progressedEnough = if (state.totalDistanceMeters <= arriveTh * 1.5f) {
            true
        } else {
            traveled >= minOf(2.0f, state.totalDistanceMeters * 0.35f)
        }

        // Pin đỏ (điểm đến thật) — chỉ khi tới đây mới “Đã đến nơi”
        val redPin = state.destinationMarkerPos
        val distToRedPinM = if (redPin != null) {
            hypot(x - redPin.x, y - redPin.y) / pixelsPerMeter
        } else {
            Float.MAX_VALUE
        }
        val destNode = state.destinationNodeId?.let { graphModel?.nodeMap?.get(it) }
        val distToDestNodeM = if (destNode != null) {
            hypot(x - destNode.x.toFloat(), y - destNode.y.toFloat()) / pixelsPerMeter
        } else {
            distToRedPinM
        }
        // Phải gần pin đỏ + gần node đích + còn ít mét trên path (tránh đứng hành lang ~3–4m báo đến)
        val nearRedPin = redPin != null &&
            progressedEnough &&
            distToRedPinM <= arriveTh &&
            distToDestNodeM <= arriveTh * 1.35f &&
            g.remainingDistanceMeters <= arriveTh * 1.4f

        val nearPathEnd = progressedEnough &&
            g.remainingDistanceMeters <= arriveTh &&
            distToPathEndM <= arriveTh

        val uiFloor = (_uiState.value as? MapUiState.Success)?.floorNumber
        val crossFloorPending = state.suggestedTargetFloor != null ||
            state.pendingDestFloor != null ||
            pendingCrossFloor != null
        val destFloor = state.pendingDestFloor
            ?: state.suggestedTargetFloor
            ?: pendingCrossFloor?.floor
        val stillNeedFloorChange = crossFloorPending &&
            destFloor != null &&
            uiFloor != null &&
            destFloor != uiFloor

        // Hết đoạn path tới cầu thang → gợi ý đổi tầng (chưa phải đích)
        if (state.isNavigatingMode && nearPathEnd && stillNeedFloorChange) {
            val floorLabel = if (destFloor == 0) "GF" else destFloor.toString()
            Log.i(
                "MapViewModel",
                "W3 at connector (not arrived): pathEnd=${distToPathEndM}m pin=${distToRedPinM}m → F$destFloor",
            )
            return state.copy(
                currentInstructionText = "Đã tới cầu thang — chuyển xuống tầng $floorLabel",
                distanceToNextManeuverMeters = 0f,
                remainingDistanceMeters = g.remainingDistanceMeters.coerceAtLeast(0f),
                routeProgress = 1f,
                etaSeconds = estimateEtaSeconds(17f, state.confidence),
                hasArrived = false,
                readyForFloorSwitch = true,
                suggestedTargetFloor = destFloor,
                pathHasFloorConnector = true,
                floorTransitionHint = "Chạm 「Chuyển tầng $floorLabel」 để tiếp tục tới lối thoát",
                navHint = "Xuống tầng $floorLabel rồi đi tiếp tới lối thoát hiểm",
                nextManeuverPos = null,
                nextManeuverType = null,
            )
        }

        // Hết path nhưng chưa sát pin đỏ → giữ chỉ đường, tính lại tới đích (tránh spam)
        if (state.isNavigatingMode && nearPathEnd && !nearRedPin && !stillNeedFloorChange) {
            val destId = state.destinationNodeId ?: state.pendingDestNodeId
            val now = System.currentTimeMillis()
            if (destId != null && now - lastRepathToPinAtMs > 2500L) {
                lastRepathToPinAtMs = now
                Log.i(
                    "MapViewModel",
                    "Path end but not at red pin (pin=${distToRedPinM}m) → repath $destId",
                )
                updatePath(destId, force = true)
            }
            return state.copy(
                currentInstructionText = "Tiếp tục tới điểm đến (pin đỏ)",
                hasArrived = false,
                isNavigatingMode = true,
                remainingDistanceMeters = distToRedPinM.coerceAtLeast(0.1f),
                navHint = "Chưa tới pin đỏ — đang tính lại đường",
                nextManeuverPos = maneuverPos,
                nextManeuverType = maneuverTypeName,
            )
        }

        // Chỉ “Đã đến nơi” khi đứng gần pin đỏ đích
        // Khẩn cấp: không auto-arrive khi còn đổi tầng / vừa neo / path quá ngắn / vừa đổi tầng
        val nowMs = System.currentTimeMillis()
        val emergencyBlockArrive = _emergencySession.value.active && (
            state.suggestedTargetFloor != null ||
                state.readyForFloorSwitch ||
                state.pendingDestFloor != null ||
                pendingCrossFloor != null ||
                traveled < 1.5f ||
                state.totalDistanceMeters < 2.0f ||
                nowMs < emergencyArriveBlockedUntilMs
            )
        if (state.isNavigatingMode && nearRedPin && !stillNeedFloorChange && !emergencyBlockArrive) {
            Log.i(
                "MapViewModel",
                "W2 arrived at red pin: dist=${"%.2f".format(distToRedPinM)}m " +
                    "remain=${"%.2f".format(g.remainingDistanceMeters)}m th=${"%.2f".format(arriveTh)}m",
            )
            activePath = emptyList()
            activePathEdges = emptyList()
            activeManeuvers = emptyList()
            activeFloorConnectors = emptyList()
            pendingCrossFloor = null
            earlyTurnAlignSinceMs = 0L
            earlyTurnAlignManeuverAt = Float.NaN
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
                readyForFloorSwitch = false,
                suggestedTargetFloor = null,
                pendingDestFloor = null,
                pendingDestNodeId = null,
                nextManeuverPos = null,
                nextManeuverType = null,
            )
        }
        val targetFloor = state.suggestedTargetFloor ?: state.pendingDestFloor
        val floorHint = FloorTransitionDetector.approachInstruction(
            activeFloorConnectors,
            traveledMeters = traveled,
            targetFloor = targetFloor,
        )
        val nextConnector = activeFloorConnectors
            .firstOrNull { it.atDistanceMeters > traveled - 0.5f }
        val distToConnector = nextConnector?.let { it.atDistanceMeters - traveled }
        val readySwitch = targetFloor != null &&
            distToConnector != null &&
            distToConnector <= 2f
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
            pathHasFloorConnector = activeFloorConnectors.isNotEmpty() || stillNeedFloorChange,
            readyForFloorSwitch = readySwitch || (stillNeedFloorChange && nearPathEnd),
            nextManeuverPos = maneuverPos,
            nextManeuverType = maneuverTypeName,
        )
    }

    /** UI gọi sau khi đã hiện snackbar “Đã đến nơi”. */
    fun clearArrivalFlag() {
        if (_navState.value.hasArrived) {
            _navState.value = _navState.value.copy(hasArrived = false)
        }
    }

    /** #15 History — ghi “Đã điều hướng” khi tới đích. */
    fun recordNavigationCompleted() {
        val s = _uiState.value as? MapUiState.Success ?: return
        val destLabel = _navState.value.destinationNodeId
            ?: _navState.value.pendingDestNodeId
            ?: "Đích indoor"
        recordHistory(
            type = "NAVIGATE_INDOOR",
            buildingId = s.buildingId,
            label = destLabel,
        )
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
            com.khoaluan.indoornav.ui.error.ErrorCenter.routeFail("Đã thử tìm đường quá nhiều lần. Vui lòng quét lại mã QR.")
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
    /** Hủy điều hướng cứng (xóa path + localization). */
    fun stopNavigation() {
        locationEngine?.stop()
        localizationMapKey = null
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        lastRerouteAtMs = 0L
        pendingCrossFloor = null
        locationEngine?.setRouteSnapEdges(emptyList())
        _navState.value = NavigationState()
    }

    /** #12 — chỉ xóa route; giữ vị trí QR + pin đích. */
    fun clearRouteOnly() {
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        lastRerouteAtMs = 0L
        pendingCrossFloor = null
        syncRouteSnapToEngine()
        _navState.update {
            it.copy(
                path = null,
                isNavigatingMode = false,
                isRerouting = false,
                totalDistanceMeters = 0f,
                etaSeconds = 0,
                remainingDistanceMeters = 0f,
                routeProgress = 0f,
                currentInstructionText = null,
                distanceToNextManeuverMeters = 0f,
                navigationError = null,
                pathHasFloorConnector = false,
                floorTransitionHint = null,
                readyForFloorSwitch = false,
                suggestedTargetFloor = null,
                pendingDestFloor = null,
                pendingDestNodeId = null,
                hasArrived = false,
            )
        }
    }

    /** Đóng chế độ xem đường / hủy đích — giữ vị trí user. */
    fun clearDestination() {
        clearRouteOnly()
        _navState.update {
            it.copy(
                destinationPoiId = null,
                destinationLabel = null,
                destinationNodeId = null,
                destinationMarkerPos = null,
                navHint = null,
            )
        }
    }

    /** #12 — tính lại đường tới đích đang chọn. */
    fun recalculateRoute() {
        if (_emergencySession.value.active &&
            _emergencySession.value.phase == EmergencyPhase.EVACUATING
        ) {
            if (_navState.value.userPos == null) {
                seedAtStairsThenContinueEmergency()
                return
            }
            startEmergencyEvacuation(forceRecalculate = true)
            return
        }
        val dest = _navState.value.destinationNodeId ?: run {
            _navState.update { it.copy(navigationError = "Chưa có điểm đến để tính lại") }
            return
        }
        updatePath(dest, force = true)
    }

    /**
     * #11 — Sửa vị trí: dừng TPF, giữ đích. Chạm map để chọn lại hoặc quét QR.
     */
    fun requestRelocalization() {
        locationEngine?.stop()
        localizationMapKey = null
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        lastRerouteAtMs = 0L
        _navState.update {
            it.copy(
                userPos = null,
                userHeading = 0f,
                path = null,
                confidence = 0f,
                isTpfActive = false,
                particles = emptyList(),
                isNavigatingMode = false,
                isRerouting = false,
                currentInstructionText = null,
                remainingDistanceMeters = 0f,
                routeProgress = 0f,
                etaSeconds = 0,
                totalDistanceMeters = 0f,
                floorTransitionHint = null,
                readyForFloorSwitch = false,
                navHint = "Chạm bản đồ để chọn điểm, hoặc quét QR",
            )
        }
    }

    /**
     * Chọn điểm trên map làm đích (chưa tính path) — dùng khi chạm map → "Đi đến đây".
     */
    fun setDestinationAtMapPoint(x: Float, y: Float) {
        val state = _uiState.value as? MapUiState.Success ?: return
        if (!x.isFinite() || !y.isFinite()) return
        val markerPos = Offset(x, y)
        val nearest = findNearestNodeId(x, y, state.mapData)
        val gModel = graphModel
        val targetNodeId = nearest
            ?: gModel?.nodeMap?.values?.minByOrNull {
                val dx = it.x - x
                val dy = it.y - y
                dx * dx + dy * dy
            }?.nodeId
        if (targetNodeId == null) {
            _navState.update { it.copy(navigationError = "Không tìm được điểm gần trên bản đồ") }
            return
        }
        activePath = emptyList()
        activePathEdges = emptyList()
        activeManeuvers = emptyList()
        activeFloorConnectors = emptyList()
        pendingCrossFloor = null
        _navState.update {
            it.copy(
                destinationPoiId = null,
                destinationLabel = "Điểm đã chọn",
                destinationNodeId = targetNodeId,
                destinationMarkerPos = markerPos,
                path = null,
                totalDistanceMeters = 0f,
                etaSeconds = 0,
                isNavigatingMode = false,
                navigationError = null,
                rerouteCount = 0,
                currentInstructionText = null,
                remainingDistanceMeters = 0f,
                routeProgress = 0f,
                pathHasFloorConnector = false,
                floorTransitionHint = null,
                suggestedTargetFloor = null,
                pendingDestFloor = state.floorNumber,
                pendingDestNodeId = targetNodeId,
                navHint = "Đã chọn điểm đến — bấm Xem đường nếu muốn chỉ đường",
            )
        }
    }

    fun localizeAtMapPoint(
        x: Float,
        y: Float,
        resumeEmergency: Boolean = true,
        hint: String? = null,
        preferExactPosition: Boolean = false,
    ) {
        val state = _uiState.value as? MapUiState.Success ?: return
        val engine = locationEngine
        if (engine == null) {
            _navState.update { it.copy(navigationError = "Hệ thống định vị chưa sẵn sàng") }
            return
        }
        if (!x.isFinite() || !y.isFinite()) return

        confidenceEngine.updateGroundTruth()
        val mapKey = buildMapSessionKey(state.buildingId, state.floorNumber)
        localizationMapKey = mapKey

        val nearest = findNearestNodeId(x, y, state.mapData)
        var anchoredX = x
        var anchoredY = y
        var usedNode = false
        if (preferExactPosition) {
            // Neo đúng điểm (POI cầu thang) — không snap 80px sang phòng khác
            engine.startWithPosition(x, y)
            anchoredX = x
            anchoredY = y
        } else if (nearest != null) {
            val ok = engine.startWithQR(nearest)
            if (ok) {
                usedNode = true
                val node = graphModel?.nodeMap?.get(nearest)
                if (node != null) {
                    val dx = node.x.toFloat() - x
                    val dy = node.y.toFloat() - y
                    val dist2 = dx * dx + dy * dy
                    if (dist2 < 80f * 80f) {
                        anchoredX = node.x.toFloat()
                        anchoredY = node.y.toFloat()
                    } else {
                        engine.startWithPosition(x, y)
                        usedNode = false
                        anchoredX = x
                        anchoredY = y
                    }
                }
            } else {
                engine.startWithPosition(x, y)
            }
        } else {
            engine.startWithPosition(x, y)
        }

        applyOutdoorGpsHeadingHandoff(engine)
        val anchor = Offset(anchoredX, anchoredY)
        _navState.update {
            it.copy(
                userPos = anchor,
                startAnchorPos = anchor,
                confidence = maxOf(it.confidence, if (usedNode) 0.45f else 0.35f),
                navigationError = null,
                navHint = hint ?: "Đã đặt vị trí đứng",
            )
        }

        if (resumeEmergency && _emergencySession.value.active) {
            com.khoaluan.indoornav.fcm.EmergencyHeartbeat.updateIndoorContext(
                buildingId = state.buildingId,
                floor = state.floorNumber,
                qrAnchor = null,
            )
            _emergencySession.update { it.copy(floorConfirmed = true) }
            tryResumeEmergencyEvacuationAfterLocalize()
        } else if (_emergencySession.value.active) {
            com.khoaluan.indoornav.fcm.EmergencyHeartbeat.updateIndoorContext(
                buildingId = state.buildingId,
                floor = state.floorNumber,
                qrAnchor = null,
            )
            _emergencySession.update { it.copy(needsQr = false, error = null, floorConfirmed = true) }
        }

        indoorPresenceClaimed = true
        com.khoaluan.indoornav.fcm.PresenceSync.update(
            context = getApplication(),
            buildingId = state.buildingId,
            floor = state.floorNumber,
            indoorSessionOpen = true,
            touchIndoor = true,
            includeRadio = true,
        )
        Log.i(
            "MapViewModel",
            "Manual localize at ($anchoredX,$anchoredY) node=$nearest usedNode=$usedNode",
        )
    }

    /** #10 — chuyển sang tầng gợi ý (giữ pending cross-floor). */
    fun switchToSuggestedFloor() {
        val s = _uiState.value as? MapUiState.Success ?: return
        val target = _navState.value.suggestedTargetFloor
            ?: _navState.value.pendingDestFloor
            ?: _emergencySession.value.suggestedExitFloor
            ?: return
        if (_emergencySession.value.active) {
            // Khẩn cấp: neo cầu thang + chỉ đường EXIT
            if (target == s.floorNumber) {
                clearExitFloorHintIfArrived(s.floorNumber)
                seedAtStairsThenContinueEmergency()
                return
            }
            _emergencySession.update {
                it.copy(
                    suggestedExitFloor = target,
                    floorConfirmed = true,
                    phase = EmergencyPhase.EVACUATING,
                )
            }
            switchEmergencyToExitFloor()
            return
        }
        indoorSessionStore.saveLastFloor(s.buildingId, target)
        refreshMap(s.buildingId, target)
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
            com.khoaluan.indoornav.ui.error.ErrorCenter.routeFail("Không thể định tuyến đến vị trí xe đã lưu.")
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

