package com.khoaluan.indoornav.ui.components

import com.khoaluan.indoornav.data.model.Poi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mapping POI Web Editor → Android (khớp pois.js). */
class PoiCategoryTest {

    @Test
    fun editorVietnameseLabels() {
        assertEquals(PoiCategory.TOILET, PoiCategory.fromRaw("Nhà vệ sinh"))
        assertEquals(PoiCategory.TOILET, PoiCategory.fromRaw("WC"))
        assertEquals(PoiCategory.ELEVATOR, PoiCategory.fromRaw("Thang máy"))
        assertEquals(PoiCategory.ESCALATOR, PoiCategory.fromRaw("Thang cuốn"))
        assertEquals(PoiCategory.STAIRS, PoiCategory.fromRaw("Cầu thang"))
        assertEquals(PoiCategory.ATM, PoiCategory.fromRaw("Máy ATM"))
        assertEquals(PoiCategory.RECEPTION, PoiCategory.fromRaw("Quầy lễ tân"))
        assertEquals(PoiCategory.EXIT, PoiCategory.fromRaw("Lối ra"))
        assertEquals(PoiCategory.ASSEMBLY_POINT, PoiCategory.fromRaw("Điểm tập trung"))
        assertEquals(PoiCategory.OTHER, PoiCategory.fromRaw("Khác"))
        assertEquals(PoiCategory.FOOD, PoiCategory.fromRaw("Nhà hàng"))
        assertEquals(PoiCategory.CAFE, PoiCategory.fromRaw("Quán cà phê"))
        assertEquals(PoiCategory.PARKING, PoiCategory.fromRaw("Bãi đỗ xe"))
        assertEquals(PoiCategory.MEDICAL, PoiCategory.fromRaw("Phòng y tế"))
        assertEquals(PoiCategory.SECURITY, PoiCategory.fromRaw("Phòng bảo vệ"))
        assertEquals(PoiCategory.INFO, PoiCategory.fromRaw("Quầy thông tin"))
        assertEquals(PoiCategory.WAITING, PoiCategory.fromRaw("Khu vực chờ"))
        assertEquals(PoiCategory.VENDING, PoiCategory.fromRaw("Máy bán hàng"))
        assertEquals(PoiCategory.SAFETY, PoiCategory.fromRaw("Bình chữa cháy"))
        assertEquals(PoiCategory.FOOD, PoiCategory.fromRaw("bếp"))
    }

    @Test
    fun nameBeatsWrongInfoType() {
        // Bug ảnh: name="nhà vệ sinh" nhưng poi_type/typeIndex = INFO → phải ra TOILET
        assertEquals(
            PoiCategory.TOILET,
            PoiCategory.fromRaw(
                type = "Quầy thông tin",
                typeIndex = 14,
                poiTypeKey = "INFO",
                name = "nhà vệ sinh",
            ),
        )
        assertEquals(
            PoiCategory.TOILET,
            Poi(
                id = 1,
                name = "nhà vệ sinh",
                x = 0,
                y = 0,
                type = null,
                poiType = "INFO",
                typeIndex = 5,
            ).resolveCategory(),
        )
    }

    @Test
    fun typeIndex_matchesWebEditorPoiTypes() {
        assertEquals(PoiCategory.TOILET, PoiCategory.fromRaw(null, 0))
        assertEquals(PoiCategory.ELEVATOR, PoiCategory.fromRaw(null, 1))
        assertEquals(PoiCategory.ESCALATOR, PoiCategory.fromRaw(null, 2))
        assertEquals(PoiCategory.STAIRS, PoiCategory.fromRaw(null, 3))
        assertEquals(PoiCategory.ATM, PoiCategory.fromRaw(null, 4))
        assertEquals(PoiCategory.RECEPTION, PoiCategory.fromRaw(null, 5))
        assertEquals(PoiCategory.EXIT, PoiCategory.fromRaw(null, 6))
        assertEquals(PoiCategory.ASSEMBLY_POINT, PoiCategory.fromRaw(null, 7))
        assertEquals(PoiCategory.OTHER, PoiCategory.fromRaw(null, 8))
        assertEquals(PoiCategory.FOOD, PoiCategory.fromRaw(null, 9))
        assertEquals(PoiCategory.CAFE, PoiCategory.fromRaw(null, 10))
        assertEquals(PoiCategory.PARKING, PoiCategory.fromRaw(null, 11))
        assertEquals(PoiCategory.VENDING, PoiCategory.fromRaw(null, 16))
        assertEquals(PoiCategory.SAFETY, PoiCategory.fromRaw(null, 17))
    }

    @Test
    fun filterGroups() {
        assertTrue(PoiCategory.CAFE.matchesFilter(PoiCategory.FOOD))
        assertTrue(PoiCategory.ESCALATOR.matchesFilter(PoiCategory.ELEVATOR))
        assertTrue(PoiCategory.RECEPTION.matchesFilter(PoiCategory.INFO))
        assertTrue(PoiCategory.VENDING.matchesFilter(PoiCategory.INFO))
        assertTrue(PoiCategory.TOILET.matchesFilter(PoiCategory.TOILET))
    }

    @Test
    fun emojiMatchesEditor() {
        assertEquals("🚻", PoiCategory.TOILET.emoji)
        assertEquals("🛗", PoiCategory.ELEVATOR.emoji)
        assertEquals("↗️", PoiCategory.ESCALATOR.emoji)
        assertEquals("🪜", PoiCategory.STAIRS.emoji)
        assertEquals("🏧", PoiCategory.ATM.emoji)
        assertEquals("🚪", PoiCategory.EXIT.emoji)
        assertEquals("🧯", PoiCategory.SAFETY.emoji)
    }
}
