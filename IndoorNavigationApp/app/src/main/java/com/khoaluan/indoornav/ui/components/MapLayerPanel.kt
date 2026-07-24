package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.i18n.tr

/** Module #9 — panel bật/tắt layer CAD. */
@Composable
fun MapLayerPanel(
    layers: MapLayerVisibility,
    onChange: (MapLayerVisibility) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = Color.White.copy(alpha = 0.96f),
        shadowElevation = 4.dp,
    ) {
        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
            Text(
                text = tr("Lớp bản đồ", "Map layers"),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFF37474F),
                modifier = Modifier.padding(bottom = 4.dp),
            )
            LayerRow(tr("Phòng", "Rooms"), layers.rooms) { onChange(layers.copy(rooms = it)) }
            LayerRow(tr("Tường", "Walls"), layers.walls) { onChange(layers.copy(walls = it)) }
            LayerRow(tr("Cửa", "Doors"), layers.doors) { onChange(layers.copy(doors = it)) }
            LayerRow(tr("POI", "POI"), layers.pois) { onChange(layers.copy(pois = it)) }
            LayerRow(tr("Đường đi", "Path"), layers.path) { onChange(layers.copy(path = it)) }
        }
    }
}

@Composable
private fun LayerRow(label: String, checked: Boolean, onChecked: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, fontSize = 12.sp, color = Color(0xFF455A64))
        Checkbox(checked = checked, onCheckedChange = onChecked)
    }
}
