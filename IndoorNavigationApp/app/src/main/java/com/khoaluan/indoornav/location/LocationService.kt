package com.khoaluan.indoornav.location

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * #28 Location Service — GPS · Compass · Permission-aware updates.
 */
class LocationService(context: Context) : SensorEventListener, LocationListener {
    private val app = context.applicationContext
    private val lm = app.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private val sm = app.getSystemService(Context.SENSOR_SERVICE) as SensorManager

    private val _fix = MutableStateFlow<Location?>(null)
    val fix: StateFlow<Location?> = _fix.asStateFlow()

    private val _accuracyM = MutableStateFlow<Float?>(null)
    val accuracyM: StateFlow<Float?> = _accuracyM.asStateFlow()

    private val _headingDeg = MutableStateFlow<Float?>(null)
    val headingDeg: StateFlow<Float?> = _headingDeg.asStateFlow()

    private val _weakGps = MutableStateFlow(false)
    val weakGps: StateFlow<Boolean> = _weakGps.asStateFlow()

    private var started = false

    fun start() {
        if (started) return
        started = true
        try {
            val provider = when {
                lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
                lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                else -> null
            }
            if (provider != null) {
                lm.requestLocationUpdates(provider, 1000L, 1f, this)
                lm.getLastKnownLocation(provider)?.let { onLocationChanged(it) }
            }
        } catch (_: SecurityException) {
            // Caller must request permission
        }
        sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)?.let {
            sm.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
    }

    fun stop() {
        if (!started) return
        started = false
        try {
            lm.removeUpdates(this)
        } catch (_: Exception) {
        }
        sm.unregisterListener(this)
    }

    override fun onLocationChanged(location: Location) {
        _fix.value = location
        _accuracyM.value = location.accuracy
        _weakGps.value = location.accuracy > 50f || !location.hasAccuracy()
    }

    @Deprecated("Deprecated in Java")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) = Unit

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_ROTATION_VECTOR) return
        val rot = FloatArray(9)
        val ori = FloatArray(3)
        SensorManager.getRotationMatrixFromVector(rot, event.values)
        SensorManager.getOrientation(rot, ori)
        var deg = Math.toDegrees(ori[0].toDouble()).toFloat()
        if (deg < 0) deg += 360f
        _headingDeg.value = deg
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
