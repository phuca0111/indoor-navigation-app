package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.background
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.api.IndoorReviewItemDto
import com.khoaluan.indoornav.data.api.IndoorTargetSummaryDto
import com.khoaluan.indoornav.ui.i18n.tr
import kotlinx.coroutines.launch

private val GmapsTeal = Color(0xFF006D77)
private val GmapsBlue = Color(0xFF1A73E8)
private val GmapsInk = Color(0xFF202124)
private val GmapsMuted = Color(0xFF5F6368)
private val GmapsStar = Color(0xFFF9AB00)
private val GmapsCard = Color(0xFFF1F3F4)

/**
 * Sheet phòng/POI trong nhà — kéo mượt Peek ↔ Expanded kiểu Google Maps.
 */
data class PlaceCardModel(
    val name: String,
    val kindLabel: String,
    val description: String? = null,
    val rating: Float? = null,
    val ratingCount: Int? = null,
    val openingHours: String? = null,
    val entityKind: String? = null,
    val entityId: String? = null,
    val floorNumber: Int? = null,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceDetailSheet(
    place: PlaceCardModel,
    summary: IndoorTargetSummaryDto? = null,
    reviews: List<IndoorReviewItemDto> = emptyList(),
    notice: String? = null,
    isLoggedIn: Boolean = false,
    onPreviewPath: () -> Unit,
    onStartNavigation: () -> Unit,
    onDismiss: () -> Unit,
    onToggleFavorite: () -> Unit = {},
    onRate: (stars: Int) -> Unit = {},
    onReport: () -> Unit = {},
    onLoginRequired: () -> Unit = {},
    /** Có khi mở sheet từ chạm map — neo đứng tại điểm vừa chạm. */
    onSetStandingLocation: (() -> Unit)? = null,
) {
    val scope = rememberCoroutineScope()
    // false = cho phép PartiallyExpanded (kéo mượt như Google Maps)
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = false,
        confirmValueChange = { true },
    )
    val canEngage = !place.entityKind.isNullOrBlank() && !place.entityId.isNullOrBlank()
    val ratingAvg = summary?.ratingAvg?.toFloat() ?: place.rating
    val ratingCount = when {
        summary != null -> summary.ratingCount
        else -> place.ratingCount ?: 0
    }
    val isFavorite = summary?.isFavorite == true
    val typeLabel = summary?.typeLabel?.takeIf { it.isNotBlank() } ?: place.kindLabel

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color.White,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp, bottom = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .width(40.dp)
                        .height(4.dp)
                        .background(Color(0xFFDADCE0), RoundedCornerShape(2.dp)),
                )
            }
        },
    ) {
        // Không bọc cả sheet bằng verticalScroll — tránh gesture scroll kéo sheet nhảy xuống.
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
        ) {
            // —— Peek: tiêu đề + meta + CTA ——
            Text(
                place.name,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = GmapsInk,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                typeLabel,
                fontSize = 13.sp,
                color = GmapsMuted,
                modifier = Modifier.padding(top = 2.dp),
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = 6.dp),
            ) {
                val avgText = if (ratingAvg != null && ratingCount > 0) {
                    String.format("%.1f", ratingAvg).replace('.', ',')
                } else {
                    "—"
                }
                Text(avgText, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = GmapsInk)
                Icon(
                    imageVector = Icons.Rounded.Star,
                    contentDescription = null,
                    tint = GmapsStar,
                    modifier = Modifier
                        .padding(horizontal = 4.dp)
                        .size(16.dp),
                )
                Text("($ratingCount)", fontSize = 13.sp, color = GmapsMuted)
            }

            place.openingHours?.takeIf { it.isNotBlank() }?.let {
                Text(
                    tr("Giờ mở: $it", "Hours: $it"),
                    fontSize = 13.sp,
                    color = GmapsMuted,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }

            if (!notice.isNullOrBlank() && !notice.contains("lỗi", ignoreCase = true)) {
                Text(
                    notice,
                    fontSize = 12.sp,
                    color = Color(0xFF188038),
                    modifier = Modifier.padding(top = 4.dp),
                )
            } else if (!notice.isNullOrBlank()) {
                Text(
                    notice,
                    fontSize = 12.sp,
                    color = Color(0xFFD93025),
                    modifier = Modifier.padding(top = 4.dp),
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                GmapsPill(
                    label = tr("Đường đi", "Directions"),
                    icon = Icons.Rounded.Place,
                    filled = true,
                    onClick = onPreviewPath,
                )
                GmapsPill(
                    label = tr("Bắt đầu", "Start"),
                    icon = Icons.Rounded.Place,
                    filled = false,
                    onClick = onStartNavigation,
                )
                if (onSetStandingLocation != null) {
                    GmapsPill(
                        label = tr("Đứng đây", "Stand here"),
                        icon = Icons.Rounded.Place,
                        filled = false,
                        onClick = onSetStandingLocation,
                    )
                }
                if (canEngage) {
                    GmapsPill(
                        label = if (isFavorite) tr("Đã lưu", "Saved") else tr("Lưu", "Save"),
                        icon = if (isFavorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        filled = false,
                        onClick = {
                            if (!isLoggedIn) onLoginRequired() else onToggleFavorite()
                        },
                    )
                }
            }

            Text(
                text = tr("Kéo lên để xem thêm", "Swipe up for more"),
                color = GmapsMuted,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .padding(top = 12.dp, bottom = 4.dp)
                    .clickable {
                        scope.launch {
                            sheetState.expand()
                        }
                    },
            )

            // —— Phần mở rộng: chỉ scroll khối này ——
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(320.dp)
                    .verticalScroll(rememberScrollState()),
            ) {
                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = Color(0xFFE8EAED))
                Spacer(modifier = Modifier.height(12.dp))

                (summary?.description ?: place.description)?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        tr("Mô tả", "Description"),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        color = GmapsInk,
                    )
                    Text(
                        it,
                        fontSize = 14.sp,
                        color = GmapsInk,
                        modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
                    )
                }

                if (canEngage) {
                    Text(
                        tr("Bài đánh giá", "Reviews"),
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = GmapsInk,
                    )
                    Spacer(modifier = Modifier.height(8.dp))

                    when {
                        reviews.isEmpty() -> {
                            Text(
                                tr(
                                    "Chưa có bài đánh giá. Hãy là người đầu tiên!",
                                    "No reviews yet. Be the first!",
                                ),
                                fontSize = 13.sp,
                                color = GmapsMuted,
                            )
                        }
                        else -> {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                reviews.take(8).forEach { review ->
                                    IndoorReviewCard(review)
                                }
                            }
                        }
                    }

                    Text(
                        text = tr("Xếp hạng và đánh giá", "Rate and review"),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        color = GmapsInk,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.padding(top = 6.dp),
                    ) {
                        (1..5).forEach { n ->
                            val filled = (summary?.myReview?.rating ?: 0) >= n
                            Text(
                                text = if (filled) "★" else "☆",
                                fontSize = 30.sp,
                                color = if (filled) GmapsStar else Color(0xFF9AA0A6),
                                modifier = Modifier
                                    .clickable {
                                        if (!isLoggedIn) onLoginRequired() else onRate(n)
                                    }
                                    .padding(2.dp),
                            )
                        }
                    }
                    Text(
                        text = if (isLoggedIn) {
                            tr("Chạm sao để viết đánh giá", "Tap a star to write a review")
                        } else {
                            tr(
                                "Đăng nhập để đánh giá / lưu / báo cáo",
                                "Sign in to rate, save, or report",
                            )
                        },
                        fontSize = 12.sp,
                        color = GmapsMuted,
                        modifier = Modifier.padding(top = 4.dp),
                    )

                    TextButton(
                        onClick = {
                            if (!isLoggedIn) onLoginRequired() else onReport()
                        },
                        modifier = Modifier.padding(top = 4.dp),
                    ) {
                        Text(tr("Báo cáo", "Report"), color = Color(0xFFD93025))
                    }
                }

                if (sheetState.currentValue == SheetValue.Expanded) {
                    TextButton(
                        onClick = {
                            scope.launch { sheetState.partialExpand() }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(tr("Thu gọn", "Collapse"), color = GmapsTeal)
                    }
                }

                TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                    Text(tr("Đóng", "Close"), color = GmapsMuted)
                }
            }
        }
    }
}

@Composable
private fun IndoorReviewCard(review: IndoorReviewItemDto) {
    val name = review.user?.fullName?.takeIf { it.isNotBlank() }
        ?: review.user?.email?.substringBefore("@")
        ?: tr("Người dùng", "User")
    val initial = name.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    val comment = review.comment?.trim().orEmpty()

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = GmapsCard,
        modifier = Modifier.width(240.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(GmapsBlue.copy(alpha = 0.15f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(initial, fontWeight = FontWeight.Bold, color = GmapsBlue, fontSize = 13.sp)
                }
                Column(
                    modifier = Modifier
                        .padding(start = 8.dp)
                        .weight(1f),
                ) {
                    Text(
                        name,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        color = GmapsInk,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "★".repeat(review.rating.coerceIn(1, 5)) +
                            "☆".repeat((5 - review.rating).coerceIn(0, 4)),
                        fontSize = 12.sp,
                        color = GmapsStar,
                    )
                }
            }
            if (comment.isNotBlank()) {
                Text(
                    text = comment,
                    fontSize = 13.sp,
                    color = GmapsInk,
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}
