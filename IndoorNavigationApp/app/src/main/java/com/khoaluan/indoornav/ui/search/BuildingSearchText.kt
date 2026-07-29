package com.khoaluan.indoornav.ui.search

import com.khoaluan.indoornav.data.model.Building
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Haystack + điểm khớp tìm tòa nhà / Place outdoor:
 * tên, địa chỉ, danh mục, slug, id, mô tả, alias, tọa độ (chuỗi + cặp lat,lng).
 */
object BuildingSearchText {

    /** Chuỗi chính để fuzzy (nameOf). */
    fun primaryHaystack(b: Building): String = listOfNotNull(
        b.name,
        b.address,
        b.category,
        b.placeSlug,
        b.description,
    ).joinToString(" ")

    /** Từ khóa phụ (keywordsOf) — id / GPS / alias. */
    fun keywordTokens(b: Building): List<String> {
        val gps = b.gpsLocation
        val tokens = mutableListOf<String>()
        b.placeId?.takeIf { it.isNotBlank() }?.let { tokens += it }
        b.id.takeIf { it.isNotBlank() && !it.startsWith("place:") }?.let { tokens += it }
        b.id.removePrefix("place:").takeIf { it.isNotBlank() && it != b.id }?.let { tokens += it }
        b.placeSlug?.takeIf { it.isNotBlank() }?.let { tokens += it }
        b.aliases.orEmpty().forEach { a -> if (a.isNotBlank()) tokens += a }
        b.description?.takeIf { it.isNotBlank() }?.let { tokens += it }
        if (gps != null && !(gps.lat == 0.0 && gps.lng == 0.0)) {
            tokens += formatCoordPair(gps.lat, gps.lng)
            tokens += formatCoord(gps.lat)
            tokens += formatCoord(gps.lng)
            // Độ dài thập phân khác nhau (gõ dở 10.74 / 106.61)
            for (p in 2..6) {
                tokens += "%.${p}f".format(gps.lat)
                tokens += "%.${p}f".format(gps.lng)
                tokens += "%.${p}f, %.${p}f".format(gps.lat, gps.lng)
            }
        }
        return tokens.distinct()
    }

    /**
     * Điểm khớp: fuzzy text + ưu tiên khi query là tọa độ gần GPS tòa.
     */
    fun matchScore(query: String, b: Building): Int {
        val q = query.trim()
        if (q.isEmpty()) return 0
        val textScore = maxOf(
            SearchFuzzy.matchScore(q, primaryHaystack(b)),
            keywordTokens(b).maxOfOrNull { SearchFuzzy.matchScore(q, it) } ?: 0,
        )
        val coordScore = coordinateMatchScore(q, b)
        return maxOf(textScore, coordScore)
    }

    fun filterRanked(query: String, items: List<Building>, limit: Int = 40): List<Building> {
        if (query.isBlank()) return emptyList()
        return items
            .map { it to matchScore(query, it) }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }
            .take(limit)
            .map { it.first }
    }

    private fun formatCoord(v: Double): String = "%.6f".format(v).trimEnd('0').trimEnd('.')

    private fun formatCoordPair(lat: Double, lng: Double): String =
        "${formatCoord(lat)}, ${formatCoord(lng)}"

    /**
     * "10.74, 106.61" / "10.742775 106.6119" → khớp gần GPS (≤ ~120 m tăng điểm).
     * Một số đơn ("10.74") → khớp chuỗi lat/lng.
     */
    private fun coordinateMatchScore(query: String, b: Building): Int {
        val gps = b.gpsLocation ?: return 0
        if (gps.lat == 0.0 && gps.lng == 0.0) return 0

        parseLatLngPair(query)?.let { (qLat, qLng) ->
            val meters = haversineMeters(qLat, qLng, gps.lat, gps.lng)
            return when {
                meters <= 15 -> 950
                meters <= 50 -> 880
                meters <= 120 -> 800
                meters <= 300 -> 650
                meters <= 800 -> 400
                else -> 0
            }
        }

        val single = query.trim().replace(',', '.')
        if (single.matches(Regex("^-?\\d+(\\.\\d+)?$"))) {
            val latStr = gps.lat.toString()
            val lngStr = gps.lng.toString()
            val nq = SearchFuzzy.normalize(single)
            if (SearchFuzzy.normalize(latStr).contains(nq) ||
                SearchFuzzy.normalize(lngStr).contains(nq) ||
                "%.6f".format(gps.lat).contains(single) ||
                "%.6f".format(gps.lng).contains(single)
            ) {
                return 700 + single.length.coerceAtMost(40)
            }
            // Gần đúng số (sai số nhỏ)
            val v = single.toDoubleOrNull() ?: return 0
            if (abs(gps.lat - v) < 0.002 || abs(gps.lng - v) < 0.002) return 620
        }
        return 0
    }

    fun parseLatLngPair(raw: String): Pair<Double, Double>? {
        val t = raw.trim()
        val m = Regex(
            "^(-?\\d+(?:[.,]\\d+)?)\\s*[,;\\s]+\\s*(-?\\d+(?:[.,]\\d+)?)\\s*$",
        ).find(t) ?: return null
        val lat = m.groupValues[1].replace(',', '.').toDoubleOrNull() ?: return null
        val lng = m.groupValues[2].replace(',', '.').toDoubleOrNull() ?: return null
        if (lat !in -90.0..90.0 || lng !in -180.0..180.0) return null
        // Việt Nam / phổ biến: lat ~8–24, lng ~102–110 — nếu đảo ngược thì swap
        return if (abs(lat) > 90) null
        else if (lat in 8.0..24.0 && lng in 100.0..120.0) lat to lng
        else if (lng in 8.0..24.0 && lat in 100.0..120.0) lng to lat
        else lat to lng
    }

    private fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371000.0
        val p1 = Math.toRadians(lat1)
        val p2 = Math.toRadians(lat2)
        val dp = Math.toRadians(lat2 - lat1)
        val dl = Math.toRadians(lon2 - lon1)
        val a = sin(dp / 2) * sin(dp / 2) +
            cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return 2 * r * atan2(sqrt(a), sqrt(1 - a))
    }
}
