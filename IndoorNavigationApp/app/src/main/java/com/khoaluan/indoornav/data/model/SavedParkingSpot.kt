package com.khoaluan.indoornav.data.model

import com.google.gson.annotations.SerializedName

/**
 * FILE: SavedParkingSpot.kt
 * MỤC ĐÍCH: Model lưu trữ thông tin vị trí đỗ xe của người dùng.
 * Bao gồm tọa độ thực, thông tin đồ thị (edgeId), độ tin cậy và ghi chú.
 */
data class SavedParkingSpot(
    @SerializedName("x") val x: Float,
    @SerializedName("y") val y: Float,
    @SerializedName("edgeId") val edgeId: String,
    @SerializedName("progress") val progress: Float,
    @SerializedName("floorId") val floorId: String,
    @SerializedName("confidence") val confidence: Float,
    @SerializedName("estimatedDriftRadius") val estimatedDriftRadius: Float,
    @SerializedName("timestamp") val timestamp: Long,
    @SerializedName("optionalNote") val optionalNote: String? = null
)
