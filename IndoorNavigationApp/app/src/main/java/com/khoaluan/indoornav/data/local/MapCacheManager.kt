package com.khoaluan.indoornav.data.local

import android.content.Context
import android.util.LruCache
import com.google.gson.Gson
import com.khoaluan.indoornav.data.model.MapResponse

/**
 * #25 Offline + #30 Memory cache — MapResponse theo building+floor.
 */
class MapCacheManager(context: Context) {
    private val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()
    private val memory = LruCache<String, MapResponse>(12)

    companion object {
        private const val PREF_NAME = "indoor_nav_map_cache"
        private fun key(buildingId: String, floor: Int) = "map_${buildingId}_$floor"
    }

    fun save(buildingId: String, floor: Int, response: MapResponse) {
        val k = key(buildingId, floor)
        memory.put(k, response)
        try {
            prefs.edit().putString(k, gson.toJson(response)).apply()
        } catch (_: Exception) { /* quota — bỏ qua */ }
    }

    fun load(buildingId: String, floor: Int): MapResponse? {
        val k = key(buildingId, floor)
        memory.get(k)?.let { return it }
        val json = prefs.getString(k, null) ?: return null
        return try {
            gson.fromJson(json, MapResponse::class.java)?.also { memory.put(k, it) }
        } catch (_: Exception) {
            null
        }
    }

    fun has(buildingId: String, floor: Int): Boolean =
        memory.get(key(buildingId, floor)) != null || prefs.contains(key(buildingId, floor))

    /** Preload nền — tải JSON map các tầng lân cận vào cache (không block UI). */
    fun floorsCached(buildingId: String, totalFloors: Int): Int {
        val n = totalFloors.coerceAtLeast(1)
        return (0 until n).count { has(buildingId, it) }
    }

    data class CachedFloor(val buildingId: String, val floor: Int)

    fun listCached(): List<CachedFloor> {
        return prefs.all.keys.mapNotNull { key ->
            if (!key.startsWith("map_")) return@mapNotNull null
            val rest = key.removePrefix("map_")
            val idx = rest.lastIndexOf('_')
            if (idx <= 0) return@mapNotNull null
            val buildingId = rest.substring(0, idx)
            val floor = rest.substring(idx + 1).toIntOrNull() ?: return@mapNotNull null
            CachedFloor(buildingId, floor)
        }.sortedWith(compareBy({ it.buildingId }, { it.floor }))
    }

    fun clearBuilding(buildingId: String) {
        val editor = prefs.edit()
        prefs.all.keys.filter { it.startsWith("map_${buildingId}_") }.forEach {
            editor.remove(it)
            memory.remove(it)
        }
        editor.apply()
    }

    fun clearAll() {
        memory.evictAll()
        prefs.edit().clear().apply()
    }
}
