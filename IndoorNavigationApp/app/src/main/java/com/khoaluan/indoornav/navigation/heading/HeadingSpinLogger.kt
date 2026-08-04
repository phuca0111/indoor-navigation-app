package com.khoaluan.indoornav.navigation.heading

import android.util.Log
import kotlin.math.abs

/**
 * Log xoay nhanh / lệch mũi tên — lọc Logcat: tag **HeadingSpin**
 *
 * Bật: [enabled] = true (mặc định true khi debug build có thể tắt).
 * Dùng để soi: device vs map vs nav, trust mag, calib, lưới, gyro.
 */
object HeadingSpinLogger {
    const val TAG = "HeadingSpin"

    /** Tắt = false nếu log quá nhiều. */
    @JvmField
    var enabled: Boolean = true

    private var lastLogMs = 0L
    private var lastForceLogMs = 0L

    /**
     * @param force true khi phát hiện lệch lớn (luôn log, rate ~4Hz)
     */
    fun log(
        gyro: Float,
        magTrust: Float,
        magSeverity: String,
        deviceDeg: Float,
        mapDeg: Float,
        navDeg: Float,
        baseDeg: Float,
        calibDeg: Float,
        gridDeg: Float,
        force: Boolean = false,
    ) {
        if (!enabled) return
        val now = System.currentTimeMillis()
        val spinning = gyro >= 0.35f
        val deviceMapGap = abs(MapHeadingMath.shortestDeltaDegrees(deviceDeg, mapDeg))
        val mapNavGap = abs(MapHeadingMath.shortestDeltaDegrees(mapDeg, navDeg))
        val desync = deviceMapGap >= 25f || mapNavGap >= 20f

        if (!force && !spinning && !desync) return

        val minInterval = when {
            force || desync -> 250L
            spinning -> 120L
            else -> 500L
        }
        val last = if (force || desync) lastForceLogMs else lastLogMs
        if (now - last < minInterval) return
        if (force || desync) lastForceLogMs = now else lastLogMs = now

        val flag = when {
            desync && spinning -> "SPIN+DESYNC"
            desync -> "DESYNC"
            spinning -> "SPIN"
            else -> "OK"
        }
        Log.i(
            TAG,
            "$flag gyro=${"%.2f".format(gyro)} trust=${"%.2f".format(magTrust)} mag=$magSeverity " +
                "dev=${"%.1f".format(deviceDeg)} map=${"%.1f".format(mapDeg)} nav=${"%.1f".format(navDeg)} " +
                "base=${"%.1f".format(baseDeg)} cal=${"%.1f".format(calibDeg)} grid=${"%.1f".format(gridDeg)} " +
                "Δdev-map=${"%.1f".format(deviceMapGap)} Δmap-nav=${"%.1f".format(mapNavGap)}"
        )
    }
}
