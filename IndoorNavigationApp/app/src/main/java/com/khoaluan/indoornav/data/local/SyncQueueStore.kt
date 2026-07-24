package com.khoaluan.indoornav.data.local

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.util.UUID

/**
 * #27 Sync Engine — hàng đợi mutation offline (Favorite/Follow/Review/Report/History).
 */
class SyncQueueStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
    private val gson = Gson()

    data class Job(
        val id: String = UUID.randomUUID().toString(),
        val type: String,
        val payloadJson: String,
        val createdAt: Long = System.currentTimeMillis(),
        val attempts: Int = 0,
    )

    fun enqueue(type: String, payload: Any) {
        val job = Job(type = type, payloadJson = gson.toJson(payload))
        persist(list() + job)
    }

    fun list(): List<Job> {
        val json = prefs.getString(KEY, null) ?: return emptyList()
        return try {
            val t = object : TypeToken<List<Job>>() {}.type
            gson.fromJson<List<Job>>(json, t) ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun remove(id: String) {
        persist(list().filter { it.id != id })
    }

    fun bumpAttempt(id: String) {
        persist(
            list().map {
                if (it.id == id) it.copy(attempts = it.attempts + 1) else it
            },
        )
    }

    fun clear() = prefs.edit().remove(KEY).apply()

    private fun persist(items: List<Job>) {
        prefs.edit().putString(KEY, gson.toJson(items)).apply()
    }

    companion object {
        private const val PREF = "sync_queue"
        private const val KEY = "jobs"
        const val TYPE_FAVORITE_ADD = "FAVORITE_ADD"
        const val TYPE_FAVORITE_REMOVE = "FAVORITE_REMOVE"
        const val TYPE_FOLLOW = "FOLLOW"
        const val TYPE_UNFOLLOW = "UNFOLLOW"
        const val TYPE_REVIEW = "REVIEW"
        const val TYPE_REPORT = "REPORT"
        const val TYPE_HISTORY = "HISTORY"
    }
}
