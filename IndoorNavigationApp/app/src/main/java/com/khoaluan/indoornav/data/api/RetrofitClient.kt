package com.khoaluan.indoornav.data.api

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

/**
 * OBJECT: RetrofitClient
 * MỤC ĐÍCH: Khởi tạo và cung cấp một thực thể duy nhất của ApiService (Singleton Pattern)
 */
object RetrofitClient {

    private var retrofit: Retrofit? = null

    /**
     * Hàm lấy instance của ApiService
     */
    fun getApiService(): ApiService {
        if (retrofit == null) {
            retrofit = Retrofit.Builder()
                .baseUrl(ApiService.BASE_URL)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
        }
        return retrofit!!.create(ApiService::class.java)
    }
}
