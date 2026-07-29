package com.khoaluan.indoornav.fcm

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.khoaluan.indoornav.R

/**
 * Foreground service ngắn — giữ process sống đủ lâu để mở Activity / overlay
 * khi nhận FCM lúc app ở nền hoặc bị hệ thống hạn chế.
 */
class EmergencyTakeoverService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val type = intent?.getStringExtra(EXTRA_TYPE) ?: "FIRE"
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "CẢNH BÁO KHẨN CẤP"
        val body = intent?.getStringExtra(EXTRA_BODY)
            ?: "Có sự cố khẩn cấp. Làm theo hướng dẫn sơ tán."
        val buildingId = intent?.getStringExtra(EXTRA_BUILDING)
        val incidentId = intent?.getStringExtra(EXTRA_INCIDENT)

        EmergencyNotifier.ensureChannel(this)
        val pending = android.app.PendingIntent.getActivity(
            this,
            (incidentId ?: type).hashCode() and 0x7FFF_FFFF,
            EmergencyNotifier.buildAlertIntent(this, type, title, body, buildingId, incidentId),
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
        )
        val notification: Notification = NotificationCompat.Builder(this, EmergencyNotifier.CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(false)
            .setContentIntent(pending)
            .setFullScreenIntent(pending, true)
            .setAutoCancel(true)
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
            startForeground(NOTIFICATION_ID, notification)
        }

        // Mở UI sau khi đã là FGS.
        EmergencyNotifier.launchTakeoverUi(
            context = applicationContext,
            type = type,
            title = title,
            body = body,
            buildingId = buildingId,
            incidentId = incidentId,
        )

        // Tự dừng và gỡ notification FGS (tránh kẹt không xóa được).
        android.os.Handler(mainLooper).postDelayed({
            runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
            stopSelf()
        }, 3_000L)

        return START_NOT_STICKY
    }

    companion object {
        private const val TAG = "EmergencyTakeoverSvc"
        private val NOTIFICATION_ID = EmergencyNotifier.SERVICE_NOTIFICATION_ID
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
                Log.i(TAG, "Started takeover service")
            } catch (e: Exception) {
                Log.e(TAG, "Cannot start FGS: ${e.message}")
                // Fallback trực tiếp
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
    }
}
