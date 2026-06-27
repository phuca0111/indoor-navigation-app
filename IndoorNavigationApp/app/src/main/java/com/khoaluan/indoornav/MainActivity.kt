package com.khoaluan.indoornav

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Surface
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.khoaluan.indoornav.ui.screens.BuildingListScreen
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
                var currentBuildingId by remember { mutableStateOf<String?>(null) }
                var showPDRTest by remember { mutableStateOf(false) }
                var isScanningQR by remember { mutableStateOf(false) }

                // Bộ yêu cầu cấp quyền định vị vị trí tại thời điểm chạy ứng dụng (Runtime Permissions)
                val locationPermissionsLauncher = rememberLauncherForActivityResult(
                    contract = ActivityResultContracts.RequestMultiplePermissions()
                ) { permissions ->
                    val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
                    val coarseLocationGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false
                    if (fineLocationGranted || coarseLocationGranted) {
                        viewModel.fetchBuildings() // Refresh lại danh sách và bắt đầu geofencing
                    }
                }

                LaunchedEffect(Unit) {
                    locationPermissionsLauncher.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        )
                    )
                }

                // Lắng nghe tòa nhà được phát hiện qua GPS Geofencing ngoài trời
                val detectedBuilding by viewModel.detectedBuilding.collectAsState()

                Surface(modifier = androidx.compose.ui.Modifier.fillMaxSize().systemBarsPadding()) {
                    Box(modifier = androidx.compose.ui.Modifier.fillMaxSize()) {
                        when {
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
                            isScanningQR -> {
                                QRScanScreen(
                                    onResult = { qrId ->
                                        viewModel.startNavigation(qrId)
                                        isScanningQR = false
                                    },
                                    onBack = { isScanningQR = false }
                                )
                            }
                            else -> {
                                MapScreen(
                                    buildingId = currentBuildingId!!,
                                    viewModel = viewModel,
                                    onBack = { 
                                        currentBuildingId = null
                                        viewModel.exitIndoorNavigation() // Bật lại định vị GPS ngoài trời
                                    },
                                    onScanQR = { isScanningQR = true }
                                )
                            }
                        }

                        // Dialog GPS Geofence hiển thị đè đắt giá (Sleek Glassmorphism Design)
                        if (detectedBuilding != null) {
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
                                        text = "Hệ thống nhận diện bạn đang ở gần \"${detectedBuilding!!.name}\". Bạn có muốn tải bản đồ và chuyển sang chế độ dẫn đường trong nhà ngay bây giờ?",
                                        fontSize = 15.sp,
                                        color = androidx.compose.ui.graphics.Color.LightGray
                                    )
                                },
                                confirmButton = {
                                    Button(
                                        onClick = {
                                            currentBuildingId = detectedBuilding!!.id
                                            viewModel.dismissGeofence()
                                        },
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = androidx.compose.ui.graphics.Color(0xFF00E5FF)
                                        )
                                    ) {
                                        Text("Bắt đầu", color = androidx.compose.ui.graphics.Color.Black, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                                    }
                                },
                                dismissButton = {
                                    TextButton(
                                        onClick = { viewModel.dismissGeofence() }
                                    ) {
                                        Text("Để sau", color = androidx.compose.ui.graphics.Color.Gray)
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