package com.khoaluan.indoornav.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import com.khoaluan.indoornav.data.api.PlaceReviewDto
import com.khoaluan.indoornav.ui.i18n.tr

private val Ink = Color(0xFF202124)
private val Muted = Color(0xFF5F6368)
private val StarYellow = Color(0xFFF9AB00)
private val Blue = Color(0xFF1A73E8)
private val CardBg = Color(0xFFF1F3F4)
private val ChipBg = Color(0xFFE8F0FE)
private val BarTrack = Color(0xFFE8EAED)
private val BarFill = Color(0xFF1A73E8)

private enum class ReviewSort {
    RELEVANT,
    NEWEST,
    HIGHEST,
    LOWEST,
}

/**
 * Tab "Bài đánh giá" kiểu Google Maps: điểm + histogram + xếp hạng + bộ lọc + danh sách.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceReviewsScreen(
    placeName: String,
    ratingAvg: Double?,
    ratingCount: Int,
    reviews: List<PlaceReviewDto>,
    reviewsLoading: Boolean,
    isLoggedIn: Boolean,
    onBack: () -> Unit,
    onRate: (initialRating: Int) -> Unit,
    onLoginRequired: () -> Unit,
) {
    var sort by remember { mutableStateOf(ReviewSort.RELEVANT) }
    var previewRating by remember { mutableStateOf(0) }

    val distribution = remember(reviews) {
        IntArray(6).also { counts ->
            reviews.forEach { r ->
                val s = r.rating.coerceIn(1, 5)
                counts[s]++
            }
        }
    }
    val maxBar = (1..5).maxOfOrNull { distribution[it] }?.coerceAtLeast(1) ?: 1
    val avg = ratingAvg ?: reviews.map { it.rating }.average().takeIf { reviews.isNotEmpty() }
    val countLabel = if (ratingCount > 0) ratingCount else reviews.size

    val sorted = remember(reviews, sort) {
        when (sort) {
            ReviewSort.RELEVANT -> reviews.sortedWith(
                compareByDescending<PlaceReviewDto> { it.helpfulCount }
                    .thenByDescending { it.updatedAt ?: it.createdAt },
            )
            ReviewSort.NEWEST -> reviews.sortedByDescending { it.updatedAt ?: it.createdAt }
            ReviewSort.HIGHEST -> reviews.sortedWith(
                compareByDescending<PlaceReviewDto> { it.rating }
                    .thenByDescending { it.updatedAt ?: it.createdAt },
            )
            ReviewSort.LOWEST -> reviews.sortedWith(
                compareBy<PlaceReviewDto> { it.rating }
                    .thenByDescending { it.updatedAt ?: it.createdAt },
            )
        }
    }

    Scaffold(
        containerColor = Color.White,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        placeName,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontWeight = FontWeight.Medium,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = tr("Quay lại", "Back"))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                horizontal = 16.dp,
                vertical = 8.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            item {
                Text(
                    text = tr("Bài đánh giá", "Reviews"),
                    fontWeight = FontWeight.Bold,
                    fontSize = 22.sp,
                    color = Ink,
                )
                Spacer(Modifier.height(16.dp))
                RatingSummaryRow(
                    avg = avg,
                    count = countLabel,
                    distribution = distribution,
                    maxBar = maxBar,
                )
                Spacer(Modifier.height(20.dp))
                HorizontalDivider(color = Color(0xFFE8EAED))
                Spacer(Modifier.height(16.dp))
            }

            item {
                Text(
                    text = tr("Xếp hạng và đánh giá", "Rate and review"),
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = Ink,
                )
                Spacer(Modifier.height(12.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .background(ChipBg, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Rounded.Person, contentDescription = null, tint = Blue)
                    }
                    Spacer(Modifier.width(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        (1..5).forEach { n ->
                            val filled = previewRating > 0 && n <= previewRating
                            Text(
                                text = if (filled) "★" else "☆",
                                fontSize = 32.sp,
                                color = if (filled) StarYellow else Color(0xFF80868B),
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .clickable {
                                        previewRating = n
                                        if (!isLoggedIn) onLoginRequired() else onRate(n)
                                    }
                                    .padding(2.dp),
                            )
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    text = if (isLoggedIn) {
                        tr("Chạm sao để viết đánh giá", "Tap a star to write a review")
                    } else {
                        tr("Đăng nhập để đánh giá", "Sign in to leave a review")
                    },
                    fontSize = 12.sp,
                    color = Muted,
                )
                Spacer(Modifier.height(16.dp))
                HorizontalDivider(color = Color(0xFFE8EAED))
                Spacer(Modifier.height(12.dp))
            }

            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    SortChip(
                        selected = sort == ReviewSort.RELEVANT,
                        label = tr("Phù hợp nhất", "Most relevant"),
                        onClick = { sort = ReviewSort.RELEVANT },
                    )
                    SortChip(
                        selected = sort == ReviewSort.NEWEST,
                        label = tr("Mới nhất", "Newest"),
                        onClick = { sort = ReviewSort.NEWEST },
                    )
                    SortChip(
                        selected = sort == ReviewSort.HIGHEST,
                        label = tr("Cao nhất", "Highest"),
                        onClick = { sort = ReviewSort.HIGHEST },
                    )
                    SortChip(
                        selected = sort == ReviewSort.LOWEST,
                        label = tr("Thấp nhất", "Lowest"),
                        onClick = { sort = ReviewSort.LOWEST },
                    )
                }
                Spacer(Modifier.height(12.dp))
            }

            when {
                reviewsLoading && reviews.isEmpty() -> {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 40.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = Blue, strokeWidth = 2.dp)
                        }
                    }
                }
                sorted.isEmpty() -> {
                    item {
                        Text(
                            text = tr(
                                "Chưa có bài đánh giá. Hãy là người đầu tiên!",
                                "No reviews yet. Be the first!",
                            ),
                            color = Muted,
                            modifier = Modifier.padding(vertical = 24.dp),
                        )
                    }
                }
                else -> {
                    items(sorted, key = { it.id ?: "${it.user?.id}-${it.updatedAt}" }) { review ->
                        FullReviewItem(review)
                        HorizontalDivider(color = Color(0xFFF1F3F4))
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun RatingSummaryRow(
    avg: Double?,
    count: Int,
    distribution: IntArray,
    maxBar: Int,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(end = 20.dp),
        ) {
            Text(
                text = if (avg != null && count > 0) {
                    String.format("%.1f", avg).replace('.', ',')
                } else {
                    "—"
                },
                fontSize = 48.sp,
                fontWeight = FontWeight.Normal,
                color = Ink,
                lineHeight = 52.sp,
            )
            Row {
                val filled = avg?.toInt()?.coerceIn(0, 5) ?: 0
                val half = avg != null && (avg - filled) >= 0.4
                (1..5).forEach { n ->
                    val on = when {
                        n <= filled -> true
                        n == filled + 1 && half -> true
                        else -> false
                    }
                    Icon(
                        imageVector = Icons.Rounded.Star,
                        contentDescription = null,
                        tint = if (on) StarYellow else Color(0xFFBDC1C6),
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
            Text(
                text = "($count)",
                fontSize = 13.sp,
                color = Muted,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 4.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            (5 downTo 1).forEach { star ->
                val ratio = distribution[star].toFloat() / maxBar.toFloat()
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = "$star",
                        fontSize = 11.sp,
                        color = Muted,
                        modifier = Modifier.width(12.dp),
                    )
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(BarTrack),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(ratio.coerceIn(0f, 1f))
                                .background(BarFill, RoundedCornerShape(4.dp)),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SortChip(
    selected: Boolean,
    label: String,
    onClick: () -> Unit,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = {
            Text(
                text = label,
                fontSize = 13.sp,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            )
        },
        leadingIcon = if (selected) {
            {
                Icon(
                    Icons.Rounded.Check,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                )
            }
        } else {
            null
        },
        shape = RoundedCornerShape(20.dp),
        colors = FilterChipDefaults.filterChipColors(
            containerColor = CardBg,
            labelColor = Ink,
            selectedContainerColor = Color(0xFFE8EAED),
            selectedLabelColor = Ink,
            selectedLeadingIconColor = Ink,
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = selected,
            borderColor = Color.Transparent,
            selectedBorderColor = Color.Transparent,
        ),
    )
}

@Composable
private fun FullReviewItem(review: PlaceReviewDto) {
    val name = review.user?.fullName?.takeIf { it.isNotBlank() }
        ?: review.user?.email?.substringBefore("@")
        ?: tr("Người dùng", "User")
    val initial = name.firstOrNull()?.uppercaseChar()?.toString() ?: "?"
    val whenLabel = relativeReviewTimeLabel(review.updatedAt ?: review.createdAt)
    val comment = review.comment?.trim().orEmpty()
    var expanded by remember { mutableStateOf(false) }

    Column(modifier = Modifier.padding(vertical = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(Blue.copy(alpha = 0.15f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(initial, fontWeight = FontWeight.Bold, color = Blue, fontSize = 15.sp)
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = name,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                    color = Ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            (1..5).forEach { n ->
                Icon(
                    imageVector = Icons.Rounded.Star,
                    contentDescription = null,
                    tint = if (n <= review.rating) StarYellow else Color(0xFFBDC1C6),
                    modifier = Modifier.size(14.dp),
                )
            }
            if (whenLabel != null) {
                Text(
                    text = "  ·  $whenLabel",
                    fontSize = 12.sp,
                    color = Muted,
                )
            }
        }
        if (comment.isNotBlank()) {
            val long = comment.length > 160
            Text(
                text = if (!expanded && long) comment.take(160).trimEnd() + "…" else comment,
                fontSize = 14.sp,
                color = Ink,
                lineHeight = 20.sp,
                modifier = Modifier.padding(top = 8.dp),
            )
            if (long) {
                Text(
                    text = if (expanded) tr("Thu gọn", "Show less") else tr("khác", "more"),
                    color = Blue,
                    fontSize = 14.sp,
                    modifier = Modifier
                        .padding(top = 2.dp)
                        .clickable { expanded = !expanded },
                )
            }
        } else {
            Text(
                text = tr("Chỉ xếp hạng sao", "Rating only"),
                fontSize = 13.sp,
                color = Muted,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

private fun relativeReviewTimeLabel(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    return try {
        val ms = java.time.Instant.parse(iso).toEpochMilli()
        val days = ((System.currentTimeMillis() - ms) / 86_400_000L).coerceAtLeast(0)
        when {
            days < 1 -> "gần đây"
            days < 30 -> "$days ngày trước"
            days < 365 -> {
                val m = (days / 30).coerceAtLeast(1)
                "$m tháng trước"
            }
            else -> {
                val y = days / 365
                if (y <= 1) "một năm trước" else "$y năm trước"
            }
        }
    } catch (_: Exception) {
        iso.take(10)
    }
}
