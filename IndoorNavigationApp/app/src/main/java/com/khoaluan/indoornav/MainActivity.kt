package com.khoaluan.indoornav

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
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

                Surface(modifier = androidx.compose.ui.Modifier.fillMaxSize()) {
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
                                onBack = { currentBuildingId = null },
                                onScanQR = { isScanningQR = true }
                            )
                        }
                    }
                }
            }
        }
    }
}