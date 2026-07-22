package com.khoaluan.indoornav.navigation.pdr

import android.hardware.SensorManager
import android.view.Surface
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Hướng = **trục giữa máy** (đường giữa thân từ đít → đầu / mép trên UI).
 * Không phải điểm giữa mặt kính; không dùng camera / lỗ loa.
 *
 * Cách tính: lấy trục “đầu máy” sau remap, chiếu xuống mặt phẳng ngang → azimuth.
 * (Ổn định hơn getOrientation khi máy hơi nghiêng sau quét QR.)
 */
class HeadingEstimator(
    private val alpha: Float = 0.98f,
    var invertAzimuth180: Boolean = false,
    var displayRotation: Int = Surface.ROTATION_0,
) {

    private var heading = 0f
    private var lastGyroTimestampNs = 0L
    private var isInitialized = false

    var lastPitchDeg: Float = 0f
        private set

    /** Máy đủ nằm để trục giữa nằm gần mặt phẳng đi bộ. */
    val isHeadAxisUsableForWalk: Boolean
        get() = abs(lastPitchDeg) <= 35f

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

        val probe = FloatArray(3)
        SensorManager.getOrientation(rotationMatrix, probe)
        lastPitchDeg = Math.toDegrees(probe[1].toDouble()).toFloat()

        val worldMatrix = FloatArray(9)
        remapHeadForward(rotationMatrix, displayRotation, worldMatrix)

        // Trục giữa máy (đầu) trong world sau remap = cột Y → (R[1], R[4], R[7])
        // Chiếu xuống mặt ngang (bỏ Z) → hướng đi thật của tâm máy.
        var currentAzimuth = centerlineAzimuthDeg(worldMatrix)
        if (invertAzimuth180) {
            currentAzimuth = normalize(currentAzimuth + 180f)
        }

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
        lastPitchDeg = 0f
    }

    private fun normalize(angle: Float): Float {
        var r = angle.mod(360f)
        if (r > 180f) r -= 360f
        return r
    }

    private fun shortestAngleDelta(from: Float, to: Float): Float {
        var delta = (to - from).mod(360f)
        if (delta > 180f) delta -= 360f
        return delta
    }

    companion object {
        /**
         * Azimuth (độ) của trục giữa máy chiếu xuống mặt ngang.
         * Cùng quy ước getOrientation: atan2(R[1], R[4]).
         */
        fun centerlineAzimuthDeg(remappedR: FloatArray): Float {
            val east = remappedR[1]
            val north = remappedR[4]
            val horiz = sqrt(east * east + north * north)
            if (horiz < 1e-3f) {
                // Máy gần thẳng đứng — fallback orientation
                val o = FloatArray(3)
                SensorManager.getOrientation(remappedR, o)
                return Math.toDegrees(o[0].toDouble()).toFloat()
            }
            return Math.toDegrees(atan2(east.toDouble(), north.toDouble())).toFloat()
        }

        /** Trung bình góc trên đường tròn (tránh lệch khi lấy mẫu sau QR). */
        fun circularMeanDeg(anglesDeg: List<Float>): Float {
            if (anglesDeg.isEmpty()) return 0f
            var sx = 0.0
            var sy = 0.0
            for (a in anglesDeg) {
                val r = Math.toRadians(a.toDouble())
                sx += cos(r)
                sy += sin(r)
            }
            return Math.toDegrees(atan2(sy, sx)).toFloat()
        }

        fun remapHeadForward(
            inR: FloatArray,
            displayRotation: Int,
            outR: FloatArray
        ) {
            val (xAxis, yAxis) = when (displayRotation) {
                Surface.ROTATION_90 ->
                    SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
                Surface.ROTATION_270 ->
                    SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
                Surface.ROTATION_180 ->
                    SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
                else ->
                    // Trục giữa máy = Y (mép trên) — không phải camera
                    SensorManager.AXIS_X to SensorManager.AXIS_Y
            }
            val ok = SensorManager.remapCoordinateSystem(inR, xAxis, yAxis, outR)
            if (!ok) {
                System.arraycopy(inR, 0, outR, 0, 9)
            }
        }
    }
}
