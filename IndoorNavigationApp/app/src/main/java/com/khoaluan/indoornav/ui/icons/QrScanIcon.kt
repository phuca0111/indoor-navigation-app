package com.khoaluan.indoornav.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/** Icon quét mã QR (thay kính lúp trên FAB). */
val QrScanIcon: ImageVector
    get() {
        if (_qrScanIcon != null) return _qrScanIcon!!
        _qrScanIcon = ImageVector.Builder(
            name = "QrScan",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            // Khung góc trên-trái
            path(fill = SolidColor(Color.Black)) {
                moveTo(3f, 5f)
                verticalLineTo(3f)
                horizontalLineTo(5f)
                verticalLineTo(5f)
                horizontalLineTo(3f)
                close()
                moveTo(3f, 11f)
                verticalLineTo(5f)
                horizontalLineTo(5f)
                verticalLineTo(9f)
                horizontalLineTo(9f)
                verticalLineTo(11f)
                horizontalLineTo(3f)
                close()
            }
            // Khung góc trên-phải
            path(fill = SolidColor(Color.Black)) {
                moveTo(21f, 5f)
                verticalLineTo(3f)
                horizontalLineTo(19f)
                verticalLineTo(5f)
                horizontalLineTo(21f)
                close()
                moveTo(21f, 11f)
                horizontalLineTo(15f)
                verticalLineTo(9f)
                horizontalLineTo(19f)
                verticalLineTo(5f)
                horizontalLineTo(21f)
                verticalLineTo(11f)
                close()
            }
            // Khung góc dưới-trái
            path(fill = SolidColor(Color.Black)) {
                moveTo(5f, 19f)
                verticalLineTo(21f)
                horizontalLineTo(3f)
                verticalLineTo(19f)
                horizontalLineTo(5f)
                close()
                moveTo(5f, 15f)
                verticalLineTo(19f)
                horizontalLineTo(9f)
                verticalLineTo(21f)
                horizontalLineTo(3f)
                verticalLineTo(13f)
                horizontalLineTo(5f)
                verticalLineTo(15f)
                close()
            }
            // Khung góc dưới-phải
            path(fill = SolidColor(Color.Black)) {
                moveTo(19f, 19f)
                verticalLineTo(21f)
                horizontalLineTo(21f)
                verticalLineTo(19f)
                horizontalLineTo(19f)
                close()
                moveTo(19f, 15f)
                horizontalLineTo(21f)
                verticalLineTo(21f)
                horizontalLineTo(15f)
                verticalLineTo(19f)
                horizontalLineTo(19f)
                verticalLineTo(15f)
                close()
            }
            // QR modules
            path(fill = SolidColor(Color.Black)) {
                moveTo(7f, 7f)
                horizontalLineTo(11f)
                verticalLineTo(11f)
                horizontalLineTo(7f)
                close()
            }
            path(fill = SolidColor(Color.Black)) {
                moveTo(13f, 7f)
                horizontalLineTo(17f)
                verticalLineTo(11f)
                horizontalLineTo(13f)
                close()
            }
            path(fill = SolidColor(Color.Black)) {
                moveTo(7f, 13f)
                horizontalLineTo(11f)
                verticalLineTo(17f)
                horizontalLineTo(7f)
                close()
            }
            path(fill = SolidColor(Color.Black)) {
                moveTo(13f, 13f)
                horizontalLineTo(14.5f)
                verticalLineTo(14.5f)
                horizontalLineTo(13f)
                close()
            }
            path(fill = SolidColor(Color.Black)) {
                moveTo(15.5f, 13f)
                horizontalLineTo(17f)
                verticalLineTo(14.5f)
                horizontalLineTo(15.5f)
                close()
            }
            path(fill = SolidColor(Color.Black)) {
                moveTo(13f, 15.5f)
                horizontalLineTo(14.5f)
                verticalLineTo(17f)
                horizontalLineTo(13f)
                close()
            }
            path(fill = SolidColor(Color.Black)) {
                moveTo(16f, 16f)
                horizontalLineTo(17f)
                verticalLineTo(17f)
                horizontalLineTo(16f)
                close()
            }
            // Đường quét ngang
            path(fill = SolidColor(Color.Black)) {
                moveTo(4f, 11.25f)
                horizontalLineTo(20f)
                verticalLineTo(12.75f)
                horizontalLineTo(4f)
                close()
            }
        }.build()
        return _qrScanIcon!!
    }

private var _qrScanIcon: ImageVector? = null
