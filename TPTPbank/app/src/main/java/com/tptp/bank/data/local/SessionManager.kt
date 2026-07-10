package com.tptp.bank.data.local

import android.content.Context

class SessionManager(context: Context) {
    private val prefs = context.getSharedPreferences("tptp_bank_session", Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_TOKEN, value).apply()

    var userName: String?
        get() = prefs.getString(KEY_NAME, null)
        set(value) = prefs.edit().putString(KEY_NAME, value).apply()

    fun isLoggedIn(): Boolean = !token.isNullOrBlank()

    fun clear() = prefs.edit().clear().apply()

    companion object {
        private const val KEY_TOKEN = "token"
        private const val KEY_NAME = "name"
    }
}
