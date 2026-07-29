package com.khoaluan.indoornav.fcm

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Nhận push DATA-ONLY khẩn cấp → mở luôn màn hình cảnh báo (takeover).
 */
class EmergencyMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        FcmTokenRegistrar.registerToken(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data

        // Spec D+ — wake + tự đo GPS (trước stop, vì payload dùng emergency=false)
        if (data["action"] == "proximity_check") {
            Log.i(TAG, "Proximity check FCM")
            EmergencyProximityCheck.handle(applicationContext, data)
            return
        }

        // Spec D — Stop Emergency
        if (data["action"] == "stop" || data["emergency"] == "false") {
            Log.i(TAG, "Stop Emergency FCM")
            EmergencyHeartbeat.stop(applicationContext)
            EmergencyNotifier.dismissEmergencySession(applicationContext)
            return
        }

        val isEmergency = data["emergency"] == "true" ||
            (data["incident_type"] != null && data["incident_id"] != null)

        if (!isEmergency) {
            Log.d(TAG, "Push thường, bỏ qua xử lý khẩn cấp.")
            return
        }

        val type = (data["incident_type"] ?: "FIRE").uppercase()
        val title = data["title"]?.takeIf { it.isNotBlank() } ?: "CẢNH BÁO KHẨN CẤP"
        val body = data["body"]?.takeIf { it.isNotBlank() }
            ?: "Có sự cố khẩn cấp. Làm theo hướng dẫn sơ tán."
        val buildingId = data["building_id"]?.takeIf { it.isNotBlank() }
        val incidentId = data["incident_id"]?.takeIf { it.isNotBlank() }

        Log.i(TAG, "Emergency FCM → takeover type=$type incident=$incidentId")
        EmergencyNotifier.launchTakeover(
            context = applicationContext,
            type = type,
            title = title,
            body = body,
            buildingId = buildingId,
            incidentId = incidentId,
        )

        // Heartbeat nếu consent cho phép chia sẻ vị trí
        if (!incidentId.isNullOrBlank()) {
            EmergencyConsentHelper.startHeartbeatIfAllowed(
                context = applicationContext,
                incidentId = incidentId,
                buildingId = buildingId,
            )
        }
    }

    companion object {
        private const val TAG = "EmergencyMessaging"
    }
}
