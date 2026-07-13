package com.khoaluan.indoornav.ui.navigation

import androidx.compose.ui.geometry.Offset

/**
 * G1 — Cờ UI card điều hướng.
 * Tách khỏi Compose để unit-test được: chọn đích ≠ tự hiện path.
 */
data class NavigationUiFlags(
    val showBottomCard: Boolean,
    /** Spinner "Đang tìm đường..." — G1 không dùng khi chỉ mới chọn đích. */
    val isSearchingPath: Boolean,
    /**
     * True khi đã chọn đích và chưa bắt đầu điều hướng.
     * Có thể chưa có path (chờ bấm "Xem đường").
     */
    val isPathPreview: Boolean,
    /** True khi đã chọn đích nhưng chưa có polyline path. */
    val awaitingPathPreview: Boolean,
)

fun computeNavigationUiFlags(
    destinationName: String?,
    path: List<Offset>?,
    isNavigatingMode: Boolean,
): NavigationUiFlags {
    val hasDestination = !destinationName.isNullOrBlank()
    val hasPath = !path.isNullOrEmpty()
    val showBottomCard = hasDestination || hasPath
    // G1: không hiện spinner chỉ vì path == null sau khi chọn đích
    val isSearchingPath = false
    val isPathPreview = hasDestination && !isNavigatingMode
    val awaitingPathPreview = hasDestination && !isNavigatingMode && !hasPath
    return NavigationUiFlags(
        showBottomCard = showBottomCard,
        isSearchingPath = isSearchingPath,
        isPathPreview = isPathPreview,
        awaitingPathPreview = awaitingPathPreview,
    )
}

/** G1b — khóa phiên định vị gắn với đúng 1 map (building + tầng). */
fun buildMapSessionKey(buildingId: String, floor: Int): String = "$buildingId|$floor"

/**
 * G1b — chỉ vẽ chấm xanh khi có vị trí và phiên localize khớp map đang mở.
 * Tránh dính tọa độ map cũ khi đổi building/tầng mà chưa quét QR lại.
 */
fun shouldDrawUserMarker(
    userPos: Offset?,
    localizationMapKey: String?,
    currentMapKey: String?,
): Boolean {
    if (userPos == null) return false
    if (localizationMapKey.isNullOrBlank() || currentMapKey.isNullOrBlank()) return false
    return localizationMapKey == currentMapKey
}
