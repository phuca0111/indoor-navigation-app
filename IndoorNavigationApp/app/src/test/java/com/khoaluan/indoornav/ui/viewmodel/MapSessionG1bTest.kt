package com.khoaluan.indoornav.ui.viewmodel

import androidx.compose.ui.geometry.Offset
import com.khoaluan.indoornav.ui.navigation.buildMapSessionKey
import com.khoaluan.indoornav.ui.navigation.shouldDrawUserMarker
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * G1b — contract: sau khi đổi map, session định vị cũ không được vẽ lên map mới.
 */
class MapSessionG1bTest {

    @Test
    fun afterMapChange_stalePosFromBuildingA_mustNotDrawOnBuildingB() {
        val stalePos = Offset(120f, 340f) // tọa độ QR map A (vd. cổng)
        val keyA = buildMapSessionKey("building-A", 0)
        val keyB = buildMapSessionKey("building-B", 0)
        // Mô phỏng: fetchMap map B đã clear localizationMapKey = null
        assertFalse(
            shouldDrawUserMarker(
                userPos = stalePos,
                localizationMapKey = null,
                currentMapKey = keyB,
            )
        )
        // Hoặc key vẫn sót map A
        assertFalse(
            shouldDrawUserMarker(
                userPos = stalePos,
                localizationMapKey = keyA,
                currentMapKey = keyB,
            )
        )
    }

    @Test
    fun navigationStateDefault_hasNoUserPos() {
        val cleared = NavigationState()
        assertNull(cleared.userPos)
        assertNull(cleared.path)
        assertFalse(cleared.isNavigatingMode)
    }

    @Test
    fun afterQrOnSameMap_markerAllowed() {
        val pos = Offset(50f, 60f)
        val key = buildMapSessionKey("building-B", 0)
        assertTrue(shouldDrawUserMarker(pos, key, key))
    }
}
