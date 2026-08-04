package com.khoaluan.indoornav.navigation.pdr

import com.khoaluan.indoornav.navigation.NavigationLogger
import kotlin.math.*

/**
 * Phát hiện bước + ước lượng sải chân ổn định cho indoor hẹp.
 *
 * Không dùng Weinberg thô từng bước (dễ lúc ngắn lúc dài theo cách cầm máy).
 * Công thức: blend(Weinberg làm mượt, cadence) quanh sải chân danh định **0.25 m** (đi bộ thường).
 * Đi chậm / nhanh / chạy → cadence kéo ngắn hoặc dài hơn trong [MIN, MAX].
 */
class StepDetector(
    threshold: Float = 1.2f,
    /** G3c: software peak chậm hơn hardware — túi quần / tư thế lạ bớt đếm ảo */
    private var minIntervalMs: Long = 500L,
    private var kWeinberg: Float = 0.30f,
) {
    var onStepDetected: ((stepLength: Float) -> Unit)? = null

    private var peakThreshold = GRAVITY + threshold
    private var valleyThreshold = GRAVITY - HYSTERESIS

    private var isAboveThreshold = false
    private var lastStepMs = 0L
    private var filteredMag = GRAVITY

    private var windowMax = -Float.MAX_VALUE
    private var windowMin = Float.MAX_VALUE

    /** Sải chân đã EMA — tránh nhảy đột ngột giữa các bước. */
    private var smoothedStepM = NOMINAL_STEP_M

    var stepCount = 0
        private set
    var totalDistanceM = 0f
        private set

    var hasHardwareSensorTriggered = false

    fun onAccelData(x: Float, y: Float, z: Float) {
        val rawMag = sqrt(x * x + y * y + z * z)
        val alpha = 0.7f
        filteredMag = alpha * filteredMag + (1f - alpha) * rawMag
        val magnitude = filteredMag

        windowMax = maxOf(windowMax, magnitude)
        windowMin = minOf(windowMin, magnitude)

        val now = System.currentTimeMillis()

        if (!isAboveThreshold && magnitude > peakThreshold && !hasHardwareSensorTriggered) {
            isAboveThreshold = true
        }

        if (isAboveThreshold && magnitude < valleyThreshold) {
            isAboveThreshold = false
            if (now - lastStepMs >= minIntervalMs) {
                emitStep(now, magnitude)
            }
        }
    }

    fun onHardwareStep() {
        hasHardwareSensorTriggered = true
        val now = System.currentTimeMillis()
        if (now - lastStepMs >= minIntervalMs) {
            emitStep(now, filteredMag)
        }
    }

    private fun emitStep(now: Long, resetMag: Float) {
        val intervalMs = if (lastStepMs > 0L) (now - lastStepMs) else 550L
        lastStepMs = now

        val stepLen = estimateStableStepLength(intervalMs)
        totalDistanceM += stepLen
        stepCount++

        NavigationLogger.logStepDetails(windowMax, windowMin, peakThreshold, kWeinberg, stepLen)
        resetWindow(resetMag)
        onStepDetected?.invoke(stepLen)
    }

    /**
     * 1) Weinberg từ biên độ (nhạy cách cầm máy) → clamp theo MIN/MAX
     * 2) Cadence từ khoảng cách 2 bước:
     *    chậm (~700ms+) → ~0.20 m, thường (~550ms) → 0.25 m,
     *    nhanh (~400ms) → ~0.32 m, chạy (~330ms) → ~0.38–0.42 m
     * 3) EMA với sải chân trước → không đổi đột ngột
     */
    private fun estimateStableStepLength(intervalMs: Long): Float {
        val delta = (windowMax - windowMin).coerceAtLeast(0.01f)
        val weinberg = (kWeinberg * delta.toDouble().pow(0.25).toFloat())
            .coerceIn(MIN_STEP_M, MAX_STEP_M)

        // Cho phép interval ngắn hơn khi chạy (hardware có thể ~320–380ms)
        val interval = intervalMs.toFloat().coerceIn(300f, 900f)
        val cadenceBand = when {
            interval >= 700f -> SLOW_STEP_M
            interval >= 500f -> NOMINAL_STEP_M
            interval >= 400f -> FAST_WALK_STEP_M
            else -> RUN_STEP_M
        }
        // Fine-tune liên tục quanh band (nhịp nhanh hơn → dài hơn một chút)
        val continuous = (NOMINAL_STEP_M + (550f - interval) / 400f * 0.14f)
            .coerceIn(MIN_STEP_M, MAX_STEP_M)
        val cadenceStep = cadenceBand * 0.65f + continuous * 0.35f

        val blended = weinberg * 0.30f + cadenceStep * 0.45f + NOMINAL_STEP_M * 0.25f
        smoothedStepM = SMOOTH_ALPHA * smoothedStepM + (1f - SMOOTH_ALPHA) * blended
        return smoothedStepM.coerceIn(MIN_STEP_M, MAX_STEP_M)
    }

    private fun resetWindow(currentMag: Float) {
        windowMax = currentMag
        windowMin = currentMag
    }

    fun setThreshold(t: Float) {
        peakThreshold = GRAVITY + t
        valleyThreshold = GRAVITY - HYSTERESIS
    }

    fun setK(k: Float) {
        kWeinberg = k
    }

    fun setMinInterval(ms: Long) {
        minIntervalMs = ms
    }

    fun reset() {
        stepCount = 0
        totalDistanceM = 0f
        isAboveThreshold = false
        lastStepMs = 0L
        filteredMag = GRAVITY
        smoothedStepM = NOMINAL_STEP_M
        resetWindow(GRAVITY)
    }

    companion object {
        private const val GRAVITY = 9.81f
        private const val HYSTERESIS = 1.0f
        /** Đi bộ bình thường. */
        private const val NOMINAL_STEP_M = 0.25f
        private const val SLOW_STEP_M = 0.20f
        private const val FAST_WALK_STEP_M = 0.32f
        private const val RUN_STEP_M = 0.40f
        private const val MIN_STEP_M = 0.18f
        private const val MAX_STEP_M = 0.42f
        private const val SMOOTH_ALPHA = 0.72f
    }
}
