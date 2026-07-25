package com.khoaluan.indoornav.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateOffsetAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.delay
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.toColorInt
import coil.compose.AsyncImagePainter
import coil.compose.rememberAsyncImagePainter
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.WallPoint
import com.khoaluan.indoornav.ui.navigation.computeHeadingDrivenRotation
import com.khoaluan.indoornav.ui.navigation.resolveManualMapRotationDelta
import com.khoaluan.indoornav.ui.navigation.screenPanToMapOffsetDelta
import com.khoaluan.indoornav.ui.viewmodel.MapRotationMode
import com.khoaluan.indoornav.ui.viewmodel.NavigationState
import kotlin.math.cos
import kotlin.math.sin

private data class RoomDrawData(
    val id: Int,
    val name: String,
    val rect: Rect?,
    val color: Color,
    val path: Path? = null,
    val labelRotation: Float = 0f,
    val isCircle: Boolean = false,
    val center: Offset? = null,
    val radius: Float? = null,
)

private data class PoiDrawData(
    val id: Int,
    val name: String,
    val pos: Offset,
    val category: PoiCategory,
    val size: Float,
)

/**
 * Engine vẽ bản đồ 2D — North-Up / Heading-Up, layer, start pin.
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
    layers: MapLayerVisibility = MapLayerVisibility(),
    poiCategoryFilter: PoiCategory? = null,
) {
    var mapScale by remember { mutableFloatStateOf(1f) }
    var mapOffset by remember { mutableStateOf(Offset.Zero) }
    var autoFollowUser by remember { mutableStateOf(false) }
    var userMapBearingOffset by remember { mutableFloatStateOf(0f) }

    var unwrappedUserHeading by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(navState.userHeading) {
        var delta = (navState.userHeading - unwrappedUserHeading) % 360f
        if (delta > 180f) delta -= 360f
        if (delta < -180f) delta += 360f
        unwrappedUserHeading += delta
    }

    LaunchedEffect(mapRotationMode) {
        userMapBearingOffset = 0f
    }

    LaunchedEffect(centerOnUserTrigger) {
        if (centerOnUserTrigger > 0) {
            userMapBearingOffset = 0f
        }
    }

    val headingDriven = computeHeadingDrivenRotation(mapRotationMode, unwrappedUserHeading)
    val animatedHeadingPart by animateFloatAsState(
        targetValue = headingDriven,
        animationSpec = tween(durationMillis = 140, easing = LinearEasing),
        label = "MapHeadingRotation",
    )
    val effectiveRotation = animatedHeadingPart + userMapBearingOffset

    val animatedUserPos by animateOffsetAsState(
        targetValue = navState.userPos ?: Offset.Zero,
        animationSpec = tween(durationMillis = 80, easing = LinearEasing),
        label = "UserPosInterpolation",
    )

    val animatedUserHeading by animateFloatAsState(
        targetValue = unwrappedUserHeading,
        animationSpec = tween(durationMillis = 140, easing = LinearEasing),
        label = "UserHeadingInterpolation",
    )

    // GĐ3 — pulse POI focus / destination pin
    val focusPulse = rememberInfiniteTransition(label = "poi_focus_pulse")
    val focusPulseScale by focusPulse.animateFloat(
        initialValue = 0.85f,
        targetValue = 1.35f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "focusPulseScale",
    )
    val focusPulseAlpha by focusPulse.animateFloat(
        initialValue = 0.55f,
        targetValue = 0.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "focusPulseAlpha",
    )

    // GĐ3 — vẽ lộ trình dần khi path mới xuất hiện (preview)
    var routeReveal by remember { mutableFloatStateOf(1f) }
    val pathKey = navState.path?.size ?: 0
    LaunchedEffect(pathKey, navState.destinationNodeId) {
        if (pathKey <= 1) {
            routeReveal = 1f
            return@LaunchedEffect
        }
        if (navState.isNavigatingMode) {
            routeReveal = 1f
            return@LaunchedEffect
        }
        routeReveal = 0f
        val steps = 18
        for (i in 1..steps) {
            routeReveal = i / steps.toFloat()
            delay(28)
        }
        routeReveal = 1f
    }
    val routeDrawProgress = if (navState.isNavigatingMode) {
        max(navState.routeProgress.coerceIn(0f, 1f), 0.05f)
    } else {
        routeReveal.coerceIn(0f, 1f)
    }

    val textMeasurer = rememberTextMeasurer()
    val bgPainter = if (!mapData.backgroundImage.isNullOrEmpty()) {
        rememberAsyncImagePainter(model = mapData.backgroundImage)
    } else {
        null
    }

    val drawWalls = remember(mapData) {
        mapData.walls.flatMap { wall ->
            val pts = wall.points
            if (pts.size >= 2) {
                (0 until pts.size - 1).map { i ->
                    Triple(
                        Offset(pts[i].x, pts[i].y),
                        Offset(pts[i + 1].x, pts[i + 1].y),
                        wall.thickness ?: 4f,
                    )
                } + if (wall.isOuter && pts.size > 2) {
                    listOf(
                        Triple(
                            Offset(pts.last().x, pts.last().y),
                            Offset(pts.first().x, pts.first().y),
                            wall.thickness ?: 4f,
                        ),
                    )
                } else {
                    emptyList()
                }
            } else {
                emptyList()
            }
        }
    }

    val drawRooms = remember(mapData) {
        mapData.rooms.map { room ->
            val color = try {
                Color((room.color?.toColorInt() ?: "#DADCE0".toColorInt()))
            } catch (_: Exception) {
                Color("#DADCE0".toColorInt())
            }

            when {
                room.shape?.lowercase() == "polygon" && !room.points.isNullOrEmpty() -> {
                    val path = Path().apply {
                        val pts = room.points
                        moveTo(pts[0].x, pts[0].y)
                        for (i in 1 until pts.size) lineTo(pts[i].x, pts[i].y)
                        close()
                    }
                    RoomDrawData(
                        room.id,
                        room.name,
                        null,
                        color,
                        path,
                        room.labelRotation,
                        center = getPolygonCentroid(room.points),
                    )
                }
                room.shape?.lowercase() == "circle" &&
                    room.cx != null && room.cy != null && room.radius != null -> {
                    RoomDrawData(
                        room.id,
                        room.name,
                        null,
                        color,
                        null,
                        room.labelRotation,
                        true,
                        Offset(room.cx, room.cy),
                        room.radius,
                    )
                }
                else -> {
                    val rect = Rect(
                        room.x.toFloat(),
                        room.y.toFloat(),
                        (room.x + room.width).toFloat(),
                        (room.y + room.height).toFloat(),
                    )
                    RoomDrawData(
                        room.id,
                        room.name,
                        rect,
                        color,
                        null,
                        room.labelRotation,
                        center = rect.center,
                    )
                }
            }
        }
    }

    val drawPois = remember(mapData, poiCategoryFilter) {
        mapData.pois
            .map { poi ->
                PoiDrawData(
                    id = poi.id,
                    name = poi.name ?: "",
                    pos = Offset(poi.x.toFloat(), poi.y.toFloat()),
                    category = poi.resolveCategory(),
                    size = (poi.size ?: 24f).coerceIn(12f, 96f),
                )
            }
            .filter { poiCategoryFilter == null || it.category == poiCategoryFilter }
    }

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
                    userMapBearingOffset += delta
                }
                val adjustedPan = screenPanToMapOffsetDelta(pan, mapRotationForGestures.value)
                val oldScale = mapScale
                val newScale = (mapScale * zoom).coerceIn(0.1f, 10f)
                mapOffset = centroid + adjustedPan - (centroid - mapOffset) * (newScale / oldScale)
                mapScale = newScale
            }
        }

    var screenW by remember { mutableFloatStateOf(0f) }
    var screenH by remember { mutableFloatStateOf(0f) }

    Box(
        modifier = mapModifier
                .background(Color(0xFFF8F9FA))
            .onSizeChanged { size ->
                screenW = size.width.toFloat()
                screenH = size.height.toFloat()
            },
    ) {
        LaunchedEffect(mapData, screenW, screenH) {
            if (screenW > 0f && mapData.rooms.isNotEmpty()) {
                val minX = mapData.rooms.minOfOrNull { it.x.toFloat() } ?: 0f
                val minY = mapData.rooms.minOfOrNull { it.y.toFloat() } ?: 0f
                val maxX = mapData.rooms.maxOfOrNull { (it.x + it.width).toFloat() } ?: 1000f
                val maxY = mapData.rooms.maxOfOrNull { (it.y + it.height).toFloat() } ?: 1000f
                val mapW = maxX - minX
                val mapH = maxY - minY
                val scaleFit = minOf(screenW / mapW, screenH / mapH) * 0.85f
                mapScale = scaleFit.coerceIn(0.1f, 5f)
                mapOffset = Offset(screenW / 2f, screenH / 2f) -
                    Offset(minX + mapW / 2f, minY + mapH / 2f) * mapScale
            }
        }

        LaunchedEffect(navState.userPos != null) {
            if (navState.userPos != null) {
                autoFollowUser = true
            }
        }

        LaunchedEffect(
            navState.userPos,
            animatedUserPos,
            autoFollowUser,
            centerOnUserTrigger,
            mapRotationMode,
        ) {
            if (navState.userPos == null) return@LaunchedEffect
            if (centerOnUserTrigger > 0) {
                autoFollowUser = true
            }
            if (autoFollowUser) {
                val followPos = if (mapRotationMode == MapRotationMode.HEADING_UP) {
                    animatedUserPos
                } else {
                    navState.userPos
                }
                mapOffset = Offset(screenW / 2f, screenH / 2f) - followPos * mapScale
            }
        }

        LaunchedEffect(centerOnDestinationTrigger) {
            if (centerOnDestinationTrigger <= 0) return@LaunchedEffect
            val dest = navState.path?.lastOrNull()
                ?: navState.destinationMarkerPos
                ?: return@LaunchedEffect
            autoFollowUser = false
            mapOffset = Offset(screenW / 2f, screenH / 2f) - dest * mapScale
        }

        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    scaleX = mapScale
                    scaleY = mapScale
                    translationX = mapOffset.x
                    translationY = mapOffset.y
                    transformOrigin = TransformOrigin(0f, 0f)
                },
        ) {
            val pivot = if (mapRotationMode == MapRotationMode.HEADING_UP && navState.userPos != null) {
                animatedUserPos
            } else {
                Offset((screenW / 2f - mapOffset.x) / mapScale, (screenH / 2f - mapOffset.y) / mapScale)
            }

            withTransform({
                rotate(effectiveRotation, pivot = pivot)
            }) {
                // Background
                bgPainter?.let { painter ->
                    val state = painter.state
                    if (state is AsyncImagePainter.State.Success) {
                        val imgSize = state.painter.intrinsicSize
                        withTransform({
                            translate(mapData.bgX, mapData.bgY)
                            val sx = mapData.bgScaleX.takeIf { it > 0f } ?: mapData.bgScale
                            val sy = mapData.bgScaleY.takeIf { it > 0f } ?: mapData.bgScale
                            scale(sx, sy, pivot = Offset.Zero)
                            rotate(mapData.bgRotation, pivot = Offset(imgSize.width / 2f, imgSize.height / 2f))
                        }) {
                            with(painter) { draw(imgSize) }
                        }
                    }
                }

                // Rooms
                if (layers.rooms) {
                    drawRooms.forEach { room ->
                        val isSelected = room.id == selectedRoomId
                        val roomAlpha = 0.4f
                        when {
                            room.path != null -> {
                                drawPath(path = room.path, color = room.color.copy(alpha = roomAlpha))
                                drawPath(
                                    path = room.path,
                                    color = if (isSelected) Color.Red else room.color,
                                    style = Stroke(width = (if (isSelected) 4f else 1.5f) / mapScale),
                                )
                            }
                            room.isCircle && room.center != null && room.radius != null -> {
                                drawCircle(
                                    color = room.color.copy(alpha = roomAlpha),
                                    radius = room.radius,
                                    center = room.center,
                                )
                                drawCircle(
                                    color = if (isSelected) Color.Red else room.color,
                                    radius = room.radius,
                                    center = room.center,
                                    style = Stroke(width = (if (isSelected) 4f else 1.5f) / mapScale),
                                )
                            }
                            room.rect != null -> {
                                drawRect(
                                    color = room.color.copy(alpha = roomAlpha),
                                    topLeft = room.rect.topLeft,
                                    size = room.rect.size,
                                )
                                drawRect(
                                    color = if (isSelected) Color.Red else room.color,
                                    topLeft = room.rect.topLeft,
                                    size = room.rect.size,
                                    style = Stroke(width = (if (isSelected) 4f else 1.5f) / mapScale),
                                )
                            }
                        }

                        if (mapScale > 0.02f && room.center != null) {
                            val layout = textMeasurer.measure(
                                text = room.name,
                                style = TextStyle(
                                    fontSize = (11f / mapScale).sp,
                                    color = Color.Black,
                                    fontWeight = FontWeight.Bold,
                                ),
                            )
                            withTransform({
                                translate(room.center.x, room.center.y)
                                rotate(-effectiveRotation, pivot = Offset.Zero)
                                translate(-layout.size.width / 2f, -layout.size.height / 2f)
                            }) {
                                drawText(layout)
                            }
                        }
                    }
                }

                // Doors
                if (layers.doors) {
                    mapData.doors.forEach { door ->
                        withTransform({
                            translate(door.x.toFloat(), door.y.toFloat())
                            rotate(door.rotation, pivot = Offset.Zero)
                        }) {
                            drawRect(
                                color = Color(0xFF8B4513),
                                topLeft = Offset(-door.width / 2f, -3f),
                                size = Size(door.width.toFloat(), 6f),
                            )
                        }
                    }
                }

                // Walls
                if (layers.walls) {
                    drawWalls.forEach { wallSeg ->
                        val wallStart = wallSeg.first
                        val wallEnd = wallSeg.second
                        val thickness = wallSeg.third
                        val strokeWidth = (thickness / mapScale).coerceIn(1.5f, 8f)
                        drawLine(
                            color = Color(0xFF94A3B8),
                            start = wallStart,
                            end = wallEnd,
                            strokeWidth = strokeWidth,
                            cap = StrokeCap.Round,
                        )
                    }
                }

                // Path — GĐ3: vẽ lộ trình dần + đoạn đã đi sáng hơn khi đang navigate
                if (layers.path) {
                    val route = navState.path
                    if (route != null && route.size > 1) {
                        val edgeCount = route.size - 1
                        val visibleEdges = max(1, ceil(edgeCount * routeDrawProgress.toDouble()).toInt())
                        val traveledEdges = if (navState.isNavigatingMode) {
                            max(0, ceil(edgeCount * navState.routeProgress.coerceIn(0f, 1f).toDouble()).toInt())
                        } else 0
                        for (i in 0 until min(visibleEdges, edgeCount)) {
                            val from = route[i]
                            val to = route[i + 1]
                            val traveled = i < traveledEdges
                            if (navState.isNavigatingMode) {
                                drawLine(
                                    color = Color(0xFF1A73E8).copy(if (traveled) 0.85f else 0.28f),
                                    start = from,
                                    end = to,
                                    strokeWidth = (if (traveled) 16f else 12f) / mapScale,
                                    cap = StrokeCap.Round,
                                )
                                drawLine(
                                    color = if (traveled) Color.White else Color.White.copy(0.7f),
                                    start = from,
                                    end = to,
                                    strokeWidth = (if (traveled) 5f else 3.5f) / mapScale,
                                    cap = StrokeCap.Round,
                                )
                            } else {
                                drawLine(
                                    color = Color(0xFF1A73E8).copy(0.45f),
                                    start = from,
                                    end = to,
                                    strokeWidth = 7f / mapScale,
                                    cap = StrokeCap.Round,
                                )
                            }
                        }
                    }
                }

                // Destination pin — GĐ3 pulse
                val destPos = navState.path?.lastOrNull() ?: navState.destinationMarkerPos
                destPos?.let { pos ->
                    val pinAlpha = if (navState.isNavigatingMode) 1f else 0.75f
                    drawCircle(
                        Color(0xFFFF1744).copy(0.35f * focusPulseAlpha * pinAlpha),
                        radius = (22f * focusPulseScale) / mapScale,
                        center = pos,
                    )
                    drawCircle(Color(0xFFFF1744).copy(0.3f * pinAlpha), radius = 20f / mapScale, center = pos)
                    drawCircle(Color(0xFFFF1744).copy(pinAlpha), radius = 10f / mapScale, center = pos)
                    drawCircle(Color.White.copy(pinAlpha), radius = 5f / mapScale, center = pos)
                    if (navState.isNavigatingMode) {
                        withTransform({ translate(pos.x, pos.y) }) {
                            val pinPath = Path().apply {
                                moveTo(0f, -18f / mapScale)
                                lineTo(-10f / mapScale, 2f / mapScale)
                                lineTo(10f / mapScale, 2f / mapScale)
                                close()
                            }
                            drawPath(pinPath, Color(0xFFFF1744))
                            drawPath(pinPath, Color.White, style = Stroke(width = 1.5f / mapScale))
                        }
                    }
                }

                // Start pin (QR)
                navState.startAnchorPos?.let { start ->
                    drawCircle(Color(0xFF43A047).copy(0.25f), radius = 18f / mapScale, center = start)
                    drawCircle(Color(0xFF2E7D32), radius = 8f / mapScale, center = start)
                    drawCircle(Color.White, radius = 3.5f / mapScale, center = start)
                }

                // POIs — icon loại + tên luôn hiện (không phụ thuộc zoom)
                if (layers.pois) {
                    drawPois.forEach { poi ->
                        val selected = poi.id == selectedPoiId
                        // Emoji catalog cần đủ px trên màn hình để khớp Editor
                        val minScreenPx = when (poi.category) {
                            PoiCategory.ATM -> 48f
                            PoiCategory.ELEVATOR, PoiCategory.STAIRS -> 46f
                            else -> 42f
                        }
                        val displaySize = max(poi.size * 1.25f, minScreenPx)
                        val iconSize = displaySize / mapScale
                        if (selected) {
                            drawCircle(
                                Color(0xFFFF1744).copy(focusPulseAlpha),
                                radius = (displaySize * 0.9f * focusPulseScale) / mapScale,
                                center = poi.pos,
                            )
                        }
                        drawPoiIcon(
                            category = poi.category,
                            center = poi.pos,
                            iconSize = iconSize,
                            isSelected = selected,
                            textMeasurer = textMeasurer,
                        )
                        val label = poi.name.ifBlank { poi.category.label }
                        if (label.isNotBlank()) {
                            val fontSp = (10f / mapScale).coerceIn(8f / mapScale, 14f / mapScale)
                            val layout = textMeasurer.measure(
                                label,
                                TextStyle(
                                    fontSize = fontSp.sp,
                                    color = Color(0xFF202124),
                                    fontWeight = FontWeight.SemiBold,
                                ),
                            )
                            val pad = 3f / mapScale
                            val labelTop = iconSize * 0.55f + 2f / mapScale
                            withTransform({
                                translate(poi.pos.x, poi.pos.y)
                                rotate(-effectiveRotation, pivot = Offset.Zero)
                                translate(-layout.size.width / 2f, labelTop)
                            }) {
                                drawRoundRect(
                                    color = Color.White.copy(0.92f),
                                    topLeft = Offset(-pad, -pad),
                                    size = Size(
                                        layout.size.width + pad * 2,
                                        layout.size.height + pad * 2,
                                    ),
                                    cornerRadius = androidx.compose.ui.geometry.CornerRadius(4f / mapScale),
                                )
                                drawText(layout)
                            }
                        }
                    }
                }
            }

            // User marker (outside map rotation block)
            if (navState.userPos != null) {
                val posMap = animatedUserPos
                val posScreen = rotateMapPointAroundPivot(posMap, pivot, effectiveRotation)
                drawCircle(Color(0xFF4285F4).copy(0.2f), radius = 25f / mapScale, center = posScreen)
                drawCircle(Color.White, radius = 10f / mapScale, center = posScreen)
                drawCircle(Color(0xFF4285F4), radius = 8f / mapScale, center = posScreen)

                val arrowRotation = if (mapRotationMode == MapRotationMode.HEADING_UP) {
                    0f
                } else {
                    animatedUserHeading + effectiveRotation
                }
                withTransform({
                    translate(posScreen.x, posScreen.y)
                    rotate(arrowRotation, pivot = Offset.Zero)
                }) {
                    val tipY = -22f / mapScale
                    val baseY = -6f / mapScale
                    val halfW = 7f / mapScale
                    val arrowPath = Path().apply {
                        moveTo(0f, tipY)
                        lineTo(-halfW, baseY)
                        lineTo(halfW, baseY)
                        close()
                    }
                    drawPath(arrowPath, Color(0xFF4285F4))
                    drawPath(arrowPath, Color.White, style = Stroke(width = 1.5f / mapScale))
                }
            }
        }

    }
}

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

private fun getPolygonCentroid(points: List<WallPoint>): Offset {
    if (points.isEmpty()) return Offset.Zero
    if (points.size == 1) return Offset(points[0].x, points[0].y)
    if (points.size == 2) {
        return Offset((points[0].x + points[1].x) / 2f, (points[0].y + points[1].y) / 2f)
    }

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
        val cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    }

    area /= 2.0
    if (kotlin.math.abs(area) < 0.1) {
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
