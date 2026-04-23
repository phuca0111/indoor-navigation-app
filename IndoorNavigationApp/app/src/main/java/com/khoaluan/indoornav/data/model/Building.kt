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
    @SerializedName("gps_location") val gpsLocation: GPSLocation? = null
)

data class GPSLocation(
    val lat: Double,
    val lng: Double
)
