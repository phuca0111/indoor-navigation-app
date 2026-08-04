package com.khoaluan.indoornav.data.api

import com.google.gson.annotations.SerializedName

/** GET /api/overpass/nearby — POI OSM quanh tọa độ (proxy Backend). */
data class OverpassNearbyResponse(
    val provider: String? = null,
    val cached: Boolean = false,
    val lat: Double? = null,
    val lng: Double? = null,
    @SerializedName("radius_m") val radiusM: Int? = null,
    val total: Int = 0,
    val results: List<OverpassHitDto> = emptyList(),
)

data class OverpassHitDto(
    val id: String,
    val source: String? = null,
    val name: String,
    @SerializedName("display_name") val displayName: String? = null,
    val lat: Double,
    val lng: Double,
    val amenity: String? = null,
    @SerializedName("osm_type") val osmType: String? = null,
    @SerializedName("osm_id") val osmId: Long? = null,
    @SerializedName("distance_m") val distanceM: Int? = null,
)
