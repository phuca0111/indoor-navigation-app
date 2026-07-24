package com.khoaluan.indoornav.data.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import com.google.gson.Gson
import com.khoaluan.indoornav.data.api.HubHistoryBody
import com.khoaluan.indoornav.data.api.HubPlaceIdBody
import com.khoaluan.indoornav.data.api.PlaceFollowBody
import com.khoaluan.indoornav.data.api.PlaceReportBody
import com.khoaluan.indoornav.data.api.PlaceReviewBody
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.local.SyncQueueStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Flush SyncQueue khi có mạng. */
class SyncEngine(private val context: Context) {
    private val store = SyncQueueStore(context)
    private val gson = Gson()

    fun isOnline(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val net = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(net) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    fun pendingCount(): Int = store.list().size

    fun enqueue(type: String, payload: Any) {
        store.enqueue(type, payload)
    }

    suspend fun flush(): Int = withContext(Dispatchers.IO) {
        if (!isOnline()) return@withContext 0
        val api = RetrofitClient.getApiService()
        var ok = 0
        for (job in store.list()) {
            try {
                val success = when (job.type) {
                    SyncQueueStore.TYPE_FAVORITE_ADD -> {
                        val body = gson.fromJson(job.payloadJson, HubPlaceIdBody::class.java)
                        api.addFavorite(body).isSuccessful
                    }
                    SyncQueueStore.TYPE_FAVORITE_REMOVE -> {
                        val body = gson.fromJson(job.payloadJson, HubPlaceIdBody::class.java)
                        api.removeFavorite(body.placeId).isSuccessful
                    }
                    SyncQueueStore.TYPE_FOLLOW -> {
                        val body = gson.fromJson(job.payloadJson, PlaceFollowBody::class.java)
                        api.followPlace(body).isSuccessful
                    }
                    SyncQueueStore.TYPE_UNFOLLOW -> {
                        val body = gson.fromJson(job.payloadJson, PlaceFollowBody::class.java)
                        api.unfollowPlace(body.placeId).isSuccessful
                    }
                    SyncQueueStore.TYPE_REVIEW -> {
                        val body = gson.fromJson(job.payloadJson, PlaceReviewBody::class.java)
                        api.upsertPlaceReview(body).isSuccessful
                    }
                    SyncQueueStore.TYPE_REPORT -> {
                        val body = gson.fromJson(job.payloadJson, PlaceReportBody::class.java)
                        api.createPlaceReport(body).isSuccessful
                    }
                    SyncQueueStore.TYPE_HISTORY -> {
                        val body = gson.fromJson(job.payloadJson, HubHistoryBody::class.java)
                        api.addHistory(body).isSuccessful
                    }
                    else -> true
                }
                if (success) {
                    store.remove(job.id)
                    ok++
                } else {
                    store.bumpAttempt(job.id)
                    if (job.attempts >= 4) store.remove(job.id)
                }
            } catch (e: Exception) {
                Log.w("SyncEngine", "job ${job.type}: ${e.message}")
                store.bumpAttempt(job.id)
            }
        }
        ok
    }
}
