package com.khoaluan.indoornav.navigation.pdr

import com.khoaluan.indoornav.navigation.NavigationLogger
import kotlin.math.*

/**
 * FILE: StepDetector.kt
 * MỤC ĐÍCH: Phát hiện bước chân và ước lượng chiều dài bước
 *
 * THUẬT TOÁN:
 *   - Peak Detection với Hysteresis: đếm bước khi gia tốc vượt ngưỡng trên
 *     rồi rơi xuống ngưỡng dưới (tránh đếm nhầm do rung)
 *   - Weinberg Model: L = K × ⁴√(Amax - Amin)
 *     Amax, Amin: giá trị cực đại/cực tiểu của magnitude trong 1 bước chân
 *     K (~0.46): hằng số hiệu chuẩn, điều chỉnh sau PDR Calibration Test
 *
 * HIỆU CHUẨN:
 *   1. Đi đúng 10 bước → Steps = 10? → chỉnh threshold
 *   2. Đi hết 10m → Dist = 9.5-10.5m? → chỉnh K
 */
class StepDetector(
    threshold: Float = 1.2f,               // Giảm xuống 1.2 → peakThreshold=11.01, dễ detect hơn với LPF mới
    private var minIntervalMs: Long = 450L,
    private var kWeinberg: Float = 0.42f    // Hằng số Weinberg (điều chỉnh cho step length ~0.5m người Việt)
) {
    /** Callback khi phát hiện 1 bước. stepLength đơn vị: mét */
    var onStepDetected: ((stepLength: Float) -> Unit)? = null

    // Ngưỡng phát hiện (hysteresis để tránh đếm nhầm)
    private var peakThreshold = GRAVITY + threshold
    private var valleyThreshold = GRAVITY - HYSTERESIS

    // Trạng thái bộ lọc
    private var isAboveThreshold = false
    private var lastStepMs = 0L

    // Low-pass filter State
    private var filteredMag = GRAVITY

    // Cửa sổ Weinberg (theo dõi Amax/Amin trong 1 bước)
    private var windowMax = -Float.MAX_VALUE
    private var windowMin = Float.MAX_VALUE

    // Thống kê nhanh
    var stepCount = 0
        private set
    var totalDistanceM = 0f
        private set

    var hasHardwareSensorTriggered = false

    /**
     * Gọi mỗi khi có dữ liệu Accelerometer mới
     * @param x, y, z gia tốc theo 3 trục (m/s²)
     */
    fun onAccelData(x: Float, y: Float, z: Float) {
        val rawMag = sqrt(x * x + y * y + z * z)

        // 1. Áp dụng Low-Pass Filter — alpha=0.7 để phản ứng kịp peak bước chân (~2Hz)
        // alpha=0.9 quá nặng: tại 50Hz filteredMag không kịp vượt peakThreshold khi đi bộ
        val alpha = 0.7f
        filteredMag = alpha * filteredMag + (1f - alpha) * rawMag
        val magnitude = filteredMag

        // 2. Cập nhật cửa sổ Weinberg
        windowMax = maxOf(windowMax, magnitude)
        windowMin = minOf(windowMin, magnitude)

        val now = System.currentTimeMillis()

        // Nếu cảm biến Hardware đã đếm bước, ta có thể bỏ qua Peak Detection thủ công
        // Nhưng ta vẫn cập nhật cửa sổ Weinberg ở trên để đo chiều dài

        // ── Rising edge: magnitude vượt ngưỡng trên ──
        if (!isAboveThreshold && magnitude > peakThreshold && !hasHardwareSensorTriggered) {
            isAboveThreshold = true
        }

        // ── Falling edge: magnitude xuống dưới ngưỡng dưới ──
        if (isAboveThreshold && magnitude < valleyThreshold) {
            isAboveThreshold = false

            // Kiểm tra khoảng cách thời gian tối thiểu giữa 2 bước
            if (now - lastStepMs >= minIntervalMs) {
                lastStepMs = now

                val stepLen = computeWeinberg()
                totalDistanceM += stepLen
                stepCount++

                // Ghi log chi tiết
                NavigationLogger.logStepDetails(windowMax, windowMin, peakThreshold, kWeinberg, stepLen)

                // Reset cửa sổ
                resetWindow(magnitude)

                onStepDetected?.invoke(stepLen)
            }
        }
    }

    /**
     * Gọi khi Cảm biến phần cứng (TYPE_STEP_DETECTOR) phát hiện có bước đi thực.
     * Độ tin cậy 100%, không bị lừa dù cầm máy đứng yên trôi đi.
     */
    fun onHardwareStep() {
        hasHardwareSensorTriggered = true // Chuyển sang ưu tiên phần cứng
        val now = System.currentTimeMillis()
        if (now - lastStepMs >= minIntervalMs) {
            lastStepMs = now
            
            // Vẫn dùng biên độ nảy của gia tốc nền hiện tại để tính sải chân (rất hay)
            val stepLen = computeWeinberg()
            totalDistanceM += stepLen
            stepCount++

            NavigationLogger.logStepDetails(windowMax, windowMin, peakThreshold, kWeinberg, stepLen)
            
            // Khởi tạo lại window cho bước tiếp theo
            resetWindow(filteredMag)
            onStepDetected?.invoke(stepLen)
        }
    }

    /** Tính chiều dài bước theo Weinberg: L = K × ⁴√(Amax - Amin) */
    private fun computeWeinberg(): Float {
        val delta = (windowMax - windowMin).coerceAtLeast(0.01f)
        return kWeinberg * delta.toDouble().pow(0.25).toFloat()
    }

    private fun resetWindow(currentMag: Float) {
        windowMax = currentMag
        windowMin = currentMag
    }

    // ── API Hiệu chuẩn (Calibration) ──────────────────────────────────────────

    /** Điều chỉnh ngưỡng phát hiện bước (dùng khi đứng yên vẫn đếm → tăng lên) */
    fun setThreshold(t: Float) {
        peakThreshold = GRAVITY + t
        valleyThreshold = GRAVITY - HYSTERESIS
    }

    /** Điều chỉnh hằng số Weinberg K (dùng khi 10m báo 8m → tăng K) */
    fun setK(k: Float) { kWeinberg = k }

    /** Điều chỉnh khoảng thời gian tối thiểu giữa 2 bước (ms) */
    fun setMinInterval(ms: Long) { minIntervalMs = ms }

    fun reset() {
        stepCount = 0
        totalDistanceM = 0f
        isAboveThreshold = false
        lastStepMs = 0L
        filteredMag = GRAVITY
        resetWindow(GRAVITY)
    }

    companion object {
        private const val GRAVITY = 9.81f
        private const val HYSTERESIS = 1.0f  // Vùng chết giữa peak và valley
    }
}
