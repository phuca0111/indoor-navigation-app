package com.khoaluan.indoornav.navigation.pdr

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.sqrt

/**
 * FILE: RotationEngine.kt
 * MỤC ĐÍCH: Orchestrator kết nối HeadingEstimator và RotationSmoother.
 * 
 * Đầu vào: Dữ liệu thô từ SensorCollector.
 * Đầu ra: StateFlow hướng xoay siêu mượt cho MapView.
 */
class RotationEngine {

    // alpha=0.95 (giảm từ 0.98): L1 phản ứng nhanh hơn ~3x khi quay
    // minAlpha=0.75 (giảm từ 0.88): L2 đáp ứng góc cua nhanh hơn ~2x
    private val headingEstimator = HeadingEstimator(alpha = 0.95f)
    private val rotationSmoother = RotationSmoother(minAlpha = 0.75f, maxAlpha = 0.97f)

    private val _smoothHeading = MutableStateFlow(0f)
    val smoothHeading: StateFlow<Float> = _smoothHeading.asStateFlow()

    private var lastGyroMagnitude = 0f
    // Throttle updateOutput để tránh gọi 2 lần nếu rotation vector và gyro cùng fire trong cùng frame (~50Hz)
    private var lastOutputTimeNs = 0L

    /**
     * Cập nhật từ Rotation Vector (La bàn + Gia tốc + Gyro nội bộ)
     */
    fun updateRotationVector(values: FloatArray) {
        headingEstimator.updateRotationVector(values, lastGyroMagnitude)
        updateOutput()
    }

    /**
     * Cập nhật từ Gyroscope (Vận tốc góc)
     */
    fun updateGyro(values: FloatArray, timestampNs: Long) {
        headingEstimator.updateGyro(values, timestampNs)
        
        // Tính độ lớn gyro (để biết máy đang xoay nhanh hay chậm)
        lastGyroMagnitude = sqrt(values[0] * values[0] + values[1] * values[1] + values[2] * values[2])
        
        updateOutput()
    }

    private fun updateOutput() {
        val now = System.nanoTime()
        // Chỉ update nếu đã qua ít nhất 10ms so với lần cuối
        if (now - lastOutputTimeNs < 10_000_000L) {
            return
        }
        lastOutputTimeNs = now

        val rawHeading = headingEstimator.getHeading()
        val smoothHeading = rotationSmoother.getSmoothRotation(rawHeading, lastGyroMagnitude)
        _smoothHeading.value = smoothHeading
    }

    fun reset() {
        headingEstimator.reset()
    }
}
