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

    private val headingEstimator = HeadingEstimator(alpha = 0.88f)
    private val rotationSmoother = RotationSmoother(minAlpha = 0.50f, maxAlpha = 0.90f)

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

    /** 0 = gyro-only khi nhiễu từ trường; 1 = tin RV bình thường. */
    var magneticTrust: Float
        get() = headingEstimator.magneticTrust
        set(value) {
            val t = value.coerceIn(0f, 1f)
            headingEstimator.magneticTrust = t
            rotationSmoother.gyroPriorityMode = t < 0.5f
        }

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

    /** Khi nhiễu mag: bám delta Game RV (không mag) — xoay máy không lệch như gyro thô. */
    fun updateGameRotationVector(values: FloatArray) {
        headingEstimator.updateGameRotationVector(values)
        if (magneticTrust < 0.5f) {
            updateOutput(minIntervalNs = 4_000_000L)
        }
    }

    /**
     * Cập nhật từ Gyroscope (Vận tốc góc)
     */
    fun updateGyro(values: FloatArray, timestampNs: Long) {
        headingEstimator.updateGyro(values, timestampNs)
        
        // Tính độ lớn gyro (để biết máy đang xoay nhanh hay chậm)
        lastGyroMagnitude = sqrt(values[0] * values[0] + values[1] * values[1] + values[2] * values[2])
        
        // Khi nhiễu từ trường: đừng throttle chặt — cần bám tay xoay
        updateOutput(minIntervalNs = if (magneticTrust < 0.5f) 4_000_000L else 10_000_000L)
    }

    /** Trọng lực từ accel — yaw gyro khi nhiễu mag không phụ thuộc RV. */
    fun updateGravity(ax: Float, ay: Float, az: Float) {
        headingEstimator.updateGravity(ax, ay, az)
        headingEstimator.seedRelativeHeadingIfNeeded()
    }

    /** G3: WALKING → smoother bám heading nhanh hơn (HEADING_UP ít lệch khi đi). */
    fun setWalking(walking: Boolean) {
        rotationSmoother.isWalking = walking
    }

    private fun updateOutput(minIntervalNs: Long = 10_000_000L) {
        val now = System.nanoTime()
        // Xoay nhanh: xuất heading dày hơn (tránh mũi tên cập nhật thưa → lệch như ảnh)
        val interval = if (lastGyroMagnitude >= 0.45f) {
            minOf(minIntervalNs, 4_000_000L)
        } else {
            minIntervalNs
        }
        if (now - lastOutputTimeNs < interval) {
            return
        }
        lastOutputTimeNs = now

        val rawHeading = headingEstimator.getHeading()
        var smoothHeading = rotationSmoother.getSmoothRotation(rawHeading, lastGyroMagnitude)
        // Đứng yên mà smoother còn lệch raw → ép khớp (la bàn đã đúng, mũi tên không được lệch)
        if (lastGyroMagnitude < 0.18f) {
            var d = (smoothHeading - rawHeading) % 360f
            if (d > 180f) d -= 360f
            if (d < -180f) d += 360f
            if (kotlin.math.abs(d) >= 12f) {
                snapToRawHeading()
                return
            }
        }
        _smoothHeading.value = smoothHeading
    }

    fun reset() {
        headingEstimator.reset()
        // Không ép trust=1 — LocationEngine giữ 0 đến khi mag OK.
        rotationSmoother.reset()
        lastGyroMagnitude = 0f
        lastOutputTimeNs = 0L
        _smoothHeading.value = 0f
    }

    /** Neo heading sau QR/đặt vị trí khi nhiễu — tránh 0° = hướng máy. */
    fun seedHeading(deg: Float) {
        headingEstimator.forceSeedHeading(deg)
        snapToRawHeading()
    }

    val hasSeededHeading: Boolean
        get() = headingEstimator.hasAbsoluteOrSeededHeading

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
