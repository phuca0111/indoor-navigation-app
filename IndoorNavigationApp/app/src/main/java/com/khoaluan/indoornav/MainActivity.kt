package com.khoaluan.indoornav

import android.Manifest
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
import com.khoaluan.indoornav.ui.screens.BuildingListScreen
import com.khoaluan.indoornav.ui.screens.LoginScreen
import com.khoaluan.indoornav.ui.screens.MapScreen
import com.khoaluan.indoornav.ui.screens.PDRTestScreen
import com.khoaluan.indoornav.ui.screens.QRScanScreen
import com.khoaluan.indoornav.ui.theme.IndoorNavigationAppTheme
import com.khoaluan.indoornav.ui.viewmodel.MapViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            IndoorNavigationAppTheme {
                val viewModel: MapViewModel = viewModel()
                val sessionManager = remember { SessionManager(this@MainActivity) }
                var showLogin by remember { mutableStateOf(!sessionManager.isLoggedIn) }
                var currentBuildingId by remember { mutableStateOf<String?>(null) }
                var showPDRTest by remember { mutableStateOf(false) }
                var isScanningQR by remember { mutableStateOf(false) }

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

                fun enterAppAfterAuth() {
                    showLogin = false
                    viewModel.dismissGeofence()
                    // LaunchedEffect(showLogin) sẽ xin quyền + fetchBuildings
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
                            showLogin && currentBuildingId == null && !showPDRTest && !isScanningQR -> {
                                LoginScreen(
                                    sessionManager = sessionManager,
                                    onContinueGuest = { enterAppAfterAuth() },
                                    onLoggedIn = { enterAppAfterAuth() },
                                )
                            }
                            showPDRTest -> {
                                PDRTestScreen(onBack = { showPDRTest = false })
                            }
                            currentBuildingId == null -> {
                                BuildingListScreen(
                                    viewModel = viewModel,
                                    onBuildingClick = { id -> currentBuildingId = id },
                                    onTestPDR = { showPDRTest = true }
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
                        if (detectedBuilding != null && !isScanningQR && !showLogin) {
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
                                            currentBuildingId = building.id
                                            viewModel.dismissGeofence()
                                            viewModel.refreshMap(building.id, 0)
                                            isScanningQR = true
                                        },
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = androidx.compose.ui.graphics.Color(0xFF00E5FF)
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
                                            if (building != null) {
                                                currentBuildingId = building.id
                                            }
                                            viewModel.dismissGeofence()
                                        }
                                    ) {
                                        Text("Vào map trước", color = androidx.compose.ui.graphics.Color.Gray)
                                    }
                                },
                                shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
                                containerColor = androidx.compose.ui.graphics.Color(0xFF1E1E2C)
                            )
                        }
                    }
                }
            }
        }
    }
}
