package com.khoaluan.indoornav.navigation.gps

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
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
 */
class GPSGeofenceManager(private val context: Context) {

    private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var locationListener: LocationListener? = null
    
    private var monitoredBuildings: List<Building> = emptyList()
    private var onEnterBuildingCallback: ((Building) -> Unit)? = null
    private var activeBuildingId: String? = null

    private val defaultActivationRadiusMeters = 150f // Bán kính kích hoạt mặc định 150m

    /**
     * Bắt đầu giám sát vị trí GPS ngoài trời dựa trên danh sách tòa nhà
     */
    @SuppressLint("MissingPermission")
    fun startMonitoring(buildings: List<Building>, onEnter: (Building) -> Unit) {
        stopMonitoring() // Dọn dẹp listener cũ nếu có
        
        monitoredBuildings = buildings
        onEnterBuildingCallback = onEnter
        activeBuildingId = null

        Log.d("GPSGeofenceManager", "Bắt đầu giám sát GPS cho ${buildings.size} tòa nhà")

        locationListener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
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
     * Dừng toàn bộ cập nhật GPS để tiết kiệm pin tuyệt đối (GPS Gateway Shutdown)
     */
    fun stopMonitoring() {
        locationListener?.let {
            locationManager.removeUpdates(it)
            Log.i("GPSGeofenceManager", "Đã ngắt kết nối định vị GPS ngoài trời (Gateway Shutdown)")
        }
        locationListener = null
        onEnterBuildingCallback = null
        activeBuildingId = null
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
}
