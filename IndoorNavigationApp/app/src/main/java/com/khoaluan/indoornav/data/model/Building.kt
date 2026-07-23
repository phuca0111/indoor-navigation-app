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
    val status: String? = "DRAFT",
    @SerializedName("workspace_status") val workspaceStatus: String? = null,
    @SerializedName("place_id") val placeId: String? = null,
    @SerializedName("gps_location") val gpsLocation: GPSLocation? = null,
    /** Tổng số tầng từ server: tầng hợp lệ 0 .. totalFloors-1 */
    @SerializedName("total_floors") val totalFloors: Int = 1,
    /** GĐ8 — Place chưa có indoor publish (từ registry). */
    @SerializedName("has_published_indoor") val hasPublishedIndoor: Boolean? = null,
)

data class GPSLocation(
    val lat: Double,
    val lng: Double
)
