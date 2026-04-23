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
    @SerializedName("qr_anchors") val qrAnchors: List<QRAnchor> = emptyList()
)

data class Room(
    val id: Int,
    val name: String,
    val x: Int,
    val y: Int,
    val width: Int,
    val height: Int,
    val color: String? = null,
    val type: String? = "Store"
)

data class PathNode(
    val id: Int,
    @SerializedName("node_id") val nodeId: String,
    val x: Int,
    val y: Int,
    val neighbors: List<Int> = emptyList(),
    @SerializedName("is_elevator") val isElevator: Boolean = false,
    @SerializedName("is_stairs") val isStairs: Boolean = false
)

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
