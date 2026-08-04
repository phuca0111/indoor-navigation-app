package com.khoaluan.indoornav.ui.theme

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Mức A — chỉnh nhẹ theo bề rộng màn (điện thoại hẹp / thường / tablet).
 * Không đổi layout 2 cột; chỉ padding + giới hạn bề rộng form/card.
 */
object AdaptiveDimens {
    private const val COMPACT_WIDTH_DP = 360
    private const val EXPANDED_WIDTH_DP = 600

    @Composable
    fun screenWidthDp(): Int = LocalConfiguration.current.screenWidthDp

    @Composable
    fun isCompactWidth(): Boolean = screenWidthDp() < COMPACT_WIDTH_DP

    @Composable
    fun isExpandedWidth(): Boolean = screenWidthDp() >= EXPANDED_WIDTH_DP

    /** Padding ngang màn hình / form. */
    @Composable
    fun screenHorizontalPadding(): Dp = when {
        isCompactWidth() -> 12.dp
        isExpandedWidth() -> 48.dp
        else -> 24.dp
    }

    /** Form login / panel chỉ đường trên tablet không kéo full width. */
    @Composable
    fun readableMaxWidth(): Dp? =
        if (isExpandedWidth()) 520.dp else null

    /** Logo login hơi nhỏ hơn trên máy hẹp. */
    @Composable
    fun loginLogoSize(): Dp = if (isCompactWidth()) 88.dp else 104.dp

    @Composable
    fun loginTitleSize() = if (isCompactWidth()) 22.sp else 24.sp
}

/** Căn giữa + giới hạn bề rộng trên tablet; phone giữ full width. */
fun Modifier.adaptiveReadableWidth(): Modifier = composed {
    val maxW = AdaptiveDimens.readableMaxWidth()
    if (maxW != null) {
        this
            .fillMaxWidth()
            .widthIn(max = maxW)
    } else {
        this.fillMaxWidth()
    }
}
