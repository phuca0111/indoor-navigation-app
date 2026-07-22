package com.khoaluan.indoornav.data.api

import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

data class LoginRequest(val email: String, val password: String)

data class GoogleLoginRequest(
    val idToken: String,
    val email: String? = null,
    val fullName: String? = null,
)

data class AuthUserDto(
    val id: String? = null,
    @SerializedName("_id") val idAlt: String? = null,
    val email: String? = null,
    @SerializedName("full_name") val fullName: String? = null,
    val role: String? = null,
) {
    fun resolvedId(): String? = id ?: idAlt
}

data class AuthResponse(
    val token: String? = null,
    val refreshToken: String? = null,
    val user: AuthUserDto? = null,
)

interface AuthApi {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponse>

    @POST("auth/google")
    suspend fun googleLogin(@Body body: GoogleLoginRequest): Response<AuthResponse>
}
