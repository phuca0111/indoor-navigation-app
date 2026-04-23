package com.khoaluan.indoornav.navigation.pdr

import android.hardware.SensorManager
import com.khoaluan.indoornav.navigation.NavigationLogger
import kotlin.math.*

/**
 * FILE: HeadingEstimator.kt
 * MỤC ĐÍCH: Ước lượng hướng đi (Heading / Yaw Angle) ổn định bằng Complementary Filter
 *
 * VẤN ĐỀ:
 *   - La bàn (Magnetometer): chính xác hướng Bắc tuyệt đối nhưng BỊ NHIỄU bởi sắt thép
 *   - Con quay hồi chuyển (Gyroscope): nhanh nhạy nhưng tích lũy DRIFT theo thời gian
 *
 * GIẢI PHÁP — Complementary Filter:
 *   heading = α × (heading + gyroZWorld × Δt) + (1-α) × compass
 *   α = 0.99 → tin Gyro 99% (xoay nhanh tức thì), tin La bàn 1% (kéo chuẩn định kỳ từ từ)
 *
 * HIỆU CHUẨN:
 *   - Nếu heading nhảy loạn khi xoay người → do la bàn giật → Tăng α lên 0.995
 *   - Nếu heading trễ / không hướng ra Bắc đúng → Giảm α xuống 0.95
 */
class HeadingEstimator(private val alpha: Float = 0.96f) {

    private var heading = 0f           // Góc hiện tại (độ, 0=Bắc, 90=Đông, -90=Tây)
    private var lastGyroTimestampNs = 0L
    private var isInitialized = false

    /**
     * Cập nhật từ Gyroscope — gọi mỗi khi có SensorEvent gyro
     * @param gyroValues vận tốc góc theo 3 trục [x, y, z] (rad/s)
     * @param timestampNs timestamp từ SensorEvent (nano-giây)
     */
    fun updateGyro(gyroValues: FloatArray, timestampNs: Long) {
        if (!isInitialized || lastGyroTimestampNs == 0L) {
            lastGyroTimestampNs = timestampNs
            return
        }
        val dt = (timestampNs - lastGyroTimestampNs) / 1_000_000_000f  // ns → giây
        lastGyroTimestampNs = timestampNs

        // Dùng trục Z của gyro làm dự đoán nhanh.
        // Dấu trừ để quy ước CW làm heading tăng trong hệ hiển thị hiện tại.
        val gyroZ = gyroValues[2]
        val deltaHeading = -(Math.toDegrees((gyroZ * dt).toDouble()).toFloat())
        heading += deltaHeading
        heading = normalize(heading)

        // Ghi log Gyro
        NavigationLogger.logGyro(gyroZ, dt, deltaHeading)
    }

    /**
     * Giữ tương thích ngược với các call-site cũ đang truyền accel.
     */
    fun updateGyro(gyroValues: FloatArray, accelValues: FloatArray, timestampNs: Long) {
        updateGyro(gyroValues, timestampNs)
    }

    /**
     * Sử dụng cảm biến Rotation Vector của Google (Gyro + Accel + Compass nội bộ qua EKF).
     * Điểm đặc biệt: 0 độ luôn luôn là cực Bắc từ trường (Giống mọi App La bàn quốc tế).
     */
    fun updateRotationVector(values: FloatArray, timestampNs: Long? = null) {
        val rotationMatrix = FloatArray(9)
        SensorManager.getRotationMatrixFromVector(rotationMatrix, values)

        val orientationAngles = FloatArray(3)
        SensorManager.getOrientation(rotationMatrix, orientationAngles)
        
        // Azimuth (góc xoay trục Z so với Cực Bắc)
        val currentAzimuth = Math.toDegrees(orientationAngles[0].toDouble()).toFloat()

        // Fusion: gyro dự đoán nhanh, rotation vector kéo chuẩn chậm (1-alpha).
        heading = if (!isInitialized) {
            isInitialized = true
            normalize(currentAzimuth)
        } else {
            val correction = shortestAngleDelta(heading, currentAzimuth)
            normalize(heading + (1f - alpha) * correction)
        }

        timestampNs?.let { ts ->
            if (lastGyroTimestampNs == 0L) {
                lastGyroTimestampNs = ts
            }
        }

        // Ghi log
        NavigationLogger.logCompass(currentAzimuth, heading, alpha)
    }

    /** Heading hiện tại (độ: 0=Bắc, 90=Đông, -90/270=Tây, 180/-180=Nam) */
    fun getHeading(): Float = heading

    /** Heading theo radian (0=Bắc, tăng theo chiều kim đồng hồ) */
    fun getHeadingRad(): Float = Math.toRadians(heading.toDouble()).toFloat()

    fun reset() {
        isInitialized = false
        lastGyroTimestampNs = 0L
        heading = 0f
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Chuẩn hóa về [-180, 180] */
    private fun normalize(angle: Float): Float {
        var r = angle % 360f
        if (r > 180f) r -= 360f
        if (r < -180f) r += 360f
        return r
    }

    /** Tính góc chênh lệch ngắn nhất (có xét wrapping -180/180) */
    private fun shortestAngleDelta(from: Float, to: Float): Float {
        var delta = (to - from) % 360f
        if (delta > 180f) delta -= 360f
        if (delta < -180f) delta += 360f
        return delta
    }
}
