package com.khoaluan.indoornav

import android.Manifest
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Surface
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.khoaluan.indoornav.data.local.SessionManager
import com.khoaluan.indoornav.deeplink.extractPlaceDeepLink
import com.khoaluan.indoornav.ui.components.ErrorBannerHost
import com.khoaluan.indoornav.ui.components.IndoorTransitionOverlay
import com.khoaluan.indoornav.ui.screens.BuildingListScreen
import com.khoaluan.indoornav.ui.screens.LoginScreen
import com.khoaluan.indoornav.ui.screens.MapScreen
import com.khoaluan.indoornav.ui.screens.PDRTestScreen
import com.khoaluan.indoornav.ui.screens.QRScanScreen
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
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.platform.LocalContext
import android.widget.Toast

private fun extractPendingDeepLink(intent: Intent?) =
    extractPlaceDeepLink(intent)

class MainActivity : ComponentActivity() {
    private var pendingPlaceSlug by mutableStateOf<String?>(null)
    private var pendingFloor by mutableStateOf<Int?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val link = extractPendingDeepLink(intent)
        pendingPlaceSlug = link?.placeSlugOrId
        pendingFloor = link?.floor
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
                val sessionManager = remember {
                    SessionManager(this@MainActivity).also { it.bindToHttpClient() }
                }
                var showLogin by remember { mutableStateOf(!sessionManager.isLoggedIn) }
                var isLoggedIn by remember { mutableStateOf(sessionManager.isLoggedIn) }
                var accountLabel by remember {
                    mutableStateOf(sessionManager.displayName ?: sessionManager.email)
                }
                var userHubDest by remember { mutableStateOf<UserHubDest?>(null) }
                val userNotice by userHub.notice.collectAsState()
                val context = LocalContext.current
                LaunchedEffect(userNotice) {
                    val msg = userNotice ?: return@LaunchedEffect
                    Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                    userHub.clearNotice()
                }
                LaunchedEffect(isLoggedIn) {
                    if (isLoggedIn) userHub.flushSyncQueue()
                }
                val authRequired by viewModel.authRequired.collectAsState()
                LaunchedEffect(authRequired) {
                    if (!authRequired) return@LaunchedEffect
                    viewModel.consumeAuthRequired()
                    isLoggedIn = false
                    accountLabel = null
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
                            showLogin = true
                        } else {
                            val name = res.body()?.user?.fullName
                            if (!name.isNullOrBlank()) {
                                sessionManager.displayName = name
                                accountLabel = name
                            }
                            isLoggedIn = true
                            viewModel.refreshFollowingPlaces()
                        }
                    } catch (_: Exception) {
                        // Mất mạng: giữ session local, favorite sẽ tự báo nếu 401
                    }
                }
                val indoorEntry by viewModel.indoorEntryState.collectAsState()
                var currentBuildingId by remember { mutableStateOf<String?>(null) }
                val mapUi by viewModel.uiState.collectAsState()
                LaunchedEffect(mapUi) {
                    val success = mapUi as? com.khoaluan.indoornav.ui.viewmodel.MapUiState.Success
                        ?: return@LaunchedEffect
                    if (currentBuildingId != null && currentBuildingId != success.buildingId) {
                        currentBuildingId = success.buildingId
                    }
                }
                var showPDRTest by remember { mutableStateOf(false) }
                var isScanningQR by remember { mutableStateOf(false) }

                fun openIndoor(buildingId: String, totalFloors: Int = 1, preferredFloor: Int? = null) {
                    if (buildingId.isBlank()) return
                    viewModel.enterIndoorSession(
                        buildingId = buildingId,
                        totalFloors = totalFloors.coerceAtLeast(1),
                        preferredFloor = preferredFloor,
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

                val locationPermissionsLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.RequestMultiplePermissions()
                ) { permissions ->
                    val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
                    val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false
                    if (fineLocationGranted || coarseLocationGranted) {
                        // Chỉ bật geofence sau khi đã qua màn Login
                        viewModel.fetchBuildings(enableGeofence = !showLogin)
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
                    viewModel.dismissGeofence()
                    // LaunchedEffect(showLogin) sẽ xin quyền + fetchBuildings
                }

                fun logoutToLogin() {
                    sessionManager.clear()
                    isLoggedIn = false
                    accountLabel = null
                    currentBuildingId = null
                    userHubDest = null
                    showLogin = true
                    viewModel.dismissGeofence()
                    viewModel.stopGpsGeofencing()
                }

                // Đang Login: tắt geofence. Đã vào app: xin GPS + tải danh sách tòa.
                LaunchedEffect(showLogin) {
                    if (showLogin) {
                        viewModel.dismissGeofence()
                        viewModel.stopGpsGeofencing()
                    } else {
                        locationPermissionsLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
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
                                )
                            }
                            else -> {
                                MapScreen(
                                    buildingId = currentBuildingId!!,
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

                        // Dialog geofence — chỉ sau Login/Guest, không che Login / camera QR
                        if (detectedBuilding != null &&
                            !isScanningQR &&
                            !showLogin &&
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
                    } // Box
                } // Surface
            } // IndoorNavigationAppTheme
            } // CompositionLocalProvider
        } // setContent
    } // onCreate

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val link = extractPendingDeepLink(intent)
        pendingPlaceSlug = link?.placeSlugOrId
        pendingFloor = link?.floor
    }
}
