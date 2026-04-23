package com.khoaluan.indoornav.ui.viewmodel

import android.app.Application
import android.util.Log
import androidx.compose.ui.geometry.Offset
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.navigation.graph.AStarPathfinder
import com.khoaluan.indoornav.navigation.graph.GraphModel
import com.khoaluan.indoornav.navigation.tpf.LocationEngine
import com.khoaluan.indoornav.navigation.tpf.TopologicalParticle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Các trạng thái có thể xảy ra khi tải bản đồ (Loading, Lên hình, Lỗi)
 */
sealed interface MapUiState {
    object Loading : MapUiState
    data class Success(val mapData: MapData, val buildingId: String) : MapUiState
    data class Error(val message: String) : MapUiState
}

/**
 * Trạng thái điều hướng thực tế (Blue Dot, Path, TPF)
 */
data class NavigationState(
    val userPos: Offset? = null,
    val userHeading: Float = 0f,
    val path: List<Offset>? = null,
    val confidence: Float = 0f,
    val isTpfActive: Boolean = false,
    val particles: List<TopologicalParticle> = emptyList(),
    val destinationNodeId: String? = null
)

sealed interface BuildingListUiState {
    object Loading : BuildingListUiState
    data class Success(val buildings: List<com.khoaluan.indoornav.data.model.Building>) : BuildingListUiState
    data class Error(val message: String) : BuildingListUiState
}

class MapViewModel(application: Application) : AndroidViewModel(application) {

    private val context = application.applicationContext
    
    // Core Engines
    private var locationEngine: LocationEngine? = null
    private var graphModel: GraphModel? = null
    private var pathfinder: AStarPathfinder? = null

    // Trạng thái bản đồ
    private val _uiState = MutableStateFlow<MapUiState>(MapUiState.Loading)
    val uiState: StateFlow<MapUiState> = _uiState.asStateFlow()

    // Trạng thái danh sách tòa nhà (Dashboard)
    private val _buildingListState = MutableStateFlow<BuildingListUiState>(BuildingListUiState.Loading)
    val buildingListState: StateFlow<BuildingListUiState> = _buildingListState.asStateFlow()

    // TRẠNG THÁI ĐIỀU HƯỚNG
    private val _navState = MutableStateFlow(NavigationState())
    val navState: StateFlow<NavigationState> = _navState.asStateFlow()

    init {
        // Tự động kéo danh sách tòa nhà khi mở App
        fetchBuildings()
    }

    /**
     * Hàm cho phép nạp lại dữ liệu bản đồ thủ công
     */
    fun refreshMap(buildingId: String, level: Int = 1) {
        fetchMap(buildingId, level)
    }

    /**
     * Kéo danh sách tòa nhà công khai từ Server
     */
    fun fetchBuildings() {
        viewModelScope.launch {
            _buildingListState.value = BuildingListUiState.Loading
            try {
                val api = RetrofitClient.getApiService()
                val response = api.getBuildings()
                if (response.isSuccessful) {
                    _buildingListState.value = BuildingListUiState.Success(response.body() ?: emptyList())
                } else {
                    _buildingListState.value = BuildingListUiState.Error("Lỗi: ${response.code()}")
                }
            } catch (e: Exception) {
                _buildingListState.value = BuildingListUiState.Error("Lỗi mạng: ${e.message}")
            }
        }
    }

    private fun fetchMap(buildingId: String, floor: Int) {
        // Chạy ngầm (bất đồng bộ) để không làm treo giao diện
        viewModelScope.launch {
            _uiState.value = MapUiState.Loading
            try {
                val api = RetrofitClient.getApiService()
                val response = api.getMapByFloor(buildingId, floor)
                
                if (response.isSuccessful) {
                    val body = response.body()
                    if (body != null) {
                        _uiState.value = MapUiState.Success(body.mapData, buildingId)
                        
                        // Khởi động Engine Đồ thị và Location khi tải xong Map
                        val gModel = GraphModel(body.mapData)
                        graphModel = gModel
                        pathfinder = AStarPathfinder(gModel)
                        locationEngine = LocationEngine(context, body.mapData).apply {
                            onLocationUpdated = { x, y, heading, confidence, isTpf ->
                                _navState.value = _navState.value.copy(
                                    userPos = Offset(x, y),
                                    userHeading = heading,
                                    confidence = confidence,
                                    isTpfActive = isTpf,
                                    particles = getParticles()
                                )
                                _navState.value.destinationNodeId?.let { destination ->
                                    updatePath(destination)
                                }
                            }
                        }
                        
                        Log.d("MapViewModel", "Tải bản đồ & Khởi tạo Engine thành công!")
                    } else {
                        _uiState.value = MapUiState.Error("Dữ liệu trống!")
                    }
                } else {
                    _uiState.value = MapUiState.Error("Lỗi kết nối: ${response.code()}")
                }
            } catch (e: Exception) {
                Log.e("MapViewModel", "Lỗi Exception", e)
                _uiState.value = MapUiState.Error("Lỗi mạng: ${e.message}")
            }
        }
    }

    // ── ĐIỀU HƯỚNG ─────────────────────────────────────────────────────────────

    /** Bắt đầu định vị khi người dùng quét mã QR thành công */
    fun startNavigation(qrId: String) {
        val state = _uiState.value as? MapUiState.Success ?: return
        val qrAnchor = state.mapData.qrAnchors.find { it.qrId == qrId }
        
        val nodeId = qrAnchor?.nodeId ?: return
        
        locationEngine?.startWithQR(nodeId)
    }

    /** Tìm đường đến phòng dựa trên A* */
    fun setDestination(roomId: Int) {
        val state = _uiState.value as? MapUiState.Success ?: return
        val room = state.mapData.rooms.find { it.id == roomId } ?: return
        
        // Tìm node gần phòng nhất (trong dữ liệu map ta quy ước search node id liên kết)
        // Hiện tại ta lấy Node ID gần tọa độ phòng nhất hoặc node được chỉ định cho phòng
        // Tạm thời: Ta giả định có 1 node ID mang tên "Room_X" hoặc liên kết
        // GIẢ ĐỊNH: mapData.nodes chứa node_id khớp với đích đến mong muốn
        // Thực tế: Tìm node_id gần (room.x, room.y) nhất
        val gModel = graphModel ?: return
        val pFinder = pathfinder ?: return
        
        val targetNode = gModel.nodeMap.values.minByOrNull { 
            val dx = it.x - room.x
            val dy = it.y - room.y
            dx*dx + dy*dy
        } ?: return

        updatePath(targetNode.nodeId)
    }

    private fun updatePath(targetNodeId: String) {
        val pFinder = pathfinder ?: return
        val gModel = graphModel ?: return

        val currentUserNodeId = findNearestNodeIdFromCurrentPosition(gModel)
            ?: locationEngine
                ?.getParticles()
                ?.firstOrNull()
                ?.edgeId
                ?.split("→")
                ?.firstOrNull()
            ?: return

        val result = pFinder.findPath(currentUserNodeId, targetNodeId)
        if (result != null && result.edges.isNotEmpty()) {
            val pathOffsets = result.edges.map { edge ->
                Offset(edge.sourceX, edge.sourceY)
            } + Offset(result.edges.last().targetX, result.edges.last().targetY)
            
            _navState.value = _navState.value.copy(
                path = pathOffsets,
                destinationNodeId = targetNodeId
            )
        }
    }

    private fun findNearestNodeIdFromCurrentPosition(gModel: GraphModel): String? {
        val userPos = _navState.value.userPos ?: return null
        return gModel.nodeMap.values.minByOrNull { node ->
            val dx = node.x.toFloat() - userPos.x
            val dy = node.y.toFloat() - userPos.y
            dx * dx + dy * dy
        }?.nodeId
    }

    fun stopNavigation() {
        locationEngine?.stop()
        _navState.value = NavigationState()
    }

    override fun onCleared() {
        super.onCleared()
        locationEngine?.stop()
    }
}
