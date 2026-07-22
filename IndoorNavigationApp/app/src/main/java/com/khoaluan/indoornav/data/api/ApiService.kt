package com.khoaluan.indoornav.data.api

// ApiService.kt
// MUC DICH: Dinh nghia tat ca REST API endpoints Retrofit goi den Backend Node.js
// Ket noi den: RetrofitClient.kt (BASE_URL lay tu BuildConfig theo flavor local/prod)
// Backend routes: Backend_server/routes/

import com.khoaluan.indoornav.BuildConfig
import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.MapResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path

interface ApiService {

    // GET /api/buildings/public - Lay danh sach tat ca toa nha (public, khong can auth)
// Tra ve: List<Building> -> dung trong MapViewModel.fetchBuildings() de hien thi danh sach toa nha
    @GET("buildings/public")
    suspend fun getBuildings(): Response<List<Building>>

    // GET /api/maps/{buildingId}/{floor}/public - Lay ban do 1 tang cu the
// Tra ve: MapResponse {mapData, buildingId, floorNumber} -> dung trong MapViewModel.fetchMap()
    @GET("maps/{buildingId}/{floor}/public")
    suspend fun getMapByFloor(
        @Path("buildingId") buildingId: String,
        @Path("floor") floor: Int
    ): Response<MapResponse>

    // GET /api/maps/{buildingId}/download — toàn bộ tầng (W3 multi-floor)
    @GET("maps/{buildingId}/download")
    suspend fun getFullBuildingMap(
        @Path("buildingId") buildingId: String
    ): Response<BuildingFloorsResponse>

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
