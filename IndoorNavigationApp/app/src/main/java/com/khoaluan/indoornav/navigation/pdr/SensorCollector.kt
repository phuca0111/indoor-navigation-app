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

    /** Từ trường (μT) — dùng phát hiện nhiễu la bàn. */
    var magneticValues = FloatArray(3)
        private set

    var magneticTimestamp = 0L
        private set

    /** SensorManager.SENSOR_STATUS_* của TYPE_MAGNETIC_FIELD. */
    var magneticAccuracy: Int = SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM
        private set

    // ── Callbacks ─────────────────────────────────────────────────────────────
    var onAccelUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onGyroUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onRotationUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    /** GAME_ROTATION_VECTOR — yaw không dùng mag; dùng khi nhiễu từ để xoay không lệch. */
    var onGameRotationUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onLinearAccelUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onStepSensorUpdate: (() -> Unit)? = null
    var onMagneticUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onMagneticAccuracyChanged: ((accuracy: Int) -> Unit)? = null
    var onRotationAccuracyChanged: ((accuracy: Int) -> Unit)? = null

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
        // Đăng ký cả hai khi có: RV (Bắc/mag) + Game RV (xoay khi nhiễu từ, không mag).
        usingGameRotationVector = rotRv == null && gameRv != null
        rotRv?.let { sensorManager.registerListener(this, it, currentDelay) }
        gameRv?.let { sensorManager.registerListener(this, it, currentDelay) }
        // Máy chỉ có Game RV → dùng làm nguồn rotation chính
        if (rotRv == null) {
            usingGameRotationVector = gameRv != null
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)?.let {
            sensorManager.registerListener(this, it, currentDelay)
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST)
        }
        // UI rate đủ cho |B| + accuracy — không cần GAME rate
        sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
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
            Sensor.TYPE_ROTATION_VECTOR -> {
                rotationValues = event.values.clone()
                sensorLogger?.logSensor("rotation_vector", rotationValues, event.timestamp)
                onRotationUpdate?.invoke(rotationValues, event.timestamp)
            }
            Sensor.TYPE_GAME_ROTATION_VECTOR -> {
                val v = event.values.clone()
                sensorLogger?.logSensor("game_rotation_vector", v, event.timestamp)
                if (onGameRotationUpdate != null) {
                    onGameRotationUpdate?.invoke(v, event.timestamp)
                } else if (usingGameRotationVector) {
                    // Fallback: máy không có RV mag → Game RV thay rotation chính
                    rotationValues = v
                    onRotationUpdate?.invoke(v, event.timestamp)
                }
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
            Sensor.TYPE_MAGNETIC_FIELD -> {
                magneticValues = event.values.clone()
                magneticTimestamp = event.timestamp
                sensorLogger?.logSensor("magnetic", magneticValues, event.timestamp)
                onMagneticUpdate?.invoke(magneticValues, event.timestamp)
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        when (sensor?.type) {
            Sensor.TYPE_MAGNETIC_FIELD -> {
                magneticAccuracy = accuracy
                onMagneticAccuracyChanged?.invoke(accuracy)
            }
            Sensor.TYPE_ROTATION_VECTOR, Sensor.TYPE_GAME_ROTATION_VECTOR -> {
                onRotationAccuracyChanged?.invoke(accuracy)
            }
        }
    }
}
