package com.khoaluan.indoornav.navigation.heading

import kotlin.math.sqrt

/**
 * Nhận diện nhiễu từ trường từ accuracy Android + cường độ |B| (μT).
 *
 * Khi nhiễu: tắt tin Rotation Vector (có mag), giữ hướng bằng gyro quanh trục trọng lực.
 * Không snap “canh Bắc = 0°” — tránh lệch lớn khi device heading đã nhiễu.
 * OK ổn định vài giây → trả về la bàn thật.
 */
enum class MagSeverity {
    OK,
    WEAK,
    SEVERE,
}

data class MagGuardState(
    val severity: MagSeverity,
    /** 0 = chỉ gyro; 1 = tin RV bình thường. */
    val magneticTrust: Float,
    val messageVi: String?,
    val fieldUt: Float? = null,
    val accuracy: Int = MagneticInterferenceGuard.ACCURACY_MEDIUM,
)

class MagneticInterferenceGuard {

    private var lastAccuracy: Int = ACCURACY_MEDIUM
    private var lastFieldUt: Float? = null
    private var severity: MagSeverity = MagSeverity.OK
    private var goodSinceMs: Long = 0L
    private var hasGoodAnchor: Boolean = false
    /** Chưa có |B| → chưa được coi là OK (tránh tin RV trước khi biết từ trường). */
    private var hasFieldSample: Boolean = false

    fun reset() {
        lastAccuracy = ACCURACY_MEDIUM
        lastFieldUt = null
        severity = MagSeverity.OK
        goodSinceMs = 0L
        hasGoodAnchor = false
        hasFieldSample = false
    }

    fun onAccuracy(accuracy: Int, nowMs: Long): MagGuardState {
        lastAccuracy = accuracy
        return evaluate(nowMs)
    }

    fun onFieldSample(bx: Float, by: Float, bz: Float, nowMs: Long): MagGuardState {
        lastFieldUt = sqrt(bx * bx + by * by + bz * bz)
        hasFieldSample = true
        return evaluate(nowMs)
    }

    private fun evaluate(nowMs: Long): MagGuardState {
        // Chưa đo được |B|: giả định nhiễu nhẹ — trust=0, không init la bàn tuyệt đối.
        if (!hasFieldSample) {
            return MagGuardState(
                severity = MagSeverity.WEAK,
                magneticTrust = 0f,
                messageVi = null,
                fieldUt = null,
                accuracy = lastAccuracy,
            )
        }

        val field = lastFieldUt
        val raw = classifyRaw(lastAccuracy, field)

        if (raw == MagSeverity.OK) {
            if (!hasGoodAnchor) {
                goodSinceMs = nowMs
                hasGoodAnchor = true
            }
            val stable = nowMs - goodSinceMs >= RECOVER_STABLE_MS
            if (severity != MagSeverity.OK && !stable) {
                return toState(severity, field, lastAccuracy)
            }
            severity = MagSeverity.OK
        } else {
            hasGoodAnchor = false
            goodSinceMs = 0L
            severity = when {
                raw == MagSeverity.SEVERE || severity == MagSeverity.SEVERE -> MagSeverity.SEVERE
                else -> MagSeverity.WEAK
            }
        }
        return toState(severity, field, lastAccuracy)
    }

    private fun classifyRaw(accuracy: Int, fieldUt: Float?): MagSeverity {
        if (accuracy <= ACCURACY_UNRELIABLE) return MagSeverity.SEVERE
        val fieldSevere = fieldUt != null && (fieldUt < FIELD_SEVERE_MIN || fieldUt > FIELD_SEVERE_MAX)
        if (fieldSevere) return MagSeverity.SEVERE
        if (accuracy == ACCURACY_LOW) return MagSeverity.WEAK
        val fieldWeak = fieldUt != null && (fieldUt < FIELD_WEAK_MIN || fieldUt > FIELD_WEAK_MAX)
        if (fieldWeak) return MagSeverity.WEAK
        return MagSeverity.OK
    }

    private fun toState(sev: MagSeverity, field: Float?, accuracy: Int): MagGuardState = when (sev) {
        MagSeverity.OK -> MagGuardState(
            severity = MagSeverity.OK,
            magneticTrust = 1f,
            messageVi = null,
            fieldUt = field,
            accuracy = accuracy,
        )
        MagSeverity.WEAK -> MagGuardState(
            severity = MagSeverity.WEAK,
            // Vẫn tin RV một phần để khóa Bắc — chỉ SEVERE mới tin 0 (Game RV tương đối).
            magneticTrust = WEAK_MAG_TRUST,
            messageVi = "Từ trường nhiễu nhẹ — vẫn căn Bắc (giảm tin la bàn)",
            fieldUt = field,
            accuracy = accuracy,
        )
        MagSeverity.SEVERE -> MagGuardState(
            severity = MagSeverity.SEVERE,
            magneticTrust = 0f,
            messageVi = "Từ trường nhiễu mạnh — tạm giữ hướng; tránh loa/kim loại",
            fieldUt = field,
            accuracy = accuracy,
        )
    }

    companion object {
        const val ACCURACY_UNRELIABLE = 0
        const val ACCURACY_LOW = 1
        const val ACCURACY_MEDIUM = 2
        const val ACCURACY_HIGH = 3

        /** Trust khi WEAK: >0.5 → RV còn blend Bắc, Game RV không cộng delta tương đối. */
        const val WEAK_MAG_TRUST = 0.7f

        // Nới dải “bình thường” — trong nhà |B| hay ~25–80 μT
        const val FIELD_WEAK_MIN = 18f
        const val FIELD_WEAK_MAX = 85f
        const val FIELD_SEVERE_MIN = 12f
        const val FIELD_SEVERE_MAX = 120f

        const val RECOVER_STABLE_MS = 1_200L
    }
}
