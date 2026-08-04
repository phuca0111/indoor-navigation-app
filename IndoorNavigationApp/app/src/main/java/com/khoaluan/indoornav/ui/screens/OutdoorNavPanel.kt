package com.khoaluan.indoornav.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.i18n.trStatic
import kotlin.math.roundToInt

/**
 * Panel chỉ đường outdoor kiểu Google Maps:
 * banner xanh (icon + khoảng cách bước) · hướng dẫn lớn · còn lại/ETA · nút thoát.
 */
@Composable
fun OutdoorNavPanel(
    buildingName: String,
    instruction: String,
    remainingM: Float,
    etaSeconds: Int,
    arrived: Boolean,
    canEnterIndoor: Boolean,
    approachingIndoor: Boolean = false,
    distanceToNextM: Float = remainingM,
    maneuver: String? = null,
    onCancel: () -> Unit,
    onOpenGoogleMaps: () -> Unit,
    onEnterIndoor: () -> Unit,
    panelModifier: Modifier = Modifier,
) {
    val etaLabel = when {
        arrived -> tr("Đã đến", "Arrived")
        etaSeconds < 60 -> tr("< 1 phút", "< 1 min")
        else -> {
            val mins = (etaSeconds / 60).coerceAtLeast(1)
            tr("$mins phút", "$mins min")
        }
    }
    val remainingLabel = formatDistanceLabel(remainingM)
    val nextDistLabel = formatDistanceLabel(distanceToNextM)
    val (icon, shortTitle) = maneuverVisual(maneuver, instruction, arrived)

    Surface(
        modifier = panelModifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp, vertical = 10.dp),
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = 16.dp, bottomEnd = 16.dp),
        color = Color.White,
        shadowElevation = 10.dp,
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // Banner bước tiếp theo (giống Google)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF1A73E8))
                    .padding(horizontal = 14.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .background(Color.White.copy(alpha = 0.18f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(34.dp),
                    )
                }
                Spacer(modifier = Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (arrived) tr("Đích đến", "Destination") else nextDistLabel,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 28.sp,
                        lineHeight = 32.sp,
                    )
                    Text(
                        text = shortTitle,
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 17.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                IconButton(onClick = onCancel, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Rounded.Close,
                        contentDescription = tr("Đóng", "Close"),
                        tint = Color.White,
                    )
                }
            }

            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Rounded.Place,
                        contentDescription = null,
                        tint = Color(0xFFEA4335),
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = buildingName,
                        fontWeight = FontWeight.Medium,
                        fontSize = 14.sp,
                        color = Color(0xFF202124),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Column {
                        Text(
                            text = etaLabel,
                            fontWeight = FontWeight.Bold,
                            fontSize = 22.sp,
                            color = Color(0xFF188038),
                        )
                        Text(
                            text = tr("thời gian còn lại", "time remaining"),
                            fontSize = 11.sp,
                            color = Color(0xFF5F6368),
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = remainingLabel,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            color = Color(0xFF202124),
                        )
                        Text(
                            text = tr("quãng đường còn", "distance left"),
                            fontSize = 11.sp,
                            color = Color(0xFF5F6368),
                        )
                    }
                }

                if (approachingIndoor && !arrived && canEnterIndoor) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = tr(
                            "Sắp tới lối vào — có thể vào trong nhà",
                            "Near entrance — you can enter indoor",
                        ),
                        fontSize = 12.sp,
                        color = Color(0xFF188038),
                        fontWeight = FontWeight.Medium,
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))
                HorizontalDivider(color = Color(0xFFE8EAED))
                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onOpenGoogleMaps) {
                        Text(tr("Google Maps", "Google Maps"), fontSize = 13.sp, color = Color(0xFF1A73E8))
                    }
                    Spacer(modifier = Modifier.weight(1f))
                    when {
                        arrived && canEnterIndoor -> {
                            Button(
                                onClick = onEnterIndoor,
                                shape = RoundedCornerShape(24.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1A73E8)),
                            ) {
                                Text(tr("Vào trong nhà", "Enter indoor"), fontSize = 13.sp)
                            }
                        }
                        !arrived && approachingIndoor && canEnterIndoor -> {
                            Button(
                                onClick = onEnterIndoor,
                                shape = RoundedCornerShape(24.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF188038)),
                            ) {
                                Text(tr("Vào Indoor", "Enter indoor"), fontSize = 13.sp)
                            }
                        }
                        arrived -> {
                            Button(
                                onClick = onCancel,
                                shape = RoundedCornerShape(24.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1A73E8)),
                            ) {
                                Text(tr("Xong", "Done"), fontSize = 13.sp)
                            }
                        }
                        else -> {
                            Button(
                                onClick = onCancel,
                                shape = RoundedCornerShape(24.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD93025)),
                            ) {
                                Text(tr("Thoát", "Exit"), fontSize = 13.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun formatDistanceLabel(meters: Float): String {
    val m = meters.coerceAtLeast(0f)
    return if (m >= 1000f) {
        val km = (m / 1000f)
        String.format("%.1f km", km)
    } else {
        "${m.roundToInt()} m"
    }
}

private fun maneuverVisual(
    maneuver: String?,
    instruction: String,
    arrived: Boolean,
): Pair<ImageVector, String> {
    if (arrived) return Icons.Rounded.Place to trStatic("Đã đến nơi", "You have arrived")
    val m = maneuver?.lowercase()?.trim().orEmpty()
    val lower = instruction.lowercase()
    val icon = when {
        m == "left" || lower.contains("trái") || lower.contains("left") ->
            Icons.AutoMirrored.Rounded.ArrowBack
        m == "right" || lower.contains("phải") || lower.contains("right") ->
            Icons.AutoMirrored.Rounded.ArrowForward
        m == "uturn" || lower.contains("quay đầu") || lower.contains("u-turn") ->
            Icons.Rounded.Refresh
        m == "arrive" -> Icons.Rounded.Place
        else -> Icons.Rounded.LocationOn
    }
    val title = instruction
        .replace(Regex("""(?i)\s*sau\s+\d+\s*m"""), "")
        .replace(Regex("""(?i)\s*in\s+\d+\s*m"""), "")
        .trim()
        .ifBlank { instruction }
    return icon to title
}
