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
 *
 * Khi [magneticTrust] ≈ 0 (nhiễu từ trường):
 * - Không blend azimuth từ Rotation Vector (có mag).
 * - Không cập nhật ma trận world từ RV (tránh nhiễm mag vào chiếu gyro).
 * - Tích phân yaw quanh **trục trọng lực** (accel) — độc lập từ trường.
 */
class HeadingEstimator(
    private val alpha: Float = 0.98f,
    var invertAzimuth180: Boolean = false,
    var displayRotation: Int = Surface.ROTATION_0,
) {

    private var heading = 0f
    private var lastGyroTimestampNs = 0L
    private var isInitialized = false
    private val lastWorldMatrix = FloatArray(9)
    private var hasWorldMatrix = false

    /** Trọng lực đơn vị trong frame thiết bị (lọc low-pass từ accel). */
    private var gravX = 0f
    private var gravY = 0f
    private var gravZ = 1f
    private var hasGravity = false

    var lastPitchDeg: Float = 0f
        private set

    /**
     * Tin Rotation Vector (có từ trường): 0 = chỉ gyro/Game RV; 1 = blend RV bình thường.
     */
    var magneticTrust: Float = 1f

    /** Đã nhận delta từ Game RV gần đây → bỏ qua tích phân gyro (tránh cộng đôi → xoay lệch). */
    private var gameRvDeltaActive: Boolean = false
    private var lastGameAzimuthDeg: Float? = null

    val isHeadAxisUsableForWalk: Boolean
        get() = abs(lastPitchDeg) <= 35f

    /** Cập nhật ước lượng trọng lực từ accelerometer (m/s²). */
    fun updateGravity(ax: Float, ay: Float, az: Float) {
        val n = sqrt(ax * ax + ay * ay + az * az)
        if (n < 5f || n > 15f) return
        val ux = ax / n
        val uy = ay / n
        val uz = az / n
        if (!hasGravity) {
            gravX = ux
            gravY = uy
            gravZ = uz
            hasGravity = true
        } else {
            val a = 0.92f
            gravX = a * gravX + (1f - a) * ux
            gravY = a * gravY + (1f - a) * uy
            gravZ = a * gravZ + (1f - a) * uz
            val gn = sqrt(gravX * gravX + gravY * gravY + gravZ * gravZ)
            if (gn > 1e-3f) {
                gravX /= gn
                gravY /= gn
                gravZ /= gn
            }
        }
    }

    fun updateGyro(gyroValues: FloatArray, timestampNs: Long) {
        if (!isInitialized || lastGyroTimestampNs == 0L) {
            lastGyroTimestampNs = timestampNs
            return
        }
        val dt = ((timestampNs - lastGyroTimestampNs) / 1_000_000_000f).coerceIn(0f, 0.05f)
        lastGyroTimestampNs = timestampNs
        if (dt <= 0f) return

        val gx = gyroValues[0]
        val gy = gyroValues[1]
        val gz = gyroValues[2]
        val trust = magneticTrust.coerceIn(0f, 1f)
        // Đang bám Game RV khi nhiễu → không cộng thêm gyro (dễ lệch tốc độ/dấu).
        if (trust < 0.5f && gameRvDeltaActive) {
            lastGyroTimestampNs = timestampNs
            return
        }

        // Khi nhiễu: chỉ dùng trục trọng lực (không mag). Khi ổn: ưu tiên world matrix từ RV.
        val yawRateRad = when {
            trust < 0.5f && hasGravity ->
                gx * gravX + gy * gravY + gz * gravZ
            trust >= 0.5f && hasWorldMatrix ->
                lastWorldMatrix[6] * gx + lastWorldMatrix[7] * gy + lastWorldMatrix[8] * gz
            hasGravity ->
                gx * gravX + gy * gravY + gz * gravZ
            else ->
                gz
        }
        val deltaHeading = -(Math.toDegrees((yawRateRad * dt).toDouble()).toFloat())
        heading = normalize(heading + deltaHeading)
    }

    /**
     * GAME_ROTATION_VECTOR — không dùng mag.
     * Khi nhiễu: chỉ áp **delta** yaw giữa các mẫu → xoay máy mượt, không kéo về Bắc bẩn.
     */
    fun updateGameRotationVector(values: FloatArray) {
        val rotationMatrix = FloatArray(9)
        SensorManager.getRotationMatrixFromVector(rotationMatrix, values)
        val probe = FloatArray(3)
        SensorManager.getOrientation(rotationMatrix, probe)
        lastPitchDeg = Math.toDegrees(probe[1].toDouble()).toFloat()

        val worldMatrix = FloatArray(9)
        remapHeadForward(rotationMatrix, displayRotation, worldMatrix)
        var az = centerlineAzimuthDeg(worldMatrix)
        if (invertAzimuth180) az = normalize(az + 180f)

        val trust = magneticTrust.coerceIn(0f, 1f)
        val prev = lastGameAzimuthDeg
        lastGameAzimuthDeg = az

        if (trust >= 0.5f) {
            // Mag OK: Game RV chỉ để giữ mốc delta; absolute do RV mag.
            gameRvDeltaActive = false
            return
        }

        // Nhiễu: khởi tạo từ azimuth Game RV (không mag) — không dùng 0° = hướng máy.
        if (!isInitialized) {
            heading = normalize(az)
            isInitialized = true
            gameRvDeltaActive = true
            return
        }
        if (prev == null) return

        val delta = shortestAngleDelta(prev, az)
        // Bỏ mẫu nhảy ảo (đổi sensor / discontinuity)
        if (abs(delta) > 45f) return
        heading = normalize(heading + delta)
        gameRvDeltaActive = true
    }

    fun updateRotationVector(values: FloatArray, gyroMagnitude: Float) {
        val rotationMatrix = FloatArray(9)
        SensorManager.getRotationMatrixFromVector(rotationMatrix, values)

        val probe = FloatArray(3)
        SensorManager.getOrientation(rotationMatrix, probe)
        lastPitchDeg = Math.toDegrees(probe[1].toDouble()).toFloat()

        val worldMatrix = FloatArray(9)
        remapHeadForward(rotationMatrix, displayRotation, worldMatrix)

        val trust = magneticTrust.coerceIn(0f, 1f)
        // Chỉ cập nhật ma trận chiếu khi còn tin RV — tránh mag nhiễu làm sai yaw gyro
        if (trust >= 0.5f) {
            System.arraycopy(worldMatrix, 0, lastWorldMatrix, 0, 9)
            hasWorldMatrix = true
        }

        var currentAzimuth = centerlineAzimuthDeg(worldMatrix)
        if (invertAzimuth180) {
            currentAzimuth = normalize(currentAzimuth + 180f)
        }

        if (!isInitialized) {
            // Nhiễu SEVERE (trust≈0): không init từ RV mag bẩn.
            // WEAK/OK (trust≥0.5): khóa azimuth tuyệt đối → căn Bắc.
            if (trust < 0.5f) return
            heading = normalize(currentAzimuth)
            isInitialized = true
            System.arraycopy(worldMatrix, 0, lastWorldMatrix, 0, 9)
            hasWorldMatrix = true
            gameRvDeltaActive = false
        } else {
            if (trust < 0.5f) return
            // Mới lấy lại tin mag / vừa thoát Game RV: snap Bắc ngay
            if (!hasWorldMatrix || gameRvDeltaActive) {
                heading = normalize(currentAzimuth)
                System.arraycopy(worldMatrix, 0, lastWorldMatrix, 0, 9)
                hasWorldMatrix = true
                gameRvDeltaActive = false
                return
            }
            val correction = shortestAngleDelta(heading, currentAzimuth)
            val err = abs(correction)
            val still = gyroMagnitude < 0.18f
            val fastSpin = gyroMagnitude >= 0.45f

            when {
                still && err >= 12f -> {
                    heading = normalize(currentAzimuth)
                }
                still -> {
                    heading = normalize(heading + 0.40f * trust * correction)
                }
                // Xoay nhanh: ưu tiên gyro đã tích phân, ít kéo RV (RV trễ → kéo ngược = lệch)
                fastSpin -> {
                    heading = normalize(heading + 0.04f * trust * correction)
                }
                err >= 35f -> {
                    heading = normalize(heading + 0.22f * trust * correction)
                }
                else -> {
                    heading = normalize(heading + (1f - alpha) * trust * correction)
                }
            }
        }
    }

    /**
     * Khi nhiễu mag mà chưa có azimuth tuyệt đối: cho phép tích phân gyro quanh trọng lực.
     * Không gán heading=0° — nếu gán, hướng máy lúc QR trở thành Bắc map (bug loglaban).
     * Chờ [forceSeedHeading] hoặc mẫu Game RV tuyệt đối.
     */
    fun seedRelativeHeadingIfNeeded() {
        // Cố ý không init ở đây.
    }

    /** Neo heading tuyệt đối (map/device frame) — dùng sau QR khi nhiễu, theo hành lang / last-good. */
    fun forceSeedHeading(deg: Float) {
        heading = normalize(deg)
        isInitialized = true
        gameRvDeltaActive = false
        lastGameAzimuthDeg = null
        lastGyroTimestampNs = 0L
    }

    fun getHeading(): Float = heading

    val hasAbsoluteOrSeededHeading: Boolean get() = isInitialized

    fun reset() {
        isInitialized = false
        heading = 0f
        lastGyroTimestampNs = 0L
        lastPitchDeg = 0f
        hasWorldMatrix = false
        hasGravity = false
        gravX = 0f
        gravY = 0f
        gravZ = 1f
        gameRvDeltaActive = false
        lastGameAzimuthDeg = null
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
        fun centerlineAzimuthDeg(remappedR: FloatArray): Float {
            val east = remappedR[1]
            val north = remappedR[4]
            val horiz = sqrt(east * east + north * north)
            if (horiz < 1e-3f) {
                val o = FloatArray(3)
                SensorManager.getOrientation(remappedR, o)
                return Math.toDegrees(o[0].toDouble()).toFloat()
            }
            return Math.toDegrees(atan2(east.toDouble(), north.toDouble())).toFloat()
        }

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
                    SensorManager.AXIS_X to SensorManager.AXIS_Y
            }
            val ok = SensorManager.remapCoordinateSystem(inR, xAxis, yAxis, outR)
            if (!ok) {
                System.arraycopy(inR, 0, outR, 0, 9)
            }
        }
    }
}
