package com.khoaluan.indoornav.data.local

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

/**
 * #14 Favorites — Save Indoor (local) khi backend chưa có building favorite.
 */
class IndoorFavoritesStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
    private val gson = Gson()

    data class SavedIndoor(
        val buildingId: String,
        val name: String,
        val totalFloors: Int = 1,
        val savedAt: Long = System.currentTimeMillis(),
    )

    fun list(): List<SavedIndoor> {
        val json = prefs.getString(KEY, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<SavedIndoor>>() {}.type
            gson.fromJson<List<SavedIndoor>>(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun isSaved(buildingId: String): Boolean =
        list().any { it.buildingId == buildingId }

    fun save(item: SavedIndoor) {
        val next = list().filter { it.buildingId != item.buildingId } + item
        prefs.edit().putString(KEY, gson.toJson(next)).apply()
    }

    fun remove(buildingId: String) {
        val next = list().filter { it.buildingId != buildingId }
        prefs.edit().putString(KEY, gson.toJson(next)).apply()
    }

    companion object {
        private const val PREF = "indoor_favorites"
        private const val KEY = "items"
    }
}
