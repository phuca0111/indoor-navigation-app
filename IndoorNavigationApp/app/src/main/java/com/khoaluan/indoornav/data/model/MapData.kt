package com.khoaluan.indoornav.data.model

import com.google.gson.annotations.SerializedName

/**
 * FILE: MapData.kt
 * MỤC ĐÍCH: Chứa toàn bộ thông tin bản đồ của một tầng (Phòng, Node, Edge, QR)
 * ĐƯỢC THIẾT KẾ ĐỂ KHỚP VỚI BACKEND NODE.JS
 */

data class MapResponse(
    @SerializedName("map_data") val mapData: MapData,
    @SerializedName("building_id") val buildingId: String,
    @SerializedName("floor_number") val floorNumber: Int,
    val version: Int
)

data class MapData(
    @SerializedName("scale_ratio") val scaleRatio: Double = 0.5,
    @SerializedName("background_image") val backgroundImage: String? = null,
    val rooms: List<Room> = emptyList(),
    val nodes: List<PathNode> = emptyList(),
    val edges: List<PathEdge> = emptyList(),
    val walls: List<Wall> = emptyList(),
    // WHY: Backend lưu doors & pois nhưng trước đây Android model thiếu field
    // → Gson bỏ qua silent → 2 layer này không bao giờ render được.
    val doors: List<Door> = emptyList(),
    val pois: List<Poi> = emptyList(),
    @SerializedName("qr_anchors") val qrAnchors: List<QRAnchor> = emptyList(),
    // Background transformation
    @SerializedName("bgX") val bgX: Float = 0f,
    @SerializedName("bgY") val bgY: Float = 0f,
    @SerializedName("bgScale") val bgScale: Float = 1f,
    @SerializedName("bgRotation") val bgRotation: Float = 0f
)

data class Room(
    val id: Int,
    val name: String,
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    val color: String? = null,
    val type: String? = "Store",
    val shape: String? = "rect",
    val points: List<WallPoint>? = emptyList(),
    val cx: Float? = null,
    val cy: Float? = null,
    val radius: Float? = null,
    @SerializedName("labelRotation") val labelRotation: Float = 0f,
    @SerializedName("labelFontSize") val labelFontSize: Float = 14f,
    @SerializedName("labelAutoScale") val labelAutoScale: Boolean = true
)

data class PathNode(
    val id: Int,
    // WHY: Backend hiện chỉ trả field "id" (Int), không trả "node_id" (String) như trước.
    // Edge ở backend dùng source/target kiểu String ("1", "2") → cần ép String từ id
    // để match. Giữ nodeIdRaw để backward-compat nếu sau này backend lại trả node_id.
    @SerializedName("node_id") val nodeIdRaw: String? = null,
    val x: Int,
    val y: Int,
    val neighbors: List<Int> = emptyList(),
    @SerializedName("is_elevator") val isElevator: Boolean = false,
    @SerializedName("is_stairs") val isStairs: Boolean = false
) {
    val nodeId: String get() = nodeIdRaw ?: id.toString()
}

data class PathEdge(
    val source: String,
    val target: String,
    val distance: Double
)

data class Wall(
    val id: Int? = null,
    val type: String? = null,
    val thickness: Float? = 4f,
    @SerializedName("is_outer") val isOuter: Boolean = false,
    val points: List<WallPoint> = emptyList(),
    // Fallback cho các định dạng tường cũ nếu có
    val x1: Float? = null,
    val y1: Float? = null,
    val x2: Float? = null,
    val y2: Float? = null
)

data class WallPoint(
    val x: Float,
    val y: Float
)

data class QRAnchor(
    @SerializedName("qr_id") val qrId: String,
    val x: Int,
    val y: Int,
    @SerializedName("room_name") val roomName: String? = null,
    @SerializedName("node_id") val nodeId: String? = null  // Phương án B: Node TPF khởi tạo hạt
)

data class Door(
    val id: Int,
    val name: String? = null,
    val x: Int,
    val y: Int,
    val width: Int = 40,
    val rotation: Float = 0f,
    val type: String? = null
)

data class Poi(
    val id: Int,
    val name: String? = null,
    val x: Int,
    val y: Int,
    val type: String? = null,
    @SerializedName("poi_type") val poiType: String? = null,
    val typeIndex: Int? = null
)

/**
 * WHY: Gson 2.9 vanilla KHÔNG tôn trọng default values của Kotlin data class
 * — nó tạo object qua reflection (sun.misc.Unsafe) bypass constructor. Nếu
 * JSON từ server thiếu field `walls`/`doors`/`pois`/... các List<T> sẽ bị gán
 * `null` dù đã khai báo `= emptyList()`. Khi consumer gọi `.isEmpty()` /
 * `.forEach` sẽ throw NullPointerException.
 *
 * Giải pháp: chạy sanitized() MỘT LẦN ngay sau khi Retrofit parse JSON để
 * đảm bảo mọi List đều non-null, các engine phía sau (GraphModel, MapView,
 * LocationEngine) không còn phải phòng null nữa.
 */
@Suppress("UNNECESSARY_SAFE_CALL", "SENSELESS_COMPARISON", "USELESS_ELVIS")
fun MapData.sanitized(): MapData = copy(
    scaleRatio = if (scaleRatio > 0.0) scaleRatio else 0.5,
    rooms = rooms ?: emptyList(),
    nodes = nodes ?: emptyList(),
    edges = edges ?: emptyList(),
    walls = (walls ?: emptyList()).map { w ->
        w.copy(points = w.points ?: emptyList())
    },
    doors = doors ?: emptyList(),
    pois = pois ?: emptyList(),
    qrAnchors = qrAnchors ?: emptyList(),
    bgX = bgX ?: 0f,
    bgY = bgY ?: 0f,
    bgScale = bgScale ?: 1f,
    bgRotation = bgRotation ?: 0f
)
