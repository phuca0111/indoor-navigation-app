package com.khoaluan.indoornav.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.ArrowForward
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.data.api.BuildingExplorerDto
import com.khoaluan.indoornav.data.api.PlaceReviewDto
import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.ui.components.GmapsPill
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.i18n.workspaceStatusVi

private val GmapsTeal = Color(0xFF006D77)
private val GmapsBlue = Color(0xFF1A73E8)
private val GmapsInk = Color(0xFF202124)
private val GmapsMuted = Color(0xFF5F6368)
private val GmapsStar = Color(0xFFF9AB00)
private val GmapsCard = Color(0xFFF1F3F4)
private val GmapsChip = Color(0xFFE8F0FE)
private val GmapsGreen = Color(0xFF188038)

/**
 * Chi tiết địa điểm kiểu Google Maps (ảnh 3) — header + pill + tabs.
 */
@Composable
fun PlaceDetailScreen(
    building: Building,
    explorer: BuildingExplorerDto? = null,
    explorerLoading: Boolean = false,
    reviews: List<PlaceReviewDto> = emptyList(),
    reviewsLoading: Boolean = false,
    isFavorite: Boolean,
    isFollowing: Boolean,
    isLoggedIn: Boolean,
    onBack: () -> Unit,
    onDirections: () -> Unit,
    onToggleFavorite: () -> Unit,
    onShare: () -> Unit,
    onToggleFollow: () -> Unit,
    onReview: (initialRating: Int) -> Unit,
    onReport: () -> Unit,
    onPropose: () -> Unit = {},
    onSeeAllReviews: () -> Unit = {},
    onEnterIndoor: () -> Unit,
    onLoginRequired: () -> Unit,
    /** true khi nằm trong PlacePreviewSheet kéo — ẩn handle trùng. */
    embeddedInSheet: Boolean = false,
) {
    val floors = explorer?.totalFloors ?: building.totalFloors
    val pois = explorer?.poisCount
    val ratingAvg = explorer?.ratingAvg
    val ratingCount = explorer?.ratingCount ?: 0
    val creatorName = explorer?.creator?.fullName
    val updatedLabel = formatExplorerDate(explorer?.updatedAt)
    val hasIndoor = explorer?.hasPublishedIndoor
        ?: (building.hasPublishedIndoor == true)
    val hasPlace = !building.placeId.isNullOrBlank()
    val category = PlaceCategoryLabels.display(explorer?.category ?: building.category)
        .takeIf { it.isNotBlank() }
    val address = (explorer?.address ?: building.address)?.takeIf { it.isNotBlank() }
    val hasGps = building.gpsLocation != null || explorer?.gpsLocation != null

    var tab by remember { mutableIntStateOf(0) } // 0 overview, 1 reviews

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White),
    ) {
        if (!embeddedInSheet) {
            // Handle
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp, bottom = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .width(40.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color(0xFFDADCE0)),
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 4.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                text = building.name,
                fontWeight = FontWeight.Bold,
                fontSize = 22.sp,
                color = GmapsInk,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .weight(1f)
                    .padding(top = 8.dp),
            )
            if (hasPlace) {
                IconButton(onClick = {
                    if (!isLoggedIn) onLoginRequired() else onToggleFavorite()
                }) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(Color(0xFFF1F3F4), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = if (isFavorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                            contentDescription = tr("Lưu", "Save"),
                            tint = if (isFavorite) Color(0xFFD93025) else GmapsMuted,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
            IconButton(onClick = onShare) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .background(Color(0xFFF1F3F4), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Rounded.Share, contentDescription = tr("Chia sẻ", "Share"), tint = GmapsMuted, modifier = Modifier.size(18.dp))
                }
            }
            IconButton(onClick = onBack) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .background(Color(0xFFF1F3F4), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Rounded.Close, contentDescription = tr("Đóng", "Close"), tint = GmapsMuted, modifier = Modifier.size(18.dp))
                }
            }
        }

        Column(modifier = Modifier.padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (ratingAvg != null && ratingCount > 0) {
                    Text(
                        text = String.format("%.1f", ratingAvg).replace('.', ','),
                        fontSize = 13.sp,
                        color = GmapsMuted,
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    repeat(5) { i ->
                        Icon(
                            Icons.Rounded.Star,
                            contentDescription = null,
                            tint = if (i < ratingAvg.toInt()) GmapsStar else Color(0xFFE0E0E0),
                            modifier = Modifier.size(14.dp),
                        )
                    }
                    Text(text = " ($ratingCount)", fontSize = 13.sp, color = GmapsMuted)
                } else {
                    Text(tr("Chưa có đánh giá", "No reviews yet"), fontSize = 13.sp, color = GmapsMuted)
                }
            }
            if (category != null || address != null) {
                Text(
                    text = listOfNotNull(category, address).joinToString(" · "),
                    fontSize = 13.sp,
                    color = GmapsMuted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            Text(
                text = if (hasIndoor) {
                    tr("Có bản đồ trong nhà", "Indoor map available")
                } else {
                    tr("Chưa có bản đồ trong nhà", "No indoor map yet")
                },
                fontSize = 13.sp,
                color = if (hasIndoor) GmapsGreen else Color(0xFFD93025),
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        Spacer(modifier = Modifier.height(12.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            GmapsPill(
                label = tr("Đường đi", "Directions"),
                icon = Icons.Rounded.Place,
                filled = true,
                enabled = hasGps,
                onClick = onDirections,
            )
            GmapsPill(
                label = tr("Trong nhà", "Indoor"),
                icon = Icons.Rounded.Place,
                filled = false,
                enabled = hasIndoor || building.id.isNotBlank(),
                onClick = onEnterIndoor,
            )
            if (hasPlace) {
                GmapsPill(
                    label = if (isFollowing) tr("Đang theo", "Following") else tr("Theo dõi", "Follow"),
                    icon = if (isFollowing) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                    filled = false,
                    onClick = {
                        if (!isLoggedIn) onLoginRequired() else onToggleFollow()
                    },
                )
            }
            GmapsPill(
                label = tr("Chia sẻ", "Share"),
                icon = Icons.Rounded.Share,
                filled = false,
                onClick = onShare,
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Tabs
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
        ) {
            DetailTab(
                label = tr("Tổng quan", "Overview"),
                selected = tab == 0,
                onClick = { tab = 0 },
                modifier = Modifier.weight(1f),
            )
            DetailTab(
                label = tr("Bài đánh giá", "Reviews"),
                selected = tab == 1,
                onClick = { tab = 1 },
                modifier = Modifier.weight(1f),
            )
        }
        HorizontalDivider(color = Color(0xFFE8EAED))

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (explorerLoading && explorer == null) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(28.dp),
                        strokeWidth = 2.dp,
                        color = GmapsTeal,
                    )
                }
            }

            when (tab) {
                0 -> {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = GmapsCard,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Text(
                                tr("Thông tin", "Info"),
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp,
                                color = GmapsInk,
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            DetailRow(
                                tr("Bản đồ trong nhà", "Indoor map"),
                                when {
                                    hasIndoor -> tr("Có bản đồ đã xuất bản", "Published indoor map")
                                    else -> tr("Chưa có bản đồ trong nhà", "No indoor map yet")
                                },
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            DetailRow(
                                tr("Trạng thái", "Status"),
                                workspaceStatusVi(building.workspaceStatus ?: building.status),
                            )
                            if (!creatorName.isNullOrBlank()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                DetailRow(tr("Creator", "Creator"), creatorName)
                            }
                            if (!updatedLabel.isNullOrBlank()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                DetailRow(tr("Cập nhật", "Updated"), updatedLabel)
                            }
                            explorer?.description?.takeIf { it.isNotBlank() }?.let {
                                Spacer(modifier = Modifier.height(8.dp))
                                DetailRow(tr("Mô tả", "Description"), it)
                            }
                        }
                    }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(GmapsCard, RoundedCornerShape(12.dp))
                            .padding(vertical = 14.dp, horizontal = 8.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                    ) {
                        ExplorerStat(tr("Tầng", "Floors"), "$floors")
                        ExplorerStat(tr("POI", "POIs"), pois?.toString() ?: "—")
                        ExplorerStat(tr("Phòng", "Rooms"), explorer?.roomsCount?.toString() ?: "—")
                    }

                    Button(
                        onClick = onEnterIndoor,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        enabled = hasIndoor || building.id.isNotBlank(),
                        colors = ButtonDefaults.buttonColors(containerColor = GmapsTeal),
                        shape = RoundedCornerShape(24.dp),
                    ) {
                        Text(
                            tr("Vào bản đồ trong nhà", "Enter Indoor"),
                            fontWeight = FontWeight.SemiBold,
                        )
                    }

                    if (hasPlace) {
                        TextButton(onClick = {
                            if (!isLoggedIn) onLoginRequired() else onPropose()
                        }) {
                            Text(tr("Đề xuất chỉnh sửa", "Suggest an edit"), color = GmapsTeal)
                        }
                    }
                }
                else -> {
                    if (hasPlace) {
                        ReviewsSection(
                            ratingAvg = ratingAvg,
                            ratingCount = ratingCount,
                            reviews = reviews,
                            reviewsLoading = reviewsLoading,
                            isLoggedIn = isLoggedIn,
                            onRate = { stars ->
                                if (!isLoggedIn) onLoginRequired() else onReview(stars)
                            },
                            onReport = {
                                if (!isLoggedIn) onLoginRequired() else onReport()
                            },
                            onPropose = {
                                if (!isLoggedIn) onLoginRequired() else onPropose()
                            },
                            onSeeAll = onSeeAllReviews,
                        )
                    } else {
                        Text(
                            tr("Địa điểm này chưa hỗ trợ đánh giá.", "Reviews not available for this place."),
                            color = GmapsMuted,
                            fontSize = 14.sp,
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun DetailTab(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            .clickable(onClick = onClick)
            .padding(top = 8.dp),
    ) {
        Text(
            text = label,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            fontSize = 14.sp,
            color = if (selected) GmapsTeal else GmapsMuted,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(if (selected) GmapsTeal else Color.Transparent),
        )
    }
}

@Composable
private fun ReviewsSection(
    ratingAvg: Double?,
    ratingCount: Int,
    reviews: List<PlaceReviewDto>,
    reviewsLoading: Boolean,
    isLoggedIn: Boolean,
    onRate: (Int) -> Unit,
    onReport: () -> Unit,
    onPropose: () -> Unit = {},
    onSeeAll: () -> Unit,
) {
    Text(
        text = tr("Bài đánh giá", "Reviews"),
        fontWeight = FontWeight.Bold,
        fontSize = 18.sp,
        color = GmapsInk,
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
    ) {
        val avgText = if (ratingAvg != null && ratingCount > 0) {
            String.format("%.1f", ratingAvg).replace('.', ',')
        } else {
            "—"
        }
        Text(
            text = avgText,
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium,
            color = GmapsInk,
        )
        Icon(
            imageVector = Icons.Rounded.Star,
            contentDescription = null,
            tint = GmapsStar,
            modifier = Modifier
                .padding(horizontal = 4.dp)
                .size(18.dp),
        )
        Text(
            text = "($ratingCount)",
            fontSize = 14.sp,
            color = GmapsMuted,
        )
    }

    when {
        reviewsLoading && reviews.isEmpty() -> {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 16.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp,
                    color = GmapsBlue,
                )
            }
        }
        reviews.isEmpty() -> {
            Text(
                text = tr(
                    "Chưa có bài đánh giá. Hãy là người đầu tiên!",
                    "No reviews yet. Be the first!",
                ),
                fontSize = 13.sp,
                color = GmapsMuted,
                modifier = Modifier.padding(bottom = 8.dp),
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
                    ReviewCarouselCard(review)
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = GmapsCard,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onSeeAll),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = tr("Xem tất cả bài đánh giá", "See all reviews"),
                        fontWeight = FontWeight.Medium,
                        fontSize = 14.sp,
                        color = GmapsInk,
                    )
                    Icon(
                        imageVector = Icons.Rounded.ArrowForward,
                        contentDescription = null,
                        tint = GmapsInk,
                        modifier = Modifier
                            .padding(start = 6.dp)
                            .size(18.dp),
                    )
                }
            }
        }
    }

    Spacer(modifier = Modifier.height(8.dp))
    HorizontalDivider(color = Color(0xFFE8EAED))
    Spacer(modifier = Modifier.height(8.dp))

    var previewRating by remember { mutableStateOf(0) }
    Text(
        text = tr("Xếp hạng và đánh giá", "Rate and review"),
        fontWeight = FontWeight.Bold,
        fontSize = 18.sp,
        color = GmapsInk,
    )
    Spacer(modifier = Modifier.height(12.dp))
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(GmapsChip, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.Person,
                contentDescription = null,
                tint = GmapsBlue,
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            (1..5).forEach { n ->
                val filled = previewRating > 0 && n <= previewRating
                Text(
                    text = if (filled) "★" else "☆",
                    fontSize = 34.sp,
                    color = if (filled) GmapsStar else Color(0xFF80868B),
                    modifier = Modifier
                        .clip(CircleShape)
                        .clickable {
                            previewRating = n
                            onRate(n)
                        }
                        .padding(horizontal = 2.dp),
                )
            }
        }
    }
    Spacer(modifier = Modifier.height(12.dp))
    Text(
        text = if (isLoggedIn) {
            tr("Chạm sao để viết đánh giá", "Tap a star to write a review")
        } else {
            tr("Đăng nhập để đánh giá", "Sign in to leave a review")
        },
        fontSize = 12.sp,
        color = GmapsMuted,
    )
    Spacer(modifier = Modifier.height(8.dp))
    TextButton(onClick = onPropose) {
        Text(tr("Đề xuất chỉnh sửa", "Suggest an edit"), color = GmapsBlue)
    }
    TextButton(onClick = onReport) {
        Text(tr("Báo cáo địa điểm", "Report place"), color = Color(0xFFD93025))
    }
}

@Composable
private fun ReviewCarouselCard(review: PlaceReviewDto) {
    val name = review.user?.fullName?.takeIf { it.isNotBlank() }
        ?: review.user?.email?.substringBefore("@")
        ?: tr("Người dùng", "User")
    val initial = name.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    val whenLabel = relativeReviewTime(review.updatedAt ?: review.createdAt)
    val comment = review.comment?.trim().orEmpty()

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = GmapsCard,
        modifier = Modifier.width(260.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .background(GmapsBlue.copy(alpha = 0.15f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = initial,
                        fontWeight = FontWeight.Bold,
                        color = GmapsBlue,
                        fontSize = 14.sp,
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = name,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        color = GmapsInk,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        (1..5).forEach { n ->
                            Icon(
                                imageVector = Icons.Rounded.Star,
                                contentDescription = null,
                                tint = if (n <= review.rating) GmapsStar else Color(0xFFBDC1C6),
                                modifier = Modifier.size(14.dp),
                            )
                        }
                    }
                }
            }
            if (whenLabel != null) {
                Text(
                    text = whenLabel,
                    fontSize = 12.sp,
                    color = GmapsMuted,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            if (comment.isNotBlank()) {
                Text(
                    text = comment,
                    fontSize = 13.sp,
                    color = GmapsInk,
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 18.sp,
                    modifier = Modifier.padding(top = 6.dp),
                )
            } else {
                Text(
                    text = tr("Chỉ xếp hạng sao", "Rating only"),
                    fontSize = 13.sp,
                    color = GmapsMuted,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun ExplorerStat(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = GmapsTeal)
        Text(label, fontSize = 12.sp, color = GmapsMuted)
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(text = label, fontSize = 12.sp, color = GmapsMuted)
        Text(text = value, fontSize = 15.sp, color = GmapsInk)
    }
}

private fun formatExplorerDate(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    val day = iso.take(10)
    if (day.length == 10 && day[4] == '-' && day[7] == '-') {
        return "${day.substring(8, 10)}/${day.substring(5, 7)}/${day.substring(0, 4)}"
    }
    return day
}

private fun relativeReviewTime(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    return try {
        val ms = java.time.Instant.parse(iso).toEpochMilli()
        val days = ((System.currentTimeMillis() - ms) / 86_400_000L).coerceAtLeast(0)
        when {
            days < 1 -> "gần đây"
            days < 30 -> "$days ngày"
            days < 365 -> "${days / 30} tháng"
            else -> {
                val y = days / 365
                if (y <= 1) "một năm" else "$y năm"
            }
        }
    } catch (_: Exception) {
        null
    }
}
