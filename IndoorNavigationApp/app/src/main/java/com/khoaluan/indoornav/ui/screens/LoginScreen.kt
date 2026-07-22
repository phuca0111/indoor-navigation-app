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
        Text("Indoor Navigation", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = NavBlue)
        Text("Đăng nhập để lưu tài khoản (tuỳ chọn)", fontSize = 13.sp)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Mật khẩu") },
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
                                sessionManager.accessToken = body?.token
                                sessionManager.email = body?.user?.email ?: email
                                sessionManager.displayName = body?.user?.fullName
                                onLoggedIn()
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
                Text("Đăng nhập")
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = {
                    if (activity == null) {
                        error = "Không lấy được Activity để đăng nhập Google"
                        return@OutlinedButton
                    }
                    scope.launch {
                        loading = true
                        error = null
                        try {
                            val helper = GoogleSignInHelper(activity)
                            val google = helper.requestIdToken().getOrElse { throw it }
                            if (google.idToken == "demo" || google.idToken.isBlank()) {
                                error = "Google chưa xác minh. Kiểm tra GOOGLE_WEB_CLIENT_ID."
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
                                sessionManager.accessToken = body.token
                                sessionManager.email = body.user?.email ?: google.email
                                sessionManager.displayName = body.user?.fullName ?: google.displayName
                                onLoggedIn()
                            } else {
                                error = when (res.code()) {
                                    404, 501 ->
                                        "Máy chủ chưa hỗ trợ Google Sign-In (HTTP ${res.code()}). Dùng Email hoặc Khách."
                                    401 -> "Token Google không hợp lệ."
                                    else -> "Google Sign-In thất bại (${res.code()})"
                                }
                            }
                        } catch (e: Exception) {
                            error = e.message ?: "Google lỗi / đã hủy"
                        } finally {
                            loading = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Tiếp tục với Google")
            }
            TextButton(onClick = onContinueGuest) {
                Text("Tiếp tục với tư cách khách")
            }
        }
    }
}
