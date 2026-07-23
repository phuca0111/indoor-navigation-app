package com.khoaluan.indoornav.navigation.gps

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.util.Log
import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.data.model.PlaceSummary
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * GPS Geofencing ngoài trời — ưu tiên Place.radius; fallback Building 150m.
 */
class GPSGeofenceManager(private val context: Context) {

    data class GeofenceSite(
        val id: String,
        val name: String,
        val lat: Double,
        val lng: Double,
        val radiusM: Float,
        val building: Building? = null,
        val place: PlaceSummary? = null
    )

    private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var locationListener: LocationListener? = null

    private var monitoredSites: List<GeofenceSite> = emptyList()
    private var onEnterSiteCallback: ((GeofenceSite) -> Unit)? = null
    private var activeSiteId: String? = null

    private val defaultBuildingRadiusMeters = 150f

    @SuppressLint("MissingPermission")
    fun startMonitoring(buildings: List<Building>, onEnter: (Building) -> Unit) {
        val sites = buildings.mapNotNull { b ->
            val gps = b.gpsLocation ?: return@mapNotNull null
            GeofenceSite(
                id = b.id,
                name = b.name,
                lat = gps.lat,
                lng = gps.lng,
                radiusM = defaultBuildingRadiusMeters,
                building = b
            )
        }
        startMonitoringSites(sites) { site ->
            site.building?.let(onEnter)
        }
    }

    @SuppressLint("MissingPermission")
    fun startMonitoringPlaces(places: List<PlaceSummary>, onEnter: (PlaceSummary) -> Unit) {
        val sites = places.mapNotNull { p ->
            val lat = p.latitude ?: return@mapNotNull null
            val lng = p.longitude ?: return@mapNotNull null
            if (lat == 0.0 && lng == 0.0) return@mapNotNull null
            val radius = (p.radius ?: 80.0).toFloat().coerceIn(30f, 2000f)
            GeofenceSite(
                id = p.id,
                name = p.name,
                lat = lat,
                lng = lng,
                radiusM = radius,
                place = p
            )
        }
        startMonitoringSites(sites) { site ->
            site.place?.let(onEnter)
        }
    }

    @SuppressLint("MissingPermission")
    fun startMonitoringSites(sites: List<GeofenceSite>, onEnter: (GeofenceSite) -> Unit) {
        stopMonitoring()
        monitoredSites = sites
        onEnterSiteCallback = onEnter
        activeSiteId = null

        Log.d("GPSGeofenceManager", "Bắt đầu giám sát GPS cho ${sites.size} site")

        locationListener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                checkGeofences(location)
            }

            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }

        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    5000L,
                    5f,
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

    fun stopMonitoring() {
        locationListener?.let {
            locationManager.removeUpdates(it)
            Log.i("GPSGeofenceManager", "Đã ngắt kết nối định vị GPS ngoài trời (Gateway Shutdown)")
        }
        locationListener = null
        onEnterSiteCallback = null
        activeSiteId = null
    }

    private fun checkGeofences(location: Location) {
        var best: GeofenceSite? = null
        var bestDist = Float.MAX_VALUE
        for (site in monitoredSites) {
            val distance = calculateDistance(
                location.latitude, location.longitude,
                site.lat, site.lng
            )
            if (distance <= site.radiusM && distance < bestDist) {
                best = site
                bestDist = distance
            }
        }
        val hit = best ?: return
        if (activeSiteId != hit.id) {
            activeSiteId = hit.id
            Log.i(
                "GPSGeofenceManager",
                "Vào geofence ${hit.name} (${bestDist.toInt()}m / radius ${hit.radiusM.toInt()}m)"
            )
            onEnterSiteCallback?.invoke(hit)
        }
    }

    private fun calculateDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Float {
        val r = 6371000
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLon / 2) * sin(dLon / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return (r * c).toFloat()
    }
}
