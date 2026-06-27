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

        // 1. Tính toán Adaptive Alpha
        // Gyro càng lớn (đang xoay nhanh) -> alpha càng nhỏ -> tin cảm biến mới hơn -> phản hồi nhanh
        val gyroThreshold = 0.5f // rad/s
        val normalizedGyro = (gyroMagnitude / gyroThreshold).coerceIn(0f, 1f)
        val alpha = maxAlpha - (maxAlpha - minAlpha) * normalizedGyro

        // 2. Tính toán độ chênh lệch ngắn nhất (xử lý lỗi 0-360)
        val delta = shortestAngleDelta(currentSmoothRotation, targetRotation)

        // 3. Jitter Suppression (Vùng chết)
        if (abs(delta) < 0.3f) return currentSmoothRotation

        // 4. Low-pass Filter với Alpha biến thiên
        currentSmoothRotation = normalize(currentSmoothRotation + (1f - alpha) * delta)

        return currentSmoothRotation
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
