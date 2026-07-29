package com.khoaluan.indoornav.ui.screens

import android.app.Activity
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import com.khoaluan.indoornav.R
import com.khoaluan.indoornav.auth.AuthEvents
import com.khoaluan.indoornav.auth.GoogleSignInHelper
import com.khoaluan.indoornav.data.api.GoogleLoginRequest
import com.khoaluan.indoornav.data.api.LoginRequest
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.local.SessionManager
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.i18n.trStatic
import com.khoaluan.indoornav.ui.theme.NavBlue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * W8 — Đăng nhập email/password hoặc Google (Credential Manager); có thể tiếp tục khách.
 */
@Composable
fun LoginScreen(
    sessionManager: SessionManager,
    onContinueGuest: () -> Unit,
    onLoggedIn: () -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val activity = context as? ComponentActivity

    // Nhận kết quả Google từ Activity lifecycle (sống sót recreate).
    LaunchedEffect(Unit) {
        launch {
            AuthEvents.loading.collect { loading = it }
        }
        launch {
            AuthEvents.error.collect { error = it }
        }
        launch {
            AuthEvents.loggedIn.collect { onLoggedIn() }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(tr("Điều hướng trong nhà", "Indoor Navigation"), fontSize = 24.sp, fontWeight = FontWeight.Bold, color = NavBlue)
        Text(
            tr("Đăng nhập để lưu tài khoản (tuỳ chọn)", "Sign in to save your account (optional)"),
            fontSize = 13.sp,
        )
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text(tr("Thư điện tử", "Email")) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text(tr("Mật khẩu", "Password")) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )
        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = androidx.compose.ui.graphics.Color.Red, fontSize = 12.sp)
        }
        Spacer(Modifier.height(16.dp))
        if (loading) {
            CircularProgressIndicator()
            Spacer(Modifier.height(8.dp))
            Text(
                tr("Đang đăng nhập…", "Signing in…"),
                fontSize = 12.sp,
                color = androidx.compose.ui.graphics.Color.Gray,
            )
        } else {
            Button(
                onClick = {
                    scope.launch {
                        loading = true
                        error = null
                        try {
                            val api = RetrofitClient.getAuthApi()
                            val res = api.login(LoginRequest(email.trim(), password))
                            if (res.isSuccessful) {
                                val body = res.body()
                                val token = body?.token
                                if (token.isNullOrBlank()) {
                                    error = "Máy chủ không trả token — thử lại."
                                } else {
                                    sessionManager.saveSession(
                                        token = token,
                                        refresh = body.refreshToken,
                                        email = body.user?.email ?: email,
                                        displayName = body.user?.fullName,
                                        avatarUrl = "",
                                    )
                                    onLoggedIn()
                                }
                            } else {
                                error = "Đăng nhập thất bại (${res.code()})"
                            }
                        } catch (e: Exception) {
                            error = e.message ?: "Lỗi mạng"
                        } finally {
                            loading = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = email.isNotBlank() && password.isNotBlank(),
            ) {
                Text(tr("Đăng nhập", "Sign in"))
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = {
                    val act = activity
                    if (act == null) {
                        error = trStatic(
                            "Không lấy được Activity để đăng nhập Google",
                            "Cannot get Activity for Google sign-in",
                        )
                        return@OutlinedButton
                    }
                    AuthEvents.emitLoading(true)
                    error = null
                    act.lifecycleScope.launch {
                        completeGoogleSignIn(act, sessionManager)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Image(
                        painter = painterResource(R.drawable.ic_google_logo),
                        contentDescription = "Google",
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(tr("Tiếp tục với Google", "Continue with Google"))
                }
            }
            TextButton(onClick = onContinueGuest) {
                Text(tr("Tiếp tục với tư cách khách", "Continue as guest"))
            }
        }
    }
}

private suspend fun completeGoogleSignIn(
    activity: Activity,
    sessionManager: SessionManager,
) {
    try {
        val helper = GoogleSignInHelper(activity)
        val google = helper.requestIdToken().getOrElse { throw it }
        if (google.idToken.isBlank() || google.idToken == "demo") {
            AuthEvents.emitError(
                trStatic(
                    "Google chưa xác minh. Kiểm tra GOOGLE_WEB_CLIENT_ID / SHA-1 trên Cloud Console.",
                    "Google not verified. Check GOOGLE_WEB_CLIENT_ID / SHA-1 on Cloud Console.",
                ),
            )
            return
        }

        val body = withContext(Dispatchers.IO) {
            RetrofitClient.init(activity.applicationContext)
            val api = RetrofitClient.getAuthApi()
            val res = api.googleLogin(
                GoogleLoginRequest(
                    idToken = google.idToken,
                    email = google.email,
                    fullName = google.displayName ?: "Google User",
                ),
            )
            if (!res.isSuccessful) {
                val errBody = try {
                    res.errorBody()?.string().orEmpty()
                } catch (_: Exception) {
                    ""
                }
                val msg = when (res.code()) {
                    404, 501 ->
                        trStatic(
                            "Máy chủ chưa hỗ trợ Google Sign-In (HTTP ${res.code()}). Dùng Email hoặc Khách.",
                            "Server does not support Google Sign-In (HTTP ${res.code()}). Use Email or Guest.",
                        )
                    401 -> trStatic(
                        "Token Google không hợp lệ (sai Web Client ID / SHA-1 Android).",
                        "Invalid Google token (wrong Web Client ID / Android SHA-1).",
                    )
                    else -> trStatic(
                        "Google Sign-In thất bại (${res.code()})" +
                            if (errBody.isNotBlank()) ": ${errBody.take(120)}" else "",
                        "Google Sign-In failed (${res.code()})",
                    )
                }
                throw IllegalStateException(msg)
            }
            res.body() ?: throw IllegalStateException("Máy chủ không trả body đăng nhập Google.")
        }

        val token = body.token
        if (token.isNullOrBlank()) {
            AuthEvents.emitError("Máy chủ không trả token — thử lại.")
            return
        }

        sessionManager.saveSession(
            token = token,
            refresh = body.refreshToken,
            email = body.user?.email ?: google.email,
            displayName = body.user?.fullName ?: google.displayName,
            avatarUrl = google.photoUrl?.takeIf { it.isNotBlank() }
                ?: body.user?.avatarUrl.orEmpty(),
        )
        AuthEvents.emitLoggedIn()
    } catch (e: Exception) {
        Log.w("LoginScreen", "Google sign-in failed: ${e.message}", e)
        AuthEvents.emitError(
            e.message ?: trStatic("Google lỗi / đã hủy", "Google error / cancelled"),
        )
    } finally {
        AuthEvents.emitLoading(false)
    }
}
