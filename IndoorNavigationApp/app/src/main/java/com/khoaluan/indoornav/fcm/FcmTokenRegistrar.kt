package com.khoaluan.indoornav.fcm

import android.content.Context
import android.os.Build
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import com.khoaluan.indoornav.data.api.DeviceRegisterBody
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.local.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Đăng ký FCM token của thiết bị lên backend (PUT /users/me/devices).
 * Chỉ đăng ký khi user đã đăng nhập — push khẩn cấp gửi theo tài khoản.
 */
object FcmTokenRegistrar {
    private const val TAG = "FcmTokenRegistrar"

    /** Lấy token hiện tại rồi gửi lên backend (gọi khi mở app / sau đăng nhập). */
    fun syncCurrentToken(context: Context) {
        val session = SessionManager(context)
        if (!session.isLoggedIn) return
        try {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token -> registerToken(context, token) }
                .addOnFailureListener { e ->
                    Log.d(TAG, "Không lấy được FCM token: ${e.message}")
                }
        } catch (e: Exception) {
            // Firebase chưa cấu hình (thiếu google-services.json) — bỏ qua, app vẫn chạy.
            Log.d(TAG, "Firebase chưa sẵn sàng: ${e.message}")
        }
    }

    /** Gửi 1 token cụ thể (dùng trong onNewToken). */
    fun registerToken(context: Context, token: String?) {
        val session = SessionManager(context)
        if (!session.isLoggedIn || token.isNullOrBlank()) return
        RetrofitClient.init(context)
        CoroutineScope(Dispatchers.IO).launch {
            try {
                RetrofitClient.getApiService().registerDevice(
                    DeviceRegisterBody(
                        device_id = session.deviceId,
                        platform = "android",
                        device_name = "${Build.MANUFACTURER} ${Build.MODEL}".trim(),
                        fcm_token = token,
                    )
                )
                Log.i(TAG, "Đã đăng ký FCM token với backend.")
            } catch (e: Exception) {
                Log.w(TAG, "Đăng ký FCM token thất bại: ${e.message}")
            }
        }
    }
}
