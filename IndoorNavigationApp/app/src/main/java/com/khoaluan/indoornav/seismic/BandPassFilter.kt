package com.khoaluan.indoornav.seismic

import kotlin.math.PI

/**
 * Band-pass 1–10 Hz: cascade high-pass + low-pass bậc 1 (nhẹ, thích nghi dt thực).
 * Giữ dải sóng P/S hữu ích cho công trình; cắt nhiễu cao (bước chân, điện thoại) và drift chậm.
 */
class BandPassFilter(
    private val lowCutoffHz: Float = 1f,
    private val highCutoffHz: Float = 10f,
) {
    private var hpPrevIn = 0f
    private var hpPrevOut = 0f
    private var lpOut = 0f
    private var lpPrimed = false

    fun process(x: Float, dtSec: Float): Float {
        val dt = dtSec.coerceIn(1e-4f, 0.1f)
        val hp = highPass(x, dt)
        return lowPass(hp, dt)
    }

    private fun highPass(x: Float, dt: Float): Float {
        val rc = 1f / (2f * PI.toFloat() * lowCutoffHz)
        val a = rc / (rc + dt)
        val y = a * (hpPrevOut + x - hpPrevIn)
        hpPrevIn = x
        hpPrevOut = y
        return y
    }

    private fun lowPass(x: Float, dt: Float): Float {
        val rc = 1f / (2f * PI.toFloat() * highCutoffHz)
        val a = dt / (rc + dt)
        lpOut = if (!lpPrimed) {
            lpPrimed = true
            x
        } else {
            lpOut + a * (x - lpOut)
        }
        return lpOut
    }

    fun reset() {
        hpPrevIn = 0f
        hpPrevOut = 0f
        lpOut = 0f
        lpPrimed = false
    }
}
