package com.khoaluan.indoornav.ui.navigation

import androidx.compose.ui.geometry.Offset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests — G1: chọn đích ≠ tự hiện đường.
 */
class NavigationUiFlagsTest {

    @Test
    fun selectDestination_withoutPath_showsCardPreview_notSearching_awaitsPath() {
        val flags = computeNavigationUiFlags(
            destinationName = "Phòng 101",
            path = null,
            isNavigatingMode = false,
        )
        assertTrue(flags.showBottomCard)
        assertFalse("G1: không spinner khi mới chọn đích", flags.isSearchingPath)
        assertTrue(flags.isPathPreview)
        assertTrue(flags.awaitingPathPreview)
    }

    @Test
    fun afterPreviewPath_hasPolyline_notAwaiting() {
        val path = listOf(Offset(0f, 0f), Offset(40f, 0f), Offset(40f, 80f))
        val flags = computeNavigationUiFlags(
            destinationName = "WC",
            path = path,
            isNavigatingMode = false,
        )
        assertTrue(flags.showBottomCard)
        assertFalse(flags.isSearchingPath)
        assertTrue(flags.isPathPreview)
        assertFalse(flags.awaitingPathPreview)
    }

    @Test
    fun startNavigation_hidesPathPreview() {
        val path = listOf(Offset(0f, 0f), Offset(10f, 10f))
        val flags = computeNavigationUiFlags(
            destinationName = "Cầu thang",
            path = path,
            isNavigatingMode = true,
        )
        assertTrue(flags.showBottomCard)
        assertFalse(flags.isPathPreview)
        assertFalse(flags.awaitingPathPreview)
    }

    @Test
    fun noDestination_noPath_hidesCard() {
        val flags = computeNavigationUiFlags(
            destinationName = null,
            path = null,
            isNavigatingMode = false,
        )
        assertFalse(flags.showBottomCard)
        assertFalse(flags.isPathPreview)
    }

    @Test
    fun emptyPathList_stillAwaitingPreview() {
        val flags = computeNavigationUiFlags(
            destinationName = "Phòng A",
            path = emptyList(),
            isNavigatingMode = false,
        )
        assertTrue(flags.awaitingPathPreview)
        assertEquals(false, flags.isSearchingPath)
    }

    // ── G1b: đổi map không vẽ chấm xanh nếu chưa localize ──

    @Test
    fun g1b_buildMapSessionKey_includesBuildingAndFloor() {
        assertEquals("b1|0", buildMapSessionKey("b1", 0))
        assertEquals("hosp|2", buildMapSessionKey("hosp", 2))
    }

    @Test
    fun g1b_noMarker_whenUserPosNull() {
        assertFalse(
            shouldDrawUserMarker(
                userPos = null,
                localizationMapKey = "b1|0",
                currentMapKey = "b1|0",
            )
        )
    }

    @Test
    fun g1b_noMarker_whenNotLocalizedOnCurrentMap() {
        val pos = Offset(100f, 200f)
        assertFalse(
            "Chưa QR trên map hiện tại",
            shouldDrawUserMarker(pos, localizationMapKey = null, currentMapKey = "b2|0"),
        )
        assertFalse(
            "Key map cũ ≠ map đang mở",
            shouldDrawUserMarker(pos, localizationMapKey = "b1|0", currentMapKey = "b2|0"),
        )
    }

    @Test
    fun g1b_drawMarker_onlyWhenKeysMatch() {
        val pos = Offset(40f, 80f)
        assertTrue(
            shouldDrawUserMarker(
                userPos = pos,
                localizationMapKey = "b2|1",
                currentMapKey = "b2|1",
            )
        )
    }
}
