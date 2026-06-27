package com.khoaluan.indoornav.navigation.pdr

import kotlin.math.sqrt

enum class MotionState {
    STILL,
    WALKING
}

/**
 * FILE: MotionStateEngine.kt
 * MỤC ĐÍCH: Xác định người dùng có đang di chuyển hay không bằng cách phân tích năng lượng dao động liên tục (Continuous Motion Energy).
 * Không phụ thuộc vào sự kiện "Bước chân" rời rạc.
 * Dùng Linear Acceleration (Gia tốc tuyến tính đã loại bỏ trọng lực).
 */
class MotionStateEngine {
    var currentState: MotionState = MotionState.STILL
        private set

    // Lọc nhiễu cho năng lượng
    private var filteredEnergy = 0f
    private val alpha = 0.85f // LPF hệ số (tăng lên để mượt hơn)

    // Ngưỡng năng lượng để xác định là đang đi (m/s^2)
    // 1.3f: Gia tốc tuyến tính của đi bộ thật thường dao động từ 1.5 - 4.0 m/s^2.
    // Đặt 1.3f để loại bỏ triệt để nhiễu xoay tay hoặc rung tay khi đứng yên.
    private val walkThreshold = 1.3f

    // Bộ đếm thời gian để tránh giật cục trạng thái
    private var lastWalkTimeMs = 0L
    private val keepAliveWalkingMs = 300L // Giữ trạng thái WALKING thêm 0.3s để dừng ngay lập tức khi đứng yên

    fun onLinearAccel(x: Float, y: Float, z: Float) {
        // Tính năng lượng chuyển động (Magnitude của gia tốc tuyến tính)
        val rawEnergy = sqrt(x * x + y * y + z * z)
        
        // Làm mượt năng lượng bằng LPF
        filteredEnergy = alpha * filteredEnergy + (1f - alpha) * rawEnergy

        val now = System.currentTimeMillis()

        if (filteredEnergy > walkThreshold) {
            currentState = MotionState.WALKING
            lastWalkTimeMs = now
        } else {
            // Nếu năng lượng giảm dưới ngưỡng, đợi hết khoảng keepAlive mới chuyển về STILL
            if (now - lastWalkTimeMs > keepAliveWalkingMs) {
                currentState = MotionState.STILL
            }
        }
    }
}
