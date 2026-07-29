package com.khoaluan.indoornav.seismic

import android.content.Context

/**
 * Opt-in lắng nghe rung nền (không cần sạc / không cần mở map).
 * Tách prefs khỏi session để giữ lựa chọn sau đăng nhập lại.
 */
object SeismicPrefs {
    private const val PREF = "seismic_monitor_prefs"
    private const val KEY_BACKGROUND = "background_enabled"

    fun isBackgroundEnabled(context: Context): Boolean {
        return context.applicationContext
            .getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .getBoolean(KEY_BACKGROUND, false)
    }

    fun setBackgroundEnabled(context: Context, enabled: Boolean) {
        context.applicationContext
            .getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_BACKGROUND, enabled)
            .apply()
    }

    /** Được phép chạy monitor: đã login + (opt-in nền hoặc đang sạc). */
    fun isEligibleToRun(context: Context): Boolean {
        val session = com.khoaluan.indoornav.data.local.SessionManager(context)
        if (!session.isLoggedIn) return false
        return isBackgroundEnabled(context) || SeismicMonitorService.isCharging(context)
    }
}
