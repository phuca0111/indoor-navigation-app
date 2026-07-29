package com.khoaluan.indoornav.data.api

import com.google.gson.annotations.SerializedName

data class OutdoorRouteRequest(
    val fromLat: Double,
    val fromLng: Double,
    val toLat: Double,
    val toLng: Double,
    val profile: String = "foot",
)

data class OutdoorLatLng(
    val lat: Double = 0.0,
    val lng: Double = 0.0,
)

data class OutdoorRouteStep(
    val maneuver: String? = null,
    @SerializedName("distance_m") val distanceM: Float = 0f,
    @SerializedName("duration_s") val durationS: Int = 0,
    val name: String? = null,
    val instruction: String? = null,
    val location: OutdoorLatLng? = null,
)

data class OutdoorRouteResponse(
    val provider: String? = null,
    val profile: String? = null,
    @SerializedName("distance_m") val distanceM: Float = 0f,
    @SerializedName("duration_s") val durationS: Int = 0,
    val polyline: List<OutdoorLatLng> = emptyList(),
    val steps: List<OutdoorRouteStep> = emptyList(),
    val from: OutdoorLatLng? = null,
    val to: OutdoorLatLng? = null,
    val message: String? = null,
    val code: String? = null,
)
