package com.khoaluan.indoornav.fcm

import android.content.Context
import android.util.Log
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.local.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Spec D — đọc consent rồi quyết định có heartbeat vị trí không.
 * ALERT_ONLY: nhận cảnh báo, không gửi vị trí.
 */
object EmergencyConsentHelper {
    private const val TAG = "EmergencyConsent"
    private const val PREFS = "emergency_consent_cache"
    private const val KEY_MODE = "mode"

    fun cachedMode(context: Context): String {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_MODE, "EMERGENCY_ONLY") ?: "EMERGENCY_ONLY"
    }

    fun cacheMode(context: Context, mode: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_MODE, mode)
            .apply()
    }

    fun allowsLocationShare(mode: String): Boolean {
        return mode.equals("EMERGENCY_ONLY", ignoreCase = true) ||
            mode.equals("ALWAYS_RESEARCH", ignoreCase = true)
    }

    fun startHeartbeatIfAllowed(
        context: Context,
        incidentId: String,
        buildingId: String?,
        floor: Int? = null,
        qrAnchor: String? = null,
    ) {
        val appCtx = context.applicationContext
        val mode = cachedMode(appCtx)
        val share = allowsLocationShare(mode)
        EmergencyHeartbeat.start(
            context = appCtx,
            incidentId = incidentId,
            buildingId = buildingId,
            floor = floor,
            qrAnchor = qrAnchor,
            shareLocation = share,
        )
        // Làm mới consent từ server (không chặn takeover)
        val session = SessionManager(appCtx)
        if (!session.isLoggedIn) return
        RetrofitClient.init(appCtx)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val res = RetrofitClient.getApiService().getEmergencyConsent()
                val serverMode = res.body()?.emergency_location_consent?.mode
                    ?: if (res.body()?.emergency_location_consent?.granted == true) {
                        "EMERGENCY_ONLY"
                    } else {
                        "ALERT_ONLY"
                    }
                cacheMode(appCtx, serverMode)
                if (!allowsLocationShare(serverMode) && share) {
                    EmergencyHeartbeat.stop(appCtx)
                } else if (allowsLocationShare(serverMode) && !share) {
                    EmergencyHeartbeat.start(
                        context = appCtx,
                        incidentId = incidentId,
                        buildingId = buildingId,
                        floor = floor,
                        qrAnchor = qrAnchor,
                        shareLocation = true,
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "refresh consent failed: ${e.message}")
            }
        }
    }
}
