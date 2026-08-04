package com.khoaluan.indoornav.navigation.pdr

import kotlin.math.*

/**
 * FILE: RotationSmoother.kt
 * MỤC ĐÍCH: Làm mượt góc xoay bản đồ, khử nhiễu (jitter) và xử lý Adaptive Smoothing.
 *
 * CHIẾN THUẬT:
 * 1. Adaptive Alpha: Thay đổi độ mượt dựa trên vận tốc góc (Gyro).
 * 2. Shortest Angle: Đảm bảo nội suy qua điểm 0-360 độ theo đường ngắn nhất.
 * 3. Dead Zone: Bỏ qua các rung động cực nhỏ (< 0.5 độ) để tránh hao pin & giật UI.
 */
class RotationSmoother(
    private val minAlpha: Float = 0.85f, // Nhạy (khi xoay nhanh)
    private val maxAlpha: Float = 0.98f  // Rất mượt (khi đứng yên)
) {
    private var currentSmoothRotation = 0f
    private var isInitialized = false

    /** true = đang đi bộ: giảm maxAlpha để heading/HEADING_UP bám hướng thật, ít trễ. */
    var isWalking: Boolean = false

    /**
     * true khi nhiễu từ trường (gyro-only): bám target nhanh hơn, dead-zone nhỏ hơn
     * để mũi tên xoay mượt theo tay.
     */
    var gyroPriorityMode: Boolean = false

    /**
     * @param targetRotation Góc xoay mục tiêu từ cảm biến (độ)
     * @param gyroMagnitude Độ lớn vận tốc góc (rad/s) để điều chỉnh alpha
     */
    fun getSmoothRotation(targetRotation: Float, gyroMagnitude: Float): Float {
        if (!isInitialized) {
            currentSmoothRotation = targetRotation
            isInitialized = true
            return currentSmoothRotation
        }

        if (gyroPriorityMode) {
            val delta = shortestAngleDelta(currentSmoothRotation, targetRotation)
            if (abs(delta) < 0.15f) return currentSmoothRotation
            currentSmoothRotation = normalize(currentSmoothRotation + 0.92f * delta)
            return currentSmoothRotation
        }

        // Đi bộ: vẫn mượt; quay nhanh → bám gần raw
        val effectiveMaxAlpha = if (isWalking) minOf(maxAlpha, 0.90f) else maxAlpha
        val effectiveMinAlpha = if (isWalking) minOf(minAlpha, 0.55f) else minAlpha
        val deadZoneDeg = if (isWalking) 0.8f else 0.35f

        // 1. Adaptive Alpha — gyro lớn → tin cảm biến mới hơn (ngưỡng thấp hơn = nhạy xoay nhanh)
        val gyroThreshold = 0.35f // rad/s
        val normalizedGyro = (gyroMagnitude / gyroThreshold).coerceIn(0f, 1f)
        val alpha = effectiveMaxAlpha - (effectiveMaxAlpha - effectiveMinAlpha) * normalizedGyro

        // 2. Độ chênh ngắn nhất (0–360)
        val delta = shortestAngleDelta(currentSmoothRotation, targetRotation)

        // Xoay nhanh: bám gần như raw (tránh tụt hàng chục độ)
        if (gyroMagnitude >= 0.55f) {
            currentSmoothRotation = normalize(currentSmoothRotation + 0.92f * delta)
            return currentSmoothRotation
        }

        // Đứng yên mà còn lệch → snap
        if (abs(delta) >= 12f && gyroMagnitude < 0.18f) {
            currentSmoothRotation = normalize(targetRotation)
            return currentSmoothRotation
        }

        if (abs(delta) < deadZoneDeg) return currentSmoothRotation

        val follow = if (gyroMagnitude < 0.18f) {
            maxOf(1f - alpha, 0.28f)
        } else {
            maxOf(1f - alpha, 0.35f)
        }
        currentSmoothRotation = normalize(currentSmoothRotation + follow * delta)

        return currentSmoothRotation
    }

    fun reset() {
        currentSmoothRotation = 0f
        isInitialized = false
        isWalking = false
        gyroPriorityMode = false
    }

    private fun shortestAngleDelta(from: Float, to: Float): Float {
        var delta = (to - from) % 360f
        if (delta > 180f) delta -= 360f
        if (delta < -180f) delta += 360f
        return delta
    }

    private fun normalize(angle: Float): Float {
        var a = angle % 360f
        if (a < 0) a += 360f
        return a
    }
}
