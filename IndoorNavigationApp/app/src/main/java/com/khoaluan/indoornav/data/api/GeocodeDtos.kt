package com.khoaluan.indoornav.data.api

import com.google.gson.annotations.SerializedName

/** GET /api/geocode — Nominatim proxy (không gọi thẳng OSM từ app). */
data class GeocodeResponse(
    val q: String? = null,
    val provider: String? = null,
    val cached: Boolean = false,
    val total: Int = 0,
    val results: List<GeocodeHitDto> = emptyList(),
)

data class GeocodeHitDto(
    val id: String,
    val source: String? = null,
    val name: String,
    @SerializedName("display_name") val displayName: String? = null,
    val lat: Double,
    val lng: Double,
    val type: String? = null,
    @SerializedName("osm_class") val osmClass: String? = null,
    val importance: Double? = null,
)
