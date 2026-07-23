package com.khoaluan.indoornav.data.api

import android.content.Context
import com.khoaluan.indoornav.BuildConfig
import com.khoaluan.indoornav.data.local.SessionManager
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * RetrofitClient — GĐ8: gắn Bearer JWT từ SessionManager khi có token.
 */
object RetrofitClient {

    private var retrofit: Retrofit? = null
    @Volatile private var appContext: Context? = null

    /** Gọi sớm từ MainActivity để Auth interceptor đọc token. */
    fun init(context: Context) {
        appContext = context.applicationContext
        retrofit = null
    }

    private fun authInterceptor(): Interceptor = Interceptor { chain ->
        val original = chain.request()
        val token = appContext?.let { SessionManager(it).accessToken }
        val req = if (!token.isNullOrBlank()) {
            original.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            original
        }
        chain.proceed(req)
    }

    private fun getOkHttpClient(): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(authInterceptor())

        if (BuildConfig.DEBUG) {
            val logging = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }
            builder.addInterceptor(logging)
        }

        return builder.build()
    }

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
