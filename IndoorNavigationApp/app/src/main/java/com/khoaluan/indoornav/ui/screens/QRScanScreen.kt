@file:OptIn(androidx.camera.core.ExperimentalGetImage::class)

package com.khoaluan.indoornav.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.util.Log
import android.view.ViewGroup
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.delay
import java.util.concurrent.Executors
import java.util.concurrent.ExecutorService

/**
 * FILE: QRScanScreen.kt
 * MỤC ĐÍCH: Màn hình quét QR code để định vị điểm xuất phát.
 * Sử dụng CameraX + ML Kit Barcode Scanning.
 */
@OptIn(androidx.camera.core.ExperimentalGetImage::class)
@SuppressLint("UnsafeOptInUsageError")
@Composable
fun QRScanScreen(
    onResult: (String) -> Unit,
    onBack: () -> Unit,
    isProcessing: Boolean = false,
    errorMessage: String? = null,
) {
    val context = LocalContext.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    var hasHandledResult by remember { mutableStateOf(false) }

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { granted -> hasCameraPermission = granted }
    )

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            launcher.launch(Manifest.permission.CAMERA)
        }
    }

    // Chỉ cho quét lại SAU lỗi + cooldown — tránh loop nhấp nháy khi QR còn trong khung
    LaunchedEffect(errorMessage) {
        if (errorMessage != null) {
            delay(2_000)
            hasHandledResult = false
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        if (hasCameraPermission) {
            CameraPreview(
                modifier = Modifier.fillMaxSize(),
                cameraExecutor = cameraExecutor,
                onBarcodeDetected = { barcode ->
                    if (hasHandledResult || isProcessing) return@CameraPreview
                    barcode.rawValue?.let {
                        hasHandledResult = true
                        onResult(it)
                    }
                }
            )

            QRScannerOverlay()

            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 60.dp)
                    .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("Quét mã QR trên tường", color = Color.White, fontSize = 16.sp)
                Text("Để xác định vị trí hiện tại của bạn", color = Color.Gray, fontSize = 12.sp)
                if (!errorMessage.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = errorMessage,
                        color = Color(0xFFFF8A80),
                        fontSize = 13.sp
                    )
                    Text(
                        text = "Giữ QR trong khung — sẽ thử lại sau 2 giây",
                        color = Color.Gray,
                        fontSize = 11.sp
                    )
                }
            }
        } else {
            Text(
                "Cần quyền Camera để quét mã QR",
                color = Color.White,
                modifier = Modifier.align(Alignment.Center)
            )
        }

        if (isProcessing) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.55f)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color(0xFF00E5FF))
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Đang xác định vị trí…", color = Color.White, fontSize = 14.sp)
                }
            }
        }

        IconButton(
            onClick = onBack,
            modifier = Modifier.align(Alignment.TopStart).padding(top = 40.dp, start = 16.dp)
        ) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
        }
    }

    DisposableEffect(Unit) {
        onDispose { cameraExecutor.shutdown() }
    }
}

@Composable
fun CameraPreview(
    modifier: Modifier,
    cameraExecutor: ExecutorService,
    onBarcodeDetected: (Barcode) -> Unit
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val scanner = remember { BarcodeScanning.getClient() }

    DisposableEffect(Unit) {
        onDispose { scanner.close() }
    }

    AndroidView(
        factory = { ctx ->
            val previewView = PreviewView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            }

            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
            cameraProviderFuture.addListener({
                val cameraProvider = cameraProviderFuture.get()

                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()

                imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
                    val mediaImage = imageProxy.image
                    if (mediaImage != null) {
                        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                        scanner.process(image)
                            .addOnSuccessListener { barcodes ->
                                if (barcodes.isNotEmpty()) {
                                    onBarcodeDetected(barcodes[0])
                                }
                            }
                            .addOnFailureListener { Log.e("QRScan", "Lỗi quét: ${it.message}") }
                            .addOnCompleteListener { imageProxy.close() }
                    } else {
                        imageProxy.close()
                    }
                }

                try {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        imageAnalysis
                    )
                } catch (e: Exception) {
                    Log.e("QRScan", "Binding camera thất bại", e)
                }
            }, ContextCompat.getMainExecutor(ctx))

            previewView
        },
        modifier = modifier
    )
}

@Composable
fun QRScannerOverlay() {
    Canvas(modifier = Modifier.fillMaxSize()) {
        val width = size.width
        val height = size.height
        val boxSize = 250.dp.toPx()
        val left = (width - boxSize) / 2
        val top = (height - boxSize) / 2

        drawRect(
            color = Color(0xFF00E5FF),
            topLeft = androidx.compose.ui.geometry.Offset(left, top),
            size = androidx.compose.ui.geometry.Size(boxSize, boxSize),
            style = Stroke(width = 4.dp.toPx())
        )

        val cornerLen = 40.dp.toPx()
        val neonColor = Color(0xFF00E5FF)
        drawLine(neonColor, Offset(left - 2, top - 2), Offset(left + cornerLen, top - 2), 8f)
        drawLine(neonColor, Offset(left - 2, top - 2), Offset(left - 2, top + cornerLen), 8f)
    }
}
