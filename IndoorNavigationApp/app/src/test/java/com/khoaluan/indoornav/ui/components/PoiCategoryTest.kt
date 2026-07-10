package com.khoaluan.indoornav.ui.components

import com.khoaluan.indoornav.data.model.Poi
import org.junit.Assert.assertEquals
import org.junit.Test

/** Mapping POI Web Editor → icon Android. */
class PoiCategoryTest {

    @Test
    fun editorVietnameseLabels() {
        assertEquals(PoiCategory.TOILET, PoiCategory.fromRaw("WC"))
        assertEquals(PoiCategory.ELEVATOR, PoiCategory.fromRaw("Thang máy"))
        assertEquals(PoiCategory.ELEVATOR, PoiCategory.fromRaw("Thang cuốn"))
        assertEquals(PoiCategory.STAIRS, PoiCategory.fromRaw("Cầu thang"))
        assertEquals(PoiCategory.EXIT, PoiCategory.fromRaw("Lối ra"))
        assertEquals(PoiCategory.INFO, PoiCategory.fromRaw("ATM"))
        assertEquals(PoiCategory.INFO, PoiCategory.fromRaw("Quầy lễ tân"))
        assertEquals(PoiCategory.OTHER, PoiCategory.fromRaw("Khác"))
        assertEquals(PoiCategory.OTHER, PoiCategory.fromRaw("Điểm mốc"))
    }

    @Test
    fun backendEnumLabels() {
        assertEquals(PoiCategory.TOILET, PoiCategory.fromRaw("TOILET"))
        assertEquals(PoiCategory.STAIRS, PoiCategory.fromRaw("STAIRS"))
        assertEquals(PoiCategory.ELEVATOR, PoiCategory.fromRaw("ELEVATOR"))
    }

    @Test
    fun typeIndexFallback_matchesWebEditorPoiTypes() {
        assertEquals(PoiCategory.TOILET, PoiCategory.fromRaw(null, 0))
        assertEquals(PoiCategory.ELEVATOR, PoiCategory.fromRaw(null, 1))
        assertEquals(PoiCategory.ELEVATOR, PoiCategory.fromRaw(null, 2))
        assertEquals(PoiCategory.STAIRS, PoiCategory.fromRaw(null, 3))
        assertEquals(PoiCategory.EXIT, PoiCategory.fromRaw(null, 6))
    }

    @Test
    fun poiResolveCategory_prefersTypeThenIndex() {
        val poi = Poi(id = 1, name = "WC 1", x = 0, y = 0, type = "Cầu thang", typeIndex = 0)
        assertEquals(PoiCategory.STAIRS, poi.resolveCategory())

        val fallback = Poi(id = 2, name = "X", x = 0, y = 0, type = "Điểm mốc", typeIndex = 1)
        assertEquals(PoiCategory.ELEVATOR, fallback.resolveCategory())
    }

    @Test
    fun poiTypeFieldFromBackend() {
        val poi = Poi(id = 3, name = "T", x = 0, y = 0, type = null, poiType = "TOILET")
        assertEquals(PoiCategory.TOILET, poi.resolveCategory())
    }
}
