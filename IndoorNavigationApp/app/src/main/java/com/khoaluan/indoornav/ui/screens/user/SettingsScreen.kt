package com.khoaluan.indoornav.ui.screens.user

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.viewmodel.UserHubViewModel
import com.khoaluan.indoornav.ui.viewmodel.UserListUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: UserHubViewModel,
    buildingsForOffline: List<Pair<String, String>>,
    onBack: () -> Unit,
    onSimulateEmergency: ((buildingId: String, type: String) -> Unit)? = null,
) {
    val theme by viewModel.theme.collectAsState()
    val locale by viewModel.locale.collectAsState()
    val voice by viewModel.voiceGuidance.collectAsState()
    val elevator by viewModel.preferElevator.collectAsState()
    val sharePrecise by viewModel.sharePrecise.collectAsState()
    val showActivity by viewModel.showActivity.collectAsState()
    val cached by viewModel.cachedMaps.collectAsState()
    val sessions by viewModel.sessions.collectAsState()
    var offlineBuildingId by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        viewModel.loadSettingsFromServer()
        viewModel.loadSessions()
        viewModel.refreshCachedMaps()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(tr("Cài đặt", "Settings")) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = tr("Quay lại", "Back"))
                    }
                },
            )
        },
    ) { pad ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(pad)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            SectionTitle(tr("Giao diện", "Appearance"))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    "system" to tr("Hệ thống", "System"),
                    "light" to tr("Sáng", "Light"),
                    "dark" to tr("Tối", "Dark"),
                ).forEach { (v, label) ->
                    FilterChip(
                        selected = theme == v,
                        onClick = { viewModel.setTheme(v) },
                        label = { Text(label) },
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            SectionTitle(tr("Ngôn ngữ", "Language"))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = locale == "vi",
                    onClick = { viewModel.setLocale("vi") },
                    label = { Text("Tiếng Việt") },
                )
                FilterChip(
                    selected = locale == "en",
                    onClick = { viewModel.setLocale("en") },
                    label = { Text("English") },
                )
            }
            Text(
                tr(
                    "Đổi ngôn ngữ áp dụng ngay trên toàn ứng dụng.",
                    "Language change applies across the whole app immediately.",
                ),
                fontSize = 12.sp,
                color = Color.Gray,
                modifier = Modifier.padding(top = 6.dp),
            )

            if (onSimulateEmergency != null) {
                Spacer(Modifier.height(20.dp))
                SectionTitle(tr("Khẩn cấp (demo)", "Emergency (demo)"))
                Text(
                    tr(
                        "Quyền chia sẻ vị trí khi có sự cố (Spec D).",
                        "Location sharing during emergencies (Spec D).",
                    ),
                    fontSize = 12.sp,
                    color = Color.Gray,
                )
                var consentMode by remember { mutableStateOf("EMERGENCY_ONLY") }
                val ctx = androidx.compose.ui.platform.LocalContext.current
                val scope = androidx.compose.runtime.rememberCoroutineScope()
                LaunchedEffect(Unit) {
                    consentMode = com.khoaluan.indoornav.fcm.EmergencyConsentHelper.cachedMode(ctx)
                    try {
                        com.khoaluan.indoornav.data.api.RetrofitClient.init(ctx)
                        val res = com.khoaluan.indoornav.data.api.RetrofitClient.getApiService()
                            .getEmergencyConsent()
                        val m = res.body()?.emergency_location_consent?.mode
                            ?: if (res.body()?.emergency_location_consent?.granted == true) {
                                "EMERGENCY_ONLY"
                            } else {
                                "ALERT_ONLY"
                            }
                        consentMode = m
                        com.khoaluan.indoornav.fcm.EmergencyConsentHelper.cacheMode(ctx, m)
                    } catch (_: Exception) {
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(
                        "EMERGENCY_ONLY" to tr(
                            "Chỉ chia sẻ vị trí khi khẩn cấp (khuyến nghị)",
                            "Share location only in emergencies (recommended)",
                        ),
                        "ALERT_ONLY" to tr(
                            "Không chia sẻ vị trí (vẫn nhận cảnh báo)",
                            "Do not share location (still receive alerts)",
                        ),
                        "ALWAYS_RESEARCH" to tr(
                            "Luôn chia sẻ để hỗ trợ nghiên cứu",
                            "Always share for research",
                        ),
                    ).forEach { (mode, label) ->
                        FilterChip(
                            selected = consentMode == mode,
                            onClick = {
                                consentMode = mode
                                com.khoaluan.indoornav.fcm.EmergencyConsentHelper.cacheMode(ctx, mode)
                                scope.launch {
                                    try {
                                        com.khoaluan.indoornav.data.api.RetrofitClient.init(ctx)
                                        com.khoaluan.indoornav.data.api.RetrofitClient.getApiService()
                                            .putEmergencyConsent(
                                                com.khoaluan.indoornav.data.api.EmergencyConsentBody(mode = mode),
                                            )
                                    } catch (_: Exception) {
                                    }
                                }
                            },
                            label = { Text(label, fontSize = 12.sp) },
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    tr(
                        "Mô phỏng màn hình cảnh báo full-screen rồi chỉ đường tới lối thoát. " +
                            "Push FCM thật sẽ gắn sau khi cấu hình Firebase.",
                        "Simulate full-screen alert then route to the nearest exit. " +
                            "Real FCM push comes after Firebase setup.",
                    ),
                    fontSize = 12.sp,
                    color = Color.Gray,
                )
                Spacer(Modifier.height(8.dp))
                val demoBuildingId = offlineBuildingId.ifBlank {
                    buildingsForOffline.firstOrNull()?.first.orEmpty()
                }
                if (buildingsForOffline.isNotEmpty()) {
                    Text(
                        tr("Tòa demo", "Demo building") + ": " +
                            (buildingsForOffline.find { it.first == demoBuildingId }?.second
                                ?: buildingsForOffline.first().second),
                        fontSize = 13.sp,
                    )
                    Spacer(Modifier.height(8.dp))
                }
                Button(
                    onClick = {
                        val id = demoBuildingId.ifBlank {
                            buildingsForOffline.firstOrNull()?.first.orEmpty()
                        }
                        onSimulateEmergency(id, "FIRE")
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFB91C1C),
                        contentColor = Color.White,
                    ),
                    enabled = buildingsForOffline.isNotEmpty() || offlineBuildingId.isNotBlank(),
                ) {
                    Text(tr("Mô phỏng cảnh báo CHÁY", "Simulate FIRE alert"))
                }
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = {
                        val id = demoBuildingId.ifBlank {
                            buildingsForOffline.firstOrNull()?.first.orEmpty()
                        }
                        onSimulateEmergency(id, "EARTHQUAKE")
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF9A3412),
                        contentColor = Color.White,
                    ),
                    enabled = buildingsForOffline.isNotEmpty() || offlineBuildingId.isNotBlank(),
                ) {
                    Text(tr("Mô phỏng ĐỘNG ĐẤT", "Simulate EARTHQUAKE alert"))
                }
            }

            Spacer(Modifier.height(20.dp))
            SectionTitle(tr("Động đất cộng đồng", "Community earthquake sensor"))
            val seismicCtx = androidx.compose.ui.platform.LocalContext.current
            var seismicBg by remember {
                mutableStateOf(
                    com.khoaluan.indoornav.seismic.SeismicPrefs.isBackgroundEnabled(seismicCtx)
                )
            }
            Text(
                tr(
                    "Bật để lắng nghe rung ngay cả khi không sạc và không mở app " +
                        "(có thông báo nhỏ trên thanh trạng thái). App vẫn lọc nhiễu on-device trước khi gửi server. " +
                        "Cần đã đăng nhập và từng mở map tòa để gắn presence.",
                    "Enable to sense shaking even when not charging and the app is closed " +
                        "(shows a quiet status notification). On-device filtering still applies. " +
                        "Requires login and having opened a building map for presence.",
                ),
                fontSize = 12.sp,
                color = Color.Gray,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            SettingSwitch(
                tr("Cảm biến động đất chạy nền", "Background earthquake sensor"),
                seismicBg,
            ) { enabled ->
                seismicBg = enabled
                com.khoaluan.indoornav.seismic.SeismicMonitorService.setBackgroundEnabled(
                    seismicCtx,
                    enabled,
                )
            }

            Spacer(Modifier.height(16.dp))
            SectionTitle(tr("Điều hướng", "Navigation"))
            SettingSwitch(
                tr("Hướng dẫn giọng nói (TTS)", "Voice guidance (TTS)"),
                voice,
            ) { viewModel.setVoiceGuidance(it) }
            SettingSwitch(
                tr("Ưu tiên thang máy", "Prefer elevators"),
                elevator,
            ) { viewModel.setPreferElevator(it) }

            Spacer(Modifier.height(16.dp))
            SectionTitle(tr("Riêng tư", "Privacy"))
            SettingSwitch(
                tr("Chia sẻ vị trí chính xác", "Share precise location"),
                sharePrecise,
            ) { viewModel.setSharePrecise(it) }
            SettingSwitch(
                tr("Hiện hoạt động công khai", "Show public activity"),
                showActivity,
            ) { viewModel.setShowActivity(it) }

            Spacer(Modifier.height(16.dp))
            SectionTitle(tr("Tải ngoại tuyến", "Offline download"))
            Text(
                tr(
                    "Bộ nhớ đệm hiện có: ${cached.size} tầng",
                    "Cached floors: ${cached.size}",
                ),
                fontSize = 12.sp,
                color = Color.Gray,
            )
            if (buildingsForOffline.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                buildingsForOffline.take(8).forEach { (id, name) ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(name, modifier = Modifier.weight(1f), fontSize = 14.sp)
                        TextButton(onClick = { viewModel.downloadBuildingOffline(id) }) {
                            Text(tr("Tải", "Download"))
                        }
                        TextButton(onClick = { viewModel.clearCachedBuilding(id) }) {
                            Text(tr("Xóa", "Delete"), color = Color(0xFFD93025))
                        }
                    }
                }
            } else {
                OutlinedTextField(
                    value = offlineBuildingId,
                    onValueChange = { offlineBuildingId = it },
                    label = { Text(tr("Mã tòa nhà", "Building ID")) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                TextButton(
                    onClick = {
                        if (offlineBuildingId.isNotBlank()) {
                            viewModel.downloadBuildingOffline(offlineBuildingId.trim())
                        }
                    },
                ) { Text(tr("Tải theo mã", "Download by ID")) }
            }
            TextButton(onClick = { viewModel.clearAllCache() }) {
                Text(tr("Xóa toàn bộ bộ nhớ đệm", "Clear all cache"), color = Color(0xFFD93025))
            }

            Spacer(Modifier.height(16.dp))
            SectionTitle(tr("Thiết bị đã đăng nhập", "Signed-in devices"))
            when (val s = sessions) {
                is UserListUiState.Loading -> Text(tr("Đang tải…", "Loading…"))
                is UserListUiState.Error -> Text(s.message, color = Color.Red, fontSize = 12.sp)
                is UserListUiState.Success -> {
                    if (s.data.isEmpty()) {
                        Text(
                            tr(
                                "Không có phiên nào (hoặc thiếu quyền).",
                                "No sessions (or missing permission).",
                            ),
                            color = Color.Gray,
                            fontSize = 12.sp,
                        )
                    } else {
                        s.data.forEach { sess ->
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 6.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        sess.deviceName?.takeIf { it.isNotBlank() }
                                            ?: sess.userAgent?.take(40)
                                            ?: sess.id.orEmpty(),
                                        fontWeight = FontWeight.Medium,
                                        fontSize = 13.sp,
                                    )
                                    Text(
                                        buildString {
                                            if (sess.current) {
                                                append(tr("Thiết bị này · ", "This device · "))
                                            }
                                            append(sess.lastUsedAt ?: sess.createdAt.orEmpty())
                                        },
                                        fontSize = 11.sp,
                                        color = Color.Gray,
                                    )
                                }
                                if (!sess.current && !sess.id.isNullOrBlank()) {
                                    TextButton(onClick = { viewModel.revokeSession(sess.id!!) }) {
                                        Text(tr("Thu hồi", "Revoke"), color = Color(0xFFD93025))
                                    }
                                }
                            }
                        }
                    }
                }
                else -> Unit
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.padding(bottom = 8.dp))
}

@Composable
private fun SettingSwitch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f), fontSize = 14.sp)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
