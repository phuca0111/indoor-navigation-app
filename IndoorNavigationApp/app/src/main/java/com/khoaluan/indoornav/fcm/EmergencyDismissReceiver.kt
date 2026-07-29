package com.khoaluan.indoornav.fcm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Khi user vuốt xóa notification khẩn cấp. */
class EmergencyDismissReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        EmergencyNotifier.cancel(context)
    }
}
