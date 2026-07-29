package com.khoaluan.indoornav.data.local

import android.content.Context
import com.khoaluan.indoornav.data.api.RetrofitClient
import java.util.UUID

/** Session JWT / user (W8) — guest khi không có token. */
class SessionManager(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    companion object {
        private const val PREF = "indoor_nav_session"
        private const val KEY_TOKEN = "access_token"
        private const val KEY_REFRESH = "refresh_token"
        private const val KEY_EMAIL = "email"
        private const val KEY_NAME = "display_name"
        private const val KEY_AVATAR = "avatar_url"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_LAST_BUILDING = "last_building_id"
    }

    /** ID thiết bị ổn định (UUID) cho đăng ký FCM — sinh 1 lần rồi giữ nguyên. */
    val deviceId: String
        get() = prefs.getString(KEY_DEVICE_ID, null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString(KEY_DEVICE_ID, it).commit()
        }

    /** Tòa gần nhất đã sync presence — dùng làm hint cho shake-report. */
    var lastBuildingId: String?
        get() = prefs.getString(KEY_LAST_BUILDING, null)
        set(v) {
            prefs.edit().putString(KEY_LAST_BUILDING, v).commit()
        }

    var accessToken: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(v) {
            prefs.edit().putString(KEY_TOKEN, v).commit()
            RetrofitClient.setAccessToken(v)
        }

    var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH, null)
        set(v) {
            prefs.edit().putString(KEY_REFRESH, v).commit()
        }

    var email: String?
        get() = prefs.getString(KEY_EMAIL, null)
        set(v) {
            prefs.edit().putString(KEY_EMAIL, v).commit()
        }

    var displayName: String?
        get() = prefs.getString(KEY_NAME, null)
        set(v) {
            prefs.edit().putString(KEY_NAME, v).commit()
        }

    /** URL ảnh hồ sơ (Google). */
    var avatarUrl: String?
        get() = prefs.getString(KEY_AVATAR, null)
        set(v) {
            prefs.edit().putString(KEY_AVATAR, v).commit()
        }

    val isLoggedIn: Boolean get() = !accessToken.isNullOrBlank()

    /** Gọi khi mở app — đồng bộ token vào OkHttp interceptor. */
    fun bindToHttpClient() {
        RetrofitClient.setAccessToken(accessToken)
    }

    fun saveSession(
        token: String,
        refresh: String? = null,
        email: String? = null,
        displayName: String? = null,
        avatarUrl: String? = null,
    ) {
        val editor = prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_REFRESH, refresh)
            .putString(KEY_EMAIL, email)
            .putString(KEY_NAME, displayName)
        if (avatarUrl != null) {
            editor.putString(KEY_AVATAR, avatarUrl.ifBlank { null })
        }
        editor.commit()
        RetrofitClient.setAccessToken(token)
    }

    fun clear() {
        prefs.edit().clear().commit()
        RetrofitClient.setAccessToken(null)
    }
}
