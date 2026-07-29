package com.khoaluan.indoornav

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import android.widget.Toast
import com.khoaluan.indoornav.data.local.SessionManager
import com.khoaluan.indoornav.deeplink.extractEmergencyDeepLink
import com.khoaluan.indoornav.deeplink.extractPlaceDeepLink
import com.khoaluan.indoornav.navigation.emergency.EmergencyPhase
import com.khoaluan.indoornav.ui.components.ErrorBannerHost
import com.khoaluan.indoornav.ui.components.IndoorTransitionOverlay
import com.khoaluan.indoornav.ui.screens.BuildingListScreen
import com.khoaluan.indoornav.ui.screens.LoginScreen
import com.khoaluan.indoornav.ui.screens.MapScreen
import com.khoaluan.indoornav.ui.screens.PDRTestScreen
import com.khoaluan.indoornav.ui.screens.QRScanScreen
import com.khoaluan.indoornav.ui.screens.emergency.EmergencyFloorPickOverlay
import com.khoaluan.indoornav.ui.screens.emergency.EmergencyTakeoverOverlay
import com.khoaluan.indoornav.ui.screens.user.ContributionsScreen
import com.khoaluan.indoornav.ui.screens.user.CreatorHubScreen
import com.khoaluan.indoornav.ui.screens.user.ErrorCenterScreen
import com.khoaluan.indoornav.ui.screens.user.FavoritesScreen
import com.khoaluan.indoornav.ui.screens.user.FollowingScreen
import com.khoaluan.indoornav.ui.screens.user.HistoryScreen
import com.khoaluan.indoornav.ui.screens.user.NotificationsScreen
import com.khoaluan.indoornav.ui.screens.user.OfflineManagerScreen
import com.khoaluan.indoornav.ui.screens.user.ProfileScreen
import com.khoaluan.indoornav.ui.screens.user.ProposalsScreen
import com.khoaluan.indoornav.ui.screens.user.SettingsScreen
import com.khoaluan.indoornav.ui.screens.user.UserHubDest
import com.khoaluan.indoornav.ui.theme.IndoorNavigationAppTheme
import com.khoaluan.indoornav.ui.i18n.AppLocaleHolder
import com.khoaluan.indoornav.ui.i18n.LocalAppLocale
import com.khoaluan.indoornav.ui.viewmodel.BuildingListUiState
import com.khoaluan.indoornav.ui.viewmodel.IndoorEntryUiState
import com.khoaluan.indoornav.ui.viewmodel.MapViewModel
import com.khoaluan.indoornav.ui.viewmodel.UserHubViewModel
class MainActivity : ComponentActivity() {
    private var pendingPlaceSlug by mutableStateOf<String?>(null)
    private var pendingFloor by mutableStateOf<Int?>(null)
    private var pendingEmergencyBuildingId by mutableStateOf<String?>(null)
    private var emergencyIntentTick by mutableStateOf(0)

    private fun applyIntentExtras(intent: Intent?) {
        val emergency = extractEmergencyDeepLink(intent)
        if (emergency != null) {
            com.khoaluan.indoornav.fcm.EmergencyNotifier.prepareActivityForLockScreen(this)
            com.khoaluan.indoornav.fcm.EmergencyNotifier.cancel(this)
            pendingEmergencyBuildingId = emergency.buildingId
            intent?.putExtra("_pending_emergency_type", emergency.incidentType)
            intent?.putExtra("_pending_emergency_title", emergency.title)
            intent?.putExtra("_pending_emergency_body", emergency.body)
            intent?.putExtra("_pending_emergency_incident", emergency.incidentId)
            intent?.putExtra("_pending_emergency_building", emergency.buildingId)
            val autoEvacuate = intent?.getBooleanExtra(
                com.khoaluan.indoornav.fcm.EmergencyAlertActivity.EXTRA_AUTO_EVACUATE,
                false,
            ) == true
            intent?.putExtra("_pending_emergency_auto_evacuate", autoEvacuate)
            emergencyIntentTick++
            return
        }
        val link = extractPlaceDeepLink(intent)
        pendingPlaceSlug = link?.placeSlugOrId
        pendingFloor = link?.floor
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyIntentExtras(intent)
        enableEdgeToEdge()
        com.khoaluan.indoornav.data.api.RetrofitClient.init(this)
        val bootLocale = com.khoaluan.indoornav.data.local.AppSettingsStore(this).locale
        AppLocaleHolder.set(bootLocale)
        setContent {
            val userHub: UserHubViewModel = viewModel()
            val appSettings = remember {
                com.khoaluan.indoornav.data.local.AppSettingsStore(this@MainActivity)
            }
            val themePref by userHub.theme.collectAsState()
            val localePref by userHub.locale.collectAsState()
            val darkTheme = when (themePref.ifBlank { appSettings.theme }) {
                "dark" -> true
                "light" -> false
                else -> androidx.compose.foundation.isSystemInDarkTheme()
            }
            CompositionLocalProvider(LocalAppLocale provides localePref) {
            IndoorNavigationAppTheme(darkTheme = darkTheme, dynamicColor = false) {
                val viewModel: MapViewModel = viewModel()
                val emergencySession by viewModel.emergencySession.collectAsState()
                val buildingActiveEmergency by viewModel.buildingActiveEmergency.collectAsState()
                val sessionManager = remember {
                    SessionManager(this@MainActivity).also { it.bindToHttpClient() }
                }
                var showLogin by remember { mutableStateOf(!sessionManager.isLoggedIn) }
                var isLoggedIn by remember { mutableStateOf(sessionManager.isLoggedIn) }
                var accountLabel by remember {
                    mutableStateOf(sessionManager.displayName ?: sessionManager.email)
                }
                var avatarUrl by remember { mutableStateOf(sessionManager.avatarUrl) }
                var userHubDest by remember { mutableStateOf<UserHubDest?>(null) }
                val userNotice by userHub.notice.collectAsState()
                val context = LocalContext.current
                LaunchedEffect(userNotice) {
                    val msg = userNotice ?: return@LaunchedEffect
                    Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                    userHub.clearNotice()
                }
                LaunchedEffect(isLoggedIn) {
                    if (isLoggedIn) {
                        try {
                            userHub.flushSyncQueue()
                        } catch (e: Exception) {
                            Log.w("MainActivity", "flushSyncQueue: ${e.message}")
                        }
                        try {
                            com.khoaluan.indoornav.fcm.FcmTokenRegistrar.syncCurrentToken(context)
                        } catch (e: Exception) {
                            Log.w("MainActivity", "FCM sync: ${e.message}")
                        }
                        // Trì hoãn seismic — tránh race với quay lại từ Google Sign-In / crash FGS.
                        try {
                            kotlinx.coroutines.delay(1500)
                            com.khoaluan.indoornav.seismic.SeismicMonitorService.startIfEligible(context)
                        } catch (e: Exception) {
                            Log.w("MainActivity", "seismic start: ${e.message}")
                        }
                    } else {
                        com.khoaluan.indoornav.seismic.SeismicMonitorService.stop(context)
                    }
                }

                // Quyền khẩn cấp: thông báo + full-screen (khoá máy) + hiện trên app khác (ngoài app).
                val notifPermLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.RequestPermission()
                ) { }
                var showOverlayPermDialog by remember { mutableStateOf(false) }
                LaunchedEffect(Unit) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                    if (Build.VERSION.SDK_INT >= 34) {
                        val nm = getSystemService(android.app.NotificationManager::class.java)
                        if (nm != null && !nm.canUseFullScreenIntent()) {
                            com.khoaluan.indoornav.fcm.EmergencyNotifier
                                .openFullScreenIntentSettings(this@MainActivity)
                        }
                    }
                    if (!com.khoaluan.indoornav.fcm.EmergencyOverlayController
                            .canDrawOverlays(this@MainActivity)
                    ) {
                        showOverlayPermDialog = true
                    }
                }
                if (showOverlayPermDialog) {
                    AlertDialog(
                        onDismissRequest = { showOverlayPermDialog = false },
                        title = { Text("Cho phép hiện cảnh báo khẩn cấp") },
                        text = {
                            Text(
                                "Để hiện màn hình đỏ khi bạn đang dùng app khác, " +
                                    "hãy bật «Hiển thị trên các ứng dụng khác» / Appear on top."
                            )
                        },
                        confirmButton = {
                            TextButton(
                                onClick = {
                                    showOverlayPermDialog = false
                                    com.khoaluan.indoornav.fcm.EmergencyNotifier
                                        .openOverlayPermissionSettings(this@MainActivity)
                                }
                            ) { Text("Mở cài đặt") }
                        },
                        dismissButton = {
                            TextButton(onClick = { showOverlayPermDialog = false }) {
                                Text("Để sau")
                            }
                        },
                    )
                }
                val authRequired by viewModel.authRequired.collectAsState()
                LaunchedEffect(authRequired) {
                    if (!authRequired) return@LaunchedEffect
                    viewModel.consumeAuthRequired()
                    isLoggedIn = false
                    accountLabel = null
                    avatarUrl = null
                    showLogin = true
                }

                // Token cũ / backup có thể còn tên nhưng JWT đã chết → kiểm tra hub/me.
                LaunchedEffect(Unit) {
                    if (!sessionManager.isLoggedIn) return@LaunchedEffect
                    sessionManager.bindToHttpClient()
                    try {
                        val res = com.khoaluan.indoornav.data.api.RetrofitClient.getApiService().getHubMe()
                        if (!res.isSuccessful) {
                            sessionManager.clear()
                            isLoggedIn = false
                            accountLabel = null
                            avatarUrl = null
                            showLogin = true
                        } else {
                            val name = res.body()?.user?.fullName
                            if (!name.isNullOrBlank()) {
                                sessionManager.displayName = name
                                accountLabel = name
                            }
                            avatarUrl = sessionManager.avatarUrl
                            isLoggedIn = true
                            viewModel.refreshFollowingPlaces()
                        }
                    } catch (_: Exception) {
                        // Mất mạng: giữ session local, favorite sẽ tự báo nếu 401
                    }
                }
                val indoorEntry by viewModel.indoorEntryState.collectAsState()
                var currentBuildingId by rememberSaveable { mutableStateOf<String?>(null) }
                val mapUi by viewModel.uiState.collectAsState()

                LaunchedEffect(mapUi) {
                    val success = mapUi as? com.khoaluan.indoornav.ui.viewmodel.MapUiState.Success
                        ?: return@LaunchedEffect
                    // Đồng bộ / khôi phục indoor nếu ViewModel còn Success (tránh văng ra list)
                    if (currentBuildingId != success.buildingId) {
                        currentBuildingId = success.buildingId
                    }
                }

                // Chưa có FCM: app tự hỏi backend xem tòa nhà đang mở có sự cố nào không.
                LaunchedEffect(currentBuildingId) {
                    if (currentBuildingId.isNullOrBlank()) {
                        viewModel.stopEmergencyWatch()
                    } else {
                        viewModel.startEmergencyWatch(currentBuildingId)
                    }
                }
                var showPDRTest by remember { mutableStateOf(false) }
                var isScanningQR by remember { mutableStateOf(false) }

                fun openIndoor(
                    buildingId: String,
                    totalFloors: Int = 1,
                    preferredFloor: Int? = null,
                    focusPoiId: Int? = null,
                ) {
                    if (buildingId.isBlank()) return
                    viewModel.enterIndoorSession(
                        buildingId = buildingId,
                        totalFloors = totalFloors.coerceAtLeast(1),
                        preferredFloor = preferredFloor,
                        focusPoiId = focusPoiId,
                    ) { id ->
                        currentBuildingId = id
                    }
                }

                fun resolveTotalFloors(buildingId: String): Int {
                    val list = (viewModel.buildingListState.value as? BuildingListUiState.Success)
                        ?.buildings
                        .orEmpty()
                    return list.firstOrNull { it.id == buildingId }?.totalFloors?.coerceAtLeast(1) ?: 1
                }

                fun beginEmergencyEvacuationFlow() {
                    viewModel.dismissGeofence()
                    isScanningQR = false
                    val session = viewModel.emergencySession.value
                    val bid = session.buildingId
                    if (currentBuildingId == null) {
                        when {
                            !bid.isNullOrBlank() -> {
                                openIndoor(bid, resolveTotalFloors(bid))
                                viewModel.requestEmergencyFloorConfirm()
                                Toast.makeText(
                                    context,
                                    "Chọn tầng đang đứng rồi chạm map để chỉ đường thoát hiểm",
                                    Toast.LENGTH_LONG,
                                ).show()
                            }
                            viewModel.detectedBuilding.value != null -> {
                                val near = viewModel.detectedBuilding.value!!
                                openIndoor(near.id, near.totalFloors.coerceAtLeast(1))
                                viewModel.requestEmergencyFloorConfirm()
                                Toast.makeText(
                                    context,
                                    "Chọn tầng đang đứng rồi chạm map để chỉ đường thoát hiểm",
                                    Toast.LENGTH_LONG,
                                ).show()
                            }
                            else -> {
                                Toast.makeText(
                                    context,
                                    "Chưa xác định tòa — mở map hoặc quét QR trước",
                                    Toast.LENGTH_LONG,
                                ).show()
                            }
                        }
                        return
                    }
                    // Luôn hỏi tầng trước — không tự chỉ đường khi chưa xác nhận tầng/vị trí
                    viewModel.requestEmergencyFloorConfirm()
                    val afterFloor = viewModel.emergencySession.value
                    if (afterFloor.phase == EmergencyPhase.AWAITING_FLOOR) {
                        Toast.makeText(
                            context,
                            "Chọn tầng bạn đang đứng",
                            Toast.LENGTH_SHORT,
                        ).show()
                        return
                    }
                    val nav = viewModel.navState.value
                    val needsStanding = nav.userPos == null && nav.startAnchorPos == null
                    if (needsStanding || afterFloor.phase == EmergencyPhase.ALERT) {
                        viewModel.requestEmergencyStandingPick()
                        Toast.makeText(
                            context,
                            "Chạm bản đồ để chọn vị trí đang đứng",
                            Toast.LENGTH_SHORT,
                        ).show()
                        return
                    }
                    val ok = viewModel.startEmergencyEvacuation()
                    if (ok) return
                    val sessionAfter = viewModel.emergencySession.value
                    when {
                        sessionAfter.phase == EmergencyPhase.AWAITING_FLOOR -> Toast.makeText(
                            context,
                            "Chọn tầng bạn đang đứng",
                            Toast.LENGTH_SHORT,
                        ).show()
                        sessionAfter.error?.startsWith("Đang tìm") == true -> Toast.makeText(
                            context,
                            "Đang tìm lối thoát trên các tầng khác…",
                            Toast.LENGTH_SHORT,
                        ).show()
                        sessionAfter.phase == EmergencyPhase.AWAITING_LOCATION -> Toast.makeText(
                            context,
                            "Chạm bản đồ để chọn vị trí đang đứng",
                            Toast.LENGTH_SHORT,
                        ).show()
                        else -> Toast.makeText(
                            context,
                            sessionAfter.error ?: "Không bắt đầu được chỉ đường",
                            Toast.LENGTH_LONG,
                        ).show()
                    }
                }

                fun consumePendingEmergencyFromIntent() {
                    val type = intent?.getStringExtra("_pending_emergency_type") ?: return
                    val title = intent?.getStringExtra("_pending_emergency_title")
                    val body = intent?.getStringExtra("_pending_emergency_body")
                    val incidentId = intent?.getStringExtra("_pending_emergency_incident")
                    val buildingId = intent?.getStringExtra("_pending_emergency_building")
                        ?: pendingEmergencyBuildingId
                    val autoEvacuate = intent?.getBooleanExtra("_pending_emergency_auto_evacuate", false) == true
                    intent?.removeExtra("_pending_emergency_type")
                    intent?.removeExtra("_pending_emergency_title")
                    intent?.removeExtra("_pending_emergency_body")
                    intent?.removeExtra("_pending_emergency_incident")
                    intent?.removeExtra("_pending_emergency_building")
                    intent?.removeExtra("_pending_emergency_auto_evacuate")
                    intent?.removeExtra(com.khoaluan.indoornav.fcm.EmergencyAlertActivity.EXTRA_AUTO_EVACUATE)
                    viewModel.triggerEmergencyAlert(
                        incidentType = type,
                        title = title,
                        body = body,
                        buildingId = buildingId,
                        incidentId = incidentId,
                    )
                    if (!buildingId.isNullOrBlank() && currentBuildingId == null) {
                        openIndoor(buildingId, resolveTotalFloors(buildingId))
                    }
                    if (autoEvacuate) {
                        beginEmergencyEvacuationFlow()
                    }
                }

                LaunchedEffect(emergencyIntentTick) {
                    consumePendingEmergencyFromIntent()
                }

                val backgroundLocationLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.RequestPermission()
                ) { granted ->
                    Log.i("MainActivity", "ACCESS_BACKGROUND_LOCATION granted=$granted")
                    com.khoaluan.indoornav.navigation.gps.BuildingGeofenceRegistrar
                        .reregisterFromStore(this@MainActivity)
                }

                fun maybeRequestBackgroundLocation() {
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
                    val bg = ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.ACCESS_BACKGROUND_LOCATION
                    )
                    if (bg == PackageManager.PERMISSION_GRANTED) {
                        com.khoaluan.indoornav.navigation.gps.BuildingGeofenceRegistrar
                            .reregisterFromStore(this@MainActivity)
                        return
                    }
                    backgroundLocationLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                }

                val locationPermissionsLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.RequestMultiplePermissions()
                ) { permissions ->
                    val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
                    val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false
                    if (fineLocationGranted || coarseLocationGranted) {
                        // Chỉ bật geofence sau khi đã qua màn Login
                        viewModel.fetchBuildings(enableGeofence = !showLogin)
                        if (!showLogin && sessionManager.isLoggedIn) {
                            maybeRequestBackgroundLocation()
                        }
                    } else {
                        viewModel.fetchBuildings(enableGeofence = false)
                    }
                }

                fun enterAppAfterAuth(asGuest: Boolean = false) {
                    if (asGuest) {
                        sessionManager.clear()
                    } else {
                        sessionManager.bindToHttpClient()
                        viewModel.refreshFollowingPlaces()
                    }
                    showLogin = false
                    isLoggedIn = sessionManager.isLoggedIn
                    accountLabel = sessionManager.displayName ?: sessionManager.email
                    avatarUrl = sessionManager.avatarUrl
                    viewModel.dismissGeofence()
                    // LaunchedEffect(showLogin) sẽ xin quyền + fetchBuildings
                }

                // Google Sign-In có thể recreate Activity — bắt sự kiện ngoài Compose LoginScreen.
                LaunchedEffect(Unit) {
                    com.khoaluan.indoornav.auth.AuthEvents.loggedIn.collect {
                        if (sessionManager.isLoggedIn) {
                            enterAppAfterAuth(asGuest = false)
                        }
                    }
                }

                fun logoutToLogin() {
                    sessionManager.clear()
                    isLoggedIn = false
                    accountLabel = null
                    avatarUrl = null
                    currentBuildingId = null
                    userHubDest = null
                    showLogin = true
                    viewModel.dismissGeofence()
                    viewModel.stopGpsGeofencing()
                    com.khoaluan.indoornav.navigation.gps.BuildingGeofenceRegistrar
                        .removeAll(this@MainActivity)
                }

                // Đang Login: tắt geofence. Đã vào app: xin GPS + tải danh sách tòa.
                LaunchedEffect(showLogin) {
                    if (showLogin) {
                        viewModel.dismissGeofence()
                        viewModel.stopGpsGeofencing()
                        com.khoaluan.indoornav.navigation.gps.BuildingGeofenceRegistrar
                            .removeAll(this@MainActivity)
                    } else {
                        locationPermissionsLauncher.launch(
                            buildList {
                                add(Manifest.permission.ACCESS_FINE_LOCATION)
                                add(Manifest.permission.ACCESS_COARSE_LOCATION)
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                    add(Manifest.permission.BLUETOOTH_SCAN)
                                    add(Manifest.permission.BLUETOOTH_CONNECT)
                                }
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    add(Manifest.permission.NEARBY_WIFI_DEVICES)
                                }
                            }.toTypedArray()
                        )
                    }
                }

                val detectedBuilding by viewModel.detectedBuilding.collectAsState()
                val navState by viewModel.navState.collectAsState()
                val qrError by viewModel.qrScanError.collectAsState()
                val isResolvingQr by viewModel.isResolvingQr.collectAsState()
                var awaitingQrLocalization by remember { mutableStateOf(false) }

                LaunchedEffect(navState.userPos, awaitingQrLocalization, qrError) {
                    if (!awaitingQrLocalization) return@LaunchedEffect
                    if (navState.userPos != null) {
                        isScanningQR = false
                        awaitingQrLocalization = false
                    } else if (qrError != null) {
                        awaitingQrLocalization = false
                    }
                }

                // Đã có vị trí + map sẵn sàng khi đang chờ sơ tán → chỉ đường ngay (không hỏi lại)
                LaunchedEffect(
                    emergencySession.phase,
                    navState.userPos,
                    mapUi,
                ) {
                    if (emergencySession.phase != EmergencyPhase.AWAITING_LOCATION) return@LaunchedEffect
                    if (navState.userPos == null) return@LaunchedEffect
                    if (mapUi !is com.khoaluan.indoornav.ui.viewmodel.MapUiState.Success) return@LaunchedEffect
                    viewModel.startEmergencyEvacuation()
                }

                Surface(modifier = Modifier.fillMaxSize().systemBarsPadding()) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        when {
                            indoorEntry is IndoorEntryUiState.Entering ||
                                indoorEntry is IndoorEntryUiState.Failed -> {
                                val entering = indoorEntry as? IndoorEntryUiState.Entering
                                val failed = indoorEntry as? IndoorEntryUiState.Failed
                                IndoorTransitionOverlay(
                                    message = entering?.message
                                        ?: "Đang chuẩn bị bản đồ trong nhà…",
                                    error = failed?.message,
                                    onCancel = {
                                        viewModel.clearIndoorEntryState()
                                        viewModel.exitIndoorNavigation()
                                        currentBuildingId = null
                                    },
                                    onRetry = failed?.let { f ->
                                        {
                                            openIndoor(f.buildingId, resolveTotalFloors(f.buildingId))
                                        }
                                    },
                                )
                            }
                            showLogin && currentBuildingId == null && !showPDRTest && !isScanningQR -> {
                                LoginScreen(
                                    sessionManager = sessionManager,
                                    onContinueGuest = { enterAppAfterAuth(asGuest = true) },
                                    onLoggedIn = { enterAppAfterAuth(asGuest = false) },
                                )
                            }
                            showPDRTest -> {
                                PDRTestScreen(onBack = { showPDRTest = false })
                            }
                            userHubDest != null && currentBuildingId == null -> {
                                when (val dest = userHubDest) {
                                    UserHubDest.Profile -> ProfileScreen(
                                        viewModel = userHub,
                                        onBack = { userHubDest = null },
                                        onOpen = { userHubDest = it },
                                        onLogout = { logoutToLogin() },
                                    )
                                    UserHubDest.Favorites -> FavoritesScreen(
                                        viewModel = userHub,
                                        onBack = { userHubDest = UserHubDest.Profile },
                                        onOpenPlace = { placeId ->
                                            userHubDest = null
                                            pendingPlaceSlug = placeId
                                        },
                                        onOpenIndoor = { id ->
                                            userHubDest = null
                                            openIndoor(id, resolveTotalFloors(id))
                                        },
                                    )
                                    UserHubDest.History -> HistoryScreen(
                                        viewModel = userHub,
                                        onBack = { userHubDest = UserHubDest.Profile },
                                    )
                                    UserHubDest.Notifications -> NotificationsScreen(
                                        viewModel = userHub,
                                        onBack = { userHubDest = UserHubDest.Profile },
                                    )
                                    UserHubDest.Settings -> {
                                        val buildings = (viewModel.buildingListState.value as? BuildingListUiState.Success)
                                            ?.buildings
                                            .orEmpty()
                                            .map { it.id to it.name }
                                        SettingsScreen(
                                            viewModel = userHub,
                                            buildingsForOffline = buildings,
                                            onBack = { userHubDest = UserHubDest.Profile },
                                            onSimulateEmergency = { buildingId, type ->
                                                userHubDest = null
                                                viewModel.triggerEmergencyAlert(
                                                    incidentType = type,
                                                    buildingId = buildingId,
                                                )
                                                if (currentBuildingId == null && buildingId.isNotBlank()) {
                                                    openIndoor(buildingId, resolveTotalFloors(buildingId))
                                                }
                                            },
                                        )
                                    }
                                    UserHubDest.Contributions -> ContributionsScreen(
                                        viewModel = userHub,
                                        onBack = { userHubDest = UserHubDest.Profile },
                                    )
                                    UserHubDest.Proposals -> ProposalsScreen(
                                        viewModel = userHub,
                                        onBack = { userHubDest = UserHubDest.Profile },
                                    )
                                    UserHubDest.Following -> FollowingScreen(
                                        viewModel = userHub,
                                        onBack = { userHubDest = UserHubDest.Profile },
                                        onOpenPlace = { placeId ->
                                            userHubDest = null
                                            pendingPlaceSlug = placeId
                                        },
                                    )
                                    UserHubDest.Creator -> CreatorHubScreen(
                                        viewModel = userHub,
                                        onBack = { userHubDest = UserHubDest.Profile },
                                    )
                                    UserHubDest.Offline -> {
                                        val buildings = (viewModel.buildingListState.value as? BuildingListUiState.Success)
                                            ?.buildings
                                            .orEmpty()
                                            .map { it.id to it.name }
                                        OfflineManagerScreen(
                                            viewModel = userHub,
                                            buildingsForOffline = buildings,
                                            onBack = { userHubDest = UserHubDest.Profile },
                                        )
                                    }
                                    UserHubDest.ErrorCenter -> ErrorCenterScreen(
                                        onBack = { userHubDest = UserHubDest.Profile },
                                    )
                                    null -> Unit
                                }
                            }
                            currentBuildingId == null -> {
                                BuildingListScreen(
                                    viewModel = viewModel,
                                    onBuildingClick = { id ->
                                        openIndoor(id, resolveTotalFloors(id))
                                    },
                                    onTestPDR = { showPDRTest = true },
                                    isLoggedIn = isLoggedIn,
                                    accountLabel = accountLabel,
                                    avatarUrl = avatarUrl,
                                    onLoginClick = { showLogin = true },
                                    onLogoutClick = { logoutToLogin() },
                                    onOpenProfile = {
                                        if (isLoggedIn) userHubDest = UserHubDest.Profile
                                        else showLogin = true
                                    },
                                    pendingPlaceSlug = pendingPlaceSlug,
                                    pendingFloor = pendingFloor,
                                    onPendingPlaceConsumed = {
                                        pendingPlaceSlug = null
                                        pendingFloor = null
                                    },
                                    onDeepLinkEnterIndoor = { id, floor ->
                                        openIndoor(id, resolveTotalFloors(id), floor)
                                    },
                                    onIndoorSearchEnter = { id, floor, poiId, totalFloors ->
                                        openIndoor(
                                            buildingId = id,
                                            totalFloors = totalFloors,
                                            preferredFloor = floor,
                                            focusPoiId = poiId,
                                        )
                                    },
                                )
                            }
                            else -> {
                                val indoorBuildingId = currentBuildingId
                                if (indoorBuildingId != null) {
                                MapScreen(
                                    buildingId = indoorBuildingId,
                                    viewModel = viewModel,
                                    suppressEmptyState = isScanningQR || awaitingQrLocalization || isResolvingQr,
                                    onBack = {
                                        currentBuildingId = null
                                        isScanningQR = false
                                        awaitingQrLocalization = false
                                        viewModel.exitIndoorNavigation()
                                    },
                                    onScanQR = { isScanningQR = true }
                                )
                                if (isScanningQR) {
                                    QRScanScreen(
                                        onResult = { qrId ->
                                            awaitingQrLocalization = true
                                            viewModel.startNavigation(qrId)
                                        },
                                        onBack = {
                                            isScanningQR = false
                                            awaitingQrLocalization = false
                                            viewModel.clearQrError()
                                        },
                                        isProcessing = isResolvingQr || awaitingQrLocalization,
                                        errorMessage = qrError,
                                    )
                                }
                                }
                            }
                        }

                        // Dialog geofence — chỉ sau Login/Guest; không che Login / QR / khẩn cấp
                        if (detectedBuilding != null &&
                            !isScanningQR &&
                            !showLogin &&
                            !emergencySession.active &&
                            indoorEntry !is IndoorEntryUiState.Entering &&
                            indoorEntry !is IndoorEntryUiState.Failed
                        ) {
                            AlertDialog(
                                onDismissRequest = { viewModel.dismissGeofence() },
                                title = {
                                    Text(
                                        text = "📍 Phát hiện tòa nhà",
                                        style = androidx.compose.ui.text.TextStyle(
                                            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                                            fontSize = 20.sp,
                                            color = androidx.compose.ui.graphics.Color.White
                                        )
                                    )
                                },
                                text = {
                                    Text(
                                        text = "Bạn đang ở gần \"${detectedBuilding!!.name}\". Quét mã QR trong tòa để xác định vị trí và bắt đầu chỉ đường.",
                                        fontSize = 15.sp,
                                        color = androidx.compose.ui.graphics.Color.LightGray
                                    )
                                },
                                confirmButton = {
                                    Button(
                                        onClick = {
                                            val building = detectedBuilding ?: return@Button
                                            viewModel.dismissGeofence()
                                            openIndoor(building.id, building.totalFloors.coerceAtLeast(1))
                                            isScanningQR = true
                                        },
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = androidx.compose.ui.graphics.Color(0xFF1A73E8)
                                        )
                                    ) {
                                        Text(
                                            "Quét QR",
                                            color = androidx.compose.ui.graphics.Color.Black,
                                            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                                        )
                                    }
                                },
                                dismissButton = {
                                    TextButton(
                                        onClick = {
                                            val building = detectedBuilding
                                            viewModel.dismissGeofence()
                                            if (building != null) {
                                                openIndoor(building.id, building.totalFloors.coerceAtLeast(1))
                                            }
                                        }
                                    ) {
                                        Text("Vào map trước", color = androidx.compose.ui.graphics.Color.Gray)
                                    }
                                },
                                shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
                                containerColor = androidx.compose.ui.graphics.Color(0xFF1E1E2C)
                            )
                        }
                        ErrorBannerHost(
                            modifier = Modifier.align(androidx.compose.ui.Alignment.BottomCenter),
                            onAction = { label ->
                                when (label) {
                                    "Đề xuất địa điểm / trong nhà",
                                    "Suggest place / indoor",
                                    -> userHubDest = UserHubDest.Proposals
                                    "Quét lại", "Rescan" -> isScanningQR = true
                                    else -> Unit
                                }
                            },
                        )

                        // Đã Đóng cảnh báo nhưng sự cố vẫn ACTIVE → banner mở lại chỉ đường thoát hiểm
                        val resumeEmergency = buildingActiveEmergency
                        if (!emergencySession.active &&
                            resumeEmergency != null &&
                            !currentBuildingId.isNullOrBlank() &&
                            (resumeEmergency.buildingId.isBlank() ||
                                resumeEmergency.buildingId == currentBuildingId)
                        ) {
                            Column(
                                modifier = Modifier
                                    .align(Alignment.TopCenter)
                                    .padding(top = 12.dp, start = 12.dp, end = 12.dp)
                                    .background(
                                        Color(0xCC7F1D1D),
                                        RoundedCornerShape(12.dp),
                                    )
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                            ) {
                                Text(
                                    text = "Sự cố vẫn đang diễn ra · ${
                                        resumeEmergency.title.ifBlank {
                                            com.khoaluan.indoornav.navigation.emergency.EmergencySession
                                                .headlineForType(resumeEmergency.incidentType)
                                        }
                                    }",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                )
                                Text(
                                    text = "Bạn đã đóng cảnh báo. Có thể bật lại chỉ đường thoát hiểm bất cứ lúc nào.",
                                    color = Color(0xFFFECACA),
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                                Button(
                                    onClick = {
                                        viewModel.resumeEmergencyGuidance()
                                        beginEmergencyEvacuationFlow()
                                    },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 8.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = Color(0xFFFBBF24),
                                        contentColor = Color(0xFF1C1917),
                                    ),
                                    shape = RoundedCornerShape(10.dp),
                                ) {
                                    Text(
                                        "Chỉ đường thoát hiểm",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                    )
                                }
                            }
                        }

                        if (emergencySession.active && emergencySession.phase == EmergencyPhase.ALERT) {
                            EmergencyTakeoverOverlay(
                                session = emergencySession,
                                onStartEvacuation = { beginEmergencyEvacuationFlow() },
                                onDismiss = { viewModel.dismissEmergency() },
                                onSwitchToExitFloor = { viewModel.switchEmergencyToExitFloor() },
                            )
                        } else if (emergencySession.active &&
                            emergencySession.phase == EmergencyPhase.AWAITING_FLOOR
                        ) {
                            val bid = emergencySession.buildingId ?: currentBuildingId
                            val floors = bid?.let {
                                maxOf(
                                    resolveTotalFloors(it),
                                    viewModel.getTotalFloorsForBuilding(it),
                                )
                            } ?: 1
                            val curFloor = (mapUi as? com.khoaluan.indoornav.ui.viewmodel.MapUiState.Success)
                                ?.floorNumber
                            // Prefetch để sheet có đủ tầng (không chỉ totalFloors=1)
                            LaunchedEffect(bid) {
                                if (!bid.isNullOrBlank()) {
                                    viewModel.prefetchFloorsForEmergencyUi(bid)
                                }
                            }
                            EmergencyFloorPickOverlay(
                                session = emergencySession,
                                currentFloor = curFloor,
                                totalFloors = floors,
                                onFloorSelected = { floor ->
                                    viewModel.confirmEmergencyFloor(floor)
                                    Toast.makeText(
                                        context,
                                        "Đang mở tầng ${if (floor == 0) "GF" else floor} — chạm map chọn vị trí",
                                        Toast.LENGTH_SHORT,
                                    ).show()
                                },
                                onDismiss = { viewModel.dismissEmergency() },
                            )
                        } else if (emergencySession.active &&
                            emergencySession.phase == EmergencyPhase.AWAITING_LOCATION
                        ) {
                            Column(
                                modifier = Modifier
                                    .align(Alignment.TopCenter)
                                    .padding(top = 12.dp, start = 12.dp, end = 12.dp)
                                    .background(
                                        Color(0xCC7F1D1D),
                                        RoundedCornerShape(12.dp),
                                    )
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                            ) {
                                Text(
                                    text = "KHẨN CẤP · Chọn vị trí đang đứng",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                )
                                Text(
                                    text = emergencySession.error
                                        ?: "Chạm một điểm trên bản đồ (hoặc quét QR). Hệ thống sẽ chỉ đường ra lối thoát hiểm gần nhất.",
                                    color = Color(0xFFFECACA),
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(top = 4.dp),
                                )
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(top = 4.dp),
                                ) {
                                    if (emergencySession.suggestedExitFloor != null) {
                                        TextButton(onClick = { viewModel.switchEmergencyToExitFloor() }) {
                                            val fl = emergencySession.suggestedExitFloor!!
                                            Text(
                                                "Xuống tầng ${if (fl == 0) "GF" else fl}",
                                                color = Color(0xFFFBBF24),
                                                fontSize = 12.sp,
                                            )
                                        }
                                    }
                                    TextButton(onClick = { isScanningQR = true }) {
                                        Text("Quét QR", color = Color(0xFFFBBF24), fontSize = 12.sp)
                                    }
                                    TextButton(onClick = { viewModel.dismissEmergency() }) {
                                        Text("Đóng", color = Color(0xFFFECACA), fontSize = 12.sp)
                                    }
                                }
                            }
                        } else if (emergencySession.active &&
                            emergencySession.phase == EmergencyPhase.EVACUATING
                        ) {
                            Column(
                                modifier = Modifier
                                    .align(Alignment.TopCenter)
                                    .padding(top = 12.dp, start = 12.dp, end = 12.dp)
                                    .background(
                                        Color(0xCC7F1D1D),
                                        RoundedCornerShape(12.dp),
                                    )
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = "KHẨN CẤP · ${emergencySession.targetLabel ?: "Chỉ đường thoát hiểm"}",
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        modifier = Modifier.weight(1f),
                                    )
                                    TextButton(onClick = { viewModel.dismissEmergency() }) {
                                        Text("Đóng", color = Color(0xFFFECACA), fontSize = 12.sp)
                                    }
                                }
                                if (emergencySession.suggestedExitFloor != null) {
                                    val fl = emergencySession.suggestedExitFloor!!
                                    val flLabel = if (fl == 0) "GF" else "$fl"
                                    TextButton(
                                        onClick = { viewModel.switchEmergencyToExitFloor() },
                                        modifier = Modifier.padding(top = 2.dp),
                                    ) {
                                        Text(
                                            "Xuống tầng lối thoát ($flLabel)",
                                            color = Color(0xFFFBBF24),
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 13.sp,
                                        )
                                    }
                                }
                            }
                        }
                    } // Box
                } // Surface
            } // IndoorNavigationAppTheme
            } // CompositionLocalProvider
        } // setContent
    } // onCreate

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        applyIntentExtras(intent)
    }
}
