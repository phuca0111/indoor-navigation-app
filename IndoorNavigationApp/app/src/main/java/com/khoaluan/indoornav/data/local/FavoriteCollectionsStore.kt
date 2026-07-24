package com.khoaluan.indoornav.data.local

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.util.UUID

/** #14 Favorites — Collections (nhóm place yêu thích, local sync-ready). */
class FavoriteCollectionsStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
    private val gson = Gson()

    data class Collection(
        val id: String,
        val name: String,
        val placeIds: List<String> = emptyList(),
        val createdAt: Long = System.currentTimeMillis(),
    )

    fun list(): List<Collection> {
        val json = prefs.getString(KEY, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<Collection>>() {}.type
            gson.fromJson<List<Collection>>(json, type) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun create(name: String): Collection {
        val col = Collection(id = UUID.randomUUID().toString(), name = name.trim())
        persist(list() + col)
        return col
    }

    fun rename(id: String, name: String) {
        persist(list().map { if (it.id == id) it.copy(name = name.trim()) else it })
    }

    fun delete(id: String) {
        persist(list().filter { it.id != id })
    }

    fun addPlace(collectionId: String, placeId: String) {
        persist(
            list().map { col ->
                if (col.id != collectionId) col
                else col.copy(placeIds = (col.placeIds + placeId).distinct())
            },
        )
    }

    fun removePlace(collectionId: String, placeId: String) {
        persist(
            list().map { col ->
                if (col.id != collectionId) col
                else col.copy(placeIds = col.placeIds.filter { it != placeId })
            },
        )
    }

    private fun persist(items: List<Collection>) {
        prefs.edit().putString(KEY, gson.toJson(items)).apply()
    }

    companion object {
        private const val PREF = "favorite_collections"
        private const val KEY = "items"
    }
}
