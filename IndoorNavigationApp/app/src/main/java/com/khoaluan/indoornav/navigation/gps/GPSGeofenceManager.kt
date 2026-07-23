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
    private var activeBuildingId: String? = null

    /** Fix ngoài trời gần nhất — giữ cả sau [stopMonitoring] để handoff indoor. */
    @Volatile
    private var lastOutdoorFix: OutdoorGpsFix? = null

    private val defaultActivationRadiusMeters = 150f // Bán kính kích hoạt mặc định 150m

    /**
     * Bắt đầu giám sát vị trí GPS ngoài trời dựa trên danh sách tòa nhà
     */
    @SuppressLint("MissingPermission")
    fun startMonitoring(buildings: List<Building>, onEnter: (Building) -> Unit) {
        stopMonitoring(clearOutdoorCache = false) // Dọn listener cũ; giữ bearing đã cache

        monitoredBuildings = buildings
        onEnterBuildingCallback = onEnter
        activeBuildingId = null

        Log.d("GPSGeofenceManager", "Bắt đầu giám sát GPS cho ${buildings.size} tòa nhà")

        locationListener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                cacheOutdoorFix(location)
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
        locationListener?.let {
            locationManager.removeUpdates(it)
            Log.i("GPSGeofenceManager", "Đã ngắt kết nối định vị GPS ngoài trời (Gateway Shutdown)")
        }
        locationListener = null
        onEnterBuildingCallback = null
        activeBuildingId = null
        if (clearOutdoorCache) {
            lastOutdoorFix = null
        }
    }

    fun getLastOutdoorFix(): OutdoorGpsFix? = lastOutdoorFix

    /**
     * Course-over-ground (Bắc thật) đủ tin cậy để seed Map Heading lúc vào indoor.
     * Trả null nếu đứng yên / accuracy kém / bearing cũ / không có bearing.
     */
    fun takeReliableOutdoorCourseDeg(
        nowMs: Long = System.currentTimeMillis(),
        maxAgeMs: Long = MAX_COURSE_AGE_MS,
        maxHorizontalAccuracyM: Float = MAX_HORIZONTAL_ACCURACY_M,
        minSpeedMps: Float = MIN_WALK_SPEED_MPS,
        maxBearingAccuracyDeg: Float = MAX_BEARING_ACCURACY_DEG,
    ): Float? {
        val fix = lastOutdoorFix ?: return null
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
        for (building in monitoredBuildings) {
            val gps = building.gpsLocation ?: continue
            val distance = calculateDistance(
                location.latitude, location.longitude,
                gps.lat, gps.lng
            )

            Log.d("GPSGeofenceManager", "Khoảng cách tới ${building.name}: ${distance}m")

            if (distance <= defaultActivationRadiusMeters) {
                if (activeBuildingId != building.id) {
                    activeBuildingId = building.id
                    Log.i("GPSGeofenceManager", "Đã đi vào Geofence của tòa nhà: ${building.name}")
                    onEnterBuildingCallback?.invoke(building)
                }
                break // Ưu tiên tòa nhà gần nhất phát hiện được
            }
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
    }
}
