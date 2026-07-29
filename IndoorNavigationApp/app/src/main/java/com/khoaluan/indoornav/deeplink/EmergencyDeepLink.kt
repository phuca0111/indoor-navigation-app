package com.khoaluan.indoornav.deeplink

import android.content.Intent
import android.net.Uri

/**
 * Deep link kích hoạt chế độ khẩn cấp (demo / FCM sau này cùng payload).
 *
 * Ví dụ:
 * - indoornav://emergency?type=FIRE&building=<id>&title=Chay+tang+3
 * - indoornav://emergency/FIRE?building=<id>
 */
data class EmergencyDeepLink(
    val incidentType: String = "FIRE",
    val title: String? = null,
    val body: String? = null,
    val buildingId: String? = null,
    val incidentId: String? = null,
)

fun extractEmergencyDeepLink(intent: Intent?): EmergencyDeepLink? {
    if (intent == null) return null

    // Extras từ FCM / EmergencyAlertActivity (không phụ thuộc URI).
    if (intent.getBooleanExtra("from_fcm_emergency", false) ||
        intent.hasExtra("emergency_type")
    ) {
        val type = (
            intent.getStringExtra("emergency_type")
                ?: intent.getStringExtra("_pending_emergency_type")
                ?: "FIRE"
            ).trim().uppercase().ifBlank { "FIRE" }
        return EmergencyDeepLink(
            incidentType = type,
            title = intent.getStringExtra("emergency_title")
                ?: intent.getStringExtra("_pending_emergency_title"),
            body = intent.getStringExtra("emergency_body")
                ?: intent.getStringExtra("_pending_emergency_body"),
            buildingId = intent.getStringExtra("emergency_building")
                ?: intent.getStringExtra("_pending_emergency_building"),
            incidentId = intent.getStringExtra("emergency_incident")
                ?: intent.getStringExtra("_pending_emergency_incident"),
        )
    }

    val data: Uri = intent.data ?: return null
    val scheme = data.scheme?.lowercase() ?: return null
    if (scheme != "indoornav" && scheme != "indoorhub") return null

    val host = data.host?.lowercase().orEmpty()
    val segs = data.pathSegments.orEmpty()
    val isEmergencyHost = host == "emergency"
    val isEmergencyPath = segs.isNotEmpty() && segs[0].equals("emergency", true)
    if (!isEmergencyHost && !isEmergencyPath) return null

    val typeFromPath = when {
        isEmergencyHost && segs.isNotEmpty() -> segs[0]
        isEmergencyPath && segs.size >= 2 -> segs[1]
        else -> null
    }

    val type = (
        data.getQueryParameter("type")
            ?: data.getQueryParameter("incident_type")
            ?: typeFromPath
            ?: "FIRE"
        ).trim().uppercase().ifBlank { "FIRE" }

    return EmergencyDeepLink(
        incidentType = type,
        title = data.getQueryParameter("title")?.takeIf { it.isNotBlank() },
        body = data.getQueryParameter("body")?.takeIf { it.isNotBlank() },
        buildingId = data.getQueryParameter("building")
            ?: data.getQueryParameter("building_id")
            ?: data.getQueryParameter("buildingId"),
        incidentId = data.getQueryParameter("incident")
            ?: data.getQueryParameter("incident_id"),
    )
}
