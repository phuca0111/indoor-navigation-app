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
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.theme.AdaptiveDimens
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
        PoiCategory.ATM,
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
            .padding(
                horizontal = if (AdaptiveDimens.isExpandedWidth()) 16.dp
                else if (AdaptiveDimens.isCompactWidth()) 6.dp
                else 8.dp,
            ),
        horizontalArrangement = Arrangement.spacedBy(
            if (AdaptiveDimens.isExpandedWidth()) 8.dp else 6.dp,
        ),
    ) {
        filters.forEach { category ->
            val label = category?.label ?: tr("Tất cả", "All")
            val selectedNow = selected == category
            FilterChip(
                selected = selectedNow,
                onClick = { onSelect(if (selectedNow && category != null) null else category) },
                label = { Text(label) },
                // Flat — tránh lớp elevation/secondaryContainer tối lộ sau chip xanh
                elevation = null,
                border = FilterChipDefaults.filterChipBorder(
                    enabled = true,
                    selected = selectedNow,
                    borderColor = Color(0xFFDADCE0),
                    selectedBorderColor = Color.Transparent,
                    disabledBorderColor = Color(0xFFDADCE0),
                    disabledSelectedBorderColor = Color.Transparent,
                    borderWidth = 1.dp,
                    selectedBorderWidth = 0.dp,
                ),
                colors = FilterChipDefaults.filterChipColors(
                    containerColor = Color.White,
                    labelColor = Color(0xFF3C4043),
                    selectedContainerColor = NavBlue,
                    selectedLabelColor = Color.White,
                    disabledContainerColor = Color.White,
                    disabledSelectedContainerColor = NavBlue,
                ),
            )
        }
    }
}
