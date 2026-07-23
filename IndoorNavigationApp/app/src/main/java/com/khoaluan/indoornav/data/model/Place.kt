package com.khoaluan.indoornav.data.model

import com.google.gson.annotations.SerializedName

/**
 * Place Registry — khớp GET /api/places/search và /api/places/public/:idOrSlug
 */
data class PlaceSummary(
    @SerializedName("_id") val id: String,
    val name: String,
    val slug: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val radius: Double? = null,
    val address: String? = null,
    val category: String? = null,
    @SerializedName("building_count") val buildingCount: Int? = 0,
    @SerializedName("distance_m") val distanceM: Double? = null,
    @SerializedName("publication_status") val publicationStatus: String? = null,
    @SerializedName("verification_status") val verificationStatus: String? = null
)

data class PlaceSearchResponse(
    val total: Int = 0,
    val places: List<PlaceSummary> = emptyList()
)

data class IndoorBuildingSummary(
    @SerializedName("_id") val id: String,
    val name: String,
    val visibility: String? = null,
    @SerializedName("total_floors") val totalFloors: Int? = 1,
    @SerializedName("workspace_id") val workspaceId: String? = null,
    val status: String? = null
)

data class PlacePublicResponse(
    val place: PlaceSummary? = null,
    @SerializedName("has_indoor") val hasIndoor: Boolean = false,
    @SerializedName("indoor_published_count") val indoorPublishedCount: Int = 0,
    @SerializedName("indoor_buildings") val indoorBuildings: List<IndoorBuildingSummary> = emptyList()
)
