package com.khoaluan.indoornav.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.i18n.tr
import kotlin.math.roundToInt

private val GmapsTeal = Color(0xFF006D77)
private val GmapsInk = Color(0xFF202124)
private val GmapsMuted = Color(0xFF5F6368)
private val GmapsGreen = Color(0xFF188038)
private val GmapsBlue = Color(0xFF1A73E8)
private val GmapsChipBg = Color(0xFFE8F0FE)

/**
 * Header A→B kiểu Google Maps khi đang xem trước tuyến.
 */
@Composable
fun OutdoorRouteEndpointsBar(
    destinationName: String,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        color = Color.White,
        shadowElevation = 6.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(end = 10.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(GmapsBlue, CircleShape),
                )
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(18.dp)
                        .background(Color(0xFFDADCE0)),
                )
                Icon(
                    imageVector = Icons.Rounded.Place,
                    contentDescription = null,
                    tint = Color(0xFFEA4335),
                    modifier = Modifier.size(16.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = tr("Vị trí của bạn", "Your location"),
                    fontSize = 14.sp,
                    color = GmapsInk,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = destinationName,
                    fontSize = 14.sp,
                    color = GmapsInk,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            IconButton(onClick = onClose) {
                Icon(Icons.Rounded.Close, contentDescription = tr("Đóng", "Close"), tint = GmapsMuted)
            }
        }
    }
}

/**
 * Bottom sheet xem trước tuyến (ảnh 2) — ETA + Bắt đầu, chưa live nav.
 */
@Composable
fun OutdoorRoutePreviewPanel(
    destinationName: String,
    distanceM: Float,
    durationS: Int,
    onStart: () -> Unit,
    onShare: () -> Unit,
    onOpenGoogleMaps: () -> Unit,
    onClose: () -> Unit,
    panelModifier: Modifier = Modifier,
) {
    val mins = (durationS / 60).coerceAtLeast(if (durationS > 0) 1 else 0)
    val etaLabel = when {
        durationS <= 0 -> "—"
        mins < 60 -> tr("$mins phút", "$mins min")
        else -> {
            val h = mins / 60
            val m = mins % 60
            if (m == 0) tr("$h giờ", "$h hr") else tr("$h giờ $m phút", "$h hr $m min")
        }
    }
    val distLabel = if (distanceM >= 1000f) {
        String.format("%.1f km", distanceM / 1000f).replace('.', ',')
    } else {
        "${distanceM.roundToInt()} m"
    }

    Surface(
        modifier = panelModifier.fillMaxWidth(),
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        color = Color.White,
        shadowElevation = 12.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp, bottom = 4.dp),
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

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = tr("Đi bộ", "Walking"),
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp,
                    color = GmapsInk,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onShare) {
                    Icon(Icons.Rounded.Share, contentDescription = tr("Chia sẻ", "Share"), tint = GmapsMuted)
                }
                IconButton(onClick = onClose) {
                    Icon(Icons.Rounded.Close, contentDescription = tr("Đóng", "Close"), tint = GmapsMuted)
                }
            }

            // Mode chips (chỉ đi bộ khả dụng — OSRM foot)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                ModeChip(label = etaLabel, selected = true, subtitle = tr("Đi bộ", "Walk"))
                ModeChip(label = "—", selected = false, subtitle = tr("Xe", "Drive"), enabled = false)
                ModeChip(label = "—", selected = false, subtitle = tr("Xe buýt", "Transit"), enabled = false)
            }

            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "$etaLabel ($distLabel)",
                fontWeight = FontWeight.Bold,
                fontSize = 22.sp,
                color = GmapsGreen,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
            Text(
                text = tr(
                    "Tuyến đường đi bộ · $destinationName",
                    "Walking route · $destinationName",
                ),
                fontSize = 13.sp,
                color = GmapsMuted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )

            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = onStart,
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp),
                    shape = RoundedCornerShape(24.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = GmapsTeal,
                        contentColor = Color.White,
                    ),
                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
                ) {
                    Icon(Icons.Rounded.Place, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(tr("Bắt đầu", "Start"), fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                }
                PreviewSecondaryBtn(
                    label = tr("Maps", "Maps"),
                    onClick = onOpenGoogleMaps,
                    modifier = Modifier.height(48.dp),
                )
                PreviewSecondaryBtn(
                    label = tr("Chia sẻ", "Share"),
                    onClick = onShare,
                    modifier = Modifier.height(48.dp),
                )
            }
        }
    }
}

@Composable
private fun ModeChip(
    label: String,
    selected: Boolean,
    subtitle: String,
    enabled: Boolean = true,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .then(
                if (selected) Modifier.border(width = 0.dp, color = Color.Transparent)
                else Modifier,
            )
            .padding(horizontal = 4.dp, vertical = 4.dp),
    ) {
        Text(
            text = label,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            color = when {
                !enabled -> Color(0xFFBDBDBD)
                selected -> GmapsTeal
                else -> GmapsInk
            },
        )
        Text(
            text = subtitle,
            fontSize = 11.sp,
            color = when {
                !enabled -> Color(0xFFBDBDBD)
                selected -> GmapsTeal
                else -> GmapsMuted
            },
        )
        if (selected) {
            Spacer(modifier = Modifier.height(4.dp))
            Box(
                modifier = Modifier
                    .width(40.dp)
                    .height(3.dp)
                    .background(GmapsTeal, RoundedCornerShape(2.dp)),
            )
        }
    }
}

@Composable
private fun PreviewSecondaryBtn(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(24.dp))
            .background(GmapsChipBg)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = GmapsTeal,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
            maxLines = 1,
        )
    }
}
