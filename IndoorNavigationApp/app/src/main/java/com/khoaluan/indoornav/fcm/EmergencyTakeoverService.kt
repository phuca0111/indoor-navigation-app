package com.khoaluan.indoornav.fcm

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import com.khoaluan.indoornav.R

/**
 * Foreground service giữ process + còi khi sự cố còn ACTIVE trên máy.
 * Dừng khi Stop FCM / dismiss / [stop] — chỉ dùng [stopService], không startForegroundService để stop
 * (tránh ForegroundServiceDidNotStartInTimeException → "IndoorNav tiếp tục dừng").
 */
class EmergencyTakeoverService : Service() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private val sirenWatchdog = object : Runnable {
        override fun run() {
            if (!EmergencySirenPlayer.isPlaying) {
                Log.i(TAG, "Siren watchdog — restart siren")
                EmergencySirenPlayer.start(applicationContext)
            }
            mainHandler.postDelayed(this, SIREN_WATCHDOG_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Bắt buộc gọi startForeground ngay — kể cả ACTION_STOP / early exit
        // (nếu vào bằng startForegroundService mà không promote → hệ thống giết process).
        promoteToForegroundPlaceholder()

        if (intent?.action == ACTION_STOP) {
            shutdownCleanly()
            return START_NOT_STICKY
        }

        val snapshot = EmergencyNotifier.readPersistedSession(this)
        val type = intent?.getStringExtra(EXTRA_TYPE)
            ?: snapshot?.type
            ?: "FIRE"
        val title = intent?.getStringExtra(EXTRA_TITLE)
            ?: snapshot?.title
            ?: "CẢNH BÁO KHẨN CẤP"
        val body = intent?.getStringExtra(EXTRA_BODY)
            ?: snapshot?.body
            ?: "Có sự cố khẩn cấp. Làm theo hướng dẫn sơ tán."
        val buildingId = intent?.getStringExtra(EXTRA_BUILDING) ?: snapshot?.buildingId
        val incidentId = intent?.getStringExtra(EXTRA_INCIDENT) ?: snapshot?.incidentId

        if (incidentId.isNullOrBlank() && snapshot == null) {
            Log.w(TAG, "No emergency session — stop FGS")
            shutdownCleanly()
            return START_NOT_STICKY
        }

        val pending = android.app.PendingIntent.getActivity(
            this,
            (incidentId ?: type).hashCode() and 0x7FFF_FFFF,
            // Không dùng full-screen intent trên notification FGS — tránh mở lại màn đỏ khi Đóng
            EmergencyNotifier.buildLaunchIntent(
                this, type, title, body, buildingId, incidentId, autoEvacuate = false,
            ),
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
        )
        val notification: Notification = NotificationCompat.Builder(this, EmergencyNotifier.CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setContentIntent(pending)
            .setAutoCancel(false)
            .setSilent(true)
            .build()

        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed: ${e.message}")
            runCatching { startForeground(NOTIFICATION_ID, notification) }
        }

        EmergencySirenPlayer.start(applicationContext)
        if (!EmergencyNotifier.isAlertUiSuppressed(applicationContext)) {
            EmergencyNotifier.launchTakeoverUi(
                context = applicationContext,
                type = type,
                title = title,
                body = body,
                buildingId = buildingId,
                incidentId = incidentId,
            )
        } else {
            Log.i(TAG, "FGS start — alert UI suppressed, skip AlertActivity")
        }

        mainHandler.removeCallbacks(sirenWatchdog)
        mainHandler.postDelayed(sirenWatchdog, SIREN_WATCHDOG_MS)

        return START_STICKY
    }

    private fun promoteToForegroundPlaceholder() {
        EmergencyNotifier.ensureChannel(this)
        val n = NotificationCompat.Builder(this, EmergencyNotifier.CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Cảnh báo khẩn cấp")
            .setContentText("Đang xử lý…")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .setOngoing(true)
            .build()
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                    NOTIFICATION_ID,
                    n,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
                )
            } else {
                startForeground(NOTIFICATION_ID, n)
            }
        } catch (e: Exception) {
            Log.e(TAG, "promote placeholder failed: ${e.message}")
            runCatching { startForeground(NOTIFICATION_ID, n) }
        }
    }

    private fun shutdownCleanly() {
        mainHandler.removeCallbacks(sirenWatchdog)
        runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
        stopSelf()
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(sirenWatchdog)
        super.onDestroy()
    }

    companion object {
        private const val TAG = "EmergencyTakeoverSvc"
        private val NOTIFICATION_ID = EmergencyNotifier.SERVICE_NOTIFICATION_ID
        private const val SIREN_WATCHDOG_MS = 8_000L
        const val ACTION_STOP = "com.khoaluan.indoornav.action.STOP_EMERGENCY_TAKEOVER"
        const val EXTRA_TYPE = "emergency_type"
        const val EXTRA_TITLE = "emergency_title"
        const val EXTRA_BODY = "emergency_body"
        const val EXTRA_BUILDING = "emergency_building"
        const val EXTRA_INCIDENT = "emergency_incident"

        fun start(
            context: Context,
            type: String,
            title: String,
            body: String,
            buildingId: String?,
            incidentId: String?,
        ) {
            val intent = Intent(context, EmergencyTakeoverService::class.java).apply {
                putExtra(EXTRA_TYPE, type)
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_BODY, body)
                putExtra(EXTRA_BUILDING, buildingId)
                putExtra(EXTRA_INCIDENT, incidentId)
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                Log.i(TAG, "Started sticky takeover service")
            } catch (e: Exception) {
                Log.e(TAG, "Cannot start FGS: ${e.message}")
                EmergencyNotifier.launchTakeoverUi(
                    context = context.applicationContext,
                    type = type,
                    title = title,
                    body = body,
                    buildingId = buildingId,
                    incidentId = incidentId,
                )
            }
        }

        /** Chỉ stopService — tuyệt đối không startForegroundService để tắt. */
        fun stop(context: Context) {
            runCatching {
                context.stopService(Intent(context, EmergencyTakeoverService::class.java))
                Log.i(TAG, "stopService requested")
            }.onFailure {
                Log.w(TAG, "stopService: ${it.message}")
            }
        }
    }
}
