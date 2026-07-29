package com.khoaluan.indoornav.navigation.gps

import android.content.Context

/**
 * Gợi ý local khi OS geofence ENTER — dùng khi FCM proximity không lấy được GPS mới
 * (máy trong túi / tắt fake GPS nhưng lastKnown vẫn là điểm xa cũ).
 */
object PresenceHintStore {
    private const val PREF = "presence_hint"
    private const val KEY_BUILDING = "last_enter_building_id"
    private const val KEY_AT = "last_enter_at_ms"

    fun markEnter(context: Context, buildingId: String) {
        if (buildingId.isBlank()) return
        context.applicationContext.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_BUILDING, buildingId)
            .putLong(KEY_AT, System.currentTimeMillis())
            .apply()
    }

    fun markExit(context: Context, buildingId: String) {
        val prefs = context.applicationContext.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        if (prefs.getString(KEY_BUILDING, null) == buildingId) {
            prefs.edit().remove(KEY_BUILDING).remove(KEY_AT).apply()
        }
    }

    /** true nếu từng ENTER tòa này trong [maxAgeMs] và chưa EXIT. */
    fun recentlyEntered(context: Context, buildingId: String?, maxAgeMs: Long = 45 * 60 * 1000L): Boolean {
        if (buildingId.isNullOrBlank()) return false
        val prefs = context.applicationContext.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        if (prefs.getString(KEY_BUILDING, null) != buildingId) return false
        val at = prefs.getLong(KEY_AT, 0L)
        return at > 0L && System.currentTimeMillis() - at <= maxAgeMs
    }
}
