package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
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

private val GmapsBlue = Color(0xFF1A73E8)
private val GmapsInk = Color(0xFF202124)
private val GmapsMuted = Color(0xFF5F6368)
private val GmapsStar = Color(0xFFF9AB00)
private val GmapsCard = Color(0xFFF1F3F4)

/**
 * Sheet phòng/POI trong nhà — chỉ đường + đánh giá/lưu/báo cáo (kiểu Google Maps outdoor).
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
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
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
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 560.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(place.name, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = GmapsInk)
            Text(typeLabel, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)

            Row(verticalAlignment = Alignment.CenterVertically) {
                val avgText = if (ratingAvg != null && ratingCount > 0) {
                    String.format("%.1f", ratingAvg).replace('.', ',')
                } else {
                    "—"
                }
                Text(avgText, fontSize = 16.sp, fontWeight = FontWeight.Medium, color = GmapsInk)
                Icon(
                    imageVector = Icons.Rounded.Star,
                    contentDescription = null,
                    tint = GmapsStar,
                    modifier = Modifier
                        .padding(horizontal = 4.dp)
                        .size(18.dp),
                )
                Text("($ratingCount)", fontSize = 14.sp, color = GmapsMuted)
            }

            place.openingHours?.takeIf { it.isNotBlank() }?.let {
                Text(tr("Giờ mở: $it", "Hours: $it"), fontSize = 13.sp, color = GmapsMuted)
            }
            (summary?.description ?: place.description)?.takeIf { it.isNotBlank() }?.let {
                Text(it, fontSize = 14.sp, color = GmapsInk)
            }

            if (!notice.isNullOrBlank() && !notice.contains("lỗi", ignoreCase = true)) {
                Text(notice, fontSize = 12.sp, color = Color(0xFF188038))
            } else if (!notice.isNullOrBlank()) {
                Text(notice, fontSize = 12.sp, color = Color(0xFFD93025))
            }

            if (canEngage) {
                HorizontalDivider(
                    color = Color(0xFFE8EAED),
                    modifier = Modifier.padding(vertical = 4.dp),
                )

                Text(
                    tr("Bài đánh giá", "Reviews"),
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = GmapsInk,
                )

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
                    modifier = Modifier.padding(top = 4.dp),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
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
                        tr("Đăng nhập để đánh giá / lưu / báo cáo", "Sign in to rate, save, or report")
                    },
                    fontSize = 12.sp,
                    color = GmapsMuted,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedButton(
                        onClick = {
                            if (!isLoggedIn) onLoginRequired() else onToggleFavorite()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(
                            imageVector = if (isFavorite) {
                                Icons.Rounded.Favorite
                            } else {
                                Icons.Rounded.FavoriteBorder
                            },
                            contentDescription = null,
                            tint = if (isFavorite) Color(0xFFD93025) else GmapsBlue,
                            modifier = Modifier
                                .padding(end = 6.dp)
                                .size(18.dp),
                        )
                        Text(if (isFavorite) tr("Đã lưu", "Saved") else tr("Lưu", "Save"))
                    }
                    TextButton(onClick = {
                        if (!isLoggedIn) onLoginRequired() else onReport()
                    }) {
                        Text(tr("Báo cáo", "Report"), color = Color(0xFFD93025))
                    }
                }
            }

            if (onSetStandingLocation != null) {
                OutlinedButton(
                    onClick = onSetStandingLocation,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(tr("Đặt vị trí đứng", "Set my location"))
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(onClick = onPreviewPath, modifier = Modifier.weight(1f)) {
                    Text(tr("Xem đường", "Preview"))
                }
                Button(
                    onClick = onStartNavigation,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = GmapsBlue),
                ) {
                    Text(tr("Bắt đầu", "Start"))
                }
            }
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                Text(tr("Đóng", "Close"))
            }
            Box(modifier = Modifier.height(12.dp))
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
