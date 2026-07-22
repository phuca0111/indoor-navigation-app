package com.khoaluan.indoornav.data.api

import com.khoaluan.indoornav.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * OBJECT: RetrofitClient
 * MỤC ĐÍCH: Khởi tạo và cung cấp một thực thể duy nhất của ApiService (Singleton Pattern)
 *
 * CẤU HÌNH:
 * - BASE_URL lấy từ BuildConfig (định nghĩa trong build.gradle.kts)
 * - Thêm HttpLoggingInterceptor ở debug build
 * - Timeout: connect=10s, read=30s, write=30s
 */
object RetrofitClient {

    private var retrofit: Retrofit? = null

    private fun getOkHttpClient(): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)

        // Issue 25: Thêm logging interceptor cho debug build
        if (BuildConfig.DEBUG) {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }
            builder.addInterceptor(logging)
        }

        return builder.build()
    }

    /**
     * Hàm lấy instance của ApiService
     */
    fun getApiService(): ApiService {
        if (retrofit == null) {
            retrofit = Retrofit.Builder()
                .baseUrl(ApiService.BASE_URL)
                .client(getOkHttpClient())
                .addConverterFactory(GsonConverterFactory.create())
                .build()
        }
        return retrofit!!.create(ApiService::class.java)
    }

    fun getAuthApi(): AuthApi {
        if (retrofit == null) {
            getApiService()
        }
        return retrofit!!.create(AuthApi::class.java)
    }
}
