package com.khoaluan.indoornav.ui.components

import androidx.compose.ui.geometry.Offset
import org.junit.Assert.assertEquals
import org.junit.Test

class MapCoordinateUtilsTest {

    @Test
    fun screenToMap_noRotation() {
        val map = screenToMapCoords(
            screen = Offset(200f, 300f),
            scale = 2f,
            offset = Offset(50f, 100f),
            rotationDeg = 0f,
            pivot = Offset.Zero,
        )
        assertEquals(75f, map.x, 0.01f)
        assertEquals(100f, map.y, 0.01f)
    }
}
