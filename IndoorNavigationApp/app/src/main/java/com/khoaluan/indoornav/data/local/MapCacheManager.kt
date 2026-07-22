package com.khoaluan.indoornav.data.local

import android.content.Context
import com.google.gson.Gson
import com.khoaluan.indoornav.data.model.MapResponse

/**
 * W4 — Cache MapResponse JSON theo building+floor (offline đọc lại).
 */
class MapCacheManager(context: Context) {
    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    companion object {
        private const val PREF_NAME = "indoor_nav_map_cache"
        private fun key(buildingId: String, floor: Int) = "map_${buildingId}_$floor"
    }

    fun save(buildingId: String, floor: Int, response: MapResponse) {
        try {
            prefs.edit().putString(key(buildingId, floor), gson.toJson(response)).apply()
        } catch (_: Exception) { /* quota — bỏ qua */ }
    }

    fun load(buildingId: String, floor: Int): MapResponse? {
        val json = prefs.getString(key(buildingId, floor), null) ?: return null
        return try {
            gson.fromJson(json, MapResponse::class.java)
        } catch (_: Exception) {
            null
        }
    }

    fun has(buildingId: String, floor: Int): Boolean =
        prefs.contains(key(buildingId, floor))
}
