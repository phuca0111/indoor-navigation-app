package com.khoaluan.indoornav.data.api

// ApiService.kt
// MUC DICH: Dinh nghia tat ca REST API endpoints Retrofit goi den Backend Node.js
// Ket noi den: RetrofitClient.kt (BASE_URL lay tu BuildConfig theo flavor local/prod)
// Backend routes: Backend_server/routes/

import com.khoaluan.indoornav.BuildConfig
import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.data.model.MapResponse
import com.khoaluan.indoornav.data.model.PlacePublicResponse
import com.khoaluan.indoornav.data.model.PlaceSearchResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path

interface ApiService {

    // GET /api/buildings/public - Lay danh sach toa nha COMMUNITY/OFFICIAL (public)
    @GET("buildings/public")
    suspend fun getBuildings(): Response<List<Building>>

    // GET /api/places/search — Place Registry public (PHASE Android)
    @GET("places/search")
    suspend fun searchPlaces(
        @retrofit2.http.Query("q") q: String? = null,
        @retrofit2.http.Query("lat") lat: Double? = null,
        @retrofit2.http.Query("lng") lng: Double? = null,
        @retrofit2.http.Query("radius_m") radiusM: Int? = null,
        @retrofit2.http.Query("limit") limit: Int? = 50
    ): Response<PlaceSearchResponse>

    // GET /api/places/public/{idOrSlug} — chi tiết + indoor_buildings
    @GET("places/public/{idOrSlug}")
    suspend fun getPlacePublic(
        @Path("idOrSlug") idOrSlug: String
    ): Response<PlacePublicResponse>

    // GET /api/community/buildings?q=&lat=&lng=&radius_m= — search cộng đồng
    @GET("community/buildings")
    suspend fun searchCommunityBuildings(
        @retrofit2.http.Query("q") q: String? = null,
        @retrofit2.http.Query("lat") lat: Double? = null,
        @retrofit2.http.Query("lng") lng: Double? = null,
        @retrofit2.http.Query("radius_m") radiusM: Int? = null,
        @retrofit2.http.Query("limit") limit: Int? = 50
    ): Response<CommunityBuildingsResponse>

    // GET /api/buildings/check-location?lat=&lng= — nearest trong bán kính
    @GET("buildings/check-location")
    suspend fun checkLocation(
        @retrofit2.http.Query("lat") lat: Double,
        @retrofit2.http.Query("lng") lng: Double
    ): Response<CheckLocationResponse>

    // GET /api/maps/{buildingId}/{floor}/public - Lay ban do 1 tang cu the
// Tra ve: MapResponse {mapData, buildingId, floorNumber} -> dung trong MapViewModel.fetchMap()
    @GET("maps/{buildingId}/{floor}/public")
    suspend fun getMapByFloor(
        @Path("buildingId") buildingId: String,
        @Path("floor") floor: Int
    ): Response<MapResponse>

    // GET /api/maps/download/{buildingId} - Lay toan bo ban do toa nha (tat ca tang)
// Tra ve: Any (raw JSON) -> chua duoc su dung rong trong app hien tai
    @GET("maps/download/{buildingId}")
    suspend fun getFullBuildingMap(
        @Path("buildingId") buildingId: String
    ): Response<Any>

    // GET /api/qr/{qrCode} - Tra cuu thong tin QR code (public endpoint)
// Backend: qrController.js lookupQr() -> QrCode.findOne({qr_code})
// Tra ve: QrLookupResponse {qr_code, building_id, floor_number, x, y, node_id, label}
// Dung trong: MapViewModel.startNavigation() de chuyen tu QR string -> toa do map
    @GET("qr/{qrCode}")
    suspend fun getQrInfo(
        @Path("qrCode") qrCode: String
    ): Response<QrLookupResponse>

    companion object {
        val BASE_URL = BuildConfig.BASE_URL
    }
}

// QR Lookup Response -- matches backend GET /api/qr/:qrCode
// Backend: qrController.js lookupQr() returns {qr_code, building_id, floor_number, x, y, node_id, label}
// Used in MapViewModel.startNavigation() to resolve QR code to map position
data class QrLookupResponse(
    val qr_code: String,
    val building_id: String,
    val floor_number: Int,
    val x: Float,
    val y: Float,
    val node_id: String?,
    val label: String?
)

/** Response GET /api/community/buildings */
data class CommunityBuildingsResponse(
    val total: Int = 0,
    val buildings: List<Building> = emptyList()
)

/** Response GET /api/buildings/check-location */
data class CheckLocationResponse(
    val found: Boolean = false,
    val message: String? = null,
    val buildings: List<Building> = emptyList()
)
