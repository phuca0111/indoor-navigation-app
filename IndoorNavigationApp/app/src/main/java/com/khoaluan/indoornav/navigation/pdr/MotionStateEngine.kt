package com.khoaluan.indoornav.navigation.pdr

import kotlin.math.sqrt

enum class MotionState {
    STILL,
    WALKING
}

/**
 * G3a/G3c: STILL ↔ WALKING với hysteresis.
 * - Vào WALKING khó (ngưỡng cao + giữ 450ms) → ngồi rung không dễ thành đi.
 * - Ra STILL chậm (ngưỡng thấp + keepAlive dài) → đang đi không khựng giữa các bước.
 * - [noteStep] gia hạn WALKING mỗi bước thật.
 */
class MotionStateEngine(
    private val walkEnterThreshold: Float = 1.35f,
    private val walkExitThreshold: Float = 0.65f,
    private val enterWalkingHoldMs: Long = 450L,
    private val keepAliveWalkingMs: Long = 2200L,
    private val energyAlpha: Float = 0.85f,
    private val nowMs: () -> Long = { System.currentTimeMillis() }
) {
    var currentState: MotionState = MotionState.STILL
        private set

    var filteredEnergy: Float = 0f
        private set

    private var lastWalkTimeMs = 0L
    private var highEnergySinceMs = 0L

    val allowsPositionUpdate: Boolean
        get() = currentState == MotionState.WALKING

    fun onLinearAccel(x: Float, y: Float, z: Float): Boolean {
        val rawEnergy = sqrt(x * x + y * y + z * z)
        filteredEnergy = energyAlpha * filteredEnergy + (1f - energyAlpha) * rawEnergy

        val previous = currentState
        val now = nowMs()

        when (currentState) {
            MotionState.STILL -> {
                if (filteredEnergy > walkEnterThreshold) {
                    if (highEnergySinceMs == 0L) highEnergySinceMs = now
                    if (now - highEnergySinceMs >= enterWalkingHoldMs) {
                        currentState = MotionState.WALKING
                        lastWalkTimeMs = now
                    }
                } else {
                    highEnergySinceMs = 0L
                }
            }
            MotionState.WALKING -> {
                if (filteredEnergy > walkExitThreshold) {
                    lastWalkTimeMs = now
                } else if (now - lastWalkTimeMs > keepAliveWalkingMs) {
                    currentState = MotionState.STILL
                    highEnergySinceMs = 0L
                }
            }
        }

        return previous != currentState
    }

    /** Mỗi bước chân thật → giữ WALKING (tránh khựng giữa chu kỳ bước). */
    fun noteStep() {
        val now = nowMs()
        currentState = MotionState.WALKING
        lastWalkTimeMs = now
        highEnergySinceMs = now
    }

    fun reset() {
        currentState = MotionState.STILL
        filteredEnergy = 0f
        lastWalkTimeMs = 0L
        highEnergySinceMs = 0L
    }
}
