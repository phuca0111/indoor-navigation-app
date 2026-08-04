package com.khoaluan.indoornav.navigation.pdr

import kotlin.math.abs
import kotlin.math.sqrt

enum class BodyActivity {
    SITTING,
    STANDING_UP,
    STANDING,
    WALKING,
}

enum class PhoneUse {
    IDLE,
    TAPPING,
}

enum class PhoneOrientation {
    PORTRAIT,
    LANDSCAPE,
    FLAT,
}

enum class CarryMode {
    HANDHELD,
    POCKET,
    TABLE,
}

enum class HoldStability {
    STABLE,
    SWINGING,
}

/**
 * Ngữ cảnh cầm máy / hoạt động ước lượng từ IMU (không ML).
 * Ngồi vs đứng là proxy cảm biến — ghi rõ khi demo.
 */
data class PhoneContext(
    val body: BodyActivity = BodyActivity.STANDING,
    val phoneUse: PhoneUse = PhoneUse.IDLE,
    val orientation: PhoneOrientation = PhoneOrientation.PORTRAIT,
    val carry: CarryMode = CarryMode.HANDHELD,
    val stability: HoldStability = HoldStability.STABLE,
) {
    val headingUnreliable: Boolean
        get() = carry == CarryMode.POCKET ||
            carry == CarryMode.TABLE ||
            orientation == PhoneOrientation.FLAT ||
            stability == HoldStability.SWINGING

    /** Nhãn tiếng Việt cho HUD / badge. */
    val labelVi: String
        get() = listOf(
            when (body) {
                BodyActivity.SITTING -> "Ngồi"
                BodyActivity.STANDING_UP -> "Đứng dậy"
                BodyActivity.STANDING -> "Đứng"
                BodyActivity.WALKING -> "Di chuyển"
            },
            when (phoneUse) {
                PhoneUse.TAPPING -> "Chạm máy"
                PhoneUse.IDLE -> "Không chạm"
            },
            when (orientation) {
                PhoneOrientation.PORTRAIT -> "Dọc"
                PhoneOrientation.LANDSCAPE -> "Ngang"
                PhoneOrientation.FLAT -> "Nằm ngang"
            },
            when (carry) {
                CarryMode.HANDHELD -> "Cầm tay"
                CarryMode.POCKET -> "Túi quần"
                CarryMode.TABLE -> "Để bàn"
            },
            when (stability) {
                HoldStability.STABLE -> "Ổn định"
                HoldStability.SWINGING -> "Đong đưa"
            },
        ).joinToString(" · ")
}

/**
 * Phân loại ngữ cảnh cầm điện thoại từ accel / linear accel / gyro + MotionState.
 * Hysteresis ~300–800ms để tránh nhảy nhãn.
 */
class PhoneContextDetector(
    private val nowMs: () -> Long = { System.currentTimeMillis() },
    private val swingEnterGyro: Float = 1.8f,
    private val swingExitGyro: Float = 0.9f,
    private val tapEnergyMin: Float = 0.35f,
    private val tapEnergyMax: Float = 1.25f,
    private val standUpEnergy: Float = 2.2f,
    private val labelHoldMs: Long = 450L,
    private val standUpHoldMs: Long = 700L,
    private val gyroAlpha: Float = 0.82f,
    private val linAlpha: Float = 0.75f,
) {
    var current: PhoneContext = PhoneContext()
        private set

    private var filteredGyroMag = 0f
    private var filteredLinEnergy = 0f
    private var filteredVertAbs = 0f

    private var pending: PhoneContext = PhoneContext()
    private var pendingSinceMs = 0L
    private var standUpUntilMs = 0L
    private var wasWalking = false
    private var lastEmittedLabel: String? = null

    fun reset() {
        current = PhoneContext()
        pending = current
        pendingSinceMs = 0L
        standUpUntilMs = 0L
        wasWalking = false
        filteredGyroMag = 0f
        filteredLinEnergy = 0f
        filteredVertAbs = 0f
        lastEmittedLabel = null
    }

    /**
     * @return context mới nếu nhãn đổi (sau hysteresis); null nếu không đổi.
     */
    fun update(
        ax: Float,
        ay: Float,
        az: Float,
        linX: Float,
        linY: Float,
        linZ: Float,
        gx: Float,
        gy: Float,
        gz: Float,
        motion: MotionState,
    ): PhoneContext? {
        val now = nowMs()
        val pose = DevicePoseClassifier.classify(ax, ay, az)

        val gyroMag = sqrt(gx * gx + gy * gy + gz * gz)
        filteredGyroMag = gyroAlpha * filteredGyroMag + (1f - gyroAlpha) * gyroMag

        val linEnergy = sqrt(linX * linX + linY * linY + linZ * linZ)
        filteredLinEnergy = linAlpha * filteredLinEnergy + (1f - linAlpha) * linEnergy

        // Thành phần “dọc thân” gần trục Y thiết bị khi portrait.
        filteredVertAbs = linAlpha * filteredVertAbs + (1f - linAlpha) * abs(linY)

        val orientation = when (pose) {
            DevicePoseClassifier.Pose.PORTRAIT_HAND -> PhoneOrientation.PORTRAIT
            DevicePoseClassifier.Pose.LANDSCAPE_HAND -> PhoneOrientation.LANDSCAPE
            DevicePoseClassifier.Pose.FLAT -> PhoneOrientation.FLAT
            DevicePoseClassifier.Pose.POCKET_OR_BODY -> {
                // Túi vẫn có thể portrait-ish; ưu tiên FLAT chỉ khi flat rõ.
                if (abs(az) > abs(ay) && abs(az) > abs(ax)) PhoneOrientation.FLAT
                else PhoneOrientation.PORTRAIT
            }
        }

        val carry = when (pose) {
            DevicePoseClassifier.Pose.POCKET_OR_BODY -> CarryMode.POCKET
            DevicePoseClassifier.Pose.FLAT -> CarryMode.TABLE
            else -> CarryMode.HANDHELD
        }

        val stability = resolveStability(motion)

        val phoneUse = resolvePhoneUse(motion, carry)

        val body = resolveBody(motion, carry, phoneUse, now)

        val candidate = PhoneContext(
            body = body,
            phoneUse = phoneUse,
            orientation = orientation,
            carry = carry,
            stability = stability,
        )

        return commitWithHysteresis(candidate, now)
    }

    private fun resolveStability(motion: MotionState): HoldStability {
        val enter = if (current.stability == HoldStability.SWINGING) swingExitGyro else swingEnterGyro
        // Đi bộ: gyro cao là bình thường — không gắn SWINGING khi WALKING.
        if (motion == MotionState.WALKING) return HoldStability.STABLE
        return if (filteredGyroMag >= enter) HoldStability.SWINGING else HoldStability.STABLE
    }

    private fun resolvePhoneUse(motion: MotionState, carry: CarryMode): PhoneUse {
        if (motion != MotionState.STILL || carry != CarryMode.HANDHELD) return PhoneUse.IDLE
        // Xung nhỏ khi STILL (chạm màn hình) — dưới ngưỡng vào WALKING.
        return if (filteredLinEnergy in tapEnergyMin..tapEnergyMax) {
            PhoneUse.TAPPING
        } else {
            PhoneUse.IDLE
        }
    }

    private fun resolveBody(
        motion: MotionState,
        carry: CarryMode,
        phoneUse: PhoneUse,
        now: Long,
    ): BodyActivity {
        if (motion == MotionState.WALKING) {
            wasWalking = true
            standUpUntilMs = 0L
            return BodyActivity.WALKING
        }

        // Vừa dừng đi → đứng.
        if (wasWalking) {
            wasWalking = false
            return BodyActivity.STANDING
        }

        // Đứng dậy: xung dọc mạnh khi STILL + cầm tay.
        if (
            carry == CarryMode.HANDHELD &&
            filteredVertAbs >= standUpEnergy &&
            filteredLinEnergy >= standUpEnergy * 0.85f
        ) {
            standUpUntilMs = now + standUpHoldMs
        }
        if (now < standUpUntilMs) {
            return BodyActivity.STANDING_UP
        }

        // Proxy ngồi: cầm tay, yên / đang chạm máy, không vừa đứng dậy.
        val sittingLikely =
            carry == CarryMode.HANDHELD &&
                filteredLinEnergy < tapEnergyMax &&
                filteredGyroMag < swingExitGyro

        return when {
            carry == CarryMode.POCKET || carry == CarryMode.TABLE -> BodyActivity.STANDING
            sittingLikely && (
                current.body == BodyActivity.SITTING ||
                    phoneUse == PhoneUse.TAPPING ||
                    filteredLinEnergy < 0.55f
                ) -> BodyActivity.SITTING
            else -> BodyActivity.STANDING
        }
    }

    private fun commitWithHysteresis(candidate: PhoneContext, now: Long): PhoneContext? {
        if (candidate.labelVi == current.labelVi) {
            pending = candidate
            pendingSinceMs = 0L
            return null
        }
        if (candidate.labelVi != pending.labelVi) {
            pending = candidate
            pendingSinceMs = now
            return null
        }
        if (pendingSinceMs == 0L) {
            pendingSinceMs = now
            return null
        }
        if (now - pendingSinceMs < labelHoldMs) return null

        current = pending
        pendingSinceMs = 0L
        if (current.labelVi == lastEmittedLabel) return null
        lastEmittedLabel = current.labelVi
        return current
    }
}
