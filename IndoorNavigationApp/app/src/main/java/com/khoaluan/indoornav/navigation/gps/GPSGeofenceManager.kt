package com.khoaluan.indoornav.navigation.gps

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import com.khoaluan.indoornav.data.model.Building
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * FILE: GPSGeofenceManager.kt
 * MỤC ĐÍCH: Quản lý GPS Geofencing ngoài trời dùng LocationManager nguyên bản của Android.
 * Hoạt động 100% offline, gọn nhẹ, không cần Google Play Services.
 * Tự động ngắt GPS (Gateway shutdown) khi người dùng vào chế độ Indoor Mode để tiết kiệm pin.
 *
 * Ngoài geofence: cache [OutdoorGpsFix] (bearing khi đang đi) để seed Map Heading lúc quét QR.
 */
class GPSGeofenceManager(private val context: Context) {

    private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var locationListener: LocationListener? = null

    private var monitoredBuildings: List<Building> = emptyList()
    private var onEnterBuildingCallback: ((Building) -> Unit)? = null
    private var onLocationCallback: ((Location) -> Unit)? = null
    private var onFarAwayCallback: ((Building, Float) -> Unit)? = null
    private var activeBuildingId: String? = null
    /** Spec D — clear presence khi cách tòa > clear (khớp backend ~200m) */
    private val clearPresenceRadiusMeters = 200f

    /** Fix ngoài trời gần nhất — giữ cả sau [stopMonitoring] để handoff indoor. */
    @Volatile
    private var lastOutdoorFix: OutdoorGpsFix? = null

    /** Listener GPS nhẹ khi indoor — chỉ lấy course để sửa heading. */
    private var courseAssistListener: LocationListener? = null
    private var onIndoorCourseCallback: ((Float) -> Unit)? = null
    /** Fix trước đó — suy hướng đi từ chuỗi tọa độ (không cần Location.bearing). */
    private var prevTrackFix: OutdoorGpsFix? = null

    private val defaultActivationRadiusMeters = 120f // Khớp R broadcast thu hẹp

    /**
     * Bắt đầu giám sát vị trí GPS ngoài trời dựa trên danh sách tòa nhà
     */
    @SuppressLint("MissingPermission")
    fun startMonitoring(
        buildings: List<Building>,
        onEnter: (Building) -> Unit,
        onLocation: ((android.location.Location) -> Unit)? = null,
        onFarAway: ((Building, Float) -> Unit)? = null,
    ) {
        stopMonitoring(clearOutdoorCache = false) // Dọn listener cũ; giữ bearing đã cache

        monitoredBuildings = buildings
        onEnterBuildingCallback = onEnter
        onLocationCallback = onLocation
        onFarAwayCallback = onFarAway
        activeBuildingId = null

        Log.d("GPSGeofenceManager", "Bắt đầu giám sát GPS cho ${buildings.size} tòa nhà")

        locationListener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                cacheOutdoorFix(location)
                onLocationCallback?.invoke(location)
                checkGeofences(location)
            }

            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }

        try {
            // Đăng ký nhận cập nhật từ GPS_PROVIDER (realtime ngoài trời)
            // và NETWORK_PROVIDER (fallback tiết kiệm pin)
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    5000L, // 5 giây cập nhật 1 lần ngoài trời
                    5f,    // Thay đổi 5 mét
                    locationListener!!
                )
            }

            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    10000L,
                    10f,
                    locationListener!!
                )
            }
        } catch (e: SecurityException) {
            Log.e("GPSGeofenceManager", "Thiếu quyền định vị GPS: ${e.message}")
        }
    }

    /**
     * Dừng toàn bộ cập nhật GPS để tiết kiệm pin tuyệt đối (GPS Gateway Shutdown).
     * @param clearOutdoorCache true khi thoát hẳn / reset; false khi vào indoor (giữ bearing handoff).
     */
    fun stopMonitoring(clearOutdoorCache: Boolean = false) {
        stopIndoorCourseAssist()
        locationListener?.let {
            locationManager.removeUpdates(it)
            Log.i("GPSGeofenceManager", "Đã ngắt kết nối định vị GPS ngoài trời (Gateway Shutdown)")
        }
        locationListener = null
        onEnterBuildingCallback = null
        onLocationCallback = null
        onFarAwayCallback = null
        activeBuildingId = null
        if (clearOutdoorCache) {
            lastOutdoorFix = null
        }
    }

    fun getLastOutdoorFix(): OutdoorGpsFix? = lastOutdoorFix

    /**
     * Course tin cậy từ bearing API (không xóa cache) — handoff / assist.
     */
    fun peekReliableOutdoorCourseDeg(
        nowMs: Long = System.currentTimeMillis(),
        maxAgeMs: Long = MAX_COURSE_AGE_MS,
        maxHorizontalAccuracyM: Float = MAX_HORIZONTAL_ACCURACY_M,
        minSpeedMps: Float = MIN_WALK_SPEED_MPS,
        maxBearingAccuracyDeg: Float = MAX_BEARING_ACCURACY_DEG,
    ): Float? = evaluateReliableCourse(
        lastOutdoorFix, nowMs, maxAgeMs, maxHorizontalAccuracyM, minSpeedMps, maxBearingAccuracyDeg,
    )

    fun takeReliableOutdoorCourseDeg(
        nowMs: Long = System.currentTimeMillis(),
        maxAgeMs: Long = MAX_COURSE_AGE_MS,
        maxHorizontalAccuracyM: Float = MAX_HORIZONTAL_ACCURACY_M,
        minSpeedMps: Float = MIN_WALK_SPEED_MPS,
        maxBearingAccuracyDeg: Float = MAX_BEARING_ACCURACY_DEG,
    ): Float? = peekReliableOutdoorCourseDeg(
        nowMs, maxAgeMs, maxHorizontalAccuracyM, minSpeedMps, maxBearingAccuracyDeg,
    )

    /**
     * Hướng đi từ hai fix GPS liên tiếp (Bắc thật) — độc lập la bàn / PDR.
     * Cần đi đủ xa so với sai số vị trí.
     */
    fun courseFromTrackFixes(
        prev: OutdoorGpsFix,
        curr: OutdoorGpsFix,
        minDistanceM: Float = MIN_TRACK_DISTANCE_M,
        maxAccuracyM: Float = 45f,
    ): Float? {
        if (curr.accuracyMeters > maxAccuracyM || prev.accuracyMeters > maxAccuracyM) return null
        val dist = calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
        if (dist < minDistanceM) return null
        val lat1 = Math.toRadians(prev.latitude)
        val lat2 = Math.toRadians(curr.latitude)
        val dLon = Math.toRadians(curr.longitude - prev.longitude)
        val y = sin(dLon) * cos(lat2)
        val x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        var brng = Math.toDegrees(atan2(y, x)).toFloat()
        if (brng < 0f) brng += 360f
        Log.i(
            "GPSGeofenceManager",
            "Track course=$brng° dist=${"%.1f".format(dist)}m acc=${curr.accuracyMeters}m",
        )
        return brng
    }

    private fun evaluateReliableCourse(
        fix: OutdoorGpsFix?,
        nowMs: Long,
        maxAgeMs: Long,
        maxHorizontalAccuracyM: Float,
        minSpeedMps: Float,
        maxBearingAccuracyDeg: Float,
    ): Float? {
        if (fix == null) return null
        if (nowMs - fix.timestampMs > maxAgeMs) {
            Log.d("GPSGeofenceManager", "Outdoor course bỏ qua: quá cũ age=${nowMs - fix.timestampMs}ms")
            return null
        }
        if (fix.accuracyMeters > maxHorizontalAccuracyM) {
            Log.d("GPSGeofenceManager", "Outdoor course bỏ qua: accuracy=${fix.accuracyMeters}m")
            return null
        }
        val bearing = fix.bearingDeg ?: run {
            Log.d("GPSGeofenceManager", "Outdoor course bỏ qua: không có bearing")
            return null
        }
        val speed = fix.speedMps
        val bearingAcc = fix.bearingAccuracyDeg
        val movingEnough = speed != null && speed >= minSpeedMps
        val bearingSharp = bearingAcc != null && bearingAcc <= maxBearingAccuracyDeg
        if (!movingEnough && !bearingSharp) {
            Log.d(
                "GPSGeofenceManager",
                "Outdoor course bỏ qua: đứng yên/bearing yếu speed=$speed bearingAcc=$bearingAcc"
            )
            return null
        }
        Log.i(
            "GPSGeofenceManager",
            "Outdoor course tin cậy bearing=$bearing° speed=$speed acc=${fix.accuracyMeters}m"
        )
        return bearing
    }

    /**
     * GPS nhẹ khi đang indoor: course từ bearing API **hoặc** chuỗi lat/lng khi đi.
     * Độc lập la bàn — thử #2 [HeadingAssistFlags.ENABLE_GPS_HEADING_ASSIST].
     */
    @SuppressLint("MissingPermission")
    fun startIndoorCourseAssist(onReliableCourse: (Float) -> Unit) {
        stopIndoorCourseAssist()
        onIndoorCourseCallback = onReliableCourse
        prevTrackFix = lastOutdoorFix
        courseAssistListener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                val before = lastOutdoorFix
                cacheOutdoorFix(location)
                val after = lastOutdoorFix ?: return

                val trackCourse = before?.let { courseFromTrackFixes(it, after) }
                    ?: prevTrackFix?.let { courseFromTrackFixes(it, after) }
                if (trackCourse != null) {
                    prevTrackFix = after
                    onIndoorCourseCallback?.invoke(trackCourse)
                    return
                }
                prevTrackFix = after

                val apiCourse = peekReliableOutdoorCourseDeg(
                    maxAgeMs = 25_000L,
                    maxHorizontalAccuracyM = 45f,
                    minSpeedMps = 0.45f,
                    maxBearingAccuracyDeg = 40f,
                ) ?: return
                onIndoorCourseCallback?.invoke(apiCourse)
            }
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    3_000L,
                    3f,
                    courseAssistListener!!,
                )
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    8_000L,
                    8f,
                    courseAssistListener!!,
                )
            }
            Log.i("GPSGeofenceManager", "Indoor GPS course assist ON (track+bearing)")
        } catch (e: SecurityException) {
            Log.e("GPSGeofenceManager", "Course assist thiếu quyền GPS: ${e.message}")
            stopIndoorCourseAssist()
        }
    }

    fun stopIndoorCourseAssist() {
        courseAssistListener?.let {
            locationManager.removeUpdates(it)
            Log.i("GPSGeofenceManager", "Indoor GPS course assist OFF")
        }
        courseAssistListener = null
        onIndoorCourseCallback = null
        prevTrackFix = null
    }

    private fun cacheOutdoorFix(location: Location) {
        val hasBearing = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            location.hasBearing()
        } else {
            location.bearing != 0f || location.hasSpeed()
        }
        val bearingAcc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasBearingAccuracy()) {
            location.bearingAccuracyDegrees
        } else {
            null
        }
        val speed = if (location.hasSpeed()) location.speed else null
        val fix = OutdoorGpsFix(
            latitude = location.latitude,
            longitude = location.longitude,
            accuracyMeters = location.accuracy,
            bearingDeg = if (hasBearing) location.bearing else null,
            bearingAccuracyDeg = bearingAcc,
            speedMps = speed,
            timestampMs = location.time.takeIf { it > 0L } ?: System.currentTimeMillis(),
            provider = location.provider,
        )
        // Ưu tiên GPS_PROVIDER; không ghi đè fix GPS tốt bằng NETWORK kém hơn
        val prev = lastOutdoorFix
        if (prev != null &&
            prev.provider == LocationManager.GPS_PROVIDER &&
            fix.provider != LocationManager.GPS_PROVIDER &&
            fix.accuracyMeters > prev.accuracyMeters
        ) {
            return
        }
        lastOutdoorFix = fix
    }

    /**
     * Kiểm tra khoảng cách của User tới tất cả các geofence tòa nhà
     */
    private fun checkGeofences(location: Location) {
        var nearest: Building? = null
        var nearestDist = Float.MAX_VALUE

        for (building in monitoredBuildings) {
            val gps = building.gpsLocation ?: continue
            val distance = calculateDistance(
                location.latitude, location.longitude,
                gps.lat, gps.lng
            )
            Log.d("GPSGeofenceManager", "Khoảng cách tới ${building.name}: ${distance}m")

            if (distance < nearestDist) {
                nearestDist = distance
                nearest = building
            }

            if (distance <= defaultActivationRadiusMeters) {
                if (activeBuildingId != building.id) {
                    activeBuildingId = building.id
                    Log.i("GPSGeofenceManager", "Đã đi vào Geofence của tòa nhà: ${building.name}")
                    onEnterBuildingCallback?.invoke(building)
                }
                return
            }
        }

        // Spec D L5 — ra ngoài >300m so với tòa gần nhất có GPS
        val farBuilding = nearest
        if (
            farBuilding != null &&
            nearestDist > clearPresenceRadiusMeters &&
            location.hasAccuracy() &&
            location.accuracy <= 50f
        ) {
            if (activeBuildingId != null) {
                activeBuildingId = null
            }
            onFarAwayCallback?.invoke(farBuilding, nearestDist)
        }
    }

    /**
     * Công thức Haversine tính khoảng cách địa lý chính xác giữa 2 điểm (Lat, Lng) ra mét
     */
    private fun calculateDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Float {
        val r = 6371000 // Bán kính Trái Đất theo mét
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLon / 2) * sin(dLon / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return (r * c).toFloat()
    }

    companion object {
        const val MAX_COURSE_AGE_MS = 45_000L
        const val MAX_HORIZONTAL_ACCURACY_M = 30f
        const val MIN_WALK_SPEED_MPS = 0.7f
        const val MAX_BEARING_ACCURACY_DEG = 25f
        /** Khoảng cách tối thiểu giữa 2 fix để suy hướng từ track (m). */
        const val MIN_TRACK_DISTANCE_M = 8f
    }
}
