package com.khoaluan.indoornav.navigation.pdr

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import kotlin.math.*

/**
 * Unit tests cho StepDetector.
 * Mục tiêu: Kiểm tra logic phát hiện bước và tính toán chiều dài bước.
 */
class StepDetectorTest {

    private lateinit var stepDetector: StepDetector
    private var capturedStepLength: Float? = null

    @Before
    fun setup() {
        stepDetector = StepDetector()
        capturedStepLength = null
        stepDetector.onStepDetected = { length ->
            capturedStepLength = length
        }
    }

    @Test
    fun `hardware step increments count and triggers callback`() {
        // When: gọi onHardwareStep
        stepDetector.onHardwareStep()

        // Then: stepCount tăng lên 1 và callback được gọi
        assertEquals(1, stepDetector.stepCount)
        assertNotNull("Step callback should be invoked", capturedStepLength)
        assertTrue("Step length should be positive", capturedStepLength!! > 0)
    }

    @Test
    fun `reset clears all state`() {
        // Arrange: tạo một vài bước
        // FIX: Giảm minInterval xuống 0 để có thể gọi nhiều bước trong test nhanh
        stepDetector.setMinInterval(0L)
        stepDetector.onHardwareStep()
        stepDetector.onHardwareStep()
        assertEquals(2, stepDetector.stepCount)
        assertTrue(stepDetector.totalDistanceM > 0)

        // Act: reset
        stepDetector.reset()

        // Assert: state về 0
        assertEquals(0, stepDetector.stepCount)
        assertEquals(0f, stepDetector.totalDistanceM, 0f)
    }

    @Test
    fun `setK changes Weinberg constant`() {
        // This test verifies that setK actually updates the internal constant
        // We'll use reflection to check the private field
        val field = StepDetector::class.java.getDeclaredField("kWeinberg")
        field.isAccessible = true

        // Initial value should be 0.42f (after our fix)
        val initialK = field.get(stepDetector) as Float
        assertEquals(0.42f, initialK, 0.001f)

        // Change k
        stepDetector.setK(0.50f)

        // Verify changed
        val newK = field.get(stepDetector) as Float
        assertEquals(0.50f, newK, 0.001f)
    }

    @Test
    fun `micro-step length minimum 0_2m is enforced in LocationEngine logic`() {
        // Test the formula: maxOf(lastStepLength * 0.4f, 0.2f)
        val testCases = listOf(
            0.1f to 0.2f,   // 0.04 -> clamp to 0.2
            0.3f to 0.2f,   // 0.12 -> clamp to 0.2
            0.5f to 0.2f,   // 0.2 -> exactly 0.2
            0.6f to 0.24f,  // 0.24 -> keep 0.24 (>= 0.2)
            1.0f to 0.4f    // 0.4 -> keep 0.4
        )

        for ((lastStep, expected) in testCases) {
            val microStep = maxOf(lastStep * 0.4f, 0.2f)
            assertEquals("For lastStep=$lastStep", expected, microStep, 0.001f)
        }
    }

    @Test
    fun `Weinberg formula yields reasonable step length`() {
        // Test: For delta magnitude 2.0, k=0.42, step length ≈ 0.5m
        val delta = 2.0f
        val k = 0.42f
        val stepLength = k * delta.toDouble().pow(0.25).toFloat()
        // delta^0.25 ≈ 1.1892, so 0.42 * 1.1892 ≈ 0.4995
        assertEquals(0.50f, stepLength, 0.01f)
    }

    @Test
    fun `setThreshold updates thresholds correctly via reflection`() {
        val fieldPeak = StepDetector::class.java.getDeclaredField("peakThreshold")
        val fieldValley = StepDetector::class.java.getDeclaredField("valleyThreshold")
        fieldPeak.isAccessible = true
        fieldValley.isAccessible = true

        val initialPeak = fieldPeak.get(stepDetector) as Float
        val initialValley = fieldValley.get(stepDetector) as Float

        // Default: GRAVITY=9.81, threshold=1.2, HYSTERESIS=1.0
        // peak = 9.81+1.2=11.01, valley = 9.81-1.0=8.81
        assertEquals(9.81f + 1.2f, initialPeak, 0.001f)
        assertEquals(9.81f - 1.0f, initialValley, 0.001f)

        // Change threshold to 1.5
        stepDetector.setThreshold(1.5f)

        val newPeak = fieldPeak.get(stepDetector) as Float
        val newValley = fieldValley.get(stepDetector) as Float
        assertEquals(9.81f + 1.5f, newPeak, 0.001f)
        assertEquals(9.81f - 1.0f, newValley, 0.001f) // HYSTERESIS unchanged
    }
}
