package com.khoaluan.indoornav.ui.components

import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.Poi
import com.khoaluan.indoornav.data.model.Room
import kotlin.math.hypot

/**
 * Hit-test chạm map trong nhà → phòng / POI có tên (để mở sheet kiểu Google Maps).
 */
object IndoorMapHitTest {

    /** Bán kính chạm POI (map px). */
    private const val POI_HIT_RADIUS = 48f

    fun findNamedRoomAt(mapData: MapData, mapX: Float, mapY: Float): Room? {
        // Ưu tiên phòng nhỏ / trên cùng: duyệt ngược danh sách
        for (i in mapData.rooms.indices.reversed()) {
            val room = mapData.rooms[i]
            if (room.name.isBlank()) continue
            if (containsRoom(room, mapX, mapY)) return room
        }
        return null
    }

    fun findNamedPoiAt(mapData: MapData, mapX: Float, mapY: Float): Poi? {
        var best: Poi? = null
        var bestDist = POI_HIT_RADIUS
        for (poi in mapData.pois) {
            val name = poi.name?.trim().orEmpty()
            if (name.isEmpty()) continue
            val d = hypot(poi.x - mapX, poi.y - mapY)
            if (d <= bestDist) {
                bestDist = d
                best = poi
            }
        }
        return best
    }

    private fun containsRoom(room: Room, x: Float, y: Float): Boolean {
        val shape = room.shape?.lowercase()
        return when {
            shape == "polygon" && !room.points.isNullOrEmpty() ->
                pointInPolygon(x, y, room.points.map { it.x to it.y })
            shape == "circle" && room.cx != null && room.cy != null && room.radius != null -> {
                val dx = x - room.cx
                val dy = y - room.cy
                dx * dx + dy * dy <= room.radius * room.radius
            }
            else -> {
                val left = room.x.toFloat()
                val top = room.y.toFloat()
                val right = left + room.width
                val bottom = top + room.height
                x in left..right && y in top..bottom
            }
        }
    }

    private fun pointInPolygon(x: Float, y: Float, poly: List<Pair<Float, Float>>): Boolean {
        if (poly.size < 3) return false
        var inside = false
        var j = poly.size - 1
        for (i in poly.indices) {
            val (xi, yi) = poly[i]
            val (xj, yj) = poly[j]
            if ((yi > y) != (yj > y) &&
                x < (xj - xi) * (y - yi) / (yj - yi + 1e-9f) + xi
            ) {
                inside = !inside
            }
            j = i
        }
        return inside
    }
}
