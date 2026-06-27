package com.khoaluan.indoornav.navigation.pdr

import android.hardware.SensorManager
import kotlin.math.*

/**
 * FILE: HeadingEstimator.kt
 * MỤC ĐÍCH: Dung hợp cảm biến (Gyro + Rotation Vector) để lấy hướng tuyệt đối.
 * 
 * PHƯƠNG PHÁP:
 * - Ưu tiên Rotation Vector (đã được Android EKF xử lý).
 * - Fallback Gyro integration nếu không có Hardware Rotation Vector.
 */
class HeadingEstimator(private val alpha: Float = 0.98f) {

    private var heading = 0f
    private var lastGyroTimestampNs = 0L
    private var isInitialized = false

    fun updateGyro(gyroValues: FloatArray, timestampNs: Long) {
        if (!isInitialized || lastGyroTimestampNs == 0L) {
            lastGyroTimestampNs = timestampNs
            return
        }
        val dt = (timestampNs - lastGyroTimestampNs) / 1_000_000_000f
        lastGyroTimestampNs = timestampNs

        val gyroZ = gyroValues[2]
        val deltaHeading = -(Math.toDegrees((gyroZ * dt).toDouble()).toFloat())
        heading = normalize(heading + deltaHeading)
    }

    fun updateRotationVector(values: FloatArray, gyroMagnitude: Float) {
        val rotationMatrix = FloatArray(9)
        SensorManager.getRotationMatrixFromVector(rotationMatrix, values)

        val orientationAngles = FloatArray(3)
        SensorManager.getOrientation(rotationMatrix, orientationAngles)
        
        val currentAzimuth = Math.toDegrees(orientationAngles[0].toDouble()).toFloat()

        if (!isInitialized) {
            heading = normalize(currentAzimuth)
            isInitialized = true
        } else {
            val correction = shortestAngleDelta(heading, currentAzimuth)
            heading = normalize(heading + (1f - alpha) * correction)
        }
    }

    fun getHeading(): Float = heading

    fun reset() {
        isInitialized = false
        lastGyroTimestampNs = 0L
    }

    private fun normalize(angle: Float): Float {
        // Euclidean modulo: luôn cho kết quả trong [0, 360), tránh lỗi hiểu nhầm do % giữ dấu số âm.
        var r = angle.mod(360f)
        if (r > 180f) r -= 360f
        return r
    }

    private fun shortestAngleDelta(from: Float, to: Float): Float {
        // Euclidean modulo: đảm bảo delta trong [0,360), rồi điều chỉnh về [-180,180)
        var delta = (to - from).mod(360f)
        if (delta > 180f) delta -= 360f
        return delta
    }
}

