package com.khoaluan.indoornav.navigation.gps

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.khoaluan.indoornav.data.local.SessionManager
import com.khoaluan.indoornav.data.model.Building

/**
 * Spec D — đăng ký OS geofence (Play Services).
 * ENTER/DWELL khi app đóng vẫn wake [BuildingGeofenceReceiver] → PresenceSync → L1/L4.
 */
object BuildingGeofenceRegistrar {
    private const val TAG = "BuildingOsGeofence"
    private const val ACTION = "com.khoaluan.indoornav.action.BUILDING_GEOFENCE"
    private const val LOITER_MS = 4 * 60 * 1000 // refresh presence khi đứng trong vùng

    fun geofencePendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, BuildingGeofenceReceiver::class.java).setAction(ACTION)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        return PendingIntent.getBroadcast(context, 0, intent, flags)
    }

    fun hasFineLocation(context: Context): Boolean {
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
        return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Đăng ký lại từ store (boot / sau khi xin background location).
     */
    fun reregisterFromStore(context: Context) {
        if (!SessionManager(context).isLoggedIn) {
            removeAll(context)
            return
        }
        if (!hasFineLocation(context)) return
        val targets = BuildingGeofenceStore.load(context)
        if (targets.isEmpty()) return
        applyTargets(context, targets)
    }

    fun registerForBuildings(context: Context, buildings: List<Building>) {
        if (!SessionManager(context).isLoggedIn) {
            removeAll(context)
            BuildingGeofenceStore.clear(context)
            return
        }
        BuildingGeofenceStore.save(context, buildings)
        if (!hasFineLocation(context)) {
            Log.w(TAG, "Chưa có quyền location — bỏ qua OS geofence")
            return
        }
        val targets = BuildingGeofenceStore.load(context)
        if (targets.isEmpty()) {
            removeAll(context)
            return
        }
        applyTargets(context, targets)
    }

    fun removeAll(context: Context) {
        val client = LocationServices.getGeofencingClient(context)
        runCatching {
            client.removeGeofences(geofencePendingIntent(context))
                .addOnSuccessListener { Log.i(TAG, "Đã gỡ OS geofence") }
                .addOnFailureListener { e -> Log.w(TAG, "Gỡ geofence thất bại: ${e.message}") }
        }
        BuildingGeofenceStore.clear(context)
    }

    private fun applyTargets(context: Context, targets: List<BuildingGeofenceStore.Target>) {
        val geofences = targets.map { t ->
            Geofence.Builder()
                .setRequestId(t.id)
                .setCircularRegion(t.lat, t.lng, t.radiusMeters)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setLoiteringDelay(LOITER_MS)
                .setTransitionTypes(
                    Geofence.GEOFENCE_TRANSITION_ENTER or
                        Geofence.GEOFENCE_TRANSITION_DWELL or
                        Geofence.GEOFENCE_TRANSITION_EXIT
                )
                .build()
        }
        val request = GeofencingRequest.Builder()
            .setInitialTrigger(
                GeofencingRequest.INITIAL_TRIGGER_ENTER or
                    GeofencingRequest.INITIAL_TRIGGER_DWELL
            )
            .addGeofences(geofences)
            .build()

        val client = LocationServices.getGeofencingClient(context)
        val pi = geofencePendingIntent(context)
        // Gỡ cũ rồi thêm mới — tránh trùng requestId
        client.removeGeofences(pi)
            .addOnCompleteListener {
                try {
                    client.addGeofences(request, pi)
                        .addOnSuccessListener {
                            Log.i(TAG, "Đã đăng ký ${geofences.size} OS geofence (presence khi app đóng)")
                        }
                        .addOnFailureListener { e ->
                            Log.e(TAG, "Đăng ký OS geofence thất bại: ${e.message}", e)
                        }
                } catch (se: SecurityException) {
                    Log.e(TAG, "Thiếu quyền geofence: ${se.message}")
                }
            }
    }
}
