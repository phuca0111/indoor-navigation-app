package com.khoaluan.indoornav.navigation.pdr

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.khoaluan.indoornav.navigation.diagnostics.SensorSessionLogger

/**
 * FILE: SensorCollector.kt
 * MỤC ĐÍCH: Đăng ký và thu thập dữ liệu cảm biến thô (KHÔNG xử lý thuật toán).
 * Phase 0.0: có thể gắn [sensorLogger] để ghi JSONL.
 */
class SensorCollector(context: Context) : SensorEventListener {

    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as SensorManager

    // ── Dữ liệu cảm biến thô (chỉ đọc từ bên ngoài) ─────────────────────────
    var accelValues = FloatArray(3)
        private set

    var gyroValues = FloatArray(3)
        private set

    var rotationValues = FloatArray(4)
        private set

    // Timestamps (nanoseconds) — dùng để tính dt cho Gyro integration
    var accelTimestamp = 0L
        private set

    var gyroTimestamp = 0L
        private set

    var linearAccelValues = FloatArray(3)
        private set

    var linearAccelTimestamp = 0L
        private set

    // ── Callbacks ─────────────────────────────────────────────────────────────
    var onAccelUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onGyroUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onRotationUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onLinearAccelUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onStepSensorUpdate: (() -> Unit)? = null

    /** Phase 0.0 — optional JSONL logger (null = không ghi). */
    var sensorLogger: SensorSessionLogger? = null

    // ── Trạng thái ─────────────────────────────────────────────────────────────
    var isRunning = false
        private set

    private var currentDelay = SensorManager.SENSOR_DELAY_GAME

    /** Bắt đầu lắng nghe cảm biến */
    fun start() {
        if (isRunning) return
        currentDelay = SensorManager.SENSOR_DELAY_GAME
        registerSensors()
        isRunning = true
    }

    /** true nếu đang dùng GAME_ROTATION_VECTOR (yaw không bám Bắc địa lý). */
    var usingGameRotationVector: Boolean = false
        private set

    private fun registerSensors() {
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let {
            sensorManager.registerListener(this, it, currentDelay)
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)?.let {
            sensorManager.registerListener(this, it, currentDelay)
        }
        val gameRv = sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
        val rotRv = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        // Compass-assist: ưu tiên ROTATION_VECTOR (có tham chiếu từ trường/Bắc),
        // chỉ fallback GAME_ROTATION_VECTOR khi máy không hỗ trợ.
        val rotationSensor = rotRv ?: gameRv
        usingGameRotationVector = (rotationSensor?.type == Sensor.TYPE_GAME_ROTATION_VECTOR)
        rotationSensor?.let {
            sensorManager.registerListener(this, it, currentDelay)
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)?.let {
            sensorManager.registerListener(this, it, currentDelay)
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST)
        }
    }

    /** Điều chỉnh tần số lấy mẫu tự động (Dynamic Sensor Rate) */
    fun setDynamicRate(isMoving: Boolean) {
        val newDelay = if (isMoving) SensorManager.SENSOR_DELAY_GAME else SensorManager.SENSOR_DELAY_UI
        if (newDelay != currentDelay && isRunning) {
            currentDelay = newDelay
            registerSensors() // Android tự động thay thế (replace) đăng ký cũ với delay mới
        }
    }

    /** Ngừng lắng nghe — gọi khi rời khỏi màn hình để tiết kiệm pin */
    fun stop() {
        sensorManager.unregisterListener(this)
        isRunning = false
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                accelValues = event.values.clone()
                accelTimestamp = event.timestamp
                sensorLogger?.logSensor("accel", accelValues, event.timestamp)
                onAccelUpdate?.invoke(accelValues, event.timestamp)
            }
            Sensor.TYPE_GYROSCOPE -> {
                gyroValues = event.values.clone()
                gyroTimestamp = event.timestamp
                sensorLogger?.logSensor("gyro", gyroValues, event.timestamp)
                onGyroUpdate?.invoke(gyroValues, event.timestamp)
            }
            Sensor.TYPE_ROTATION_VECTOR, Sensor.TYPE_GAME_ROTATION_VECTOR -> {
                rotationValues = event.values.clone()
                sensorLogger?.logSensor("rotation_vector", rotationValues, event.timestamp)
                onRotationUpdate?.invoke(rotationValues, event.timestamp)
            }
            Sensor.TYPE_LINEAR_ACCELERATION -> {
                linearAccelValues = event.values.clone()
                linearAccelTimestamp = event.timestamp
                sensorLogger?.logSensor("linear_accel", linearAccelValues, event.timestamp)
                onLinearAccelUpdate?.invoke(linearAccelValues, event.timestamp)
            }
            Sensor.TYPE_STEP_DETECTOR -> {
                sensorLogger?.logSensor(
                    "step_detector",
                    floatArrayOf(1f),
                    event.timestamp,
                    force = true
                )
                onStepSensorUpdate?.invoke()
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Không cần xử lý cho PDR
    }
}
