package com.khoaluan.indoornav.ui.screens

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.auth.GoogleSignInHelper
import com.khoaluan.indoornav.data.api.GoogleLoginRequest
import com.khoaluan.indoornav.data.api.LoginRequest
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.local.SessionManager
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.i18n.trStatic
import com.khoaluan.indoornav.ui.theme.NavBlue
import kotlinx.coroutines.launch

/**
 * W8 — Đăng nhập email/password hoặc Google (Credential Manager / demo); có thể tiếp tục khách.
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
                    if (activity == null) {
                        error = trStatic(
                            "Không lấy được Activity để đăng nhập Google",
                            "Cannot get Activity for Google sign-in",
                        )
                        return@OutlinedButton
                    }
                    scope.launch {
                        loading = true
                        error = null
                        try {
                            val helper = GoogleSignInHelper(activity)
                            val google = helper.requestIdToken().getOrElse { throw it }
                            if (google.idToken == "demo" || google.idToken.isBlank()) {
                                error = trStatic(
                                    "Google chưa xác minh. Kiểm tra GOOGLE_WEB_CLIENT_ID.",
                                    "Google not verified. Check GOOGLE_WEB_CLIENT_ID.",
                                )
                                return@launch
                            }
                            val api = RetrofitClient.getAuthApi()
                            val res = api.googleLogin(
                                GoogleLoginRequest(
                                    idToken = google.idToken,
                                    email = google.email,
                                    fullName = google.displayName ?: "Google User",
                                ),
                            )
                            if (res.isSuccessful && !res.body()?.token.isNullOrBlank()) {
                                val body = res.body()!!
                                sessionManager.saveSession(
                                    token = body.token!!,
                                    refresh = body.refreshToken,
                                    email = body.user?.email ?: google.email,
                                    displayName = body.user?.fullName ?: google.displayName,
                                )
                                onLoggedIn()
                            } else {
                                error = when (res.code()) {
                                    404, 501 ->
                                        trStatic(
                                            "Máy chủ chưa hỗ trợ Google Sign-In (HTTP ${res.code()}). Dùng Email hoặc Khách.",
                                            "Server does not support Google Sign-In (HTTP ${res.code()}). Use Email or Guest.",
                                        )
                                    401 -> trStatic("Token Google không hợp lệ.", "Invalid Google token.")
                                    else -> trStatic(
                                        "Google Sign-In thất bại (${res.code()})",
                                        "Google Sign-In failed (${res.code()})",
                                    )
                                }
                            }
                        } catch (e: Exception) {
                            error = e.message ?: trStatic("Google lỗi / đã hủy", "Google error / cancelled")
                        } finally {
                            loading = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(tr("Tiếp tục với Google", "Continue with Google"))
            }
            TextButton(onClick = onContinueGuest) {
                Text(tr("Tiếp tục với tư cách khách", "Continue as guest"))
            }
        }
    }
}
