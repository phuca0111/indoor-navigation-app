package com.khoaluan.indoornav.data.local

import android.content.Context

/**
 * #18 Settings — prefs điều hướng + theme/language local (đồng bộ hub khi login).
 */
class AppSettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    var theme: String
        get() = prefs.getString(KEY_THEME, "system") ?: "system"
        set(v) = prefs.edit().putString(KEY_THEME, v).apply()

    var locale: String
        get() = prefs.getString(KEY_LOCALE, "vi") ?: "vi"
        set(v) = prefs.edit().putString(KEY_LOCALE, v).apply()

    var voiceGuidance: Boolean
        get() = prefs.getBoolean(KEY_VOICE, true)
        set(v) = prefs.edit().putBoolean(KEY_VOICE, v).apply()

    var preferElevator: Boolean
        get() = prefs.getBoolean(KEY_ELEVATOR, true)
        set(v) = prefs.edit().putBoolean(KEY_ELEVATOR, v).apply()

    var sharePreciseLocation: Boolean
        get() = prefs.getBoolean(KEY_SHARE_LOC, true)
        set(v) = prefs.edit().putBoolean(KEY_SHARE_LOC, v).apply()

    var showActivity: Boolean
        get() = prefs.getBoolean(KEY_SHOW_ACTIVITY, true)
        set(v) = prefs.edit().putBoolean(KEY_SHOW_ACTIVITY, v).apply()

    companion object {
        private const val PREF = "app_user_settings"
        private const val KEY_THEME = "theme"
        private const val KEY_LOCALE = "locale"
        private const val KEY_VOICE = "voice_guidance"
        private const val KEY_ELEVATOR = "prefer_elevator"
        private const val KEY_SHARE_LOC = "share_precise"
        private const val KEY_SHOW_ACTIVITY = "show_activity"
    }
}
