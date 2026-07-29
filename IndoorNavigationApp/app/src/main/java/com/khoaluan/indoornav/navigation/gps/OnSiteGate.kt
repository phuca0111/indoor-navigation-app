package com.khoaluan.indoornav.navigation.gps

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Chứng minh đang tại / gần tòa vs xem map từ xa.
 * Dùng để: không ghi presence / không học radio / không takeover khi REMOTE|UNKNOWN.
 */
object OnSiteGate {
    /** Khớp mặc định EMERGENCY_RECIPIENT_GEOFENCE_RADIUS_M. */
    const val DEFAULT_RADIUS_M = 150f
    private const val FRESH_MS = 180_000L
    private const val PROVEN_REMOTE_MS = 90_000L

    enum class Status {
        /** GPS gần / geofence ENTER gần đây. */
        ON_SITE,
        /** GPS mới chứng minh ngoài R. */
        REMOTE,
        /** Không đủ bằng chứng — coi như xem từ xa (không claim presence). */
        UNKNOWN,
    }

    fun evaluate(
        context: Context,
        buildingId: String?,
        buildingLat: Double?,
        buildingLng: Double?,
        lastOutdoorFix: OutdoorGpsFix? = null,
        radiusM: Float = DEFAULT_RADIUS_M,
    ): Status {
        if (buildingId.isNullOrBlank()) return Status.UNKNOWN
        if (PresenceHintStore.recentlyEntered(context, buildingId)) return Status.ON_SITE

        val bLat = buildingLat
        val bLng = buildingLng
        if (bLat == null || bLng == null || !bLat.isFinite() || !bLng.isFinite()) {
            return Status.UNKNOWN
        }

        val fix = lastOutdoorFix?.let { o ->
            Location("outdoor").apply {
                latitude = o.latitude
                longitude = o.longitude
                accuracy = o.accuracyMeters
                time = o.timestampMs
            }
        } ?: lastKnownLocation(context)
        if (fix == null) return Status.UNKNOWN

        val ageMs = System.currentTimeMillis() - fix.time.coerceAtLeast(0L)
        val dist = haversineMeters(bLat, bLng, fix.latitude, fix.longitude)

        if (ageMs in 0..FRESH_MS && dist <= radiusM) return Status.ON_SITE
        if (ageMs in 0..PROVEN_REMOTE_MS && dist > radiusM) return Status.REMOTE
        // GPS cũ ngoài R: không claim on-site
        if (dist > radiusM) return Status.REMOTE
        return Status.UNKNOWN
    }

    fun allowsPresenceClaim(status: Status): Boolean = status == Status.ON_SITE

    fun allowsEmergencyTakeover(status: Status): Boolean = status == Status.ON_SITE

    private fun lastKnownLocation(context: Context): Location? {
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (fine != PackageManager.PERMISSION_GRANTED && coarse != PackageManager.PERMISSION_GRANTED) {
            return null
        }
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        return try {
            lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                ?: lm.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER)
        } catch (_: SecurityException) {
            null
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
