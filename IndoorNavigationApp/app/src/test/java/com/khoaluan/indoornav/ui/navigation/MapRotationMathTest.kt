package com.khoaluan.indoornav.ui.navigation

import androidx.compose.ui.geometry.Offset
import com.khoaluan.indoornav.ui.viewmodel.MapRotationMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests — G2: xoay map Google-like (độ, ~1:1, lọc nhiễu).
 */
class MapRotationMathTest {

    @Test
    fun normalize_keepsDegrees_noToDegreesAmplification() {
        // Trước đây toDegrees(5°) ≈ 286° — bug quá nhạy
        assertEquals(5f, normalizeGestureRotationDegrees(5f), 0.01f)
        assertEquals(-12f, normalizeGestureRotationDegrees(-12f), 0.01f)
    }

    @Test
    fun resolveDelta_ignoresTinyNoise() {
        assertEquals(0f, resolveManualMapRotationDelta(0.3f, panDistancePx = 0f, zoom = 1f), 0.01f)
    }

    @Test
    fun resolveDelta_appliesOneToOneWhenRotatingClearly() {
        assertEquals(15f, resolveManualMapRotationDelta(15f, panDistancePx = 0f, zoom = 1f), 0.01f)
    }

    @Test
    fun resolveDelta_ignoresSmallRotationWhilePanning() {
        assertEquals(
            0f,
            resolveManualMapRotationDelta(1.5f, panDistancePx = 40f, zoom = 1f),
            0.01f,
        )
    }

    @Test
    fun resolveDelta_ignoresSmallRotationWhilePinching() {
        assertEquals(
            0f,
            resolveManualMapRotationDelta(1.5f, panDistancePx = 0f, zoom = 1.08f),
            0.01f,
        )
    }

    @Test
    fun northUp_usesOffsetOnly() {
        val rot = computeEffectiveMapRotation(
            mode = MapRotationMode.NORTH_UP,
            unwrappedUserHeading = 90f,
            userMapBearingOffset = 45f,
        )
        assertEquals(45f, rot, 0.01f)
    }

    @Test
    fun headingUp_isNegativeHeadingPlusOffset() {
        val rot = computeEffectiveMapRotation(
            mode = MapRotationMode.HEADING_UP,
            unwrappedUserHeading = 30f,
            userMapBearingOffset = 10f,
        )
        assertEquals(-20f, rot, 0.01f)
    }

    @Test
    fun headingDriven_northUp_isZero() {
        assertEquals(0f, computeHeadingDrivenRotation(MapRotationMode.NORTH_UP, 90f), 0.01f)
        assertTrue(computeHeadingDrivenRotation(MapRotationMode.HEADING_UP, 90f) == -90f)
    }

    @Test
    fun screenPan_atZeroRotation_unchanged() {
        val pan = Offset(10f, -4f)
        assertEquals(pan.x, screenPanToMapOffsetDelta(pan, 0f).x, 0.01f)
        assertEquals(pan.y, screenPanToMapOffsetDelta(pan, 0f).y, 0.01f)
    }

    @Test
    fun screenPan_at180_isInverted() {
        val pan = Offset(10f, 0f)
        val adjusted = screenPanToMapOffsetDelta(pan, 180f)
        assertEquals(-10f, adjusted.x, 0.1f)
        assertEquals(0f, adjusted.y, 0.1f)
    }
}
