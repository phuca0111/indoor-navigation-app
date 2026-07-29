package com.khoaluan.indoornav.fcm

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Spec D+ — quét ngắn Wi-Fi BSSID + BLE (không cần kết nối Wi-Fi / vẫn gửi qua 4G).
 * Dùng khi proximity_check / heartbeat / vào indoor để học & khớp fingerprint tòa.
 */
object RadioPresenceScanner {
    private const val TAG = "RadioPresence"
    private const val WIFI_WAIT_MS = 4_000L
    private const val BLE_WAIT_MS = 3_500L

    data class ScanResultPayload(
        val wifi: List<Map<String, Any?>>,
        val ble: List<Map<String, Any?>>,
    )

    fun scanBlocking(context: Context): ScanResultPayload {
        val appCtx = context.applicationContext
        val wifi = scanWifi(appCtx)
        val ble = scanBle(appCtx)
        Log.i(TAG, "scan wifi=${wifi.size} ble=${ble.size}")
        return ScanResultPayload(wifi = wifi, ble = ble)
    }

    @SuppressLint("MissingPermission")
    private fun scanWifi(context: Context): List<Map<String, Any?>> {
        if (!hasLocationOrNearbyWifi(context)) return emptyList()
        val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            ?: return emptyList()
        if (!wm.isWifiEnabled) {
            // Vẫn thử getScanResults (một số máy giữ cache khi Wi-Fi tắt)
            return mapWifiResults(wm)
        }

        val latch = CountDownLatch(1)
        val done = AtomicBoolean(false)
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (done.compareAndSet(false, true)) latch.countDown()
            }
        }
        try {
            val filter = IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
            if (Build.VERSION.SDK_INT >= 33) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(receiver, filter)
            }
            @Suppress("DEPRECATION")
            wm.startScan()
            latch.await(WIFI_WAIT_MS, TimeUnit.MILLISECONDS)
        } catch (e: Exception) {
            Log.w(TAG, "wifi scan: ${e.message}")
        } finally {
            runCatching { context.unregisterReceiver(receiver) }
        }
        return mapWifiResults(wm)
    }

    @SuppressLint("MissingPermission")
    private fun mapWifiResults(wm: WifiManager): List<Map<String, Any?>> {
        return try {
            @Suppress("DEPRECATION")
            wm.scanResults
                .orEmpty()
                .sortedByDescending { it.level }
                .take(30)
                .map {
                    mapOf(
                        "bssid" to (it.BSSID ?: ""),
                        "ssid" to (it.SSID ?: ""),
                        "rssi" to it.level,
                    )
                }
                .filter { (it["bssid"] as String).isNotBlank() }
        } catch (e: Exception) {
            Log.w(TAG, "wifi results: ${e.message}")
            emptyList()
        }
    }

    @SuppressLint("MissingPermission")
    private fun scanBle(context: Context): List<Map<String, Any?>> {
        if (!hasBlePermission(context)) return emptyList()
        val bm = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager ?: return emptyList()
        val adapter = bm.adapter ?: return emptyList()
        if (!adapter.isEnabled) return emptyList()
        val scanner = adapter.bluetoothLeScanner ?: return emptyList()

        val found = LinkedHashMap<String, Map<String, Any?>>()
        val latch = CountDownLatch(1)
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult?) {
                val dev = result?.device ?: return
                val addr = dev.address?.lowercase() ?: return
                if (found.containsKey(addr)) return
                found[addr] = mapOf(
                    "id" to addr,
                    "rssi" to (result.rssi),
                    "name" to (dev.name ?: result.scanRecord?.deviceName ?: ""),
                )
                if (found.size >= 25) latch.countDown()
            }

            override fun onScanFailed(errorCode: Int) {
                Log.w(TAG, "ble scan failed=$errorCode")
                latch.countDown()
            }
        }

        return try {
            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build()
            scanner.startScan(null, settings, callback)
            latch.await(BLE_WAIT_MS, TimeUnit.MILLISECONDS)
            scanner.stopScan(callback)
            found.values.toList()
        } catch (e: Exception) {
            Log.w(TAG, "ble scan: ${e.message}")
            runCatching { scanner.stopScan(callback) }
            emptyList()
        }
    }

    private fun hasLocationOrNearbyWifi(context: Context): Boolean {
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED) {
            return true
        }
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.NEARBY_WIFI_DEVICES) ==
                PackageManager.PERMISSION_GRANTED
        }
        return false
    }

    private fun hasBlePermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= 31) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                PackageManager.PERMISSION_GRANTED
        }
    }
}
