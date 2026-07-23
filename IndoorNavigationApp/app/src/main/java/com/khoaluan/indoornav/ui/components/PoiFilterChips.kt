package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.khoaluan.indoornav.ui.theme.NavBlue

/** Chip lọc loại POI trên bản đồ. null = hiện tất cả. */
@Composable
fun PoiFilterChips(
    selected: PoiCategory?,
    onSelect: (PoiCategory?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val filters = listOf<PoiCategory?>(
        null,
        PoiCategory.TOILET,
        PoiCategory.ELEVATOR,
        PoiCategory.STAIRS,
        PoiCategory.EXIT,
        PoiCategory.FOOD,
        PoiCategory.PARKING,
        PoiCategory.MEDICAL,
        PoiCategory.SECURITY,
        PoiCategory.SAFETY,
        PoiCategory.INFO,
    )
    Row(
        modifier = modifier
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        filters.forEach { category ->
            val label = category?.label ?: "Tất cả"
            val selectedNow = selected == category
            FilterChip(
                selected = selectedNow,
                onClick = { onSelect(if (selectedNow && category != null) null else category) },
                label = { Text(label) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = NavBlue,
                    selectedLabelColor = Color.White,
                ),
            )
        }
    }
}
