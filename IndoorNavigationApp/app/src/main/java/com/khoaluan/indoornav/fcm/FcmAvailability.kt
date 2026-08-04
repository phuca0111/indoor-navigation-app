package com.khoaluan.indoornav.fcm

import android.content.Context
import com.google.firebase.FirebaseApp

/**
 * Phát hiện Firebase/FCM đã gắn google-services.json chưa.
 * Không throw — app chạy được cả khi thiếu file.
 */
object FcmAvailability {
    fun isFirebaseReady(context: Context): Boolean =
        try {
            FirebaseApp.getApps(context.applicationContext).isNotEmpty()
        } catch (_: Exception) {
            false
        }

    fun statusLabelVi(context: Context): String =
        if (isFirebaseReady(context)) {
            "FCM: Firebase đã gắn (google-services.json) — đăng ký token khi đăng nhập"
        } else {
            "FCM: chưa có google-services.json — chỉ mô phỏng cảnh báo trong app"
        }

    fun statusLabelEn(context: Context): String =
        if (isFirebaseReady(context)) {
            "FCM: Firebase configured — token syncs after login"
        } else {
            "FCM: missing google-services.json — in-app simulation only"
        }
}
