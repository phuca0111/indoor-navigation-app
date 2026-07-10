package com.tptp.bank.data.api

import com.tptp.bank.BuildConfig
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Query

data class AuthRequest(
    val email: String? = null,
    val phone: String? = null,
    val password: String,
    val full_name: String? = null
)

data class AuthResponse(
    val token: String,
    val user: BankUserDto
)

data class BankUserDto(
    val id: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val full_name: String? = null
)

data class WalletResponse(
    val balance: Double = 0.0,
    val currency: String = "VND",
    val user: BankUserDto? = null
)

data class TopupRequest(val amount: Long, val idempotency_key: String? = null)

data class TopupResponse(
    val balance: Double = 0.0,
    val currency: String = "VND",
    val duplicated: Boolean = false
)

data class PaymentResolveResponse(
    val invoice_id: String = "",
    val invoice_number: String = "",
    val amount: Double = 0.0,
    val currency: String = "VND",
    val plan: String? = null,
    val merchant: String = "",
    val status: String = "",
    val payment_token: String = ""
)

data class PaymentConfirmRequest(
    val invoice_id: String,
    val payment_token: String
)

data class PaymentConfirmResponse(
    val success: Boolean = false,
    val balance: Double = 0.0,
    val plan: String? = null,
    val message: String? = null
)

data class ErrorResponse(val message: String?, val code: String? = null)

interface BankApiService {
    @POST("auth/register")
    suspend fun register(@Body body: AuthRequest): Response<AuthResponse>

    @POST("auth/login")
    suspend fun login(@Body body: AuthRequest): Response<AuthResponse>

    @GET("wallet")
    suspend fun getWallet(@Header("Authorization") auth: String): Response<WalletResponse>

    @POST("wallet/topup")
    suspend fun topup(
        @Header("Authorization") auth: String,
        @Body body: TopupRequest
    ): Response<TopupResponse>

    @GET("pay/resolve")
    suspend fun resolvePayment(
        @Query("invoiceId") invoiceId: String,
        @Query("token") token: String
    ): Response<PaymentResolveResponse>

    @POST("pay/confirm")
    suspend fun confirmPayment(
        @Header("Authorization") auth: String,
        @Body body: PaymentConfirmRequest
    ): Response<PaymentConfirmResponse>

    companion object {
        val BASE_URL: String = BuildConfig.BASE_URL
    }
}
