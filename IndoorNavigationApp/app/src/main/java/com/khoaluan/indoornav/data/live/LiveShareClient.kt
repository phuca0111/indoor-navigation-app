package com.khoaluan.indoornav.data.live

import com.khoaluan.indoornav.BuildConfig
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * W6 — Live location share qua REST `/api/live-share/:sessionId`
 * (không phụ thuộc Socket.IO client).
 */
class LiveShareClient(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build(),
) {
    data class Peer(
        @SerializedName("peerId") val peerId: String = "",
        @SerializedName("name") val name: String = "",
        @SerializedName("x") val x: Double = 0.0,
        @SerializedName("y") val y: Double = 0.0,
        @SerializedName("floor") val floor: Int? = null,
        @SerializedName("heading") val heading: Float? = null,
    )

    private data class PeersResponse(val peers: List<Peer> = emptyList())

    val peerId: String = UUID.randomUUID().toString().take(8)

    private val _peers = MutableStateFlow<List<Peer>>(emptyList())
    val peers: StateFlow<List<Peer>> = _peers.asStateFlow()

    private val gson = Gson()
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private fun rootBase(): String {
        // BuildConfig.BASE_URL ends with /api/
        return BuildConfig.BASE_URL.removeSuffix("/").removeSuffix("/api")
    }

    suspend fun pushAndPoll(
        sessionId: String,
        name: String,
        x: Float,
        y: Float,
        floor: Int,
        heading: Float?,
    ) = withContext(Dispatchers.IO) {
        val url = "${rootBase()}/api/live-share/$sessionId"
        val bodyJson = gson.toJson(
            mapOf(
                "peerId" to peerId,
                "name" to name,
                "x" to x.toDouble(),
                "y" to y.toDouble(),
                "floor" to floor,
                "heading" to heading,
            ),
        )
        val req = Request.Builder()
            .url(url)
            .post(bodyJson.toRequestBody(jsonMedia))
            .build()
        client.newCall(req).execute().use { resp ->
            val text = resp.body?.string().orEmpty()
            if (!resp.isSuccessful) return@withContext
            val parsed = runCatching { gson.fromJson(text, PeersResponse::class.java) }.getOrNull()
            _peers.value = parsed?.peers.orEmpty()
        }
    }

    suspend fun loopWhileActive(
        sessionId: String,
        name: String,
        getPose: () -> Triple<Float, Float, Int>?,
        getHeading: () -> Float?,
        intervalMs: Long = 2000L,
    ) {
        while (kotlinx.coroutines.currentCoroutineContext().isActive) {
            val pose = getPose()
            if (pose != null) {
                pushAndPoll(sessionId, name, pose.first, pose.second, pose.third, getHeading())
            }
            delay(intervalMs)
        }
    }

    fun clear() {
        _peers.value = emptyList()
    }
}
