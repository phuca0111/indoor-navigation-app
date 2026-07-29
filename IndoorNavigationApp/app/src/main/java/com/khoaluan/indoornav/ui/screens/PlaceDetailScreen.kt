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
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.i18n.workspaceStatusVi

private val GmapsBlue = Color(0xFF1A73E8)
private val GmapsInk = Color(0xFF202124)
private val GmapsMuted = Color(0xFF5F6368)
private val GmapsStar = Color(0xFFF9AB00)
private val GmapsCard = Color(0xFFF1F3F4)
private val GmapsChip = Color(0xFFE8F0FE)

/**
 * GĐ2 Building Explorer — tổng quan + đánh giá kiểu Google Maps.
 */
@OptIn(ExperimentalMaterial3Api::class)
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

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(building.name, maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = "Quay lại")
                    }
                },
                actions = {
                    if (hasPlace) {
                        IconButton(onClick = {
                            if (!isLoggedIn) onLoginRequired() else onToggleFavorite()
                        }) {
                            Icon(
                                imageVector = if (isFavorite) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                                contentDescription = "Yêu thích",
                                tint = if (isFavorite) Color(0xFFD93025) else GmapsMuted,
                            )
                        }
                    }
                    IconButton(onClick = onShare) {
                        Icon(Icons.Rounded.Share, contentDescription = "Chia sẻ")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
            )
        },
        containerColor = Color.White,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = building.name,
                fontWeight = FontWeight.Bold,
                fontSize = 24.sp,
                color = GmapsInk,
            )
            Text(
                text = listOfNotNull(
                    PlaceCategoryLabels.display(explorer?.category ?: building.category)
                        .takeIf { it.isNotBlank() },
                    (explorer?.address ?: building.address)?.takeIf { it.isNotBlank() },
                ).joinToString(" · ").ifBlank { tr("Chưa có địa chỉ", "No address yet") },
                fontSize = 14.sp,
                color = GmapsMuted,
            )

            if (explorerLoading && explorer == null) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(28.dp),
                        strokeWidth = 2.dp,
                        color = GmapsBlue,
                    )
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

            SectionTitle(tr("Tổng quan", "Overview"))
            DetailRow(
                tr("Bản đồ trong nhà", "Indoor map"),
                when {
                    hasIndoor -> tr("Có bản đồ đã xuất bản", "Published indoor map")
                    else -> tr("Chưa có bản đồ trong nhà", "No indoor map yet")
                },
            )
            DetailRow(
                tr("Trạng thái", "Status"),
                workspaceStatusVi(building.workspaceStatus ?: building.status),
            )
            if (!creatorName.isNullOrBlank()) {
                DetailRow(tr("Creator", "Creator"), creatorName)
            }
            if (!updatedLabel.isNullOrBlank()) {
                DetailRow(tr("Cập nhật", "Updated"), updatedLabel)
            }
            explorer?.description?.takeIf { it.isNotBlank() }?.let {
                DetailRow(tr("Mô tả", "Description"), it)
            }

            HorizontalDivider(color = Color(0xFFE8EAED))
            SectionTitle(tr("Hành động", "Actions"))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = onDirections,
                    enabled = building.gpsLocation != null || explorer?.gpsLocation != null,
                    modifier = Modifier.weight(1f),
                ) { Text(tr("Chỉ đường", "Directions")) }
                if (hasPlace) {
                    OutlinedButton(
                        onClick = {
                            if (!isLoggedIn) onLoginRequired() else onToggleFollow()
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            if (isFollowing) tr("Bỏ theo dõi", "Unfollow")
                            else tr("Theo dõi", "Follow"),
                        )
                    }
                }
            }

            if (hasPlace) {
                HorizontalDivider(color = Color(0xFFE8EAED))
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
            }

            HorizontalDivider(color = Color(0xFFE8EAED))
            SectionTitle(tr("Bản đồ trong nhà", "Indoor map"))
            Text(
                text = tr(
                    "Xem sơ đồ tầng, điểm POI và điều hướng trong công trình.",
                    "View floor plans, POIs and indoor navigation.",
                ),
                fontSize = 13.sp,
                color = GmapsMuted,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Button(
                onClick = onEnterIndoor,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                enabled = hasIndoor || building.id.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = GmapsBlue),
                shape = RoundedCornerShape(24.dp),
            ) {
                Text(
                    tr("Vào bản đồ trong nhà", "Enter Indoor"),
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
        }
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
    // —— Bài đánh giá (tóm tắt + carousel) ——
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

    // —— Xếp hạng và đánh giá (interactive) ——
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
        Text(value, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = GmapsBlue)
        Text(label, fontSize = 12.sp, color = GmapsMuted)
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp,
        color = GmapsInk,
    )
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
        formatExplorerDate(iso)
    }
}
