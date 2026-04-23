package com.khoaluan.indoornav.data.api

import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.data.model.MapResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path

/**
 * INTERFACE: ApiService
 * MỤC ĐÍCH: Định nghĩa các đường dẫn kết nối tới Backend Node.js
 */
interface ApiService {

    // 1. App gọi hàm này để lấy danh sách tòa nhà có bản đồ
    @GET("buildings/public")
    suspend fun getBuildings(): Response<List<Building>>

    // 2. Tải bản đồ của một tầng cụ thể (Dùng route /public để tránh lỗi 401)
    @GET("maps/{buildingId}/{floor}/public")
    suspend fun getMapByFloor(
        @Path("buildingId") buildingId: String,
        @Path("floor") floor: Int
    ): Response<MapResponse>

    // 2. Tải toàn bộ bản đồ của một tòa nhà
    @GET("maps/download/{buildingId}")
    suspend fun getFullBuildingMap(
        @Path("buildingId") buildingId: String
    ): Response<Any>

    companion object {
        // Địa chỉ localhost cho Android Emulator (Phải có /api/)
        const val BASE_URL = "http://10.0.2.2:5000/api/"
    }
}
