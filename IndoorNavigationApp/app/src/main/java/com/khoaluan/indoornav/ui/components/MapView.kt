package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.ui.viewmodel.NavigationState
import com.khoaluan.indoornav.utils.ImageUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * FILE: MapView.kt
 * MỤC ĐÍCH: Engine vẽ bản đồ 2D hỗ trợ vuốt chạm (Pan/Zoom) + Render Navigation Layers
 */
@Composable
fun MapView(
    mapData: MapData,
    selectedRoomId: Int? = null,
    navState: NavigationState = NavigationState() // New: Navigation data
) {

    val textMeasurer = rememberTextMeasurer()

        // 1. Dữ liệu vẽ được tiền tính toán (O(N))
    val drawEdges = remember(mapData) {
        mapData.edges.mapNotNull { edge ->
            val source = mapData.nodes.find { it.nodeId == edge.source }
            val target = mapData.nodes.find { it.nodeId == edge.target }
            if (source != null && target != null) {
                Pair(Offset(source.x.toFloat(), source.y.toFloat()), Offset(target.x.toFloat(), target.y.toFloat()))
            } else null
        }
    }

    val drawNodes = remember(mapData) {
        mapData.nodes.map { node ->
            val color = when {
                node.isElevator -> Color(0xFF4CAF50)
                node.isStairs -> Color(0xFF9C27B0)
                else -> Color.White
            }
            Pair(Offset(node.x.toFloat(), node.y.toFloat()), color)
        }
    }

    val drawWalls = remember(mapData) {
        mapData.walls.flatMap { wall ->
            val pts = wall.points
            if (pts.size >= 2) {
                val segments = mutableListOf<Triple<Offset, Offset, Float>>()
                for (i in 0 until pts.size - 1) {
                    segments.add(
                        Triple(
                            Offset(pts[i].x, pts[i].y),
                            Offset(pts[i + 1].x, pts[i + 1].y),
                            wall.thickness ?: 4f
                        )
                    )
                }
                if (wall.isOuter && pts.size > 2) {
                    segments.add(
                        Triple(
                            Offset(pts.last().x, pts.last().y),
                            Offset(pts.first().x, pts.first().y),
                            wall.thickness ?: 4f
                        )
                    )
                }
                segments
            } else if (wall.x1 != null && wall.y1 != null && wall.x2 != null && wall.y2 != null) {
                listOf(
                    Triple(
                        Offset(wall.x1, wall.y1),
                        Offset(wall.x2, wall.y2),
                        wall.thickness ?: 4f
                    )
                )
            } else {
                emptyList()
            }
        }
    }

    // 1.2 Dữ liệu phòng (Rooms)
    val drawRooms = remember(mapData) {
        mapData.rooms.map { room ->
            val rect = androidx.compose.ui.geometry.Rect(
                room.x.toFloat(),
                room.y.toFloat(),
                (room.x + room.width).toFloat(),
                (room.y + room.height).toFloat()
            )
            val color = try {
                Color(android.graphics.Color.parseColor(room.color ?: "#4F46E5"))
            } catch (e: Exception) {
                Color(0xFF6366F1)
            }
            // Trả về bộ 4 giá trị để có ID kiểm tra Highlight
            kotlin.math.log10(10f) // dummy to ensure quadruple
            listOf(rect, color, room.name, room.id)
        }
    }

    // 2. Tính toán biên của bản đồ (Bounding Box)
    val mapBounds = remember(mapData) {
        if (mapData.nodes.isEmpty() && mapData.rooms.isEmpty()) {
            androidx.compose.ui.geometry.Rect(0f, 0f, 1000f, 1000f)
        } else {
            var minX = Float.MAX_VALUE
            var maxX = Float.MIN_VALUE
            var minY = Float.MAX_VALUE
            var maxY = Float.MIN_VALUE
            
            mapData.nodes.forEach {
                minX = minOf(minX, it.x.toFloat())
                maxX = maxOf(maxX, it.x.toFloat())
                minY = minOf(minY, it.y.toFloat())
                maxY = maxOf(maxY, it.y.toFloat())
            }
            
            mapData.rooms.forEach {
                minX = minOf(minX, it.x.toFloat())
                maxX = maxOf(maxX, (it.x + it.width).toFloat())
                minY = minOf(minY, it.y.toFloat())
                maxY = maxOf(maxY, (it.y + it.height).toFloat())
            }

            mapData.walls.forEach { wall ->
                wall.points.forEach { p ->
                    minX = minOf(minX, p.x)
                    maxX = maxOf(maxX, p.x)
                    minY = minOf(minY, p.y)
                    maxY = maxOf(maxY, p.y)
                }
            }
            
            androidx.compose.ui.geometry.Rect(minX, minY, maxX, maxY)
        }
    }

    // 3. Quản lý Zoom/Pan với tham số khởi tạo thông minh
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var rotationDeg by remember { mutableFloatStateOf(0f) }

    // --- LOGIC THU PHÓNG TẠI TÂM (Pivot Zoom) ---
    val modifier = Modifier
        .fillMaxSize()
        .pointerInput(Unit) {
            detectTransformGestures { centroid, pan, zoom, rotation ->
                val oldScale = scale
                val newScale = (scale * zoom).coerceIn(0.1f, 10f)
                val oldRotation = rotationDeg
                val newRotation = normalizeAngleDeg(oldRotation + rotation)

                // Giữ điểm dưới ngón tay ổn định khi zoom + rotate + pan:
                // 1) Đưa vector màn hình hiện tại về hệ map cũ (undo rotation)
                // 2) Scale theo tỉ lệ mới
                // 3) Áp lại rotation mới
                // 4) Tịnh tiến theo pan
                val vOld = centroid - offset
                val mapVector = rotateVector(vOld, -oldRotation) * (newScale / oldScale)
                val screenVectorNew = rotateVector(mapVector, newRotation)

                offset = centroid + pan - screenVectorNew
                scale = newScale
                rotationDeg = newRotation
            }
        }

    // 4. Ảnh nền
    var backgroundImage by remember { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    LaunchedEffect(mapData.backgroundImage) {
        if (!mapData.backgroundImage.isNullOrEmpty()) {
            withContext(Dispatchers.Default) {
                backgroundImage = ImageUtils.decodeBase64ToImageBitmap(mapData.backgroundImage)
            }
        }
    }

    // 5. Hiệu ứng Pulse cho Blue Dot
    val pulseAnim = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(navState.userPos) {
        if (navState.userPos != null) {
            pulseAnim.snapTo(0f)
            pulseAnim.animateTo(
                targetValue = 1f,
                animationSpec = androidx.compose.animation.core.infiniteRepeatable(
                    animation = androidx.compose.animation.core.tween(1500),
                    repeatMode = androidx.compose.animation.core.RepeatMode.Restart
                )
            )
        }
    }

    BoxWithConstraints(
        modifier = modifier.background(Color(0xFF1E1E2E))
    ) {
        val screenW = maxWidth.value
        val screenH = maxHeight.value

        // Tự động căn giữa và Zoom fit khi mới nạp
        LaunchedEffect(mapData, screenW, screenH) {
            if (screenW > 0 && (mapData.nodes.isNotEmpty() || mapData.rooms.isNotEmpty())) {
                val mapW = mapBounds.width.takeIf { it > 0 } ?: 1000f
                val mapH = mapBounds.height.takeIf { it > 0 } ?: 1000f
                
                val scaleX = constraints.maxWidth / mapW
                val scaleY = constraints.maxHeight / mapH
                val scaleFit = minOf(scaleX, scaleY) * 0.8f
                
                scale = scaleFit.coerceIn(0.01f, 5f)
                rotationDeg = 0f
                
                val mapCenter = Offset(mapBounds.left + mapW / 2, mapBounds.top + mapH / 2)
                val screenCenter = Offset(constraints.maxWidth / 2f, constraints.maxHeight / 2f)
                offset = screenCenter - (mapCenter * scale)
            }
        }

        // --- Tự động căn giữa phòng được chọn (Highlight) ---
        LaunchedEffect(selectedRoomId) {
            if (selectedRoomId != null && screenW > 0) {
                val room = mapData.rooms.find { it.id == selectedRoomId }
                if (room != null) {
                    val roomCenter = Offset(
                        (room.x + room.width / 2).toFloat(),
                        (room.y + room.height / 2).toFloat()
                    )
                    val screenCenter = Offset(constraints.maxWidth / 2f, constraints.maxHeight / 2f)
                    
                    // Zoom vào gần hơn một chút để nhìn rõ phòng (ví dụ 1.5x zoom mặc định)
                    val targetScale = 2.0f
                    scale = targetScale
                    offset = screenCenter - rotateVector(roomCenter * targetScale, rotationDeg)
                }
            }
        }

        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    rotationZ = rotationDeg
                    translationX = offset.x
                    translationY = offset.y
                    transformOrigin = TransformOrigin(0f, 0f)
                }
        ) {
            // --- Vẽ ảnh nền ---
            backgroundImage?.let { img ->
                drawImage(image = img, topLeft = Offset.Zero)
            }

            // --- Vẽ Phòng (Rooms) ---
            drawRooms.forEach { roomData ->
                val rect = roomData[0] as androidx.compose.ui.geometry.Rect
                val color = roomData[1] as Color
                val name = roomData[2] as String
                val roomId = roomData[3] as Int

                drawRect(
                    color = color.copy(alpha = 0.5f),
                    topLeft = Offset(rect.left, rect.top),
                    size = androidx.compose.ui.geometry.Size(rect.width, rect.height)
                )
                // Vẽ viền phòng
                val isSelected = roomId == selectedRoomId
                drawRect(
                    color = if (isSelected) Color.Red else color,
                    topLeft = Offset(rect.left, rect.top),
                    size = androidx.compose.ui.geometry.Size(rect.width, rect.height),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(
                        width = (if (isSelected) 6f else 2f) / scale
                    )
                )

                // Vẽ tên phòng
                if (scale > 0.5f) {
                    val textStyle = androidx.compose.ui.text.TextStyle(
                        color = Color.White,
                        fontSize = (12f / scale).sp,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                    )
                    val textLayoutResult = textMeasurer.measure(
                        text = name,
                        style = textStyle
                    )
                    drawText(
                        textLayoutResult = textLayoutResult,
                        topLeft = Offset(
                            rect.left + (rect.width - textLayoutResult.size.width) / 2,
                            rect.top + (rect.height - textLayoutResult.size.height) / 2
                        )
                    )
                }
            }

            // --- Vẽ đường đi ---
            drawEdges.forEach { (start, end) ->
                drawLine(
                    color = Color(0xFF00FFCC).copy(alpha = 0.7f),
                    start = start,
                    end = end,
                    strokeWidth = 3f / scale
                )
            }

            // --- Vẽ tường ---
            drawWalls.forEach { (start, end, thickness) ->
                drawLine(
                    color = Color(0xFF111827),
                    start = start,
                    end = end,
                    strokeWidth = (thickness / scale).coerceAtLeast(2f / scale),
                    cap = StrokeCap.Round
                )
            }

            // --- Vẽ điểm ---
            drawNodes.forEach { (center, color) ->
                drawCircle(
                    color = color,
                    radius = 4f / scale,
                    center = center
                )
            }

            // --- LAYER ĐIỀU HƯỚNG ---

            // 1. Vẽ hạt Particles (Debug)
            if (navState.particles.isNotEmpty()) {
                navState.particles.forEach { p ->
                    val edge = mapData.edges.find { "${it.source}→${it.target}" == p.edgeId || "${it.target}→${it.source}" == p.edgeId }
                    if (edge != null) {
                        val src = mapData.nodes.find { it.nodeId == (if (p.edgeId.contains("→")) p.edgeId.split("→")[0] else edge.source) }
                        val tgt = mapData.nodes.find { it.nodeId == (if (p.edgeId.contains("→")) p.edgeId.split("→")[1] else edge.target) }
                        if (src != null && tgt != null) {
                            val px = src.x + p.progress * (tgt.x - src.x)
                            val py = src.y + p.progress * (tgt.y - src.y)
                            drawCircle(
                                color = Color.Yellow.copy(alpha = 0.5f),
                                radius = 3f / scale,
                                center = Offset(px, py)
                            )
                        }
                    }
                }
            }

            // 2. Vẽ Đường dẫn NEON (Path)
            navState.path?.let { pathNodes ->
                if (pathNodes.size > 1) {
                    for (i in 0 until pathNodes.size - 1) {
                        // Vẽ vầng sáng (Glow)
                        drawLine(
                            color = Color(0xFF00E5FF).copy(alpha = 0.3f),
                            start = pathNodes[i],
                            end = pathNodes[i+1],
                            strokeWidth = 12f / scale,
                            cap = androidx.compose.ui.graphics.StrokeCap.Round
                        )
                        // Đường chính
                        drawLine(
                            color = Color.White,
                            start = pathNodes[i],
                            end = pathNodes[i+1],
                            strokeWidth = 4f / scale,
                            cap = androidx.compose.ui.graphics.StrokeCap.Round
                        )
                    }
                }
            }

            // 3. Vẽ Vị Trí Người Dùng (BLUE DOT)
            navState.userPos?.let { pos ->
                // Hiệu ứng Pulse tỏa ra
                drawCircle(
                    color = Color(0xFF00E5FF).copy(alpha = 1f - pulseAnim.value),
                    radius = (20f + pulseAnim.value * 30f) / scale,
                    center = pos
                )
                // Chấm xanh chính
                drawCircle(
                    color = Color(0xFF00E5FF),
                    radius = 12f / scale,
                    center = pos
                )
                drawCircle(
                    color = Color.White,
                    radius = 12f / scale,
                    center = pos,
                    style = androidx.compose.ui.graphics.drawscope.Stroke(2f / scale)
                )

                // Mũi tên hướng (Heading)
                val headingRad = Math.toRadians(navState.userHeading.toDouble()).toFloat()
                val arrowLen = 40f / scale
                val endX = pos.x + arrowLen * sin(headingRad)
                val endY = pos.y - arrowLen * cos(headingRad)
                
                drawLine(
                    color = Color(0xFF00E5FF),
                    start = pos,
                    end = Offset(endX, endY),
                    strokeWidth = 6f / scale,
                    cap = androidx.compose.ui.graphics.StrokeCap.Round
                )
            }
        }

        if (abs(rotationDeg) > 0.5f) {
            FilledTonalButton(
                onClick = { rotationDeg = 0f },
                modifier = Modifier
                    .align(androidx.compose.ui.Alignment.TopEnd)
                    .padding(top = 16.dp, end = 16.dp)
            ) {
                Text("Reset North")
            }
        }
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
