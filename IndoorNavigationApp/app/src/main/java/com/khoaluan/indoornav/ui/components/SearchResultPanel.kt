package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.khoaluan.indoornav.ui.i18n.LocalAppLocale
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.i18n.tr
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.model.Building

/**
 * Module #4 Search Result — danh sách kết quả (không nhảy thẳng Place).
 */
@Composable
fun SearchResultPanel(
    query: String,
    results: List<Building>,
    loading: Boolean,
    onSelect: (Building) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (query.isBlank()) return

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(max = 320.dp),
        shape = RoundedCornerShape(16.dp),
        color = Color.White,
        shadowElevation = 6.dp,
    ) {
        when {
            loading && results.isEmpty() -> {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = Color(0xFF1A73E8),
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(10.dp))
                    Text("Đang tìm…", color = Color(0xFF5F6368), fontSize = 14.sp)
                }
            }
            results.isEmpty() -> {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = "Không có kết quả cho \"$query\"",
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF202124),
                        fontSize = 15.sp,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Thử từ khóa khác hoặc đổi danh mục.",
                        color = Color(0xFF5F6368),
                        fontSize = 13.sp,
                    )
                }
            }
            else -> {
                LazyColumn(
                    contentPadding = PaddingValues(vertical = 4.dp),
                ) {
                    item {
                        Text(
                            text = "${results.size} kết quả",
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                            fontSize = 12.sp,
                            color = Color(0xFF5F6368),
                            fontWeight = FontWeight.Medium,
                        )
                    }
                    items(results, key = { it.id }) { building ->
                        SearchResultRow(building = building, onClick = { onSelect(building) })
                        HorizontalDivider(color = Color(0xFFE8EAED))
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchResultRow(
    building: Building,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Rounded.Place,
            contentDescription = null,
            tint = Color(0xFF1A73E8),
            modifier = Modifier.size(28.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = building.name,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                color = Color(0xFF202124),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val subtitle = listOfNotNull(
                PlaceCategoryLabels.display(building.category, LocalAppLocale.current)
                    .takeIf { it.isNotBlank() },
                building.address?.takeIf { it.isNotBlank() },
            ).joinToString(" · ")
            if (subtitle.isNotBlank()) {
                Text(
                    text = subtitle,
                    fontSize = 12.sp,
                    color = Color(0xFF5F6368),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (building.hasPublishedIndoor == true) {
                Text(
                    text = tr("Có bản đồ trong nhà", "Indoor map available"),
                    fontSize = 11.sp,
                    color = Color(0xFF188038),
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}
