package com.tptp.bank

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.tptp.bank.BuildConfig
import com.tptp.bank.data.api.*
import com.tptp.bank.data.local.SessionManager
import com.tptp.bank.ui.screens.QrScanScreen
import com.tptp.bank.util.formatVnd
import com.tptp.bank.util.parsePaymentQr
import kotlinx.coroutines.launch
import java.io.IOException

class MainActivity : ComponentActivity() {
    private lateinit var session: SessionManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionManager(this)
        setContent { TPTPbankApp() }
    }

    @Composable
    private fun TPTPbankApp() {
        var screen by remember { mutableStateOf(if (session.isLoggedIn()) "home" else "auth") }
        var balance by remember { mutableDoubleStateOf(0.0) }
        var userName by remember { mutableStateOf(session.userName ?: "") }
        var pendingPayment by remember { mutableStateOf<PaymentResolveResponse?>(null) }

        val api = remember { RetrofitClient.api }
        val scope = rememberCoroutineScope()
        val snackbarHostState = remember { SnackbarHostState() }

        fun showMessage(text: String) {
            scope.launch {
                snackbarHostState.showSnackbar(text)
            }
        }

        fun authHeader() = "Bearer ${session.token}"

        fun refreshWallet() {
            scope.launch {
                try {
                    val res = api.getWallet(authHeader())
                    if (res.isSuccessful) {
                        val body = res.body()
                        balance = body?.balance ?: 0.0
                        userName = body?.user?.full_name?.takeIf { it.isNotBlank() } ?: userName
                    } else {
                        showMessage(parseError(res.errorBody()?.string() ?: "Không tải được ví"))
                    }
                } catch (e: IOException) {
                    Log.e(TAG, "getWallet network", e)
                    showMessage("Không kết nối server. Kiểm tra WiFi + server port 5000.")
                } catch (e: Exception) {
                    Log.e(TAG, "getWallet", e)
                    showMessage("Lỗi tải ví: ${e.message}")
                }
            }
        }

        LaunchedEffect(screen) {
            if (screen == "home" && session.isLoggedIn()) refreshWallet()
        }

        MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFF38BDF8))) {
            Scaffold(
                snackbarHost = { SnackbarHost(snackbarHostState) },
                containerColor = Color(0xFF0F172A)
            ) { padding ->
                Box(
                    Modifier
                        .fillMaxSize()
                        .padding(padding)
                ) {
                    when (screen) {
                        "auth" -> AuthScreen(
                            onLogin = { email, password ->
                                scope.launch {
                                    try {
                                        val res = api.login(AuthRequest(email = email, password = password))
                                        val body = res.body()
                                        if (res.isSuccessful && body != null) {
                                            session.token = body.token
                                            session.userName = body.user.full_name ?: email
                                            userName = body.user.full_name?.takeIf { it.isNotBlank() } ?: email
                                            screen = "home"
                                        } else {
                                            showMessage(parseError(res.errorBody()?.string() ?: "Đăng nhập thất bại"))
                                        }
                                    } catch (e: IOException) {
                                        Log.e(TAG, "login network", e)
                                        showMessage("Không kết nối server. Kiểm tra WiFi + server đang chạy port 5000.")
                                    } catch (e: Exception) {
                                        Log.e(TAG, "login", e)
                                        showMessage("Lỗi đăng nhập: ${e.message}")
                                    }
                                }
                            },
                            onRegister = { email, name, password ->
                                scope.launch {
                                    try {
                                        val res = api.register(
                                            AuthRequest(email = email, password = password, full_name = name)
                                        )
                                        val body = res.body()
                                        if (res.isSuccessful && body != null) {
                                            session.token = body.token
                                            session.userName = name
                                            userName = name
                                            screen = "home"
                                        } else {
                                            showMessage(parseError(res.errorBody()?.string() ?: "Đăng ký thất bại"))
                                        }
                                    } catch (e: IOException) {
                                        Log.e(TAG, "register network", e)
                                        showMessage("Không kết nối server. Kiểm tra WiFi + server đang chạy port 5000.")
                                    } catch (e: Exception) {
                                        Log.e(TAG, "register", e)
                                        showMessage("Lỗi đăng ký: ${e.message}")
                                    }
                                }
                            }
                        )

                        "home" -> HomeScreen(
                            userName = userName,
                            balance = balance,
                            onTopup = { screen = "topup" },
                            onScan = { screen = "scan" },
                            onLogout = {
                                session.clear()
                                balance = 0.0
                                screen = "auth"
                            }
                        )

                        "topup" -> TopupScreen(
                            onBack = { screen = "home" },
                            onConfirm = { amount ->
                                scope.launch {
                                    try {
                                        val res = api.topup(authHeader(), TopupRequest(amount))
                                        if (res.isSuccessful) {
                                            balance = res.body()?.balance ?: balance
                                            showMessage("Nạp thành công")
                                            screen = "home"
                                        } else {
                                            showMessage(parseError(res.errorBody()?.string() ?: "Nạp thất bại"))
                                        }
                                    } catch (e: Exception) {
                                        showMessage("Lỗi nạp tiền: ${e.message}")
                                    }
                                }
                            }
                        )

                        "scan" -> QrScanScreen(
                            onBack = { screen = "home" },
                            onResult = { raw ->
                                val parsed = parsePaymentQr(raw)
                                if (parsed == null) {
                                    showMessage("QR không hợp lệ")
                                    screen = "home"
                                    return@QrScanScreen
                                }
                                scope.launch {
                                    try {
                                        val res = api.resolvePayment(parsed.invoiceId, parsed.token)
                                        if (res.isSuccessful && res.body() != null) {
                                            pendingPayment = res.body()
                                            screen = "confirm"
                                        } else {
                                            showMessage("Không đọc được đơn thanh toán")
                                            screen = "home"
                                        }
                                    } catch (e: Exception) {
                                        showMessage("Lỗi quét QR: ${e.message}")
                                        screen = "home"
                                    }
                                }
                            }
                        )

                        "confirm" -> pendingPayment?.let { pay ->
                            ConfirmPaymentScreen(
                                payment = pay,
                                balance = balance,
                                onBack = { screen = "home"; pendingPayment = null },
                                onConfirm = {
                                    scope.launch {
                                        try {
                                            val res = api.confirmPayment(
                                                authHeader(),
                                                PaymentConfirmRequest(pay.invoice_id, pay.payment_token)
                                            )
                                            if (res.isSuccessful) {
                                                balance = res.body()?.balance ?: balance
                                                showMessage("Thanh toán thành công — Gói ${res.body()?.plan}")
                                                pendingPayment = null
                                                screen = "home"
                                            } else {
                                                showMessage(parseError(res.errorBody()?.string() ?: "Thanh toán thất bại"))
                                            }
                                        } catch (e: Exception) {
                                            showMessage("Lỗi thanh toán: ${e.message}")
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    companion object {
        private const val TAG = "TPTPbank"
    }
}

@Composable
private fun AuthScreen(
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String) -> Unit
) {
    var isRegister by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Default.AccountBalance, null, tint = Color(0xFF38BDF8), modifier = Modifier.size(64.dp))
        Text("TPTPbank", style = MaterialTheme.typography.headlineMedium, color = Color.White)
        if (BuildConfig.DEBUG) {
            Text(
                "Server: ${BuildConfig.BASE_URL}",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF64748B),
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        Spacer(Modifier.height(24.dp))
        if (isRegister) {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Họ tên") },
                modifier = Modifier.fillMaxWidth(),
                colors = authFieldColors()
            )
            Spacer(Modifier.height(8.dp))
        }
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth(),
            colors = authFieldColors()
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Mật khẩu") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
            colors = authFieldColors()
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = {
                if (isRegister) onRegister(email.trim(), name.trim(), password)
                else onLogin(email.trim(), password)
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = email.isNotBlank() && password.length >= 6 && (!isRegister || name.isNotBlank())
        ) { Text(if (isRegister) "Đăng ký" else "Đăng nhập") }
        TextButton(onClick = { isRegister = !isRegister }) {
            Text(if (isRegister) "Đã có tài khoản? Đăng nhập" else "Chưa có tài khoản? Đăng ký")
        }
    }
}

@Composable
private fun authFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Color.White,
    unfocusedTextColor = Color.White,
    focusedLabelColor = Color(0xFF94A3B8),
    unfocusedLabelColor = Color(0xFF64748B),
    cursorColor = Color(0xFF38BDF8),
    focusedBorderColor = Color(0xFF38BDF8),
    unfocusedBorderColor = Color(0xFF475569)
)

@Composable
private fun HomeScreen(
    userName: String,
    balance: Double,
    onTopup: () -> Unit,
    onScan: () -> Unit,
    onLogout: () -> Unit
) {
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("Xin chào, $userName", color = Color.White, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(24.dp))
        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))) {
            Column(Modifier.padding(20.dp)) {
                Text("Số dư khả dụng", color = Color(0xFF94A3B8))
                Text(formatVnd(balance), style = MaterialTheme.typography.headlineMedium, color = Color.White)
            }
        }
        Spacer(Modifier.height(24.dp))
        Button(onClick = onTopup, modifier = Modifier.fillMaxWidth()) { Text("Nạp tiền") }
        Spacer(Modifier.height(12.dp))
        Button(onClick = onScan, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.QrCodeScanner, null)
            Spacer(Modifier.width(8.dp))
            Text("Quét QR thanh toán")
        }
        Spacer(Modifier.weight(1f))
        TextButton(onClick = onLogout) { Text("Đăng xuất") }
    }
}

@Composable
private fun TopupScreen(onBack: () -> Unit, onConfirm: (Long) -> Unit) {
    var amountText by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        TextButton(onClick = onBack) { Text("← Quay lại", color = Color(0xFF38BDF8)) }
        Text("Nạp tiền vào ví", style = MaterialTheme.typography.headlineSmall, color = Color.White)
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value = amountText,
            onValueChange = { amountText = it.filter { c -> c.isDigit() } },
            label = { Text("Số tiền (VND)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(),
            colors = authFieldColors()
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = { amountText.toLongOrNull()?.let(onConfirm) },
            enabled = (amountText.toLongOrNull() ?: 0L) >= 10000,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Xác nhận nạp") }
    }
}

@Composable
private fun ConfirmPaymentScreen(
    payment: PaymentResolveResponse,
    balance: Double,
    onBack: () -> Unit,
    onConfirm: () -> Unit
) {
    val enough = balance >= payment.amount
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        TextButton(onClick = onBack) { Text("← Hủy", color = Color(0xFF38BDF8)) }
        Text("Xác nhận thanh toán", style = MaterialTheme.typography.headlineSmall, color = Color.White)
        Spacer(Modifier.height(16.dp))
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))) {
            Column(Modifier.padding(16.dp)) {
                Text("Merchant: ${payment.merchant}", color = Color(0xFF94A3B8))
                Text("Gói: ${payment.plan}", color = Color.White)
                Text(formatVnd(payment.amount), style = MaterialTheme.typography.headlineMedium, color = Color(0xFF38BDF8))
                Text("HĐ: ${payment.invoice_number}", color = Color(0xFF64748B), style = MaterialTheme.typography.bodySmall)
            }
        }
        Spacer(Modifier.height(12.dp))
        Text("Số dư: ${formatVnd(balance)}", color = Color.White)
        if (!enough) Text("Số dư không đủ — vui lòng nạp thêm", color = MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(24.dp))
        Button(onClick = onConfirm, enabled = enough, modifier = Modifier.fillMaxWidth()) {
            Text("Xác nhận thanh toán")
        }
    }
}

private fun parseError(raw: String): String {
    if (raw.isBlank()) return "Có lỗi xảy ra"
    return try {
        val gson = com.google.gson.Gson()
        gson.fromJson(raw, ErrorResponse::class.java).message ?: raw.take(120)
    } catch (_: Exception) {
        raw.take(120)
    }
}
