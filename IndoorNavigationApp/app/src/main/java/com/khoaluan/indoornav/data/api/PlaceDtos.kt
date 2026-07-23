package com.khoaluan.indoornav.data.api

import com.google.gson.annotations.SerializedName

/** GĐ8 — Place Registry DTO (GET /api/places). */
data class PlacesListResponse(
    val total: Int = 0,
    val places: List<PlaceDto> = emptyList(),
)

data class PlaceDetailResponse(
    val place: PlaceDto? = null,
    @SerializedName("indoor_workspaces") val indoorWorkspaces: List<IndoorWorkspaceDto> = emptyList(),
)

data class PlaceSearchResponse(
    val total: Int = 0,
    @SerializedName("search_mode") val searchMode: String? = null,
    val places: List<PlaceDto> = emptyList(),
)

data class PlaceDto(
    @SerializedName("_id") val id: String,
    val name: String,
    val aliases: List<String>? = null,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val address: String? = null,
    val category: String? = null,
    @SerializedName("publication_status") val publicationStatus: String? = null,
    @SerializedName("owner_type") val ownerType: String? = null,
    @SerializedName("verification_status") val verificationStatus: String? = null,
    val verified: Boolean = false,
    val status: String? = null,
    @SerializedName("distance_m") val distanceM: Int? = null,
    @SerializedName("building_count") val buildingCount: Int? = null,
    @SerializedName("has_published_indoor") val hasPublishedIndoor: Boolean = false,
)

data class IndoorWorkspaceDto(
    @SerializedName("_id") val id: String,
    val name: String? = null,
    val status: String? = null,
    @SerializedName("workspace_status") val workspaceStatus: String? = null,
    val visibility: String? = null,
    @SerializedName("total_floors") val totalFloors: Int? = null,
)

data class PlaceSearchBody(
    val q: String? = null,
    val category: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    @SerializedName("radius_m") val radiusM: Int? = null,
    val limit: Int? = 50,
)
