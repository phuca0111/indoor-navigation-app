package com.khoaluan.indoornav.data.model

import com.google.gson.annotations.SerializedName

/**
 * FILE: Building.kt
 * MỤC ĐÍCH: Model tòa nhà khớp với Backend
 */
data class Building(
    @SerializedName("_id") val id: String,
    val name: String,
    val address: String? = null,
    val description: String? = null,
    val status: String? = "DRAFT",
    @SerializedName("workspace_status") val workspaceStatus: String? = null,
    @SerializedName("place_id") val placeId: String? = null,
    /** Place slug (gắn từ Registry khi merge outdoor). */
    @SerializedName("place_slug") val placeSlug: String? = null,
    val category: String? = null,
    /** Alias Place (tìm theo tên gọi khác). */
    val aliases: List<String>? = null,
    @SerializedName("gps_location") val gpsLocation: GPSLocation? = null,
    /** Bán kính kích hoạt outdoor (mét) — dùng cho OS geofence. */
    @SerializedName("activation_radius") val activationRadius: Int? = null,
    /** Tổng số tầng từ server: tầng hợp lệ 0 .. totalFloors-1 */
    @SerializedName("total_floors") val totalFloors: Int = 1,
    /** GĐ8 — Place chưa có indoor publish (từ registry). */
    @SerializedName("has_published_indoor") val hasPublishedIndoor: Boolean? = null,
)

data class GPSLocation(
    val lat: Double,
    val lng: Double
)
