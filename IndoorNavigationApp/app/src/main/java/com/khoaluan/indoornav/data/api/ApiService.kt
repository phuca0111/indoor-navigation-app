package com.khoaluan.indoornav.data.api

// ApiService.kt — REST endpoints → Backend Node.js

import com.khoaluan.indoornav.BuildConfig
import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.MapResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {

    @GET("buildings/public")
    suspend fun getBuildings(): Response<List<Building>>

    /** GĐ2 — tóm tắt tòa nhà (số tầng, POI, đánh giá, creator) trước Enter Indoor */
    @GET("buildings/{id}/explorer")
    suspend fun getBuildingExplorer(@Path("id") buildingId: String): Response<BuildingExplorerDto>

    /** GĐ4 — tìm POI trong nhà từ outdoor (vd: ATM → AEON · Tầng 2) */
    @GET("buildings/indoor-search")
    suspend fun searchIndoorPois(
        @Query("q") query: String,
        @Query("limit") limit: Int = 30,
        @Query("category") category: String? = null,
    ): Response<IndoorSearchResponse>

    @GET("places")
    suspend fun getPlaces(
        @Query("q") q: String? = null,
        @Query("category") category: String? = null,
        @Query("limit") limit: Int = 50,
    ): Response<PlacesListResponse>

    @GET("places/{id}")
    suspend fun getPlace(@Path("id") placeId: String): Response<PlaceDetailResponse>

    @GET("places/public/{idOrSlug}")
    suspend fun getPlacePublic(@Path("idOrSlug") idOrSlug: String): Response<PlaceDetailResponse>

    @GET("place-platform/places/{slugOrId}")
    suspend fun getPlaceBySlugOrId(@Path("slugOrId") slugOrId: String): Response<PlacePlatformPlaceResponse>

    @POST("place-platform/places/{slugOrId}/view")
    suspend fun recordPlaceView(@Path("slugOrId") slugOrId: String): Response<SimpleMessageResponse>

    @POST("places/search")
    suspend fun searchPlaces(@Body body: PlaceSearchBody): Response<PlaceSearchResponse>

    /** Geocode OSM qua Backend (Nominatim proxy + cache). */
    @GET("geocode")
    suspend fun geocode(
        @Query("q") q: String,
        @Query("limit") limit: Int = 5,
        @Query("lat") lat: Double? = null,
        @Query("lng") lng: Double? = null,
    ): Response<GeocodeResponse>

    /** POI OSM quanh tọa độ qua Backend (Overpass proxy + cache). */
    @GET("overpass/nearby")
    suspend fun overpassNearby(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
        @Query("radius") radius: Int = 250,
        @Query("limit") limit: Int = 30,
        @Query("amenities") amenities: String? = null,
    ): Response<OverpassNearbyResponse>

    /** Thời tiết hiện tại qua Backend (OpenWeatherMap). 503 nếu chưa cấu hình key. */
    @GET("weather/current")
    suspend fun weatherCurrent(
        @Query("lat") lat: Double,
        @Query("lng") lng: Double,
    ): Response<WeatherCurrentResponse>

    @POST("place-platform/reviews")
    suspend fun upsertPlaceReview(@Body body: PlaceReviewBody): Response<PlaceReviewResponse>

    @GET("place-platform/places/{placeId}/reviews")
    suspend fun listPlaceReviews(
        @Path("placeId") placeId: String,
        @Query("limit") limit: Int = 20,
    ): Response<PlaceReviewsListResponse>

    @POST("place-platform/reports")
    suspend fun createPlaceReport(@Body body: PlaceReportBody): Response<PlaceReportResponse>

    @POST("map-contributions")
    suspend fun createMapContribution(@Body body: MapContributionBody): Response<MapContributionResponse>

    @GET("indoor-places/targets/{buildingId}/{floor}/{kind}/{entityId}")
    suspend fun getIndoorTarget(
        @Path("buildingId") buildingId: String,
        @Path("floor") floor: Int,
        @Path("kind") kind: String,
        @Path("entityId") entityId: String,
        @Query("name") name: String? = null,
    ): Response<IndoorTargetSummaryDto>

    @GET("indoor-places/targets/{buildingId}/{floor}/{kind}/{entityId}/reviews")
    suspend fun listIndoorReviews(
        @Path("buildingId") buildingId: String,
        @Path("floor") floor: Int,
        @Path("kind") kind: String,
        @Path("entityId") entityId: String,
        @Query("name") name: String? = null,
        @Query("limit") limit: Int = 20,
    ): Response<IndoorReviewsListResponse>

    @POST("indoor-places/reviews")
    suspend fun upsertIndoorReview(@Body body: IndoorReviewBody): Response<IndoorReviewResponse>

    @POST("indoor-places/reports")
    suspend fun createIndoorReport(@Body body: IndoorReportBody): Response<IndoorReportResponse>

    @POST("indoor-places/favorites")
    suspend fun addIndoorFavorite(@Body body: IndoorFavoriteBody): Response<IndoorFavoriteResponse>

    @DELETE("indoor-places/favorites/{buildingId}/{floor}/{kind}/{entityId}")
    suspend fun removeIndoorFavorite(
        @Path("buildingId") buildingId: String,
        @Path("floor") floor: Int,
        @Path("kind") kind: String,
        @Path("entityId") entityId: String,
    ): Response<IndoorFavoriteResponse>

    @POST("hub/community/follow")
    suspend fun followPlace(@Body body: PlaceFollowBody): Response<SimpleMessageResponse>

    @DELETE("hub/community/follow/{placeId}")
    suspend fun unfollowPlace(@Path("placeId") placeId: String): Response<SimpleMessageResponse>

    @GET("hub/community/following")
    suspend fun listFollowing(): Response<PlaceFollowingResponse>

    @GET("place-platform/reviews/mine")
    suspend fun myReviews(@Query("limit") limit: Int = 50): Response<PlaceReviewsMineResponse>

    @GET("place-platform/reports/mine")
    suspend fun myReports(@Query("limit") limit: Int = 50): Response<PlaceReportsMineResponse>

    @GET("hub/proposals")
    suspend fun listHubProposals(): Response<PlaceProposalsListResponse>

    @POST("place-proposals")
    suspend fun createPlaceProposal(@Body body: PlaceProposalBody): Response<PlaceProposalCreateResponse>

    @GET("hub/workspaces")
    suspend fun listHubWorkspaces(): Response<HubWorkspacesResponse>

    @GET("creator/me/stats")
    suspend fun getCreatorStats(): Response<CreatorStatsResponse>

    @GET("hub/me")
    suspend fun getHubMe(): Response<HubMeResponse>

    @GET("hub/favorites")
    suspend fun listFavorites(): Response<HubFavoritesListResponse>

    @GET("hub/favorites/check")
    suspend fun checkFavorite(@Query("place_id") placeId: String): Response<HubFavoriteCheckResponse>

    @POST("hub/favorites")
    suspend fun addFavorite(@Body body: HubPlaceIdBody): Response<HubFavoriteMutationResponse>

    @DELETE("hub/favorites/{placeId}")
    suspend fun removeFavorite(@Path("placeId") placeId: String): Response<HubFavoriteMutationResponse>

    @GET("hub/history")
    suspend fun listHistory(): Response<HubHistoryListResponse>

    @POST("hub/history")
    suspend fun addHistory(@Body body: HubHistoryBody): Response<HubHistoryResponse>

    @DELETE("hub/history")
    suspend fun clearHistory(@Query("type") type: String? = null): Response<HubHistoryClearResponse>

    @GET("hub/settings")
    suspend fun getHubSettings(): Response<HubSettingsResponse>

    @PUT("hub/settings")
    suspend fun putHubSettings(@Body body: HubSettingsResponse): Response<HubSettingsResponse>

    @GET("users/me")
    suspend fun getUserMe(): Response<UserProfileResponse>

    @GET("users/me/sessions")
    suspend fun listUserSessions(): Response<List<UserSessionDto>>

    @DELETE("users/me/sessions/{sessionId}")
    suspend fun revokeUserSession(@Path("sessionId") sessionId: String): Response<SimpleOkMessage>

    @GET("notifications")
    suspend fun listNotifications(
        @Query("limit") limit: Int = 30,
        @Query("unread") unread: Boolean? = null,
    ): Response<NotificationListResponse>

    @GET("notifications/unread-count")
    suspend fun notificationUnreadCount(): Response<NotificationUnreadResponse>

    @PATCH("notifications/{id}/read")
    suspend fun markNotificationRead(@Path("id") id: String): Response<SimpleOkMessage>

    @POST("notifications/read-all")
    suspend fun markAllNotificationsRead(): Response<NotificationUnreadResponse>

    @GET("maps/{buildingId}/{floor}/public")
    suspend fun getMapByFloor(
        @Path("buildingId") buildingId: String,
        @Path("floor") floor: Int,
    ): Response<MapResponse>

    @GET("maps/{buildingId}/download")
    suspend fun getFullBuildingMap(
        @Path("buildingId") buildingId: String,
    ): Response<BuildingFloorsResponse>

    @GET("qr/{qrCode}")
    suspend fun getQrInfo(
        @Path("qrCode") qrCode: String,
    ): Response<QrLookupResponse>

    /** P3 — sự cố đang diễn ra của tòa nhà, dùng để bật cảnh báo khẩn cấp trong app */
    @GET("emergency/buildings/{buildingId}/active")
    suspend fun getActiveEmergency(
        @Path("buildingId") buildingId: String,
    ): Response<ActiveEmergencyResponse>

    /** P3 — đăng ký thiết bị + FCM token để nhận push khẩn cấp (kể cả khi tắt màn hình) */
    @PUT("users/me/devices")
    suspend fun registerDevice(
        @Body body: DeviceRegisterBody,
    ): Response<DeviceRegisterResponse>

    /** Spec D — snapshot presence theo sự kiện */
    @PUT("users/me/presence")
    suspend fun updatePresence(
        @Body body: PresenceUpdateBody,
    ): Response<PresenceUpdateResponse>

    @GET("users/me/emergency-consent")
    suspend fun getEmergencyConsent(): Response<EmergencyConsentResponse>

    @PUT("users/me/emergency-consent")
    suspend fun putEmergencyConsent(
        @Body body: EmergencyConsentBody,
    ): Response<EmergencyConsentResponse>

    @POST("emergency/incidents/{incidentId}/location")
    suspend fun reportEmergencyLocation(
        @Path("incidentId") incidentId: String,
        @Body body: EmergencyLocationBody,
    ): Response<Unit>

    /** MVP — báo cáo rung (máy đo địa chấn cộng đồng) → server gom theo tòa */
    @POST("emergency/shake-reports")
    suspend fun submitShakeReport(
        @Body body: ShakeReportBody,
    ): Response<ShakeReportResponse>

    /** Outdoor — OSRM proxy (đi bộ tới cửa tòa) */
    @GET("navigation/outdoor-route")
    suspend fun getOutdoorRoute(
        @Query("fromLat") fromLat: Double,
        @Query("fromLng") fromLng: Double,
        @Query("toLat") toLat: Double,
        @Query("toLng") toLng: Double,
        @Query("profile") profile: String = "foot",
    ): Response<OutdoorRouteResponse>

    @POST("navigation/outdoor-route")
    suspend fun postOutdoorRoute(
        @Body body: OutdoorRouteRequest,
    ): Response<OutdoorRouteResponse>

    companion object {
        val BASE_URL = BuildConfig.BASE_URL
    }
}

data class DeviceRegisterBody(
    val device_id: String,
    val platform: String = "android",
    val device_name: String = "",
    val app_version: String = "",
    val fcm_token: String = "",
)

data class DeviceRegisterResponse(
    val device_id: String? = null,
    val has_fcm_token: Boolean = false,
)

data class PresenceWifiSample(
    val bssid: String,
    val ssid: String? = null,
    val rssi: Int? = null,
)

data class PresenceBleSample(
    val id: String,
    val rssi: Int? = null,
    val name: String? = null,
)

data class PresenceUpdateBody(
    val device_id: String,
    val building_id: String? = null,
    val floor: Int? = null,
    val qr_id: String? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    val accuracy: Double? = null,
    val building_lat: Double? = null,
    val building_lng: Double? = null,
    val indoor_session_open: Boolean? = null,
    val touch_indoor: Boolean = false,
    val clear_presence: Boolean = false,
    /** Spec D+ — Wi-Fi BSSID (không cần kết nối Wi-Fi; gửi qua 4G/5G). */
    val wifi_bssids: List<PresenceWifiSample>? = null,
    /** Spec D+ — BLE advertisement id/MAC. */
    val ble_ids: List<PresenceBleSample>? = null,
)

data class PresenceUpdateResponse(
    val device_id: String? = null,
    val last_building_id: String? = null,
    val indoor_session_open: Boolean? = null,
    val last_radio_building_id: String? = null,
    val last_radio_score: Double? = null,
    val last_radio_source: String? = null,
)

data class EmergencyConsentBody(
    val mode: String? = null,
    val granted: Boolean? = null,
)

data class EmergencyConsentResponse(
    val emergency_location_consent: EmergencyConsentDto? = null,
)

data class EmergencyConsentDto(
    val granted: Boolean = false,
    val mode: String? = null,
    val granted_at: String? = null,
    val revoked_at: String? = null,
    val version: String? = null,
)

data class EmergencyLocationBody(
    val lat: Double? = null,
    val lng: Double? = null,
    val accuracy: Double? = null,
    val heading: Double? = null,
    val battery: Double? = null,
    val building_id: String? = null,
    val floor_number: Int? = null,
    val source: String = "GPS",
    val motion: String = "unknown",
    /** Số ms đứng yên liên tục — server gắn possibly_trapped khi ≥ 15 phút. */
    val still_duration_ms: Long? = null,
)

data class ActiveEmergencyResponse(
    val active: Boolean = false,
    val incident: ActiveEmergencyIncidentDto? = null,
    val hazard_zones: List<ActiveEmergencyHazardZoneDto> = emptyList(),
)

data class ActiveEmergencyIncidentDto(
    val id: String? = null,
    val type: String? = null,
    val title: String? = null,
    val description: String? = null,
    val building_id: String? = null,
)

data class ActiveEmergencyHazardZoneDto(
    val id: String? = null,
    val hazard_type: String? = null,
    val name: String? = null,
    val floor_number: Int? = null,
    val polygon: List<HazardPointDto> = emptyList(),
)

data class HazardPointDto(
    val x: Double = 0.0,
    val y: Double = 0.0,
)

data class ShakeReportBody(
    val device_id: String,
    val magnitude: Double,
    val peak_ms2: Double? = null,
    val duration_ms: Long? = null,
    val building_id: String? = null,
    val source: String = "charging_idle",
    val client_ts: Long? = null,
    /** Tỷ lệ STA/LTA on-device (Hướng 1). */
    val sta_lta_ratio: Double? = null,
    val algorithm: String? = null,
    /** GPS lúc báo cáo — server đối chiếu tòa (app chạy nền). */
    val lat: Double? = null,
    val lng: Double? = null,
    val accuracy: Float? = null,
)

data class ShakeReportResponse(
    val accepted: Boolean = false,
    val report_id: String? = null,
    val building_id: String? = null,
    val building_match: String? = null,
    val window_device_count: Int? = null,
    val threshold: Int? = null,
    val triggered: Boolean = false,
    val reason: String? = null,
    val incident_id: String? = null,
)

data class BuildingFloorsResponse(
    val building_id: String? = null,
    val total_floors: Int = 0,
    val floors_count: Int = 0,
    val floors: List<FloorMapDocument> = emptyList(),
)

data class FloorMapDocument(
    val floor_number: Int = 0,
    val version: Int = 1,
    val map_data: MapData? = null,
)

data class QrLookupResponse(
    val qr_code: String,
    val building_id: String,
    val floor_number: Int,
    val x: Float,
    val y: Float,
    val node_id: String?,
    val label: String?,
)
