package com.khoaluan.indoornav.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.ui.i18n.LocalAppLocale
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.i18n.tr
import kotlinx.coroutines.launch
import kotlin.math.abs

private val GmapsTeal = Color(0xFF006D77)
private val GmapsInk = Color(0xFF202124)
private val GmapsMuted = Color(0xFF5F6368)
private val GmapsGreen = Color(0xFF188038)
private val GmapsStar = Color(0xFFF9AB00)
private val GmapsChipOutline = Color(0xFFB0BEC5)

/**
 * Bottom sheet địa điểm kiểu Google Maps:
 * kéo theo tay → snap Peek / Expanded (không nhảy full một phát).
 */
@Composable
fun PlacePreviewSheet(
    building: Building,
    explorer: com.khoaluan.indoornav.data.api.BuildingExplorerDto? = null,
    isFavorite: Boolean,
    isFollowing: Boolean,
    notice: String?,
    isLoggedIn: Boolean,
    sheetExpanded: Boolean = false,
    onSheetExpandedChange: (Boolean) -> Unit = {},
    onDismiss: () -> Unit,
    onDirections: () -> Unit,
    onStart: () -> Unit = onDirections,
    onToggleFavorite: () -> Unit,
    onShare: () -> Unit,
    onToggleFollow: () -> Unit,
    onOpenDetail: () -> Unit = { onSheetExpandedChange(true) },
    onPropose: () -> Unit = {},
    onEnterIndoor: () -> Unit,
    onLoginRequired: () -> Unit,
    expandedContent: @Composable () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val category = PlaceCategoryLabels.display(building.category, LocalAppLocale.current)
        .takeIf { it.isNotBlank() }
    val ratingAvg = explorer?.ratingAvg?.takeIf { (explorer.ratingCount) > 0 }
    val ratingCount = explorer?.ratingCount ?: 0
    val hasGps = building.gpsLocation != null
    val hasIndoor = building.hasPublishedIndoor == true

    val density = LocalDensity.current
    val screenH = with(density) { LocalConfiguration.current.screenHeightDp.dp.toPx() }
    val peekH = with(density) { 300.dp.toPx() }
    val expandedH = screenH * 0.92f
    val dismissH = peekH * 0.55f
    // midH không dùng nữa — expandThreshold bên dưới

    val scope = rememberCoroutineScope()
    val heightAnim = remember { Animatable(if (sheetExpanded) expandedH else peekH) }
    val velocityTracker = remember { VelocityTracker() }
    var lastDragY by remember { mutableFloatStateOf(0f) }
    var isDragging by remember { mutableStateOf(false) }
    // Tránh LaunchedEffect đè animation sau settleTo()
    var settleFromDrag by remember { mutableStateOf(false) }

    val springSpec = spring<Float>(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMediumLow,
    )
    // Chỉ cần kéo ~28% là snap mở (không bắt giữa chừng)
    val expandThreshold = peekH + (expandedH - peekH) * 0.28f

    fun settleTo(expanded: Boolean) {
        settleFromDrag = true
        onSheetExpandedChange(expanded)
        scope.launch {
            heightAnim.animateTo(
                if (expanded) expandedH else peekH,
                animationSpec = springSpec,
            )
            settleFromDrag = false
        }
    }

    fun settleFromRelease(velocityY: Float) {
        // velocityY < 0 = fling lên (mở); > 0 = fling xuống
        val h = heightAnim.value
        when {
            velocityY < -600f -> settleTo(true)
            velocityY > 800f -> {
                when {
                    h > expandThreshold -> settleTo(false)
                    h < peekH * 0.8f -> onDismiss()
                    else -> settleTo(false)
                }
            }
            h < dismissH -> onDismiss()
            h >= expandThreshold -> settleTo(true)
            else -> settleTo(false)
        }
    }

    // Chỉ sync khi parent đổi sheetExpanded từ ngoài — không chạy khi đang kéo
    LaunchedEffect(sheetExpanded) {
        if (isDragging || settleFromDrag) return@LaunchedEffect
        val target = if (sheetExpanded) expandedH else peekH
        if (abs(heightAnim.value - target) > 4f) {
            heightAnim.animateTo(target, springSpec)
        }
    }

    LaunchedEffect(building.id) {
        isDragging = false
        settleFromDrag = false
        onSheetExpandedChange(false)
        heightAnim.snapTo(peekH)
    }

    val progress = ((heightAnim.value - peekH) / (expandedH - peekH).coerceAtLeast(1f))
        .coerceIn(0f, 1f)

    val dragGesture = Modifier.pointerInput(peekH, expandedH, dismissH, expandThreshold) {
        detectVerticalDragGestures(
            onDragStart = {
                isDragging = true
                settleFromDrag = false
                velocityTracker.resetTracking()
                lastDragY = 0f
                // Hủy animateTo đang kéo sheet ngược xuống
                scope.launch { heightAnim.stop() }
            },
            onVerticalDrag = { change, dragAmount ->
                change.consume()
                velocityTracker.addPosition(
                    change.uptimeMillis,
                    Offset(change.position.x, change.position.y),
                )
                lastDragY = dragAmount
                val next = (heightAnim.value - dragAmount)
                    .coerceIn(dismissH * 0.85f, expandedH)
                scope.launch { heightAnim.snapTo(next) }
            },
            onDragEnd = {
                isDragging = false
                val vy = try {
                    velocityTracker.calculateVelocity().y
                } catch (_: Exception) {
                    lastDragY * 60f
                }
                velocityTracker.resetTracking()
                settleFromRelease(vy)
            },
            onDragCancel = {
                isDragging = false
                velocityTracker.resetTracking()
                settleFromRelease(0f)
            },
        )
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .height(with(density) { heightAnim.value.toDp() }),
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        color = Color.White,
        shadowElevation = 12.dp,
        tonalElevation = 0.dp,
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Luôn kéo được từ handle; khi peek thì kéo cả phần preview
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(28.dp)
                    .then(dragGesture),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .width(40.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color(0xFFDADCE0)),
                )
            }

            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                // Peek — mờ dần khi kéo lên
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .then(if (progress < 0.55f) dragGesture else Modifier)
                        .graphicsLayer { alpha = (1f - progress * 1.35f).coerceIn(0f, 1f) }
                        .padding(bottom = 12.dp),
                ) {
                    PeekHeader(
                        building = building,
                        category = category,
                        ratingAvg = ratingAvg,
                        ratingCount = ratingCount,
                        hasIndoor = hasIndoor,
                        notice = notice,
                        isFavorite = isFavorite,
                        isLoggedIn = isLoggedIn,
                        onToggleFavorite = {
                            if (!isLoggedIn) onLoginRequired() else onToggleFavorite()
                        },
                        onShare = onShare,
                        onDismiss = onDismiss,
                        onLoginRequired = onLoginRequired,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        GmapsPill(
                            label = tr("Đường đi", "Directions"),
                            icon = Icons.Rounded.Place,
                            filled = true,
                            enabled = hasGps,
                            onClick = onDirections,
                        )
                        GmapsPill(
                            label = tr("Bắt đầu", "Start"),
                            icon = Icons.Rounded.Place,
                            filled = false,
                            enabled = hasGps,
                            onClick = onStart,
                        )
                        if (hasIndoor) {
                            GmapsPill(
                                label = tr("Trong nhà", "Indoor"),
                                icon = Icons.Rounded.Place,
                                filled = false,
                                onClick = onEnterIndoor,
                            )
                        }
                        if (!building.placeId.isNullOrBlank()) {
                            GmapsPill(
                                label = if (isFollowing) {
                                    tr("Đang theo", "Following")
                                } else {
                                    tr("Theo dõi", "Follow")
                                },
                                icon = if (isFavorite) {
                                    Icons.Rounded.Favorite
                                } else {
                                    Icons.Rounded.FavoriteBorder
                                },
                                filled = false,
                                onClick = {
                                    if (!isLoggedIn) onLoginRequired() else onToggleFollow()
                                },
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = tr("Kéo lên để xem chi tiết", "Swipe up for details"),
                        color = GmapsMuted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }

                // Expanded — chỉ hiện khi đã kéo khá lên (tránh remount nặng giữa chừng)
                if (progress > 0.35f) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer {
                                alpha = ((progress - 0.35f) / 0.35f).coerceIn(0f, 1f)
                            },
                    ) {
                        expandedContent()
                    }
                }
            }
        }
    }
}

@Composable
private fun PeekHeader(
    building: Building,
    category: String?,
    ratingAvg: Double?,
    ratingCount: Int,
    hasIndoor: Boolean,
    notice: String?,
    isFavorite: Boolean,
    isLoggedIn: Boolean,
    onToggleFavorite: () -> Unit,
    onShare: () -> Unit,
    onDismiss: () -> Unit,
    onLoginRequired: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 4.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = building.name,
            fontWeight = FontWeight.Bold,
            fontSize = 22.sp,
            color = GmapsInk,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            lineHeight = 26.sp,
            modifier = Modifier
                .weight(1f)
                .padding(top = 6.dp),
        )
        if (!building.placeId.isNullOrBlank()) {
            RoundIconBtn(
                icon = if (isFavorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                tint = if (isFavorite) Color(0xFFD93025) else GmapsMuted,
                contentDescription = tr("Lưu", "Save"),
                onClick = onToggleFavorite,
            )
        }
        RoundIconBtn(
            icon = Icons.Rounded.Share,
            tint = GmapsMuted,
            contentDescription = tr("Chia sẻ", "Share"),
            onClick = onShare,
        )
        RoundIconBtn(
            icon = Icons.Rounded.Close,
            tint = GmapsMuted,
            contentDescription = tr("Đóng", "Close"),
            onClick = onDismiss,
        )
    }

    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (ratingAvg != null) {
                Text(
                    text = String.format("%.1f", ratingAvg).replace('.', ','),
                    fontSize = 13.sp,
                    color = GmapsMuted,
                )
                Spacer(modifier = Modifier.width(4.dp))
                repeat(5) { i ->
                    Icon(
                        imageVector = Icons.Rounded.Star,
                        contentDescription = null,
                        tint = if (i < ratingAvg.toInt()) GmapsStar else Color(0xFFE0E0E0),
                        modifier = Modifier.size(14.dp),
                    )
                }
                Text(text = " ($ratingCount)", fontSize = 13.sp, color = GmapsMuted)
            } else {
                Text(
                    text = tr("Chưa có đánh giá", "No reviews yet"),
                    fontSize = 13.sp,
                    color = GmapsMuted,
                )
            }
        }
        if (category != null) {
            Text(
                text = category,
                fontSize = 13.sp,
                color = GmapsMuted,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        Text(
            text = when {
                hasIndoor -> tr("Có bản đồ trong nhà", "Indoor map available")
                else -> tr("Chưa có bản đồ trong nhà", "No indoor map yet")
            },
            fontSize = 13.sp,
            color = if (hasIndoor) GmapsGreen else GmapsMuted,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(top = 2.dp),
        )
        if (!notice.isNullOrBlank()) {
            Text(
                text = notice,
                fontSize = 12.sp,
                color = GmapsMuted,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun RoundIconBtn(
    icon: ImageVector,
    tint: Color,
    contentDescription: String,
    onClick: () -> Unit,
) {
    IconButton(onClick = onClick, modifier = Modifier.size(40.dp)) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(Color(0xFFF1F3F4), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = tint,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
fun GmapsPill(
    label: String,
    icon: ImageVector,
    filled: Boolean,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val bg = when {
        !enabled -> Color(0xFFF1F3F4)
        filled -> GmapsTeal
        else -> Color.White
    }
    val fg = when {
        !enabled -> Color(0xFF9AA0A6)
        filled -> Color.White
        else -> GmapsTeal
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .height(40.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(bg)
            .then(
                if (!filled && enabled) {
                    Modifier.border(1.dp, GmapsChipOutline, RoundedCornerShape(24.dp))
                } else {
                    Modifier
                },
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = fg,
            modifier = Modifier.size(18.dp),
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = label,
            color = fg,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            maxLines = 1,
        )
    }
}
