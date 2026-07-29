package com.khoaluan.indoornav.navigation.gps

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Sau reboot OS xoá geofence — đăng ký lại nếu user còn đăng nhập.
 */
class BuildingGeofenceBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (
            action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }
        Log.i(TAG, "Boot/replace → reregister OS geofence")
        BuildingGeofenceRegistrar.reregisterFromStore(context.applicationContext)
    }

    companion object {
        private const val TAG = "BuildingOsGeofence"
    }
}
