package com.khoaluan.indoornav.ui.screens

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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.navigation.NavigationLogger
import com.khoaluan.indoornav.navigation.pdr.RuntimePdrTestController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlin.math.*

/**
 * FILE: PDRTestScreen.kt
 * MỤC ĐÍCH: Màn hình hiệu chuẩn PDR — Canvas trắng + vết đường đi + Debug HUD
 *
 * PHIÊN BẢN MỚI (REFACTORED):
 * KHÔNG tự khởi tạo thuật toán PDR.
 * Chỉ lấy dữ liệu qua RuntimePdrTestController để đảm bảo test đúng pipeline production.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PDRTestScreen(onBack: () -> Unit) {

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // ── Giao tiếp với Runtime Pipeline ─────────────────────────────────────────
    val controller = remember { RuntimePdrTestController(context) }
    val testState by controller.testState.collectAsState()

    // ── Vị trí & Trail ────────────────────────────────────────────────────────
    val trail = remember { mutableStateListOf<Offset>() }
    var startPos by remember { mutableStateOf(Offset.Zero) }
    var isInitialized by remember { mutableStateOf(false) }

    // ── Viewport transform (Pan + Zoom + Rotate) ────────────────────────────
    var panOffset by remember { mutableStateOf(Offset.Zero) }
    var zoomScale by remember { mutableFloatStateOf(1f) }
    var mapRotationDeg by remember { mutableFloatStateOf(0f) }
    
    var exportMessage by remember { mutableStateOf("") }

    // Scale: 1 mét = pixel. RuntimePdrTestController fallback dùng MapData() rỗng
    // có scaleRatio = 0.5 -> pixelsPerMeter = 40.0 / 0.5 = 80f. Khớp với màn Test cũ.
    val SCALE = 80f

    // ── Khởi tạo cảm biến ────────────────────────────────────────────────────
    LaunchedEffect(Unit) {
        NavigationLogger.clear()
        controller.start()
    }

    DisposableEffect(Unit) {
        onDispose { controller.stop() }
    }

    // ── Cập nhật Trail liên tục ─────────────────────────────────────────────
    LaunchedEffect(testState.x, testState.y) {
        if (isInitialized) {
            val currentPt = startPos + Offset(testState.x, testState.y)
            val lastPt = trail.lastOrNull()
            // Chỉ thêm điểm mới nếu khoảng cách > 1 pixel (tránh rác bộ nhớ)
            if (lastPt == null || (currentPt - lastPt).getDistanceSquared() > 1f) {
                trail.add(currentPt)
            }
        }
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
                    startPos = Offset(screenW / 2f, screenH / 2f)
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
                val current = startPos + Offset(testState.x, testState.y)
                
                // Khoảng cách drift (đường đứt nét từ gốc đến vị trí hiện tại)
                if (trail.size > 1) {
                    drawLine(
                        Color.Yellow.copy(alpha = 0.2f),
                        startPos, current, 1.5f,
                        pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(
                            floatArrayOf(10f, 10f)
                        )
                    )
                }
                
                drawCircle(Color(0xFF00E5FF).copy(alpha = 0.25f), 22f, current)
                drawCircle(Color(0xFF00E5FF), 10f, current)
                drawCircle(Color.White, 10f, current, style = Stroke(2f))

                // Mũi tên heading — tam giác đối xứng, không dùng 3 drawLine
                withTransform({
                    translate(current.x, current.y)
                    rotate(testState.heading, pivot = Offset.Zero)
                }) {
                    val arrowPath = Path().apply {
                        moveTo(0f, -36f)
                        lineTo(-10f, -8f)
                        lineTo(10f, -8f)
                        close()
                    }
                    drawPath(arrowPath, Color(0xFFFFEB3B))
                    drawPath(arrowPath, Color.White, style = Stroke(1.5f))
                }
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
                HudStat("STEPS", "${testState.stepCount}")
                HudStat("DIST", "${"%.2f".format(testState.totalDistance)}m")
                HudStat("STEP LEN", "${"%.3f".format(testState.stepLength)}m")
                HudStat("HEAD", "${"%.0f".format(testState.heading)}°")
            }

            Spacer(Modifier.height(6.dp))

            // Info bar
            // Confidence chỉ có nghĩa khi TPF active (có bản đồ). Test mode = PDR thuần → hiện "PDR"
            if (testState.isTpfActive) {
                HudRow("Confidence (TPF)", "${"%.2f".format(testState.confidence)}",
                    if (testState.confidence < 0.3f) Color(0xFFFF5722) else Color(0xFF4CAF50))
            } else {
                HudRow("Mode", "PDR (no map)", Color(0xFF90CAF9))
            }
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
                        isInitialized = false
                        panOffset = Offset.Zero
                        zoomScale = 1f
                        mapRotationDeg = 0f
                        exportMessage = ""
                        NavigationLogger.clear()
                        controller.reset()
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
