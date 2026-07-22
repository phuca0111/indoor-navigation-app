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

    /** Game RV: đảo yaw 180° cho khớp mũi tên với hướng cầm máy. */
    var invertAzimuth180: Boolean
        get() = headingEstimator.invertAzimuth180
        set(value) {
            headingEstimator.invertAzimuth180 = value
        }

    /** Surface.ROTATION_* — đồng bộ xoay màn hình (đầu/đít theo UI). */
    var displayRotation: Int
        get() = headingEstimator.displayRotation
        set(value) {
            headingEstimator.displayRotation = value
        }

    /** Pitch gần nhất — khóa QR chờ máy nằm (đầu máy chỉ ngang). */
    val lastPitchDeg: Float
        get() = headingEstimator.lastPitchDeg

    val isHeadAxisUsableForWalk: Boolean
        get() = headingEstimator.isHeadAxisUsableForWalk

    /** rad/s — dùng gate xoay tại chỗ / bước ảo khi quay vòng. */
    val gyroMagnitude: Float
        get() = lastGyroMagnitude

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

    /** G3: WALKING → smoother bám heading nhanh hơn (HEADING_UP ít lệch khi đi). */
    fun setWalking(walking: Boolean) {
        rotationSmoother.isWalking = walking
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
        rotationSmoother.reset()
        lastGyroMagnitude = 0f
        lastOutputTimeNs = 0L
        _smoothHeading.value = 0f
    }

    /** Sau QR trong map: nhảy ngay về azimuth thô (bỏ trễ smoother ~10°). */
    fun snapToRawHeading() {
        val raw = headingEstimator.getHeading()
        rotationSmoother.reset()
        // Init smoother tại raw
        rotationSmoother.getSmoothRotation(raw, 0f)
        _smoothHeading.value = raw
    }

    /**
     * Buộc mẫu Rotation Vector kế tiếp khởi tạo lại azimuth tuyệt đối
     * (dùng sau resume app / đổi tab — tránh gyro/smoother giữ góc trôi).
     */
    fun invalidateAbsoluteHeading() {
        headingEstimator.reset()
        rotationSmoother.reset()
        lastGyroMagnitude = 0f
        lastOutputTimeNs = 0L
    }
}
