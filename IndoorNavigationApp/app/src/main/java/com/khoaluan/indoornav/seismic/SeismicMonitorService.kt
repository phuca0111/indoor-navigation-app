package com.khoaluan.indoornav.seismic

import android.Manifest
import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.khoaluan.indoornav.R
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.api.ShakeReportBody
import com.khoaluan.indoornav.data.local.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Foreground service — lắng nghe accelerometer khi:
 * - User bật opt-in nền (không cần sạc / không cần mở app), hoặc
 * - Đang sạc (chế độ mặc định tiết kiệm pin).
 */
class SeismicMonitorService : Service(), SensorEventListener {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var sensorManager: SensorManager? = null
    private val detector = SeismicDetector()
    private var lastReportAt = 0L
    private var listening = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        ensureChannel(this)
        startAsForeground()
        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        maybeStartListening("onCreate")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopListening()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_REEVAL -> {
                refreshNotification()
                maybeStartListening("reeval")
            }
            else -> {
                refreshNotification()
                maybeStartListening("start")
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        stopListening()
        scope.cancel()
        super.onDestroy()
    }

    private fun notificationText(): String {
        return if (SeismicPrefs.isBackgroundEnabled(this)) {
            "Đang lắng nghe nền (không cần sạc)"
        } else {
            "Đang lắng nghe khi sạc"
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Cảm biến động đất")
            .setContentText(notificationText())
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_DEFERRED)
            .build()
    }

    private fun startAsForeground() {
        val notification = buildNotification()
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
            // Không gọi startForeground lần 2 không type trên API 34 — sẽ crash process.
            Log.e(TAG, "startForeground failed — stop self: ${e.message}")
            try {
                stopSelf()
            } catch (_: Exception) {
            }
        }
    }

    private fun refreshNotification() {
        try {
            val nm = getSystemService(NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.notify(NOTIFICATION_ID, buildNotification())
        } catch (_: Exception) {
        }
    }

    private fun maybeStartListening(reason: String) {
        val session = SessionManager(this)
        if (!session.isLoggedIn) {
            Log.i(TAG, "skip listen ($reason): not logged in")
            stopListening()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return
        }
        if (!SeismicPrefs.isEligibleToRun(this)) {
            Log.i(TAG, "skip listen ($reason): no opt-in and not charging")
            stopListening()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return
        }
        startListening()
        Log.i(
            TAG,
            "listening ($reason) bg=${SeismicPrefs.isBackgroundEnabled(this)} " +
                "charging=${isCharging(this)} interactive=${isInteractive()}"
        )
    }

    private fun startListening() {
        if (listening) return
        val sm = sensorManager ?: return
        val accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: run {
            Log.w(TAG, "no accelerometer")
            return
        }
        detector.reset()
        sm.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME)
        listening = true
        Log.i(TAG, "accel registered; warmup≈${"%.0f".format(detector.warmupRemainingSec())}s")
    }

    private fun stopListening() {
        if (!listening) return
        sensorManager?.unregisterListener(this)
        listening = false
        detector.reset()
    }

    private fun isInteractive(): Boolean {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        return pm.isInteractive
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_ACCELEROMETER) return
        val now = System.currentTimeMillis()
        val trigger = detector.onSample(
            x = event.values[0],
            y = event.values[1],
            z = event.values[2],
            timestampNs = event.timestamp,
            nowMs = now,
        ) ?: return
        if (now - lastReportAt < REPORT_COOLDOWN_MS) return
        lastReportAt = now
        Log.i(
            TAG,
            "on-device trigger peak=${"%.3f".format(trigger.peakFilteredMs2)} " +
                "R=${"%.2f".format(trigger.maxStaLtaRatio)} dur=${trigger.durationMs}ms"
        )
        reportShake(trigger)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun reportShake(trigger: SeismicTrigger) {
        val session = SessionManager(applicationContext)
        if (!session.isLoggedIn) return
        val buildingHint = session.lastBuildingId
        val fix = lastKnownLocation(applicationContext)
        val source = when {
            SeismicPrefs.isBackgroundEnabled(applicationContext) && !isCharging(applicationContext) ->
                "background"
            SeismicPrefs.isBackgroundEnabled(applicationContext) -> "background"
            else -> "charging_idle"
        }
        val magnitude = maxOf(
            trigger.peakFilteredMs2.toDouble(),
            (trigger.maxStaLtaRatio * 0.15).coerceAtMost(5.0),
        )
        scope.launch {
            try {
                RetrofitClient.init(applicationContext)
                val resp = RetrofitClient.getApiService().submitShakeReport(
                    ShakeReportBody(
                        device_id = session.deviceId,
                        magnitude = magnitude,
                        peak_ms2 = trigger.peakFilteredMs2.toDouble(),
                        duration_ms = trigger.durationMs,
                        building_id = buildingHint,
                        source = source,
                        client_ts = System.currentTimeMillis(),
                        sta_lta_ratio = trigger.maxStaLtaRatio.toDouble(),
                        algorithm = "sta_lta_v1",
                        lat = fix?.latitude,
                        lng = fix?.longitude,
                        accuracy = fix?.takeIf { it.hasAccuracy() }?.accuracy,
                    )
                )
                val body = resp.body()
                Log.i(
                    TAG,
                    "shake report HTTP ${resp.code()} accepted=${body?.accepted} " +
                        "triggered=${body?.triggered} devices=${body?.window_device_count}/${body?.threshold} " +
                        "building=${body?.building_id} match=${body?.building_match} " +
                        "gps=${fix?.latitude},${fix?.longitude} reason=${body?.reason}"
                )
            } catch (e: Exception) {
                Log.w(TAG, "shake report failed: ${e.message}")
            }
        }
    }

    private fun lastKnownLocation(context: Context): Location? {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return null
        }
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return try {
            val gps = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            val net = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            when {
                gps == null -> net
                net == null -> gps
                else -> if (gps.time >= net.time) gps else net
            }
        } catch (_: SecurityException) {
            null
        }
    }

    companion object {
        private const val TAG = "SeismicMonitor"
        private const val NOTIFICATION_ID = 71042
        /** v2 = IMPORTANCE_MIN — thu nhỏ tối đa; Android vẫn bắt buộc có FGS notification. */
        const val CHANNEL_ID = "seismic_monitor_v2"
        const val ACTION_STOP = "com.khoaluan.indoornav.seismic.STOP"
        const val ACTION_REEVAL = "com.khoaluan.indoornav.seismic.REEVAL"
        private const val REPORT_COOLDOWN_MS = 30_000L

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            // Xóa kênh cũ (IMPORTANCE_LOW) — Android không hạ importance kênh đã tạo
            runCatching { mgr.deleteNotificationChannel("seismic_monitor_v1") }
            val existing = mgr.getNotificationChannel(CHANNEL_ID)
            if (existing != null && existing.importance > android.app.NotificationManager.IMPORTANCE_MIN) {
                runCatching { mgr.deleteNotificationChannel(CHANNEL_ID) }
            }
            val ch = android.app.NotificationChannel(
                CHANNEL_ID,
                "Cảm biến động đất (ẩn)",
                android.app.NotificationManager.IMPORTANCE_MIN,
            ).apply {
                description = "Chạy nền — thông báo thu nhỏ tối đa (bắt buộc bởi Android)"
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
                enableLights(false)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
            }
            mgr.createNotificationChannel(ch)
        }

        fun isCharging(context: Context): Boolean {
            val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val status = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS)
                if (status == BatteryManager.BATTERY_STATUS_CHARGING ||
                    status == BatteryManager.BATTERY_STATUS_FULL
                ) {
                    return true
                }
            }
            @Suppress("DEPRECATION")
            val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val plugged = intent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
            return plugged != 0
        }

        fun startIfEligible(context: Context) {
            val app = context.applicationContext
            if (!SeismicPrefs.isEligibleToRun(app)) {
                stop(app)
                return
            }
            ensureChannel(app)
            val intent = Intent(app, SeismicMonitorService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(app, intent)
                } else {
                    app.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "start failed: ${e.message}")
            }
        }

        fun stop(context: Context) {
            try {
                context.applicationContext.stopService(
                    Intent(context.applicationContext, SeismicMonitorService::class.java)
                )
            } catch (_: Exception) {
            }
        }

        fun reevaluate(context: Context) {
            startIfEligible(context)
        }

        /** Bật/tắt opt-in nền rồi start/stop service tương ứng. */
        fun setBackgroundEnabled(context: Context, enabled: Boolean) {
            SeismicPrefs.setBackgroundEnabled(context, enabled)
            if (enabled) {
                startIfEligible(context)
            } else {
                // Tắt nền: nếu đang sạc vẫn có thể chạy
                reevaluate(context)
            }
        }
    }
}
