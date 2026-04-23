package com.khoaluan.indoornav.ui.screens

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.navigation.NavigationLogger
import com.khoaluan.indoornav.navigation.pdr.SensorCollector
import com.khoaluan.indoornav.navigation.pdr.StepDetector
import com.khoaluan.indoornav.navigation.pdr.HeadingEstimator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlin.math.*

/**
 * FILE: PDRTestScreen.kt
 * MỤC ĐÍCH: Màn hình hiệu chuẩn PDR — Canvas trắng + vết đường đi + Debug HUD
 *
 * KHÔNG cần bản đồ, không cần server.
 * Chỉ cần điện thoại thật + không gian di chuyển.
 *
 * CÁCH DÙNG:
 *   1. Bật màn hình → chấm xanh xuất hiện ở giữa
 *   2. Cầm điện thoại ngang ngực → đi bộ tự nhiên
 *   3. Quan sát vết đường đi + Debug HUD
 *   4. Điều chỉnh K và Threshold theo kết quả
 *   5. Bấm "Export Log" để lưu CSV phân tích sau
 *
 * SCALE: 1 mét = PIXELS_PER_METER pixel trên màn hình test
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PDRTestScreen(onBack: () -> Unit) {

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // ── Vị trí & Trail ────────────────────────────────────────────────────────
    var posX by remember { mutableFloatStateOf(-1f) }
    var posY by remember { mutableFloatStateOf(-1f) }
    val trail = remember { mutableStateListOf<Offset>() }
    var startPos by remember { mutableStateOf(Offset.Zero) }
    var isInitialized by remember { mutableStateOf(false) }

    // ── Thống kê Debug HUD ────────────────────────────────────────────────────
    var totalSteps by remember { mutableIntStateOf(0) }
    var totalDistM by remember { mutableFloatStateOf(0f) }
    var currentHeading by remember { mutableFloatStateOf(0f) }
    var lastStepLen by remember { mutableFloatStateOf(0f) }
    var accelMag by remember { mutableFloatStateOf(9.81f) }
    var exportMessage by remember { mutableStateOf("") }
    
    // ── Viewport transform (Pan + Zoom + Rotate) ────────────────────────────
    var panOffset by remember { mutableStateOf(Offset.Zero) }
    var zoomScale by remember { mutableFloatStateOf(1f) }
    var mapRotationDeg by remember { mutableFloatStateOf(0f) }

    // ── Navigation modules ────────────────────────────────────────────────────
    val sensorCollector = remember { SensorCollector(context) }
    val stepDetector = remember { StepDetector() }
    val headingEstimator = remember { HeadingEstimator() }

    // Scale: 1 mét = pixel
    val SCALE = 80f

    // ── Khởi tạo cảm biến ────────────────────────────────────────────────────
    LaunchedEffect(Unit) {
        NavigationLogger.clear()
        var hasRotationVectorFix = false

        // Callback: mỗi bước chân
        stepDetector.onStepDetected = { stepLen ->
            val headingRad = headingEstimator.getHeadingRad()
            val dx = stepLen * sin(headingRad) * SCALE
            val dy = -stepLen * cos(headingRad) * SCALE  // Canvas Y tăng xuống → đảo
            posX += dx
            posY += dy
            trail.add(Offset(posX, posY))
            totalSteps++
            totalDistM += stepLen
            lastStepLen = stepLen
        }

        // Callback: Accelerometer
        sensorCollector.onAccelUpdate = { values, timestampNs ->
            stepDetector.onAccelData(values[0], values[1], values[2])
            accelMag = sqrt(values[0].pow(2) + values[1].pow(2) + values[2].pow(2))
        }

        // Callback: Rotation Vector (La bàn siêu mượt của Google)
        // Hệ thống này lấy hướng tuyệt đối (Bắc thực tế) và chống nhiễu loạn cực tốt
        sensorCollector.onRotationUpdate = { values, timestampNs ->
            hasRotationVectorFix = true
            headingEstimator.updateRotationVector(values, timestampNs)
            currentHeading = headingEstimator.getHeading()
        }
        
        // Callback: Hardware Step Sensor (Cảm biến đếm bước chuyên dụng)
        sensorCollector.onStepSensorUpdate = {
            stepDetector.onHardwareStep()
        }

        // Callback: Gyroscope
        sensorCollector.onGyroUpdate = { values, timestampNs ->
            // Tránh double-update: khi đã có Rotation Vector thì gyro chỉ làm fallback.
            if (!hasRotationVectorFix) {
                headingEstimator.updateGyro(values, timestampNs)
            }
            currentHeading = headingEstimator.getHeading()
        }

        sensorCollector.start()
    }

    DisposableEffect(Unit) {
        onDispose { sensorCollector.stop() }
    }

    // ── UI ────────────────────────────────────────────────────────────────────
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0A0A1A))
    ) {

        // TopBar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF12122A))
                .padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = onBack) {
                Text("← Back", color = Color(0xFF00E5FF), fontSize = 14.sp)
            }
            Spacer(Modifier.weight(1f))
            Text(
                "PDR Calibration Test",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp
            )
            Spacer(Modifier.weight(1f))
            Text(
                "Events: ${NavigationLogger.getCount()}",
                color = Color.Gray,
                fontSize = 11.sp
            )
        }

        // ── Canvas vẽ trail ──────────────────────────────────────────────────
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(Color(0xFF111122))
                .pointerInput(Unit) {
                    detectTransformGestures { centroid, pan, zoom, rotation ->
                        val oldScale = zoomScale
                        val newScale = (zoomScale * zoom).coerceIn(0.2f, 8f)
                        val oldRotation = mapRotationDeg
                        val newRotation = normalizeAngleDeg(oldRotation + rotation)

                        val vOld = centroid - panOffset
                        val mapVector = rotateVector(vOld, -oldRotation) * (newScale / oldScale)
                        val screenVectorNew = rotateVector(mapVector, newRotation)

                        panOffset = centroid + pan - screenVectorNew
                        zoomScale = newScale
                        mapRotationDeg = newRotation
                    }
                }
        ) {
            val screenW = constraints.maxWidth.toFloat()
            val screenH = constraints.maxHeight.toFloat()

            // Khởi tạo vị trí bắt đầu ở giữa màn hình
            LaunchedEffect(screenW, screenH) {
                if (!isInitialized && screenW > 0 && screenH > 0) {
                    posX = screenW / 2f
                    posY = screenH / 2f
                    startPos = Offset(posX, posY)
                    trail.add(startPos)
                    isInitialized = true
                }
            }

            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        scaleX = zoomScale
                        scaleY = zoomScale
                        rotationZ = mapRotationDeg
                        translationX = panOffset.x
                        translationY = panOffset.y
                        transformOrigin = TransformOrigin(0f, 0f)
                    }
            ) {
                // Lưới tham chiếu (vẽ rộng ra để khi pan/zoom/rotate không bị hụt)
                val gridColor = Color.White.copy(alpha = 0.04f)
                val gridRange = 3000f // Vẽ lưới trong vùng cực rộng
                var gx = -gridRange
                while (gx < gridRange) {
                    drawLine(gridColor, Offset(gx, -gridRange), Offset(gx, gridRange))
                    gx += SCALE
                }
                var gy = -gridRange
                while (gy < gridRange) {
                    drawLine(gridColor, Offset(-gridRange, gy), Offset(gridRange, gy))
                    gy += SCALE
                }

                // Điểm gốc (hình tròn màu xanh lá)
                drawCircle(Color(0xFF4CAF50).copy(alpha = 0.5f), 14f, startPos)
                drawCircle(Color(0xFF4CAF50), 6f, startPos)

                // Khoảng cách drift (đường đứt nét từ gốc đến vị trí hiện tại)
                if (trail.size > 1) {
                    val current = Offset(posX, posY)
                    drawLine(
                        Color.Yellow.copy(alpha = 0.2f),
                        startPos, current, 1.5f,
                        pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(
                            floatArrayOf(
                                10f,
                                10f
                            )
                        )
                    )
                }

                // Vết đường đi
                if (trail.size > 1) {
                    for (i in 1 until trail.size) {
                        val t = i.toFloat() / trail.size
                        drawLine(
                            color = Color(0xFF00E5FF).copy(alpha = 0.4f + 0.5f * t),
                            start = trail[i - 1],
                            end = trail[i],
                            strokeWidth = 3f
                        )
                    }
                }

                // Chấm xanh — vị trí hiện tại
                val current = Offset(posX, posY)
                drawCircle(Color(0xFF00E5FF).copy(alpha = 0.25f), 22f, current)
                drawCircle(Color(0xFF00E5FF), 10f, current)
                drawCircle(Color.White, 10f, current, style = Stroke(2f))

                // Mũi tên Heading
                val headRad = Math.toRadians(currentHeading.toDouble()).toFloat()
                val arrowLen = 36f
                val tip = Offset(
                    current.x + arrowLen * sin(headRad),
                    current.y - arrowLen * cos(headRad)
                )
                drawLine(Color(0xFFFFEB3B), current, tip, 3f)
                // Đầu mũi tên
                val perpLen = 8f
                val perpX = cos(headRad) * perpLen
                val perpY = sin(headRad) * perpLen
                drawLine(
                    Color(0xFFFFEB3B),
                    tip,
                    Offset(tip.x - 8 * sin(headRad) + perpX, tip.y + 8 * cos(headRad) + perpY),
                    2f
                )
                drawLine(
                    Color(0xFFFFEB3B),
                    tip,
                    Offset(tip.x - 8 * sin(headRad) - perpX, tip.y + 8 * cos(headRad) - perpY),
                    2f
                )
            }
        }

        // ── Debug HUD ────────────────────────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF0D0D20))
                .padding(horizontal = 16.dp, vertical = 10.dp)
        ) {
            // Dòng thống kê
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                HudStat("STEPS", "$totalSteps")
                HudStat("DIST", "${"%.2f".format(totalDistM)}m")
                HudStat("STEP LEN", "${"%.3f".format(lastStepLen)}m")
                HudStat("HEAD", "${"%.0f".format(currentHeading)}°")
            }

            Spacer(Modifier.height(6.dp))

            // Accel bar
            HudRow("Accel magnitude", "${"%.2f".format(accelMag)} m/s²",
                if (accelMag > 11f) Color(0xFFFF5722) else Color(0xFF00E5FF))
            HudRow("Log events", "${NavigationLogger.getCount()}", Color.Gray)

            if (exportMessage.isNotEmpty()) {
                Text(exportMessage, color = Color(0xFF4CAF50), fontSize = 10.sp,
                    modifier = Modifier.padding(top = 2.dp))
            }

            Spacer(Modifier.height(8.dp))

            // Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = {
                        trail.clear()
                        totalSteps = 0
                        totalDistM = 0f
                        lastStepLen = 0f
                        isInitialized = false
                        panOffset = Offset.Zero
                        zoomScale = 1f
                        mapRotationDeg = 0f
                        exportMessage = ""
                        NavigationLogger.clear()
                        stepDetector.reset()
                        headingEstimator.reset()
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E1E3A))
                ) {
                    Text("🔄 Reset", fontSize = 13.sp)
                }

                Button(
                    onClick = {
                        scope.launch(Dispatchers.IO) {
                            val path = NavigationLogger.exportToFile(context)
                            exportMessage = "Saved: .../${path.substringAfterLast("/")}"
                        }
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1B5E20))
                ) {
                    Text("💾 Export Log", fontSize = 13.sp)
                }

                Button(
                    onClick = {
                        panOffset = Offset.Zero
                        zoomScale = 1f
                        mapRotationDeg = 0f
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0D47A1))
                ) {
                    Text("🧭 Reset View", fontSize = 13.sp)
                }
            }

            Spacer(Modifier.height(4.dp))
        }
    }
}

@Composable
private fun HudStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = Color(0xFF00E5FF), fontSize = 18.sp,
            fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
        Text(label, color = Color.Gray, fontSize = 9.sp, fontFamily = FontFamily.Monospace)
    }
}

@Composable
private fun HudRow(label: String, value: String, valueColor: Color = Color(0xFF00E5FF)) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 1.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = Color.Gray, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
        Text(value, color = valueColor, fontSize = 11.sp,
            fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
    }
}

private fun rotateVector(v: Offset, degrees: Float): Offset {
    val rad = Math.toRadians(degrees.toDouble()).toFloat()
    val c = cos(rad)
    val s = sin(rad)
    return Offset(
        x = v.x * c - v.y * s,
        y = v.x * s + v.y * c
    )
}

private fun normalizeAngleDeg(angle: Float): Float {
    var r = angle % 360f
    if (r > 180f) r -= 360f
    if (r < -180f) r += 360f
    return r
}
