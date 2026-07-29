package com.khoaluan.indoornav.fcm

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import com.khoaluan.indoornav.data.api.EmergencyLocationBody
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.local.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Spec D — heartbeat vị trí chỉ khi Emergency Mode (Incident ACTIVE + consent).
 * Phát hiện đứng yên ≥ 15 phút → gửi motion=still + still_duration_ms (server gắn possibly_trapped).
 */
object EmergencyHeartbeat {
    private const val TAG = "EmergencyHeartbeat"
    private const val INTERVAL_MS = 15_000L
    /** Di chuyển dưới ngưỡng này (m) giữa 2 fix → coi là still. */
    private const val STILL_MOVE_MAX_M = 15f
    /** Tốc độ GPS dưới ngưỡng (m/s) → still. */
    private const val STILL_SPEED_MAX_MS = 0.4f
    private const val TRAPPED_STILL_MS = 15L * 60L * 1000L

    @Volatile
    private var incidentId: String? = null
    @Volatile
    private var buildingId: String? = null
    @Volatile
    private var floor: Int? = null
    @Volatile
    private var qrAnchor: String? = null
    @Volatile
    private var shareLocation: Boolean = true
    private var tickCount: Int = 0

    private var lastFix: Location? = null
    private var stillSinceMs: Long = 0L

    private var handler: Handler? = null
    private var runnable: Runnable? = null

    fun start(
        context: Context,
        incidentId: String,
        buildingId: String? = null,
        floor: Int? = null,
        qrAnchor: String? = null,
        shareLocation: Boolean = true,
    ) {
        if (!shareLocation) {
            Log.i(TAG, "Consent ALERT_ONLY — không heartbeat vị trí.")
            stop(context)
            return
        }
        this.incidentId = incidentId
        this.buildingId = buildingId
        this.floor = floor
        this.qrAnchor = qrAnchor
        this.shareLocation = true
        this.tickCount = 0
        this.lastFix = null
        this.stillSinceMs = 0L

        stopTickerOnly()
        val appCtx = context.applicationContext
        val h = Handler(Looper.getMainLooper())
        handler = h
        runnable = object : Runnable {
            override fun run() {
                tick(appCtx)
                h.postDelayed(this, INTERVAL_MS)
            }
        }
        h.post(runnable!!)
        Log.i(TAG, "Heartbeat start incident=$incidentId every ${INTERVAL_MS}ms")
    }

    fun updateIndoorContext(buildingId: String?, floor: Int?, qrAnchor: String? = null) {
        if (buildingId != null) this.buildingId = buildingId
        if (floor != null) this.floor = floor
        if (qrAnchor != null) this.qrAnchor = qrAnchor
    }

    fun stop(context: Context? = null) {
        stopTickerOnly()
        incidentId = null
        buildingId = null
        floor = null
        qrAnchor = null
        lastFix = null
        stillSinceMs = 0L
        Log.i(TAG, "Heartbeat stopped")
    }

    private fun stopTickerOnly() {
        runnable?.let { handler?.removeCallbacks(it) }
        runnable = null
        handler = null
    }

    private fun evaluateMotion(fix: Location?, now: Long): Pair<String, Long> {
        if (fix == null) {
            if (stillSinceMs > 0L) {
                return "still" to (now - stillSinceMs).coerceAtLeast(0L)
            }
            return "unknown" to 0L
        }

        val prev = lastFix
        if (prev == null) {
            lastFix = fix
            return "unknown" to 0L
        }

        val moved = prev.distanceTo(fix)
        val speedOk = !fix.hasSpeed() || fix.speed <= STILL_SPEED_MAX_MS
        val isStill = moved < STILL_MOVE_MAX_M && speedOk

        if (isStill) {
            if (stillSinceMs <= 0L) stillSinceMs = now
        } else {
            stillSinceMs = 0L
        }
        lastFix = fix

        val duration = if (stillSinceMs > 0L) (now - stillSinceMs).coerceAtLeast(0L) else 0L
        val motion = if (stillSinceMs <= 0L) "moving" else "still"
        if (duration >= TRAPPED_STILL_MS) {
            Log.w(TAG, "possibly trapped: still ${duration / 60000} min")
        }
        return motion to duration
    }

    private fun tick(context: Context) {
        val id = incidentId ?: return
        val session = SessionManager(context)
        if (!session.isLoggedIn) return

        val fix = lastKnownLocation(context)
        val battery = batteryPct(context)
        val now = System.currentTimeMillis()
        val (motion, stillDurationMs) = evaluateMotion(fix, now)
        tickCount += 1
        val scanRadio = tickCount == 1 || tickCount % 2 == 1
        RetrofitClient.init(context)
        CoroutineScope(Dispatchers.IO).launch {
            PresenceSync.updateBlocking(
                context = context,
                buildingId = buildingId,
                floor = floor,
                qrId = qrAnchor,
                lat = fix?.latitude,
                lng = fix?.longitude,
                accuracy = fix?.takeIf { it.hasAccuracy() }?.accuracy,
                touchIndoor = buildingId != null,
                indoorSessionOpen = buildingId != null,
                includeRadio = scanRadio,
            )
            try {
                RetrofitClient.getApiService().reportEmergencyLocation(
                    incidentId = id,
                    body = EmergencyLocationBody(
                        lat = fix?.latitude,
                        lng = fix?.longitude,
                        accuracy = fix?.accuracy?.toDouble(),
                        heading = if (fix != null && fix.hasBearing()) fix.bearing.toDouble() else null,
                        battery = battery,
                        building_id = buildingId,
                        floor_number = floor,
                        source = if (qrAnchor != null) "QR_ANCHOR" else "GPS",
                        motion = motion,
                        still_duration_ms = stillDurationMs.takeIf { it > 0L },
                    )
                )
            } catch (e: Exception) {
                Log.w(TAG, "report location failed: ${e.message}")
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

    private fun batteryPct(context: Context): Double? {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return null
        val pct = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return if (pct in 0..100) pct.toDouble() else null
    }
}
