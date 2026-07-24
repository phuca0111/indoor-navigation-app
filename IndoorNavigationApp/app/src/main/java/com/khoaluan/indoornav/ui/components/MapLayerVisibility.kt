package com.khoaluan.indoornav.ui.components

/**
 * Module #9 — bật/tắt layer trên Indoor Viewer.
 */
data class MapLayerVisibility(
    val rooms: Boolean = true,
    val walls: Boolean = true,
    val doors: Boolean = true,
    val pois: Boolean = true,
    val path: Boolean = true,
    /** Minimap đã gỡ khỏi UI; giữ field để tương thích copy(). */
    val miniMap: Boolean = false,
)
