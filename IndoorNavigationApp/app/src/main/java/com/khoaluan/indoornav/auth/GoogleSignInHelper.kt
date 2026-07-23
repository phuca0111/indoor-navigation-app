package com.khoaluan.indoornav.auth

import android.app.Activity
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.khoaluan.indoornav.BuildConfig

/**
 * W8 — Google ID token qua Credential Manager.
 *
 * Sau khi chọn tài khoản mà báo "hủy": thường do OAuth Android (SHA-1 / package)
 * hoặc Play Services — không phải user bấm Back.
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

        val cm = CredentialManager.create(activity)
        // 1) Nút Sign in with Google (không nonce — tránh fail sau khi chọn account)
        return try {
            parseCredential(cm.getCredential(activity, buildSignInWithGoogleRequest(clientId)))
        } catch (cancel: GetCredentialCancellationException) {
            Log.w(TAG, "SignInWithGoogle cancel type=${cancel.type} msg=${cancel.errorMessage}", cancel)
            // 2) Fallback One Tap
            try {
                parseCredential(cm.getCredential(activity, buildGoogleIdRequest(clientId)))
            } catch (cancel2: GetCredentialCancellationException) {
                Log.w(TAG, "GoogleId cancel type=${cancel2.type} msg=${cancel2.errorMessage}", cancel2)
                Result.failure(
                    IllegalStateException(
                        buildCancelMessage(cancel2),
                        cancel2,
                    ),
                )
            } catch (none: NoCredentialException) {
                Result.failure(
                    IllegalStateException(
                        "Không lấy được credential Google. Kiểm tra OAuth Client Android + SHA-1 debug trên Cloud Console.",
                        none,
                    ),
                )
            } catch (e: GetCredentialException) {
                Result.failure(
                    IllegalStateException(
                        "Google Sign-In lỗi: ${e.type} — ${e.errorMessage ?: e.message}",
                        e,
                    ),
                )
            }
        } catch (e: NoCredentialException) {
            try {
                parseCredential(cm.getCredential(activity, buildGoogleIdRequest(clientId)))
            } catch (e2: Exception) {
                Result.failure(
                    IllegalStateException(
                        "Không lấy được tài khoản Google cho app. Kiểm tra Play Services và OAuth SHA-1.",
                        e2,
                    ),
                )
            }
        } catch (e: GetCredentialException) {
            Result.failure(
                IllegalStateException(
                    "Google Sign-In lỗi: ${e.type} — ${e.errorMessage ?: e.message}",
                    e,
                ),
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun buildCancelMessage(e: GetCredentialCancellationException): String {
        val detail = listOfNotNull(e.type, e.errorMessage?.toString()).joinToString(" | ")
        // User bấm Back thật sự vẫn vào đây — nhưng sau khi ĐÃ chọn account
        // thì gần như chắc là cấu hình OAuth / Play Services.
        return "Đăng nhập Google bị dừng sau khi chọn tài khoản" +
            (if (detail.isNotBlank()) " ($detail)" else "") +
            ". Thường do thiếu OAuth Client kiểu Android (package com.khoaluan.indoornav + SHA-1) " +
            "hoặc Google Play Services. Thử Email/mật khẩu tạm thời."
    }

    private fun buildSignInWithGoogleRequest(clientId: String): GetCredentialRequest {
        val option = GetSignInWithGoogleOption.Builder(clientId).build()
        return GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()
    }

    private fun buildGoogleIdRequest(clientId: String): GetCredentialRequest {
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(clientId)
            .setAutoSelectEnabled(false)
            .build()
        return GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()
    }

    private fun parseCredential(response: GetCredentialResponse): Result<GoogleIdResult> {
        val cred = response.credential
        if (cred is CustomCredential &&
            cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            val google = GoogleIdTokenCredential.createFrom(cred.data)
            val token = google.idToken
            if (token.isBlank()) {
                return Result.failure(IllegalStateException("Google không trả idToken"))
            }
            return Result.success(
                GoogleIdResult(
                    idToken = token,
                    email = google.id,
                    displayName = google.displayName,
                ),
            )
        }
        return Result.failure(IllegalStateException("Credential không phải Google ID token"))
    }

    companion object {
        private const val TAG = "GoogleSignIn"
    }
}
