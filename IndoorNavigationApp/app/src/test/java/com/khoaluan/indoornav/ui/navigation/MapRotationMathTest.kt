package com.khoaluan.indoornav.ui.navigation

import androidx.compose.ui.geometry.Offset
import com.khoaluan.indoornav.ui.viewmodel.MapRotationMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * Kiểm tra pan/zoom khi map xoay: nội dung phải đi theo ngón trên màn hình.
 */
class MapRotationMathTest {

    private val screenCenter = Offset(400f, 800f)
    private val scale = 0.5f
    private val mapPoint = Offset(200f, 300f)

    /** Chiếu map → màn hình với pivot = tâm màn hình (NORTH_UP / xoay tay). */
    private fun projectScreenCenterPivot(
        offset: Offset,
        rotationDeg: Float,
        point: Offset = mapPoint,
    ): Offset {
        val pivot = Offset(
            (screenCenter.x - offset.x) / scale,
            (screenCenter.y - offset.y) / scale,
        )
        val rotated = rotateAroundPivot(point, pivot, rotationDeg)
        return Offset(rotated.x * scale + offset.x, rotated.y * scale + offset.y)
    }

    /** Chiếu với pivot cố định (HEADING_UP). */
    private fun projectFixedPivot(
        offset: Offset,
        rotationDeg: Float,
        pivot: Offset,
        point: Offset = mapPoint,
    ): Offset {
        val rotated = rotateAroundPivot(point, pivot, rotationDeg)
        return Offset(rotated.x * scale + offset.x, rotated.y * scale + offset.y)
    }

    private fun assertOffsetEquals(expected: Offset, actual: Offset, epsilon: Float = 0.15f) {
        assertEquals("x", expected.x, actual.x, epsilon)
        assertEquals("y", expected.y, actual.y, epsilon)
    }

    @Test
    fun screenPanDelta_zeroRotation_isIdentity() {
        val pan = Offset(-40f, 20f)
        assertOffsetEquals(pan, screenPanToMapOffsetDelta(pan, 0f))
    }

    @Test
    fun screenPanDelta_180_negatesPan() {
        val pan = Offset(30f, -10f)
        assertOffsetEquals(Offset(-30f, 10f), screenPanToMapOffsetDelta(pan, 180f))
    }

    @Test
    fun screenCenterPivot_panFollowsFinger_atAngles() {
        val angles = listOf(0f, 32f, 45f, 90f, 135f, 180f, -90f, 270f)
        val fingerPans = listOf(
            Offset(-50f, 0f), // trái
            Offset(50f, 0f), // phải
            Offset(0f, -50f), // lên
            Offset(0f, 50f), // xuống
            Offset(-30f, 40f),
        )
        val baseOffset = Offset(100f, 150f)

        for (angle in angles) {
            for (fingerPan in fingerPans) {
                val newOffset = applyMapPanZoomOffset(
                    currentOffset = baseOffset,
                    centroid = screenCenter,
                    pan = fingerPan,
                    oldScale = scale,
                    newScale = scale,
                    mapRotationDegrees = angle,
                    screenCenter = screenCenter,
                    pivotFixedToUser = false,
                )
                val before = projectScreenCenterPivot(baseOffset, angle)
                val after = projectScreenCenterPivot(newOffset, angle)
                val screenDelta = after - before
                assertOffsetEquals(
                    fingerPan,
                    screenDelta,
                )
            }
        }
    }

    @Test
    fun screenCenterPivot_rawPan_isWrongWhenRotated90() {
        // Minh họa bug cũ: pan thô khi xoay 90° → vuốt trái đi lên (hoặc ngược).
        val baseOffset = Offset(100f, 150f)
        val fingerLeft = Offset(-50f, 0f)
        val rawNew = baseOffset + fingerLeft
        val before = projectScreenCenterPivot(baseOffset, 90f)
        val after = projectScreenCenterPivot(rawNew, 90f)
        val screenDelta = after - before
        // R(90°) * (-50, 0) ≈ (0, -50) → đi lên, không đi trái
        assertTrue(abs(screenDelta.x) < 5f)
        assertTrue(screenDelta.y < -40f)
    }

    @Test
    fun fixedUserPivot_rawPan_followsFinger_evenAtSouth() {
        val pivot = Offset(220f, 310f)
        val baseOffset = Offset(80f, 120f)
        val fingerPans = listOf(
            Offset(-40f, 0f),
            Offset(0f, 40f),
            Offset(25f, -15f),
        )
        for (angle in listOf(0f, 32f, 90f, 180f)) {
            for (fingerPan in fingerPans) {
                val newOffset = applyMapPanZoomOffset(
                    currentOffset = baseOffset,
                    centroid = Offset(200f, 400f),
                    pan = fingerPan,
                    oldScale = scale,
                    newScale = scale,
                    mapRotationDegrees = angle,
                    screenCenter = screenCenter,
                    pivotFixedToUser = true,
                )
                val before = projectFixedPivot(baseOffset, angle, pivot)
                val after = projectFixedPivot(newOffset, angle, pivot)
                assertOffsetEquals(fingerPan, after - before)
            }
        }
    }

    @Test
    fun headingUp_mustNotUseInversePan_atSouth() {
        // Nếu nhầm dùng R^{-1} khi pivot user cố định + heading Nam → đảo cử chỉ.
        assertTrue(isMapRotationPivotFixedToUser(MapRotationMode.HEADING_UP, hasUserPos = true))
        assertFalse(isMapRotationPivotFixedToUser(MapRotationMode.HEADING_UP, hasUserPos = false))
        assertFalse(isMapRotationPivotFixedToUser(MapRotationMode.NORTH_UP, hasUserPos = true))

        val pan = Offset(-40f, 0f)
        val wrong = screenPanToMapOffsetDelta(pan, 180f)
        assertOffsetEquals(Offset(40f, 0f), wrong) // đảo — đúng là không được áp khi HEADING_UP
    }

    @Test
    fun zoomTowardCentroid_keepsPointUnderFinger_whenRotated() {
        val angle = 32f
        val centroid = Offset(350f, 700f)
        val baseOffset = Offset(120f, 180f)
        val newScale = scale * 1.25f

        // Map point đang nằm dưới centroid (trước gesture)
        val unrotated = rotateAroundPivot(centroid, screenCenter, -angle)
        val mapUnderFinger = Offset(
            (unrotated.x - baseOffset.x) / scale,
            (unrotated.y - baseOffset.y) / scale,
        )
        // sanity: project mapUnderFinger ≈ centroid
        assertOffsetEquals(centroid, projectScreenCenterPivot(baseOffset, angle, mapUnderFinger), 1f)

        val newOffset = applyMapPanZoomOffset(
            currentOffset = baseOffset,
            centroid = centroid,
            pan = Offset.Zero,
            oldScale = scale,
            newScale = newScale,
            mapRotationDegrees = angle,
            screenCenter = screenCenter,
            pivotFixedToUser = false,
        )

        fun projectWithScale(offset: Offset, sc: Float, point: Offset): Offset {
            val p = Offset(
                (screenCenter.x - offset.x) / sc,
                (screenCenter.y - offset.y) / sc,
            )
            val rotated = rotateAroundPivot(point, p, angle)
            return Offset(rotated.x * sc + offset.x, rotated.y * sc + offset.y)
        }

        val after = projectWithScale(newOffset, newScale, mapUnderFinger)
        assertOffsetEquals(centroid, after, 1.5f)
    }

    @Test
    fun rotateAroundPivot_90_movesRightToDown() {
        val p = rotateAroundPivot(Offset(1f, 0f), Offset.Zero, 90f)
        assertOffsetEquals(Offset(0f, 1f), p, 1e-4f)
    }

    @Test
    fun screenPanDelta_matchesInverseRotationMatrix() {
        val angle = 32f
        val pan = Offset(-50f, 10f)
        val rad = Math.toRadians(-angle.toDouble())
        val c = cos(rad).toFloat()
        val s = sin(rad).toFloat()
        val expected = Offset(pan.x * c - pan.y * s, pan.x * s + pan.y * c)
        assertOffsetEquals(expected, screenPanToMapOffsetDelta(pan, angle), 1e-4f)
    }
}
