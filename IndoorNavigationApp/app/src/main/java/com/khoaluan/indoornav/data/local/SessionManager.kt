package com.khoaluan.indoornav.data.local

import android.content.Context

/** Session JWT / user (W8) — guest khi không có token. */
class SessionManager(context: Context) {
    private val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    companion object {
        private const val PREF = "indoor_nav_session"
        private const val KEY_TOKEN = "access_token"
        private const val KEY_EMAIL = "email"
        private const val KEY_NAME = "display_name"
    }

    var accessToken: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(v) = prefs.edit().putString(KEY_TOKEN, v).apply()

    var email: String?
        get() = prefs.getString(KEY_EMAIL, null)
        set(v) = prefs.edit().putString(KEY_EMAIL, v).apply()

    var displayName: String?
        get() = prefs.getString(KEY_NAME, null)
        set(v) = prefs.edit().putString(KEY_NAME, v).apply()

    val isLoggedIn: Boolean get() = !accessToken.isNullOrBlank()

    fun clear() {
        prefs.edit().clear().apply()
    }
}
