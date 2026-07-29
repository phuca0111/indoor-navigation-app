package com.khoaluan.indoornav.fcm

import android.content.Context
import android.util.Log
import com.khoaluan.indoornav.data.api.PresenceBleSample
import com.khoaluan.indoornav.data.api.PresenceUpdateBody
import com.khoaluan.indoornav.data.api.PresenceUpdateResponse
import com.khoaluan.indoornav.data.api.PresenceWifiSample
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.local.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Spec D — ghi snapshot presence theo sự kiện (không heartbeat lúc bình thường).
 * Spec D+ — tùy chọn quét Wi-Fi/BLE ngắn để học/khớp fingerprint tòa.
 */
object PresenceSync {
    private const val TAG = "PresenceSync"

    fun update(
        context: Context,
        buildingId: String? = null,
        floor: Int? = null,
        qrId: String? = null,
        lat: Double? = null,
        lng: Double? = null,
        accuracy: Float? = null,
        buildingLat: Double? = null,
        buildingLng: Double? = null,
        indoorSessionOpen: Boolean? = null,
        touchIndoor: Boolean = false,
        clearPresence: Boolean = false,
        includeRadio: Boolean = false,
    ) {
        val session = SessionManager(context)
        if (!session.isLoggedIn) return
        CoroutineScope(Dispatchers.IO).launch {
            updateBlocking(
                context = context,
                buildingId = buildingId,
                floor = floor,
                qrId = qrId,
                lat = lat,
                lng = lng,
                accuracy = accuracy,
                buildingLat = buildingLat,
                buildingLng = buildingLng,
                indoorSessionOpen = indoorSessionOpen,
                touchIndoor = touchIndoor,
                clearPresence = clearPresence,
                includeRadio = includeRadio,
            )
        }
    }

    /**
     * Gọi trên IO / background. Trả về body server (có last_radio_*) hoặc null nếu lỗi.
     */
    suspend fun updateBlocking(
        context: Context,
        buildingId: String? = null,
        floor: Int? = null,
        qrId: String? = null,
        lat: Double? = null,
        lng: Double? = null,
        accuracy: Float? = null,
        buildingLat: Double? = null,
        buildingLng: Double? = null,
        indoorSessionOpen: Boolean? = null,
        touchIndoor: Boolean = false,
        clearPresence: Boolean = false,
        includeRadio: Boolean = false,
    ): PresenceUpdateResponse? = withContext(Dispatchers.IO) {
        val appCtx = context.applicationContext
        val session = SessionManager(appCtx)
        if (!session.isLoggedIn) return@withContext null
        RetrofitClient.init(appCtx)

        var wifi: List<PresenceWifiSample>? = null
        var ble: List<PresenceBleSample>? = null
        if (includeRadio) {
            val scan = RadioPresenceScanner.scanBlocking(appCtx)
            wifi = scan.wifi.mapNotNull { row ->
                val bssid = row["bssid"] as? String ?: return@mapNotNull null
                PresenceWifiSample(
                    bssid = bssid,
                    ssid = row["ssid"] as? String,
                    rssi = (row["rssi"] as? Number)?.toInt(),
                )
            }
            ble = scan.ble.mapNotNull { row ->
                val id = row["id"] as? String ?: return@mapNotNull null
                PresenceBleSample(
                    id = id,
                    rssi = (row["rssi"] as? Number)?.toInt(),
                    name = row["name"] as? String,
                )
            }
        }

        try {
            val resp = RetrofitClient.getApiService().updatePresence(
                PresenceUpdateBody(
                    device_id = session.deviceId,
                    building_id = buildingId,
                    floor = floor,
                    qr_id = qrId,
                    lat = lat,
                    lng = lng,
                    accuracy = accuracy?.toDouble(),
                    building_lat = buildingLat,
                    building_lng = buildingLng,
                    indoor_session_open = indoorSessionOpen,
                    touch_indoor = touchIndoor,
                    clear_presence = clearPresence,
                    wifi_bssids = wifi,
                    ble_ids = ble,
                )
            )
            if (!resp.isSuccessful) {
                Log.w(TAG, "updatePresence HTTP ${resp.code()}")
                return@withContext null
            }
            val body = resp.body()
            if (clearPresence) {
                session.lastBuildingId = null
            } else {
                val resolved = body?.last_building_id
                    ?: body?.last_radio_building_id
                    ?: buildingId
                if (!resolved.isNullOrBlank()) {
                    session.lastBuildingId = resolved
                }
            }
            if (body?.last_radio_building_id != null) {
                Log.i(
                    TAG,
                    "radio match building=${body.last_radio_building_id} " +
                        "score=${body.last_radio_score} src=${body.last_radio_source}"
                )
            }
            body
        } catch (e: Exception) {
            Log.w(TAG, "updatePresence failed: ${e.message}")
            null
        }
    }
}
