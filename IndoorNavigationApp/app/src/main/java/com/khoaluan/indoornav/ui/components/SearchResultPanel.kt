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
import androidx.compose.material.icons.rounded.Search
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
import com.khoaluan.indoornav.data.api.GeocodeHitDto
import com.khoaluan.indoornav.data.api.IndoorSearchHitDto
import com.khoaluan.indoornav.data.api.OverpassHitDto
import com.khoaluan.indoornav.data.model.Building

/**
 * Module #4 Search Result — danh sách kết quả (không nhảy thẳng Place).
 * GĐ4: Indoor POI · Place · Nominatim · Overpass nearby.
 */
@Composable
fun SearchResultPanel(
    query: String,
    results: List<Building>,
    loading: Boolean,
    onSelect: (Building) -> Unit,
    indoorHits: List<IndoorSearchHitDto> = emptyList(),
    indoorLoading: Boolean = false,
    onSelectIndoor: (IndoorSearchHitDto) -> Unit = {},
    osmHits: List<GeocodeHitDto> = emptyList(),
    osmLoading: Boolean = false,
    onSelectOsm: (GeocodeHitDto) -> Unit = {},
    overpassHits: List<OverpassHitDto> = emptyList(),
    overpassLoading: Boolean = false,
    onSelectOverpass: (OverpassHitDto) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val qBlank = query.isBlank()
    if (qBlank && overpassHits.isEmpty() && !overpassLoading) return

    val anyLoading =
        (!qBlank && loading && results.isEmpty()) ||
            (!qBlank && indoorLoading && indoorHits.isEmpty()) ||
            (!qBlank && osmLoading && osmHits.isEmpty()) ||
            (overpassLoading && overpassHits.isEmpty() && qBlank)
    val empty =
        results.isEmpty() &&
            indoorHits.isEmpty() &&
            osmHits.isEmpty() &&
            overpassHits.isEmpty()

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(max = 360.dp),
        shape = RoundedCornerShape(16.dp),
        color = Color.White,
        shadowElevation = 6.dp,
    ) {
        when {
            anyLoading && empty -> {
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
                    Spacer(modifier.width(10.dp))
                    Text(
                        text = if (qBlank) {
                            tr("Đang tải POI quanh đây…", "Loading nearby POIs…")
                        } else {
                            tr("Đang tìm…", "Searching…")
                        },
                        color = Color(0xFF5F6368),
                        fontSize = 14.sp,
                    )
                }
            }
            empty && !qBlank -> {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(
                        text = tr("Không có kết quả cho \"$query\"", "No results for \"$query\""),
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF202124),
                        fontSize = 15.sp,
                    )
                    Spacer(modifier.height(4.dp))
                    Text(
                        text = tr(
                            "Thử từ khóa POI (ATM, WC…), tên Place, hoặc địa chỉ OSM.",
                            "Try a POI keyword, place name, or OSM address.",
                        ),
                        color = Color(0xFF5F6368),
                        fontSize = 13.sp,
                    )
                }
            }
            else -> {
                LazyColumn(contentPadding = PaddingValues(vertical = 4.dp)) {
                    if (indoorHits.isNotEmpty()) {
                        item {
                            Text(
                                text = tr(
                                    "Trong nhà · ${indoorHits.size}",
                                    "Indoor · ${indoorHits.size}",
                                ),
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                                fontSize = 12.sp,
                                color = Color(0xFF1A73E8),
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        items(
                            indoorHits,
                            key = { "${it.buildingId}-${it.floorNumber}-${it.poiId}" },
                        ) { hit ->
                            IndoorSearchResultRow(hit = hit, onClick = { onSelectIndoor(hit) })
                            HorizontalDivider(color = Color(0xFFE8EAED))
                        }
                    }
                    if (results.isNotEmpty()) {
                        item {
                            Text(
                                text = tr(
                                    "Địa điểm · ${results.size}",
                                    "Places · ${results.size}",
                                ),
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
                    if (osmHits.isNotEmpty()) {
                        item {
                            Text(
                                text = tr(
                                    "Bản đồ OSM · ${osmHits.size}",
                                    "OSM map · ${osmHits.size}",
                                ),
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                                fontSize = 12.sp,
                                color = Color(0xFF93370D),
                                fontWeight = FontWeight.Medium,
                            )
                        }
                        items(osmHits, key = { it.id }) { hit ->
                            OsmSearchResultRow(hit = hit, onClick = { onSelectOsm(hit) })
                            HorizontalDivider(color = Color(0xFFE8EAED))
                        }
                    }
                    if (overpassHits.isNotEmpty()) {
                        item {
                            Text(
                                text = tr(
                                    "POI quanh đây · ${overpassHits.size}",
                                    "Nearby POIs · ${overpassHits.size}",
                                ),
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                                fontSize = 12.sp,
                                color = Color(0xFF0D7377),
                                fontWeight = FontWeight.Medium,
                            )
                        }
                        items(overpassHits, key = { it.id }) { hit ->
                            OverpassSearchResultRow(hit = hit, onClick = { onSelectOverpass(hit) })
                            HorizontalDivider(color = Color(0xFFE8EAED))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun IndoorSearchResultRow(
    hit: IndoorSearchHitDto,
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
            imageVector = Icons.Rounded.Search,
            contentDescription = null,
            tint = Color(0xFF188038),
            modifier = Modifier.size(28.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = hit.poiName ?: "POI",
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                color = Color(0xFF202124),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = listOfNotNull(
                    hit.buildingName,
                    hit.floorName ?: tr("Tầng ${hit.floorNumber}", "Floor ${hit.floorNumber}"),
                    hit.poiTypeLabel,
                ).joinToString(" · "),
                fontSize = 12.sp,
                color = Color(0xFF5F6368),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = tr("Vào bản đồ trong nhà →", "Enter indoor map →"),
                fontSize = 11.sp,
                color = Color(0xFF1A73E8),
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun OsmSearchResultRow(
    hit: GeocodeHitDto,
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
            tint = Color(0xFF93370D),
            modifier = Modifier.size(28.dp),
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = hit.name,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                color = Color(0xFF202124),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val subtitle = hit.displayName?.takeIf { it.isNotBlank() }
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    fontSize = 12.sp,
                    color = Color(0xFF5F6368),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = tr("Chỉ đường ngoài trời (OSM) →", "Outdoor directions (OSM) →"),
                fontSize = 11.sp,
                color = Color(0xFF93370D),
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun OverpassSearchResultRow(
    hit: OverpassHitDto,
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
            tint = Color(0xFF0D7377),
            modifier = Modifier.size(28.dp),
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = hit.name,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                color = Color(0xFF202124),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val subtitle = listOfNotNull(
                hit.amenity?.replace('_', ' '),
                hit.distanceM?.let { "${it} m" },
            ).joinToString(" · ").ifBlank { hit.displayName }
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    fontSize = 12.sp,
                    color = Color(0xFF5F6368),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = tr("Chỉ đường ngoài trời →", "Outdoor directions →"),
                fontSize = 11.sp,
                color = Color(0xFF0D7377),
                modifier = Modifier.padding(top = 2.dp),
            )
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
