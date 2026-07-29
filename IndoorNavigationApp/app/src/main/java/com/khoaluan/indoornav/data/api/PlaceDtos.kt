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
    val slug: String? = null,
    val aliases: List<String>? = null,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val radius: Double? = null,
    val address: String? = null,
    val category: String? = null,
    val description: String? = null,
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

/** Hub favorite / history DTOs */
data class HubMeResponse(
    val user: AuthUserDto? = null,
    val message: String? = null,
)

data class HubPlaceIdBody(
    @SerializedName("place_id") val placeId: String,
)

data class HubFavoriteCheckResponse(
    val favorited: Boolean = false,
)

data class HubFavoriteMutationResponse(
    val message: String? = null,
)

data class HubHistoryBody(
    val type: String,
    @SerializedName("place_id") val placeId: String? = null,
    @SerializedName("building_id") val buildingId: String? = null,
    val label: String? = null,
)

data class HubHistoryListResponse(
    val total: Int = 0,
    val history: List<HubHistoryItemDto> = emptyList(),
)

data class HubHistoryItemDto(
    @SerializedName("_id") val id: String? = null,
    val type: String? = null,
    @SerializedName("place_id") val placeId: String? = null,
    @SerializedName("building_id") val buildingId: String? = null,
    val label: String? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
)

data class HubHistoryClearResponse(
    val message: String? = null,
    val deleted: Int = 0,
)

data class HubHistoryResponse(
    val history: Any? = null,
)

data class HubFavoritesListResponse(
    val total: Int = 0,
    val favorites: List<HubFavoriteItemDto> = emptyList(),
)

data class HubFavoriteItemDto(
    @SerializedName("_id") val id: String? = null,
    @SerializedName("place_id") val placeId: String? = null,
    val place: PlaceDto? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
)

data class HubSettingsResponse(
    val preferences: HubPreferencesDto? = null,
    @SerializedName("notification_preferences") val notificationPreferences: HubNotifPrefsDto? = null,
)

data class HubPreferencesDto(
    val locale: String? = null,
    val timezone: String? = null,
    val theme: String? = null,
    val privacy: HubPrivacyDto? = null,
    val location: HubLocationPrefsDto? = null,
)

data class HubPrivacyDto(
    @SerializedName("show_email") val showEmail: Boolean? = null,
    @SerializedName("show_activity") val showActivity: Boolean? = null,
)

data class HubLocationPrefsDto(
    @SerializedName("share_precise") val sharePrecise: Boolean? = null,
    @SerializedName("default_radius_m") val defaultRadiusM: Int? = null,
)

data class HubNotifPrefsDto(
    @SerializedName("email_security") val emailSecurity: Boolean? = null,
    @SerializedName("email_product") val emailProduct: Boolean? = null,
    @SerializedName("in_app") val inApp: Boolean? = null,
)

data class UserProfileResponse(
    @SerializedName("_id") val id: String? = null,
    val email: String? = null,
    @SerializedName("full_name") val fullName: String? = null,
    val phone: String? = null,
    val role: String? = null,
    @SerializedName("display_role_label") val displayRoleLabel: String? = null,
    val avatar: UserAvatarDto? = null,
    @SerializedName("email_verified_at") val emailVerifiedAt: String? = null,
)

data class UserAvatarDto(
    val url: String? = null,
    @SerializedName("object_key") val objectKey: String? = null,
)

data class UserSessionDto(
    val id: String? = null,
    @SerializedName("device_name") val deviceName: String? = null,
    @SerializedName("user_agent") val userAgent: String? = null,
    @SerializedName("ip_address") val ipAddress: String? = null,
    @SerializedName("last_used_at") val lastUsedAt: String? = null,
    @SerializedName("created_at") val createdAt: String? = null,
    val current: Boolean = false,
)

data class NotificationListResponse(
    val items: List<NotificationDto> = emptyList(),
    @SerializedName("next_cursor") val nextCursor: String? = null,
)

data class NotificationDto(
    @SerializedName("_id") val id: String? = null,
    val type: String? = null,
    val title: String? = null,
    val body: String? = null,
    val severity: String? = null,
    val link: String? = null,
    @SerializedName("read_at") val readAt: String? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
)

data class NotificationUnreadResponse(
    @SerializedName("unread_count") val unreadCount: Int = 0,
)

data class SimpleOkMessage(
    val message: String? = null,
)

/** Place Platform / Community */
data class PlacePlatformPlaceResponse(
    val place: PlaceDto? = null,
)

data class PlaceReviewBody(
    @SerializedName("place_id") val placeId: String,
    val rating: Int,
    val comment: String? = null,
)

data class PlaceReviewDto(
    @SerializedName("_id") val id: String? = null,
    @SerializedName("place_id") val placeId: String? = null,
    val rating: Int = 0,
    val comment: String? = null,
    @SerializedName("helpful_count") val helpfulCount: Int = 0,
    @SerializedName("createdAt") val createdAt: String? = null,
    @SerializedName("updatedAt") val updatedAt: String? = null,
    val user: PlaceReviewUserDto? = null,
)

data class PlaceReviewUserDto(
    val id: String? = null,
    @SerializedName("full_name") val fullName: String? = null,
    val email: String? = null,
)

data class PlaceReviewResponse(val review: PlaceReviewDto? = null)

data class PlaceReviewsListResponse(
    val total: Int = 0,
    val reviews: List<PlaceReviewDto> = emptyList(),
)

data class PlaceReportBody(
    @SerializedName("place_id") val placeId: String,
    @SerializedName("reason_code") val reasonCode: String,
    val detail: String? = null,
)

data class PlaceReportResponse(val report: Any? = null)

/** POST /api/map-contributions — đề xuất cộng đồng (OUTDOOR/INDOOR) */
data class MapContributionBody(
    val type: String,
    @SerializedName("map_scope") val mapScope: String = "OUTDOOR",
    val title: String,
    val description: String? = null,
    @SerializedName("place_id") val placeId: String? = null,
    @SerializedName("building_id") val buildingId: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

data class MapContributionDto(
    @SerializedName("_id") val id: String? = null,
    val type: String? = null,
    @SerializedName("map_scope") val mapScope: String? = null,
    val title: String? = null,
    val status: String? = null,
)

data class MapContributionResponse(val contribution: MapContributionDto? = null)

/** GET /api/indoor-places/targets/... — phòng / POI như địa điểm */
data class IndoorTargetSummaryDto(
    @SerializedName("building_id") val buildingId: String? = null,
    @SerializedName("floor_number") val floorNumber: Int? = null,
    @SerializedName("entity_kind") val entityKind: String? = null,
    @SerializedName("entity_id") val entityId: String? = null,
    val name: String? = null,
    @SerializedName("type_label") val typeLabel: String? = null,
    val description: String? = null,
    @SerializedName("rating_avg") val ratingAvg: Double? = null,
    @SerializedName("rating_count") val ratingCount: Int = 0,
    @SerializedName("is_favorite") val isFavorite: Boolean = false,
    @SerializedName("my_review") val myReview: IndoorMyReviewDto? = null,
)

data class IndoorMyReviewDto(
    val rating: Int? = null,
    val comment: String? = null,
)

data class IndoorReviewBody(
    @SerializedName("building_id") val buildingId: String,
    @SerializedName("floor_number") val floorNumber: Int,
    @SerializedName("entity_kind") val entityKind: String,
    @SerializedName("entity_id") val entityId: String,
    val rating: Int,
    val comment: String? = null,
    @SerializedName("entity_name") val entityName: String? = null,
)

data class IndoorReportBody(
    @SerializedName("building_id") val buildingId: String,
    @SerializedName("floor_number") val floorNumber: Int,
    @SerializedName("entity_kind") val entityKind: String,
    @SerializedName("entity_id") val entityId: String,
    @SerializedName("reason_code") val reasonCode: String,
    val detail: String? = null,
    @SerializedName("entity_name") val entityName: String? = null,
)

data class IndoorFavoriteBody(
    @SerializedName("building_id") val buildingId: String,
    @SerializedName("floor_number") val floorNumber: Int,
    @SerializedName("entity_kind") val entityKind: String,
    @SerializedName("entity_id") val entityId: String,
    @SerializedName("entity_name") val entityName: String? = null,
)

data class IndoorReviewItemDto(
    @SerializedName("_id") val id: String? = null,
    val rating: Int = 0,
    val comment: String? = null,
    val user: PlaceReviewUserDto? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
    @SerializedName("updatedAt") val updatedAt: String? = null,
)

data class IndoorReviewsListResponse(
    val total: Int = 0,
    val reviews: List<IndoorReviewItemDto> = emptyList(),
)

data class IndoorReviewResponse(val review: Any? = null, val message: String? = null)
data class IndoorReportResponse(val report: Any? = null, val message: String? = null)
data class IndoorFavoriteResponse(val favorite: Any? = null, val message: String? = null, val ok: Boolean? = null)

data class PlaceFollowBody(
    @SerializedName("place_id") val placeId: String,
)

data class PlaceFollowingItem(
    @SerializedName("place_id") val placeId: String? = null,
    val place: PlaceDto? = null,
)

data class PlaceFollowingResponse(
    val total: Int = 0,
    val following: List<PlaceFollowingItem> = emptyList(),
)

data class SimpleMessageResponse(
    val message: String? = null,
    val ok: Boolean? = null,
    val views: Int? = null,
)

data class PlaceReviewsMineResponse(
    val total: Int = 0,
    val reviews: List<PlaceReviewDto> = emptyList(),
)

data class PlaceReportsMineResponse(
    val total: Int = 0,
    val reports: List<PlaceReportItemDto> = emptyList(),
)

data class PlaceReportItemDto(
    @SerializedName("_id") val id: String? = null,
    @SerializedName("place_id") val placeId: String? = null,
    @SerializedName("reason_code") val reasonCode: String? = null,
    val detail: String? = null,
    val status: String? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
)

data class PlaceProposalBody(
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val address: String? = null,
    val category: String? = null,
    val description: String? = null,
)

data class PlaceProposalDto(
    @SerializedName("_id") val id: String? = null,
    val name: String? = null,
    @SerializedName("proposed_name") val proposedName: String? = null,
    val status: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val address: String? = null,
    val category: String? = null,
    val description: String? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
) {
    fun displayName(): String = proposedName?.takeIf { it.isNotBlank() } ?: name.orEmpty()
}

data class PlaceProposalCreateResponse(
    val message: String? = null,
    val proposal: PlaceProposalDto? = null,
)

data class PlaceProposalsListResponse(
    val total: Int = 0,
    val proposals: List<PlaceProposalDto> = emptyList(),
)

data class HubWorkspaceDto(
    @SerializedName("_id") val id: String? = null,
    val name: String? = null,
    val status: String? = null,
    @SerializedName("workspace_status") val workspaceStatus: String? = null,
    @SerializedName("place_id") val placeId: String? = null,
    @SerializedName("total_floors") val totalFloors: Int? = null,
    val building: HubWorkspaceBuildingDto? = null,
    @SerializedName("updatedAt") val updatedAt: String? = null,
) {
    fun floors(): Int = totalFloors ?: building?.totalFloors ?: 0
}

data class HubWorkspaceBuildingDto(
    @SerializedName("total_floors") val totalFloors: Int? = null,
)

data class HubWorkspacesResponse(
    val total: Int = 0,
    val workspaces: List<HubWorkspaceDto> = emptyList(),
    val buildings: List<HubWorkspaceDto> = emptyList(),
)

data class CreatorStatsResponse(
    val funnel: CreatorFunnelDto? = null,
    val stats: CreatorStatsDto? = null,
    val note: String? = null,
)

data class CreatorFunnelDto(
    val workspaces: Int = 0,
    @SerializedName("indoor_buildings") val indoorBuildings: Int = 0,
    val published: Int = 0,
    @SerializedName("places_linked") val placesLinked: Int = 0,
)

data class CreatorStatsDto(
    val views: Int = 0,
    val downloads: Int? = null,
    val usage: Int = 0,
    val followers: Int = 0,
    val favorites: Int = 0,
    @SerializedName("rating_count") val ratingCount: Int = 0,
    @SerializedName("rating_avg") val ratingAvg: Double? = null,
)

/** GĐ2 Building Explorer — GET /buildings/:id/explorer */
data class BuildingExplorerDto(
    @SerializedName("building_id") val buildingId: String? = null,
    val name: String? = null,
    val address: String? = null,
    val description: String? = null,
    val category: String? = null,
    @SerializedName("place_id") val placeId: String? = null,
    @SerializedName("place_slug") val placeSlug: String? = null,
    @SerializedName("place_name") val placeName: String? = null,
    val verified: Boolean = false,
    @SerializedName("gps_location") val gpsLocation: com.khoaluan.indoornav.data.model.GPSLocation? = null,
    @SerializedName("total_floors") val totalFloors: Int = 1,
    @SerializedName("floors_with_map") val floorsWithMap: Int = 0,
    @SerializedName("rooms_count") val roomsCount: Int = 0,
    @SerializedName("pois_count") val poisCount: Int = 0,
    @SerializedName("rating_avg") val ratingAvg: Double? = null,
    @SerializedName("rating_count") val ratingCount: Int = 0,
    val creator: BuildingExplorerCreatorDto? = null,
    @SerializedName("updated_at") val updatedAt: String? = null,
    @SerializedName("has_published_indoor") val hasPublishedIndoor: Boolean = false,
)

data class BuildingExplorerCreatorDto(
    val id: String? = null,
    @SerializedName("full_name") val fullName: String? = null,
)

/** GĐ4 Indoor Search — GET /buildings/indoor-search?q= */
data class IndoorSearchResponse(
    val query: String? = null,
    val total: Int = 0,
    val results: List<IndoorSearchHitDto> = emptyList(),
)

data class IndoorSearchHitDto(
    @SerializedName("building_id") val buildingId: String,
    @SerializedName("building_name") val buildingName: String? = null,
    @SerializedName("place_id") val placeId: String? = null,
    val address: String? = null,
    @SerializedName("total_floors") val totalFloors: Int = 1,
    @SerializedName("floor_number") val floorNumber: Int = 0,
    @SerializedName("floor_name") val floorName: String? = null,
    @SerializedName("poi_id") val poiId: Int? = null,
    @SerializedName("poi_name") val poiName: String? = null,
    @SerializedName("poi_type") val poiType: String? = null,
    @SerializedName("poi_type_label") val poiTypeLabel: String? = null,
    val description: String? = null,
)

