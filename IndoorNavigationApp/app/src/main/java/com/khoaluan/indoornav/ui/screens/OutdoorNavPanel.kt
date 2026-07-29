package com.khoaluan.indoornav.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.i18n.tr
import kotlin.math.roundToInt

@Composable
fun OutdoorNavPanel(
    buildingName: String,
    instruction: String,
    remainingM: Float,
    etaSeconds: Int,
    arrived: Boolean,
    canEnterIndoor: Boolean,
    onCancel: () -> Unit,
    onOpenGoogleMaps: () -> Unit,
    onEnterIndoor: () -> Unit,
    panelModifier: Modifier = Modifier,
) {
    val etaLabel = when {
        etaSeconds < 60 -> tr("ETA < 1 phút", "ETA < 1 min")
        else -> {
            val mins = (etaSeconds / 60).coerceAtLeast(1)
            tr("ETA ~$mins phút", "ETA ~$mins min")
        }
    }
    Card(
        modifier = panelModifier
            .fillMaxWidth()
            .padding(12.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = tr("Chỉ đường ngoài trời", "Outdoor directions"),
                    fontSize = 12.sp,
                    color = Color(0xFF5F6368),
                )
                IconButton(onClick = onCancel, modifier = Modifier.size(28.dp)) {
                    Icon(Icons.Rounded.Close, contentDescription = tr("Hủy", "Cancel"))
                }
            }
            Text(
                text = buildingName,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                color = Color(0xFF202124),
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = instruction,
                fontWeight = FontWeight.Bold,
                fontSize = 20.sp,
                color = Color(0xFF1A73E8),
            )
            Text(
                text = "${remainingM.roundToInt()} m · $etaLabel",
                fontSize = 13.sp,
                color = Color(0xFF5F6368),
                modifier = Modifier.padding(top = 4.dp),
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(onClick = onOpenGoogleMaps, modifier = Modifier.weight(1f)) {
                    Text(tr("Google Maps", "Google Maps"), fontSize = 12.sp)
                }
                if (arrived && canEnterIndoor) {
                    Button(
                        onClick = onEnterIndoor,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1A73E8)),
                    ) {
                        Text(tr("Vào trong nhà", "Enter indoor"), fontSize = 12.sp)
                    }
                } else if (arrived) {
                    Button(
                        onClick = onCancel,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1A73E8)),
                    ) {
                        Text(tr("Xong", "Done"), fontSize = 12.sp)
                    }
                } else {
                    Button(
                        onClick = onCancel,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD93025)),
                    ) {
                        Text(tr("Hủy chỉ đường", "Stop"), fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
