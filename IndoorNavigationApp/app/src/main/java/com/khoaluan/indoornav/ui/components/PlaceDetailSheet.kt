package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.theme.NavBlue

/**
 * W7 — Place card rút gọn (tên, loại, mô tả, rating, giờ mở).
 */
data class PlaceCardModel(
    val name: String,
    val kindLabel: String,
    val description: String? = null,
    val rating: Float? = null,
    val ratingCount: Int? = null,
    val openingHours: String? = null,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceDetailSheet(
    place: PlaceCardModel,
    onPreviewPath: () -> Unit,
    onStartNavigation: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(place.name, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = NavBlue)
            Text(place.kindLabel, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (place.rating != null) {
                val count = place.ratingCount?.let { " ($it đánh giá)" } ?: ""
                Text("★ %.1f$count".format(place.rating), fontSize = 14.sp)
            }
            place.openingHours?.takeIf { it.isNotBlank() }?.let {
                Text("Giờ mở: $it", fontSize = 13.sp)
            }
            place.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, fontSize = 14.sp)
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(onClick = onPreviewPath, modifier = Modifier.weight(1f)) {
                    Text("Xem đường")
                }
                Button(onClick = onStartNavigation, modifier = Modifier.weight(1f)) {
                    Text("Bắt đầu")
                }
            }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                Text("Đóng")
            }
            Spacer(Modifier.height(12.dp))
        }
    }
}
