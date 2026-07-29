package com.khoaluan.indoornav.navigation.gps

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.khoaluan.indoornav.fcm.PresenceSync
import com.khoaluan.indoornav.navigation.gps.PresenceHintStore

/**
 * Nhận ENTER / DWELL / EXIT từ OS geofence — chạy cả khi app đã đóng (có BACKGROUND_LOCATION).
 */
class BuildingGeofenceReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val event = GeofencingEvent.fromIntent(intent)
        if (event == null) {
            Log.w(TAG, "GeofencingEvent null")
            return
        }
        if (event.hasError()) {
            Log.w(TAG, "Geofence error=${event.errorCode}")
            return
        }

        val transition = event.geofenceTransition
        val triggering = event.triggeringLocation
        val ids = event.triggeringGeofences?.map { it.requestId }.orEmpty()
        if (ids.isEmpty()) return

        val buildingId = ids.first()
        val target = BuildingGeofenceStore.load(context).firstOrNull { it.id == buildingId }
        val lat = triggering?.latitude
        val lng = triggering?.longitude
        val acc = triggering?.accuracy

        when (transition) {
            Geofence.GEOFENCE_TRANSITION_ENTER,
            Geofence.GEOFENCE_TRANSITION_DWELL -> {
                Log.i(TAG, "OS geofence ENTER/DWELL building=$buildingId")
                PresenceHintStore.markEnter(context.applicationContext, buildingId)
                PresenceSync.update(
                    context = context.applicationContext,
                    buildingId = buildingId,
                    lat = lat,
                    lng = lng,
                    accuracy = acc,
                    buildingLat = target?.lat,
                    buildingLng = target?.lng,
                    touchIndoor = true,
                    indoorSessionOpen = false,
                    includeRadio = true,
                )
            }
            Geofence.GEOFENCE_TRANSITION_EXIT -> {
                Log.i(TAG, "OS geofence EXIT building=$buildingId")
                PresenceHintStore.markExit(context.applicationContext, buildingId)
                // Cập nhật GPS tại điểm thoát — server soft-exclude nếu >R; clear nếu > clearDist
                PresenceSync.update(
                    context = context.applicationContext,
                    lat = lat,
                    lng = lng,
                    accuracy = acc,
                    buildingLat = target?.lat,
                    buildingLng = target?.lng,
                    indoorSessionOpen = false,
                )
            }
            else -> Log.d(TAG, "Bỏ qua transition=$transition")
        }
    }

    companion object {
        private const val TAG = "BuildingOsGeofence"
    }
}
