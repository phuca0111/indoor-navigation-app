package com.khoaluan.indoornav.auth

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.khoaluan.indoornav.BuildConfig
import java.util.UUID

/**
 * W8 — Lấy Google ID token qua Credential Manager (bắt buộc xác minh Google).
 * Không có [BuildConfig.GOOGLE_WEB_CLIENT_ID] → lỗi rõ, không tự vào app kiểu demo.
 */
class GoogleSignInHelper(private val activity: Activity) {

    data class GoogleIdResult(
        val idToken: String,
        val email: String? = null,
        val displayName: String? = null,
    )

    class NotConfiguredException :
        IllegalStateException(
            "Chưa cấu hình GOOGLE_WEB_CLIENT_ID. Dùng Email/mật khẩu hoặc Tiếp tục với tư cách khách.",
        )

    suspend fun requestIdToken(): Result<GoogleIdResult> {
        val clientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.trim()
        if (clientId.isEmpty()) {
            return Result.failure(NotConfiguredException())
        }

        return try {
            val googleIdOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(clientId)
                .setNonce(UUID.randomUUID().toString())
                .build()
            val request = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()
            val cm = CredentialManager.create(activity)
            val response = cm.getCredential(activity, request)
            val cred = response.credential
            if (cred is CustomCredential &&
                cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                val google = GoogleIdTokenCredential.createFrom(cred.data)
                val token = google.idToken
                if (token.isBlank()) {
                    Result.failure(IllegalStateException("Google không trả idToken"))
                } else {
                    Result.success(
                        GoogleIdResult(
                            idToken = token,
                            email = google.id,
                            displayName = google.displayName,
                        ),
                    )
                }
            } else {
                Result.failure(IllegalStateException("Credential không phải Google ID token"))
            }
        } catch (e: GetCredentialCancellationException) {
            Result.failure(IllegalStateException("Đã hủy đăng nhập Google", e))
        } catch (e: NoCredentialException) {
            Result.failure(IllegalStateException("Không có tài khoản Google trên máy", e))
        } catch (e: GetCredentialException) {
            Result.failure(e)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
