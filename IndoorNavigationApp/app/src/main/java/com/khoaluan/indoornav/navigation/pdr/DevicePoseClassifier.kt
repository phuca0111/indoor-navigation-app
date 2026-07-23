package com.khoaluan.indoornav.navigation.pdr

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * G3c — Phân loại tư thế cầm máy từ gia tốc (gravity ≈ accel khi đứng yên).
 * Dùng để giảm tin cậy heading khi túi/nằm ngang.
 */
object DevicePoseClassifier {

    enum class Pose {
        /** Màn hình đứng (portrait), cầm tay. */
        PORTRAIT_HAND,
        /** Ngang (landscape). */
        LANDSCAPE_HAND,
        /** Đặt phẳng (bàn / túi nằm). */
        FLAT,
        /** Túi / thân — trục Z thiết bị không “lên”, gia tốc dọc thân. */
        POCKET_OR_BODY,
    }

    /**
     * @param ax,ay,az gia tốc thô (m/s²), gồm gravity.
     */
    fun classify(ax: Float, ay: Float, az: Float): Pose {
        val mag = sqrt(ax * ax + ay * ay + az * az)
        if (mag < 2f) return Pose.FLAT
        val nx = ax / mag
        val ny = ay / mag
        val nz = az / mag
        // Flat: |nz| lớn
        if (abs(nz) > 0.85f) return Pose.FLAT
        // Portrait hand: |ny| lớn (Y thiết bị gần thẳng đứng)
        if (abs(ny) > 0.65f && abs(nz) < 0.55f) return Pose.PORTRAIT_HAND
        // Landscape: |nx| lớn
        if (abs(nx) > 0.65f && abs(nz) < 0.55f) return Pose.LANDSCAPE_HAND
        return Pose.POCKET_OR_BODY
    }

    /** Heading từ cảm biến kém tin khi túi / flat. */
    fun headingUnreliable(pose: Pose): Boolean =
        pose == Pose.POCKET_OR_BODY || pose == Pose.FLAT
}
