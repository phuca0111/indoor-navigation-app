package com.khoaluan.indoornav.navigation.gps

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.khoaluan.indoornav.data.model.Building

/**
 * Lưu danh sách tòa có GPS để đăng ký lại OS geofence sau reboot / process chết.
 */
object BuildingGeofenceStore {
    private const val PREFS = "building_os_geofence"
    private const val KEY_TARGETS = "targets_json"
    private val gson = Gson()

    data class Target(
        val id: String,
        val name: String,
        val lat: Double,
        val lng: Double,
        val radiusMeters: Float,
    )

    fun save(context: Context, buildings: List<Building>) {
        val targets = buildings.mapNotNull { b ->
            val gps = b.gpsLocation ?: return@mapNotNull null
            if (b.id.isBlank()) return@mapNotNull null
            val radius = maxOf(80f, (b.activationRadius ?: 50).toFloat()).coerceAtMost(150f)
            Target(
                id = b.id,
                name = b.name,
                lat = gps.lat,
                lng = gps.lng,
                radiusMeters = radius,
            )
        }.take(90)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TARGETS, gson.toJson(targets))
            .apply()
    }

    fun load(context: Context): List<Target> {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_TARGETS, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<Target>>() {}.type
            gson.fromJson<List<Target>>(raw, type).orEmpty()
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
}
