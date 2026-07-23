package com.khoaluan.indoornav.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImagePainter
import coil.compose.rememberAsyncImagePainter
import com.khoaluan.indoornav.R
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.ui.navigation.computeHeadingDrivenRotation
import com.khoaluan.indoornav.ui.navigation.resolveManualMapRotationDelta
import com.khoaluan.indoornav.ui.navigation.screenPanToMapOffsetDelta
import com.khoaluan.indoornav.ui.viewmodel.MapRotationMode
import com.khoaluan.indoornav.ui.viewmodel.NavigationState
import kotlin.math.cos
import kotlin.math.sin

// --- Data classes định nghĩa ngoài hàm để tránh lỗi local class ---
private data class RoomDrawData(
    val id: Int,
    val name: String,
    val rect: androidx.compose.ui.geometry.Rect?,
    val color: Color,
    val path: androidx.compose.ui.graphics.Path? = null,
    val labelRotation: Float = 0f,
    val isCircle: Boolean = false,
    val center: Offset? = null,
    val radius: Float? = null
)

private data class PoiDrawData(
    val id: Int,
    val name: String,
    val pos: Offset,
    val color: Color
)

/**
 * FILE: MapView.kt
 * MỤC ĐÍCH: Engine vẽ bản đồ 2D hỗ trợ North-Up và Heading-Up Mode.
 */
@Composable
fun MapView(
    mapData: MapData,
    selectedRoomId: Int? = null,
    selectedPoiId: Int? = null,
    navState: NavigationState = NavigationState(),
    mapRotationMode: MapRotationMode = MapRotationMode.NORTH_UP,
    centerOnUserTrigger: Int = 0,
    centerOnDestinationTrigger: Int = 0,
) {
    // 1. Quản lý trạng thái Camera
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var autoFollowUser by remember { mutableStateOf(false) }
    // G2: offset xoay tay — dùng cả NORTH_UP và HEADING_UP (kiểu Google)
    var userMapBearingOffset by remember { mutableFloatStateOf(0f) }

    // Unwrap heading để tránh jitter khi vượt 360° (dùng chung cho map rotation và user arrow)
    var unwrappedUserHeading by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(navState.userHeading) {
        var delta = (navState.userHeading - unwrappedUserHeading) % 360f
        if (delta > 180f) delta -= 360f
        if (delta < -180f) delta += 360f
        unwrappedUserHeading += delta
    }

    // La bàn đổi mode → reset offset (về hành vi mặc định mode)
    LaunchedEffect(mapRotationMode) {
        userMapBearingOffset = 0f
    }

    // Crosshair recenter → reset offset xoay tay (Google: về theo hướng đi / North)
    LaunchedEffect(centerOnUserTrigger) {
        if (centerOnUserTrigger > 0) {
            userMapBearingOffset = 0f
        }
    }

    // G2: HEADING_UP = -heading + offset; NORTH_UP = offset
    // Offset tay áp ngay. Heading: animate ngắn, dùng CÙNG giá trị cho map + mũi tên (tránh lệch phase).
    val headingDriven = computeHeadingDrivenRotation(mapRotationMode, unwrappedUserHeading)
    val animatedHeadingPart by animateFloatAsState(
        targetValue = headingDriven,
        animationSpec = tween(durationMillis = 140, easing = androidx.compose.animation.core.LinearEasing),
        label = "MapHeadingRotation"
    )
    val effectiveRotation = animatedHeadingPart + userMapBearingOffset

    // UI Interpolation cho User Position (ngắn hơn — pivot HEADING_UP bám chấm)
    val animatedUserPos by androidx.compose.animation.core.animateOffsetAsState(
        targetValue = navState.userPos ?: Offset.Zero,
        animationSpec = androidx.compose.animation.core.tween(durationMillis = 80, easing = androidx.compose.animation.core.LinearEasing),
        label = "UserPosInterpolation"
    )

    // NORTH_UP: mũi tên theo heading. HEADING_UP: mũi tên cố định hướng lên màn hình (= -effectiveRotation trong map space).
    val animatedUserHeading by animateFloatAsState(
        targetValue = unwrappedUserHeading,
        animationSpec = tween(durationMillis = 140, easing = androidx.compose.animation.core.LinearEasing),
        label = "UserHeadingInterpolation"
    )

    val textMeasurer = rememberTextMeasurer()
    val bgPainter = if (!mapData.backgroundImage.isNullOrEmpty()) {
        rememberAsyncImagePainter(model = mapData.backgroundImage)
    } else null

    // 2. Pre-calculation
    val drawWalls = remember(mapData) {
        mapData.walls.flatMap { wall ->
            val pts = wall.points
            if (pts.size >= 2) {
                (0 until pts.size - 1).map { i ->
                    Triple(Offset(pts[i].x, pts[i].y), Offset(pts[i + 1].x, pts[i + 1].y), wall.thickness ?: 4f)
                } + if (wall.isOuter && pts.size > 2) {
                    listOf(Triple(Offset(pts.last().x, pts.last().y), Offset(pts.first().x, pts.first().y), wall.thickness ?: 4f))
                } else emptyList()
            } else emptyList()
        }
    }

    val drawRooms = remember(mapData) {
        mapData.rooms.map { room ->
            val color = try { Color(android.graphics.Color.parseColor(room.color ?: "#4F46E5")) }
                        catch (e: Exception) { Color(0xFF6366F1) }
            
            if (room.shape?.lowercase() == "polygon" && !room.points.isNullOrEmpty()) {
                val path = androidx.compose.ui.graphics.Path().apply {
                    val pts = room.points
                    moveTo(pts[0].x, pts[0].y)
                    for (i in 1 until pts.size) { lineTo(pts[i].x, pts[i].y) }
                    close()
                }
                val centroid = getPolygonCentroid(room.points)
                RoomDrawData(room.id, room.name, null, color, path, room.labelRotation, center = centroid)
            } else if (room.shape?.lowercase() == "circle" && room.cx != null && room.cy != null && room.radius != null) {
                RoomDrawData(room.id, room.name, null, color, null, room.labelRotation, true, Offset(room.cx, room.cy), room.radius)
            } else {
                val rect = androidx.compose.ui.geometry.Rect(
                    room.x.toFloat(), room.y.toFloat(),
                    (room.x + room.width).toFloat(), (room.y + room.height).toFloat()
                )
                RoomDrawData(room.id, room.name, rect, color, null, room.labelRotation, center = rect.center)
            }
        }
    }

    val drawPois = remember(mapData) {
        mapData.pois.map { poi ->
            val color = when (poi.type?.lowercase()) {
                "stairs" -> Color(0xFF9C27B0)
                "elevator" -> Color(0xFF4CAF50)
                "restroom" -> Color(0xFF03A9F4)
                else -> Color(0xFFFFC107)
            }
            PoiDrawData(poi.id, poi.name ?: "", Offset(poi.x.toFloat(), poi.y.toFloat()), color)
        }
    }

    // 3. Gestures — pan theo chiều ngón tay kể cả khi map đang xoay
    val mapRotationForGestures = rememberUpdatedState(effectiveRotation)
    val mapModifier = Modifier
        .fillMaxSize()
        .pointerInput(mapRotationMode) {
            detectTransformGestures { centroid, pan, zoom, gestureRotationDeg ->
                autoFollowUser = false

                val delta = resolveManualMapRotationDelta(
                    gestureRotationDegrees = gestureRotationDeg,
                    panDistancePx = pan.getDistance(),
                    zoom = zoom,
                )
                if (delta != 0f) {
                    // Compose detectTransformGestures: chiều dương khớp cảm giác xoay map theo tay
                    userMapBearingOffset += delta
                }

                val adjustedPan = screenPanToMapOffsetDelta(pan, mapRotationForGestures.value)
                val oldScale = scale
                val newScale = (scale * zoom).coerceIn(0.1f, 10f)
                offset = centroid + adjustedPan - (centroid - offset) * (newScale / oldScale)
                scale = newScale
            }
        }

    // 4. Viewport logic
    BoxWithConstraints(modifier = mapModifier.background(Color(0xFFF8FAFC))) {
        val screenW = constraints.maxWidth.toFloat()
        val screenH = constraints.maxHeight.toFloat()

        LaunchedEffect(mapData, screenW, screenH) {
            if (screenW > 0 && mapData.rooms.isNotEmpty()) {
                val minX = mapData.rooms.minOfOrNull { it.x.toFloat() } ?: 0f
                val minY = mapData.rooms.minOfOrNull { it.y.toFloat() } ?: 0f
                val maxX = mapData.rooms.maxOfOrNull { (it.x + it.width).toFloat() } ?: 1000f
                val maxY = mapData.rooms.maxOfOrNull { (it.y + it.height).toFloat() } ?: 1000f
                val mapW = maxX - minX
                val mapH = maxY - minY
                val scaleFit = minOf(screenW / mapW, screenH / mapH) * 0.85f
                scale = scaleFit.coerceIn(0.1f, 5f)
                offset = Offset(screenW / 2f, screenH / 2f) - Offset(minX + mapW/2f, minY + mapH/2f) * scale
            }
        }

        // Tự động bật auto-follow khi định vị bắt đầu (userPos lần đầu tiên không null)
        LaunchedEffect(navState.userPos != null) {
        if (navState.userPos != null) {
                autoFollowUser = true
            }
        }

        LaunchedEffect(navState.userPos, animatedUserPos, autoFollowUser, centerOnUserTrigger, mapRotationMode) {
            if (navState.userPos == null) return@LaunchedEffect
            // Recenter khi user bấm nút (cả 2 mode)
            if (centerOnUserTrigger > 0) {
                autoFollowUser = true
            }
            // HEADING_UP: center theo animated pos (khớp pivot + mũi tên); NORTH_UP: pos thô OK
            if (autoFollowUser) {
                val followPos = if (mapRotationMode == MapRotationMode.HEADING_UP) {
                    animatedUserPos
                } else {
                    navState.userPos
                }
                offset = Offset(screenW / 2f, screenH / 2f) - followPos * scale
            }
        }

        // Căn giữa điểm đến (pin đỏ / cuối path) — tắt follow user
        LaunchedEffect(centerOnDestinationTrigger) {
            if (centerOnDestinationTrigger <= 0) return@LaunchedEffect
            val dest = navState.path?.lastOrNull() ?: navState.destinationMarkerPos ?: return@LaunchedEffect
            autoFollowUser = false
            offset = Offset(screenW / 2f, screenH / 2f) - dest * scale
        }

        // 5. Canvas Drawing
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = offset.x
                    translationY = offset.y
                    transformOrigin = TransformOrigin(0f, 0f)
                }
        ) {
            // HEADING_UP: pivot = cùng điểm với chấm/mũi tên (animated) — tránh map xoay lệch so với avatar
            val pivot = if (mapRotationMode == MapRotationMode.HEADING_UP && navState.userPos != null) {
                animatedUserPos
            } else {
                // Tâm màn hình trong canvas space → xoay bản đồ quanh giữa view, không bị méo
                Offset((screenW / 2f - offset.x) / scale, (screenH / 2f - offset.y) / scale)
            }
                withTransform({
                rotate(effectiveRotation, pivot = pivot)
            }) {
                // LAYER 0: Background
                bgPainter?.let { painter ->
                    val state = painter.state
                    if (state is AsyncImagePainter.State.Success) {
                        val size = state.painter.intrinsicSize
                        withTransform({
                            translate(mapData.bgX, mapData.bgY)
                            scale(mapData.bgScale, mapData.bgScale, pivot = Offset.Zero)
                            rotate(mapData.bgRotation, pivot = Offset(size.width / 2f, size.height / 2f))
                        }) {
                            with(painter) { draw(size) }
                        }
                    }
                }

                // LAYER 1: Rooms
                drawRooms.forEach { room ->
                    val isSelected = room.id == selectedRoomId
                    val roomAlpha = 0.4f
                    if (room.path != null) {
                        drawPath(path = room.path, color = room.color.copy(alpha = roomAlpha))
                        drawPath(
                            path = room.path,
                            color = if (isSelected) Color.Red else room.color,
                            style = androidx.compose.ui.graphics.drawscope.Stroke(width = (if (isSelected) 4f else 1.5f) / scale)
                        )
                    } else if (room.isCircle && room.center != null && room.radius != null) {
                        drawCircle(color = room.color.copy(alpha = roomAlpha), radius = room.radius, center = room.center)
                        drawCircle(
                            color = if (isSelected) Color.Red else room.color,
                            radius = room.radius,
                            center = room.center,
                            style = androidx.compose.ui.graphics.drawscope.Stroke(width = (if (isSelected) 4f else 1.5f) / scale)
                        )
                    } else if (room.rect != null) {
                        drawRect(color = room.color.copy(alpha = roomAlpha), topLeft = room.rect.topLeft, size = room.rect.size)
                drawRect(
                            color = if (isSelected) Color.Red else room.color,
                            topLeft = room.rect.topLeft,
                            size = room.rect.size,
                            style = androidx.compose.ui.graphics.drawscope.Stroke(width = (if (isSelected) 4f else 1.5f) / scale)
                        )
                    }

                    // Label
                    if (scale > 0.02f && room.center != null) {
                        val layout = textMeasurer.measure(
                            text = room.name,
                            style = androidx.compose.ui.text.TextStyle(
                                fontSize = (11f / scale).sp,
                                color = Color.Black,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                    )
                        )
                        withTransform({
                            translate(room.center.x, room.center.y)
                            rotate(-effectiveRotation, pivot = Offset.Zero) // Đặt pivot về 0,0 để chữ xoay quanh tâm của chính nó
                            translate(-layout.size.width / 2f, -layout.size.height / 2f)
                        }) {
                            drawText(layout)
                        }
                    }
                }

                // LAYER 2: Doors
                mapData.doors.forEach { door ->
                    withTransform({
                        translate(door.x.toFloat(), door.y.toFloat())
                        rotate(door.rotation, pivot = Offset.Zero)
                    }) {
                        drawRect(
                            color = Color(0xFF8B4513),
                            topLeft = Offset(-door.width / 2f, -3f),
                            size = androidx.compose.ui.geometry.Size(door.width.toFloat(), 6f)
                        )
                    }
                }

                // LAYER 3: Walls
                drawWalls.forEach { (start, end, thickness) ->
                    // Issue 22: Clamp strokeWidth để tránh quá dày khi zoom out (scale nhỏ)
                    // thickness/scale có thể rất lớn nếu scale ~0.1. Giới hạn trong [1.5f, 8f] pixel.
                    val strokeWidth = (thickness / scale).coerceIn(1.5f, 8f)
                    drawLine(Color(0xFF94A3B8), start, end, strokeWidth = strokeWidth, cap = StrokeCap.Round)
                }

                // LAYER 4: Navigation Path (preview mỏng / navigate dày)
                navState.path?.let { path ->
                    if (path.size > 1) {
                        for (i in 0 until path.size - 1) {
                            if (navState.isNavigatingMode) {
                                drawLine(Color(0xFF00E5FF).copy(0.3f), path[i], path[i + 1], strokeWidth = 14f / scale, cap = StrokeCap.Round)
                                drawLine(Color.White, path[i], path[i + 1], strokeWidth = 4f / scale, cap = StrokeCap.Round)
                            } else {
                                drawLine(Color(0xFF00E5FF).copy(0.35f), path[i], path[i + 1], strokeWidth = 6f / scale, cap = StrokeCap.Round)
                            }
                        }
                    }
                }

                // LAYER 4.5: Destination Marker — ưu tiên path cuối; G1: dùng destinationMarkerPos khi chưa có path
                val destPos = navState.path?.lastOrNull() ?: navState.destinationMarkerPos
                destPos?.let { pos ->
                    val pinAlpha = if (navState.isNavigatingMode) 1f else 0.75f
                    drawCircle(Color(0xFFFF1744).copy(0.3f * pinAlpha), radius = 20f / scale, center = pos)
                    drawCircle(Color(0xFFFF1744).copy(pinAlpha), radius = 10f / scale, center = pos)
                    drawCircle(Color.White.copy(pinAlpha), radius = 5f / scale, center = pos)
                    if (navState.isNavigatingMode) {
                        withTransform({ translate(pos.x, pos.y) }) {
                            val pinPath = Path().apply {
                                moveTo(0f, -18f / scale)
                                lineTo(-10f / scale, 2f / scale)
                                lineTo(10f / scale, 2f / scale)
                                close()
                            }
                            drawPath(pinPath, Color(0xFFFF1744))
                            drawPath(pinPath, Color.White, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.5f / scale))
                        }
                    }
                }

 // LAYER 5: POIs
                drawPois.forEach { poi ->
                    val isSelected = poi.id == selectedPoiId
                    drawCircle(if (isSelected) Color.Red else poi.color, radius = (if (isSelected) 8f else 6f) / scale, center = poi.pos)
                    if (scale > 0.6f) {
                        val layout = textMeasurer.measure(poi.name, androidx.compose.ui.text.TextStyle(fontSize = (9f/scale).sp))
                        // FIX: Counter-rotate POI text to keep it always horizontal
                        withTransform({
                            translate(poi.pos.x, poi.pos.y)
                            rotate(-effectiveRotation, pivot = Offset.Zero)
                            translate(-layout.size.width / 2f, 10f / scale)
                        }) {
                            drawText(layout)
                        }
                    }
                }

                // User marker vẽ NGOÀI khối xoay map (kiểu la bàn: kim cố định đầu máy)
            }

            // LAYER 6: Blue dot + mũi tên (NORTH_UP mặc định: tip = hướng đầu máy trên map)
            if (navState.userPos != null) {
                val posMap = animatedUserPos
                val posScreen = rotateMapPointAroundPivot(posMap, pivot, effectiveRotation)
                drawCircle(Color(0xFF007AFF).copy(0.2f), radius = 25f / scale, center = posScreen)
                drawCircle(Color.White, radius = 10f / scale, center = posScreen)
                drawCircle(Color(0xFF007AFF), radius = 8f / scale, center = posScreen)

                val arrowRotation = if (mapRotationMode == MapRotationMode.HEADING_UP) {
                    0f
                } else {
                    animatedUserHeading + effectiveRotation
                }
                withTransform({
                    translate(posScreen.x, posScreen.y)
                    rotate(arrowRotation, pivot = Offset.Zero)
                }) {
                    val tipY = -22f / scale
                    val baseY = -6f / scale
                    val halfW = 7f / scale
                    val arrowPath = Path().apply {
                        moveTo(0f, tipY)
                        lineTo(-halfW, baseY)
                        lineTo(halfW, baseY)
                        close()
                    }
                    drawPath(arrowPath, Color(0xFF007AFF))
                    drawPath(
                        arrowPath,
                        Color.White,
                        style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.5f / scale)
                    )
                }
            }
        }
    }
}

/** Xoay điểm map quanh pivot (cùng quy ước Canvas.rotate chiều kim đồng hồ). */
private fun rotateMapPointAroundPivot(point: Offset, pivot: Offset, degrees: Float): Offset {
    if (degrees == 0f) return point
    val rad = Math.toRadians(degrees.toDouble())
    val c = cos(rad).toFloat()
    val s = sin(rad).toFloat()
    val dx = point.x - pivot.x
    val dy = point.y - pivot.y
    return Offset(
        x = pivot.x + dx * c - dy * s,
        y = pivot.y + dx * s + dy * c,
    )
}

/**
 * Tính toán tâm hình học thực sự (Centroid) của một đa giác (Polygon).
 * Sử dụng Double để tránh lỗi tràn bộ nhớ mantissa của Float khi toạ độ lớn.
 */
private fun getPolygonCentroid(points: List<com.khoaluan.indoornav.data.model.WallPoint>): Offset {
    if (points.isEmpty()) return Offset.Zero
    if (points.size == 1) return Offset(points[0].x, points[0].y)
    if (points.size == 2) return Offset((points[0].x + points[1].x) / 2f, (points[0].y + points[1].y) / 2f)

    var area = 0.0
    var cx = 0.0
    var cy = 0.0

    for (i in points.indices) {
        val p1 = points[i]
        val p2 = points[(i + 1) % points.size]
        
        val x1 = p1.x.toDouble()
        val y1 = p1.y.toDouble()
        val x2 = p2.x.toDouble()
        val y2 = p2.y.toDouble()

        val crossProduct = x1 * y2 - x2 * y1
        area += crossProduct
        cx += (x1 + x2) * crossProduct
        cy += (y1 + y2) * crossProduct
    }

    area /= 2.0
    
    // Nếu diện tích quá nhỏ (đa giác tự cắt hoặc các điểm thẳng hàng)
    if (Math.abs(area) < 0.1) {
        val minX = points.minOf { it.x }
        val maxX = points.maxOf { it.x }
        val minY = points.minOf { it.y }
        val maxY = points.maxOf { it.y }
        return Offset((minX + maxX) / 2f, (minY + maxY) / 2f)
    }

    cx /= (6.0 * area)
    cy /= (6.0 * area)
    
    return Offset(cx.toFloat(), cy.toFloat())
}
