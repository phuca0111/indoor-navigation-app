package com.khoaluan.indoornav.navigation.pdr

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

/**
 * FILE: SensorCollector.kt
 * MỤC ĐÍCH: Đăng ký và thu thập dữ liệu từ 3 cảm biến cốt lõi:
 *   - Accelerometer (gia tốc kế)  → phát hiện bước chân
 *   - Gyroscope (con quay hồi chuyển) → tính hướng quay
 *   - Magnetometer (la bàn từ trường) → hướng Bắc tuyệt đối
 * TẦN SUẤT: SENSOR_DELAY_GAME (~50Hz) — đủ nhanh, không tốn pin quá
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

    // ── Callbacks ─────────────────────────────────────────────────────────────
    var onAccelUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onGyroUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onRotationUpdate: ((values: FloatArray, timestampNs: Long) -> Unit)? = null
    var onStepSensorUpdate: (() -> Unit)? = null

    // ── Trạng thái ─────────────────────────────────────────────────────────────
    var isRunning = false
        private set

    /** Bắt đầu lắng nghe cảm biến */
    fun start() {
        if (isRunning) return
        val delay = SensorManager.SENSOR_DELAY_GAME

        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let {
            sensorManager.registerListener(this, it, delay)
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)?.let {
            sensorManager.registerListener(this, it, delay)
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)?.let {
            sensorManager.registerListener(this, it, delay)
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_FASTEST)
        }
        isRunning = true
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
                onAccelUpdate?.invoke(accelValues, event.timestamp)
            }
            Sensor.TYPE_GYROSCOPE -> {
                gyroValues = event.values.clone()
                gyroTimestamp = event.timestamp
                onGyroUpdate?.invoke(gyroValues, event.timestamp)
            }
            Sensor.TYPE_ROTATION_VECTOR -> {
                rotationValues = event.values.clone()
                onRotationUpdate?.invoke(rotationValues, event.timestamp)
            }
            Sensor.TYPE_STEP_DETECTOR -> {
                onStepSensorUpdate?.invoke()
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Không cần xử lý cho PDR
    }
}
