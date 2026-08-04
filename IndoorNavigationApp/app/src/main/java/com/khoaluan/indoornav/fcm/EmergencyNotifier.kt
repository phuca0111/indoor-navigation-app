package com.khoaluan.indoornav.fcm

import android.app.ActivityOptions
import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import com.khoaluan.indoornav.MainActivity
import com.khoaluan.indoornav.R

/**
 * Đánh thức máy + mở full-screen cảnh báo khẩn cấp.
 */
object EmergencyNotifier {

    const val CHANNEL_ID = "emergency_alerts_v3"
    private const val CHANNEL_NAME = "Cảnh báo khẩn cấp"
    const val NOTIFICATION_ID = 91_002
    /** ID notification của Foreground Service — phải hủy cùng lúc. */
    const val SERVICE_NOTIFICATION_ID = 91_003
    /** Nhắc lại khi admin broadcast trùng (không takeover). */
    const val NOTIFICATION_REMINDER_ID = 91_004
    private const val TAG = "EmergencyNotifier"
    private const val PREFS = "emergency_session_prefs"
    private const val KEY_ACTIVE_INCIDENT = "active_incident_id"
    private const val KEY_TYPE = "session_type"
    private const val KEY_TITLE = "session_title"
    private const val KEY_BODY = "session_body"
    private const val KEY_BUILDING = "session_building"
    /** User đã bấm Chỉ đường / đang sơ tán trên Main — không mở lại AlertActivity. */
    private const val KEY_SUPPRESS_ALERT_UI = "suppress_alert_ui"

    fun markActiveIncident(context: Context, incidentId: String?) {
        val id = incidentId?.takeIf { it.isNotBlank() } ?: return
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ACTIVE_INCIDENT, id)
            .apply()
    }

    /** Persist session, không mở EmergencyAlertActivity (Main in-app). */
    fun markActiveIncidentQuiet(
        context: Context,
        type: String,
        title: String,
        body: String,
        buildingId: String?,
        incidentId: String?,
        /** false khi resume từ banner sau Đóng — không hú lại còi. */
        startSiren: Boolean = true,
    ) {
        val appCtx = context.applicationContext
        setSuppressAlertUi(appCtx, true)
        persistSession(appCtx, type, title, body, buildingId, incidentId)
        if (startSiren && !EmergencySirenPlayer.isPlaying) {
            EmergencySirenPlayer.start(appCtx)
        }
    }

    fun setSuppressAlertUi(context: Context, suppress: Boolean) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_SUPPRESS_ALERT_UI, suppress)
            .apply()
    }

    fun isAlertUiSuppressed(context: Context): Boolean =
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_SUPPRESS_ALERT_UI, false)

    fun persistSession(
        context: Context,
        type: String,
        title: String,
        body: String,
        buildingId: String?,
        incidentId: String?,
    ) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ACTIVE_INCIDENT, incidentId)
            .putString(KEY_TYPE, type)
            .putString(KEY_TITLE, title)
            .putString(KEY_BODY, body)
            .putString(KEY_BUILDING, buildingId)
            .apply()
    }

    fun readPersistedSession(context: Context): EmergencySessionSnapshot? {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val incidentId = prefs.getString(KEY_ACTIVE_INCIDENT, null)?.takeIf { it.isNotBlank() }
            ?: return null
        return EmergencySessionSnapshot(
            incidentId = incidentId,
            type = prefs.getString(KEY_TYPE, "FIRE") ?: "FIRE",
            title = prefs.getString(KEY_TITLE, "CẢNH BÁO KHẨN CẤP") ?: "CẢNH BÁO KHẨN CẤP",
            body = prefs.getString(KEY_BODY, null)
                ?: "Có sự cố khẩn cấp. Làm theo hướng dẫn sơ tán.",
            buildingId = prefs.getString(KEY_BUILDING, null),
        )
    }

    data class EmergencySessionSnapshot(
        val incidentId: String,
        val type: String,
        val title: String,
        val body: String,
        val buildingId: String?,
    )

    fun clearActiveIncident(context: Context) {
        context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_ACTIVE_INCIDENT)
            .remove(KEY_TYPE)
            .remove(KEY_TITLE)
            .remove(KEY_BODY)
            .remove(KEY_BUILDING)
            .putBoolean(KEY_SUPPRESS_ALERT_UI, false)
            .apply()
    }

    fun isSameActiveIncident(context: Context, incidentId: String?): Boolean {
        val id = incidentId?.takeIf { it.isNotBlank() } ?: return false
        val active = context.applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_ACTIVE_INCIDENT, null)
        return active == id
    }

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        runCatching { manager.deleteNotificationChannel("emergency_alerts") }
        runCatching { manager.deleteNotificationChannel("emergency_alerts_v2") }
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null && existing.importance >= NotificationManager.IMPORTANCE_HIGH) return
        if (existing != null) manager.deleteNotificationChannel(CHANNEL_ID)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Cảnh báo sự cố — còi hú + mở full màn hình sơ tán."
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 500, 200, 500, 200, 500)
                // Âm thanh do EmergencySirenPlayer (USAGE_ALARM) — tránh beep mặc định chồng còi
                setSound(null, null)
                setBypassDnd(true)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            }
        )
    }

    fun buildDeepLink(
        type: String,
        title: String?,
        body: String?,
        buildingId: String?,
        incidentId: String?,
    ): Uri = Uri.Builder()
        .scheme("indoornav")
        .authority("emergency")
        .apply {
            appendQueryParameter("type", type)
            title?.let { appendQueryParameter("title", it) }
            body?.let { appendQueryParameter("body", it) }
            buildingId?.let { appendQueryParameter("building", it) }
            incidentId?.let { appendQueryParameter("incident", it) }
        }
        .build()

    fun buildLaunchIntent(
        context: Context,
        type: String,
        title: String?,
        body: String?,
        buildingId: String?,
        incidentId: String?,
        autoEvacuate: Boolean = false,
        /** Đóng màn đỏ → về Main + banner, không hiện lại ALERT. */
        snoozeOverlay: Boolean = false,
    ): Intent = Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = buildDeepLink(type, title, body, buildingId, incidentId)
        putExtra("from_fcm_emergency", true)
        putExtra(EmergencyAlertActivity.EXTRA_TYPE, type)
        putExtra(EmergencyAlertActivity.EXTRA_TITLE, title)
        putExtra(EmergencyAlertActivity.EXTRA_BODY, body)
        putExtra(EmergencyAlertActivity.EXTRA_BUILDING, buildingId)
        putExtra(EmergencyAlertActivity.EXTRA_INCIDENT, incidentId)
        putExtra(EmergencyAlertActivity.EXTRA_AUTO_EVACUATE, autoEvacuate)
        putExtra(EmergencyAlertActivity.EXTRA_SNOOZE_OVERLAY, snoozeOverlay)
        addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        )
    }

    fun buildAlertIntent(
        context: Context,
        type: String,
        title: String?,
        body: String?,
        buildingId: String?,
        incidentId: String?,
    ): Intent = Intent(context, EmergencyAlertActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = buildDeepLink(type, title, body, buildingId, incidentId)
        putExtra(EmergencyAlertActivity.EXTRA_TYPE, type)
        putExtra(EmergencyAlertActivity.EXTRA_TITLE, title)
        putExtra(EmergencyAlertActivity.EXTRA_BODY, body)
        putExtra(EmergencyAlertActivity.EXTRA_BUILDING, buildingId)
        putExtra(EmergencyAlertActivity.EXTRA_INCIDENT, incidentId)
        addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_NO_USER_ACTION
        )
    }

    private fun wakeScreen(context: Context) {
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            val wake = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    PowerManager.ON_AFTER_RELEASE,
                "indoornav:emergency"
            )
            wake.acquire(8_000L)
            wake.release()
        } catch (e: Exception) {
            Log.d(TAG, "wakeScreen: ${e.message}")
        }
    }

    /** Entry từ FCM — ưu tiên Foreground Service. */
    fun launchTakeover(
        context: Context,
        type: String,
        title: String,
        body: String,
        buildingId: String?,
        incidentId: String?,
    ) {
        val appCtx = context.applicationContext
        // Cùng sự cố + còi còn kêu:
        // - Đang sơ tán (suppress) → không mở lại màn đỏ
        // - Còn đang hiện cảnh báo → chỉ notification nhắc
        // Còi đã tắt (Đóng/snooze / process chết) → fallthrough takeover lại đầy đủ
        if (isSameActiveIncident(appCtx, incidentId) && EmergencySirenPlayer.isPlaying) {
            if (isAlertUiSuppressed(appCtx)) {
                Log.i(TAG, "Same incident + evacuating — keep siren, skip AlertActivity: $incidentId")
                persistSession(appCtx, type, title, body, buildingId, incidentId)
                return
            }
            Log.i(TAG, "Same incident active + siren playing — reminder push only: $incidentId")
            postReminderNotification(appCtx, type, title, body, buildingId, incidentId)
            return
        }
        if (isSameActiveIncident(appCtx, incidentId)) {
            Log.i(TAG, "Same incident but siren stopped — re-takeover: $incidentId")
        }
        ensureChannel(appCtx)
        // Takeover mới từ FCM → cho phép AlertActivity
        setSuppressAlertUi(appCtx, false)
        markActiveIncident(appCtx, incidentId)
        persistSession(appCtx, type, title, body, buildingId, incidentId)
        EmergencySirenPlayer.start(appCtx)
        EmergencyTakeoverService.start(
            context = appCtx,
            type = type,
            title = title,
            body = body,
            buildingId = buildingId,
            incidentId = incidentId,
        )
    }

    /**
     * Nhắc lại khi admin broadcast trùng sự cố: notification thường (không full-screen / không Activity đỏ).
     * Bấm vào vẫn mở app / tiếp tục sơ tán.
     */
    fun postReminderNotification(
        context: Context,
        type: String,
        title: String,
        body: String,
        buildingId: String?,
        incidentId: String?,
    ) {
        val appCtx = context.applicationContext
        ensureChannel(appCtx)
        val launch = buildAlertIntent(
            context = appCtx,
            type = type,
            title = title,
            body = body,
            buildingId = buildingId,
            incidentId = incidentId,
        )
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val requestCode = ((incidentId ?: type).hashCode() and 0x7FFF_FFFF) + 17
        val pending = PendingIntent.getActivity(appCtx, requestCode, launch, flags)
        val reminderTitle = if (title.contains("nhắc", ignoreCase = true)) {
            title
        } else {
            "Nhắc: $title"
        }
        val notification = NotificationCompat.Builder(appCtx, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(reminderTitle)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setVibrate(longArrayOf(0, 300, 150, 300))
            .setContentIntent(pending)
            .build()
        val manager = appCtx.getSystemService(NotificationManager::class.java) ?: return
        // ID riêng để không đè notification FSI / FGS đang chạy
        manager.notify(NOTIFICATION_REMINDER_ID, notification)
    }

    /** Phần UI thật: overlay + Activity + FSI notification. */
    fun launchTakeoverUi(
        context: Context,
        type: String,
        title: String,
        body: String,
        buildingId: String?,
        incidentId: String?,
    ) {
        val appCtx = context.applicationContext
        ensureChannel(appCtx)
        EmergencySirenPlayer.start(appCtx)
        wakeScreen(appCtx)

        if (isAlertUiSuppressed(appCtx)) {
            Log.i(TAG, "launchTakeoverUi suppressed — notification only (user đang sơ tán)")
            // Vẫn cập nhật FSI notification nhưng không start Activity đỏ
            postReminderNotification(appCtx, type, title, body, buildingId, incidentId)
            return
        }

        val alertIntent = buildAlertIntent(appCtx, type, title, body, buildingId, incidentId)
        try {
            appCtx.startActivity(alertIntent)
            Log.i(TAG, "startActivity EmergencyAlertActivity ok")
        } catch (e: Exception) {
            Log.w(TAG, "startActivity blocked: ${e.message}")
        }

        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val requestCode = (incidentId ?: type).hashCode() and 0x7FFF_FFFF
        val pending: PendingIntent = if (Build.VERSION.SDK_INT >= 34) {
            val options = ActivityOptions.makeBasic().apply {
                setPendingIntentBackgroundActivityStartMode(
                    ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                )
            }
            PendingIntent.getActivity(appCtx, requestCode, alertIntent, flags, options.toBundle())
        } else {
            PendingIntent.getActivity(appCtx, requestCode, alertIntent, flags)
        }

        val notification = NotificationCompat.Builder(appCtx, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(false)
            .setAutoCancel(true)
            .setSilent(true)
            .setVibrate(longArrayOf(0, 500, 200, 500, 200, 500))
            .setContentIntent(pending)
            .setFullScreenIntent(pending, true)
            .setDeleteIntent(buildDismissPendingIntent(appCtx))
            .build()

        val manager = appCtx.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= 34 && !manager.canUseFullScreenIntent()) {
            Log.w(TAG, "Thiếu quyền full-screen intent.")
        }
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun buildDismissPendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, EmergencyDismissReceiver::class.java)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(context, 91_010, intent, flags)
    }

    fun cancel(context: Context) {
        val appCtx = context.applicationContext
        EmergencySirenPlayer.stop()
        val nm = appCtx.getSystemService(NotificationManager::class.java)
        nm?.cancel(NOTIFICATION_ID)
        nm?.cancel(SERVICE_NOTIFICATION_ID)
        nm?.cancel(NOTIFICATION_REMINDER_ID)
        EmergencyOverlayController.dismiss()
        EmergencyTakeoverService.stop(appCtx)
    }

    /**
     * Tắt còi + FGS khi user đã bấm Chỉ đường / chọn tầng —
     * giữ session sự cố trên map (không clearActiveIncident).
     */
    fun stopTakeoverAudio(context: Context) {
        val appCtx = context.applicationContext
        EmergencySirenPlayer.stop()
        EmergencyTakeoverService.stop(appCtx)
        val nm = appCtx.getSystemService(NotificationManager::class.java)
        nm?.cancel(NOTIFICATION_ID)
        nm?.cancel(SERVICE_NOTIFICATION_ID)
        Log.i(TAG, "Takeover audio stopped (session kept)")
    }

    /** Spec D — Stop Emergency: tắt overlay/FGS (giữ notification nếu user chưa xóa — tùy product; ở đây tắt session). */
    /** Spec D — Stop Emergency: tắt overlay / FGS takeover. */
    fun dismissEmergencySession(context: Context) {
        clearActiveIncident(context)
        cancel(context)
    }

    fun prepareActivityForLockScreen(activity: android.app.Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            activity.setShowWhenLocked(true)
            activity.setTurnScreenOn(true)
            val keyguard = activity.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguard.requestDismissKeyguard(activity, null)
        } else {
            @Suppress("DEPRECATION")
            activity.window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                    android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
    }

    fun openOverlayPermissionSettings(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        try {
            context.startActivity(
                Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${context.packageName}"),
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (e: Exception) {
            Log.w(TAG, "openOverlayPermissionSettings: ${e.message}")
        }
    }

    fun openFullScreenIntentSettings(context: Context) {
        if (Build.VERSION.SDK_INT < 34) return
        try {
            context.startActivity(
                Intent(
                    Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                    Uri.parse("package:${context.packageName}"),
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (e: Exception) {
            Log.w(TAG, "openFullScreenIntentSettings: ${e.message}")
        }
    }
}
