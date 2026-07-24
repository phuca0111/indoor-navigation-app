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

    @POST("place-platform/reviews")
    suspend fun upsertPlaceReview(@Body body: PlaceReviewBody): Response<PlaceReviewResponse>

    @POST("place-platform/reports")
    suspend fun createPlaceReport(@Body body: PlaceReportBody): Response<PlaceReportResponse>

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

    companion object {
        val BASE_URL = BuildConfig.BASE_URL
    }
}

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
