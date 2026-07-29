package com.khoaluan.indoornav.seismic

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Boot / cắm-rút sạc → đánh giá lại SeismicMonitorService.
 * Khi user đã opt-in nền: rút sạc không tắt service.
 */
class SeismicPowerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        Log.i(TAG, "power/boot action=$action")
        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_POWER_CONNECTED -> {
                SeismicMonitorService.startIfEligible(context)
            }
            Intent.ACTION_POWER_DISCONNECTED -> {
                if (SeismicPrefs.isBackgroundEnabled(context)) {
                    // Vẫn chạy nền — chỉ cập nhật notification
                    SeismicMonitorService.reevaluate(context)
                } else {
                    SeismicMonitorService.stop(context)
                }
            }
        }
    }

    companion object {
        private const val TAG = "SeismicPower"
    }
}
