package com.khoaluan.indoornav.fcm

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.khoaluan.indoornav.navigation.gps.PresenceHintStore
import kotlinx.coroutines.runBlocking
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Spec D+ — FCM proximity_check khi app đóng / máy trong túi.
 *
 * Quy tắc an toàn (ưu tiên không sót người trong vùng):
 * - Chỉ **từ chối** khi có GPS **mới** (< [FRESH_REJECT_MS]) và ngoài R.
 * - GPS cũ “đang ở xa” (sau khi tắt fake / chưa kịp fix mới) **không** đủ để từ chối.
 * - `uncertain_alert=1` (server: user từng gắn tòa / vừa bị soft-exclude):
 *   nếu không có GPS mới chứng minh đang ở xa → **vẫn hiện cảnh báo**.
 */
object EmergencyProximityCheck {
    private const val TAG = "EmergencyProximity"
    private const val WAIT_SEC = 14L
    /** Chỉ tin “đang ở xa” khi fix mới hơn ngưỡng này. */
    private const val FRESH_REJECT_MS = 45_000L
    private const val FRESH_ACCEPT_MS = 180_000L
    private const val EXTRA_FROM_LIVE = "indoornav_from_live"

    fun handle(context: Context, data: Map<String, String>) {
        val appCtx = context.applicationContext
        val buildingLat = data["building_lat"]?.toDoubleOrNull()
        val buildingLng = data["building_lng"]?.toDoubleOrNull()
        val radiusM = data["radius_m"]?.toFloatOrNull() ?: 150f
        val clearDistM = data["clear_distance_m"]?.toFloatOrNull()
            ?: maxOf(500f, radiusM + 50f)
        val incidentId = data["incident_id"]?.takeIf { it.isNotBlank() }
        val buildingId = data["building_id"]?.takeIf { it.isNotBlank() }
        val uncertainAlert = data["uncertain_alert"] == "1"
        val type = (data["incident_type"] ?: "FIRE").uppercase()
        val title = data["title"]?.takeIf { it.isNotBlank() } ?: "CẢNH BÁO KHẨN CẤP"
        val body = data["body"]?.takeIf { it.isNotBlank() }
            ?: "Có sự cố khẩn cấp gần bạn. Làm theo hướng dẫn sơ tán."

        if (buildingLat == null || buildingLng == null) {
            Log.w(TAG, "proximity_check thiếu tọa độ tòa — bỏ qua")
            return
        }

        val fine = ContextCompat.checkSelfPermission(appCtx, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(appCtx, Manifest.permission.ACCESS_COARSE_LOCATION)
        val hasLocationPermission =
            fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED

        val loc = if (hasLocationPermission) resolveLocationBlocking(appCtx) else null
        val dist = loc?.let { haversineMeters(buildingLat, buildingLng, it.latitude, it.longitude) }
        val ageMs = loc?.let { System.currentTimeMillis() - it.time.coerceAtLeast(0L) }
        val fromLive = loc?.extras?.getBoolean(EXTRA_FROM_LIVE) == true
        val freshReject = ageMs != null && ageMs in 0..FRESH_REJECT_MS
        val freshAccept = ageMs != null && ageMs in 0..FRESH_ACCEPT_MS
        val localEnter = PresenceHintStore.recentlyEntered(appCtx, buildingId)

        Log.i(
            TAG,
            "proximity_check dist=${dist?.let { "%.0f".format(it) }}m R=$radiusM clear=$clearDistM " +
                "ageMs=$ageMs fromLive=$fromLive uncertain=$uncertainAlert localEnter=$localEnter"
        )

        val treatNear = dist != null && dist <= radiusM
        // Spec D+ — luôn quét Wi-Fi/BLE (kể cả không có GPS) để học/khớp fingerprint
        val presenceResp = runBlocking {
            PresenceSync.updateBlocking(
                context = appCtx,
                buildingId = if (treatNear) buildingId else null,
                lat = loc?.latitude,
                lng = loc?.longitude,
                accuracy = loc?.takeIf { it.hasAccuracy() }?.accuracy,
                buildingLat = if (treatNear) buildingLat else null,
                buildingLng = if (treatNear) buildingLng else null,
                touchIndoor = treatNear,
                indoorSessionOpen = false,
                includeRadio = true,
            )
        }
        val radioHit = !buildingId.isNullOrBlank() &&
            presenceResp?.last_radio_building_id == buildingId &&
            (presenceResp.last_radio_score ?: 0.0) >= 2.0
        Log.i(
            TAG,
            "radioHit=$radioHit score=${presenceResp?.last_radio_score} " +
                "src=${presenceResp?.last_radio_source}"
        )

        if (loc != null && !treatNear && dist != null && dist > clearDistM && !buildingId.isNullOrBlank()) {
            PresenceHintStore.markExit(appCtx, buildingId)
        }

        val inside = dist != null && dist <= radiusM && (freshAccept || fromLive)
        // GPS live ngoài R → không báo (trừ khi radio fingerprint khớp tòa — GPS kém trong nhà).
        val provenOutside = fromLive && dist != null && freshReject && dist > radiusM && !radioHit
        val provenFarAway = fromLive && dist != null && freshReject && dist > clearDistM && !radioHit

        val shouldAlert = when {
            provenFarAway || provenOutside -> false
            radioHit -> true
            inside -> true
            localEnter && !provenOutside -> true
            // Máy túi / GPS chưa có: fail-open cho ứng viên re-entry
            uncertainAlert && loc == null -> true
            uncertainAlert && !fromLive -> true
            else -> false
        }

        if (!shouldAlert) {
            Log.i(
                TAG,
                "Không hiện cảnh báo (provenOutside=$provenOutside far=$provenFarAway " +
                    "uncertain=$uncertainAlert hasLoc=${loc != null} fromLive=$fromLive)"
            )
            return
        }

        Log.i(
            TAG,
            "Hiện cảnh báo (inside=$inside radio=$radioHit uncertain=$uncertainAlert " +
                "localEnter=$localEnter noLive=${!fromLive})"
        )
        if (buildingId != null) PresenceHintStore.markEnter(appCtx, buildingId)

        EmergencyNotifier.launchTakeover(
            context = appCtx,
            type = type,
            title = title,
            body = body,
            buildingId = buildingId,
            incidentId = incidentId,
        )
        if (!incidentId.isNullOrBlank()) {
            EmergencyConsentHelper.startHeartbeatIfAllowed(
                context = appCtx,
                incidentId = incidentId,
                buildingId = buildingId,
            )
        }
    }

    @SuppressLint("MissingPermission")
    private fun resolveLocationBlocking(context: Context): Location? {
        val best = AtomicReference<Location?>(null)
        val done = AtomicBoolean(false)
        val latch = CountDownLatch(1)
        val main = Handler(Looper.getMainLooper())
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val startedAt = SystemClock.elapsedRealtime()
        val minWaitMs = 3500L // chờ GPS mới; tránh chốt lastKnown xa cũ quá sớm

        fun ageOf(loc: Location): Long = System.currentTimeMillis() - loc.time.coerceAtLeast(0L)

        fun tagLive(loc: Location, live: Boolean): Location {
            val b = Bundle(loc.extras ?: Bundle())
            b.putBoolean(EXTRA_FROM_LIVE, live)
            loc.extras = b
            return loc
        }

        fun consider(loc: Location?, source: String, live: Boolean) {
            if (loc == null) return
            val tagged = tagLive(Location(loc), live)
            val prev = best.get()
            if (prev == null || isBetter(tagged, prev)) {
                best.set(tagged)
                Log.d(
                    TAG,
                    "fix via $source live=$live provider=${tagged.provider} " +
                        "acc=${tagged.accuracy} age=${ageOf(tagged)} mock=${isMock(tagged)}"
                )
            }
            val waited = SystemClock.elapsedRealtime() - startedAt
            if (waited >= minWaitMs && (ageOf(tagged) <= FRESH_REJECT_MS || isMock(tagged) || live)) {
                if (done.compareAndSet(false, true)) latch.countDown()
            }
        }

        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                consider(location, "updates", live = true)
            }
            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }

        for (p in lm.getProviders(true)) {
            consider(runCatching { lm.getLastKnownLocation(p) }.getOrNull(), "lastKnown:$p", live = false)
        }

        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER, 0L, 0f, listener, Looper.getMainLooper()
                )
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER, 0L, 0f, listener, Looper.getMainLooper()
                )
            }
            runCatching {
                lm.requestLocationUpdates(
                    LocationManager.PASSIVE_PROVIDER, 0L, 0f, listener, Looper.getMainLooper()
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "requestLocationUpdates: ${e.message}")
        }

        try {
            val client = LocationServices.getFusedLocationProviderClient(context)
            client.lastLocation.addOnSuccessListener { consider(it, "fusedLast", live = false) }
            val cts = CancellationTokenSource()
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                .addOnSuccessListener { consider(it, "fusedCurrent", live = true) }
            main.postDelayed({ cts.cancel() }, WAIT_SEC * 1000)
        } catch (e: Exception) {
            Log.d(TAG, "fused unavailable: ${e.message}")
        }

        main.postDelayed({
            val cur = best.get()
            if (cur != null && done.compareAndSet(false, true)) {
                latch.countDown()
            }
        }, minWaitMs)

        val ok = latch.await(WAIT_SEC, TimeUnit.SECONDS)
        runCatching { lm.removeUpdates(listener) }
        if (!ok) Log.w(TAG, "timeout ${WAIT_SEC}s bestAge=${best.get()?.let { ageOf(it) }}")
        return best.get()
    }

    private fun isBetter(a: Location, b: Location): Boolean {
        val liveA = a.extras?.getBoolean(EXTRA_FROM_LIVE) == true
        val liveB = b.extras?.getBoolean(EXTRA_FROM_LIVE) == true
        if (liveA && !liveB) return true
        if (!liveA && liveB) return false
        val ageA = System.currentTimeMillis() - a.time.coerceAtLeast(0L)
        val ageB = System.currentTimeMillis() - b.time.coerceAtLeast(0L)
        if (ageA <= FRESH_REJECT_MS && ageB > FRESH_REJECT_MS) return true
        if (ageB <= FRESH_REJECT_MS && ageA > FRESH_REJECT_MS) return false
        if (isMock(a) && !isMock(b) && ageA <= FRESH_ACCEPT_MS) return true
        if (!isMock(a) && isMock(b) && ageB <= FRESH_REJECT_MS) return false
        if (ageA < ageB - 10_000) return true
        if (ageB < ageA - 10_000) return false
        val accA = if (a.hasAccuracy()) a.accuracy else 9999f
        val accB = if (b.hasAccuracy()) b.accuracy else 9999f
        return accA <= accB
    }

    private fun isMock(loc: Location): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            loc.isMock
        } else {
            @Suppress("DEPRECATION")
            loc.isFromMockProvider
        }
    }

    private fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Float {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLon / 2) * sin(dLon / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return (r * c).toFloat()
    }
}
