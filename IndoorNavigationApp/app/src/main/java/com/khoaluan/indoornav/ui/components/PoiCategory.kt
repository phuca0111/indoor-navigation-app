package com.khoaluan.indoornav.ui.components

import androidx.compose.ui.graphics.Color
import java.text.Normalizer

/**
 * Loại POI chuẩn hoá từ:
 * - Backend enum: TOILET, STAIRS, ELEVATOR…
 * - Web Editor [type] tiếng Việt: "WC", "Thang máy", "Cầu thang"…
 * - Web Editor [typeIndex]: 0=WC, 1=Thang máy, 2=Thang cuốn, 3=Cầu thang…
 */
enum class PoiCategory(val label: String, val color: Color) {
    TOILET("WC", Color(0xFF0288D1)),
    STAIRS("Thang bộ", Color(0xFF7B1FA2)),
    ELEVATOR("Thang máy", Color(0xFF388E3C)),
    EXIT("Lối ra", Color(0xFFE53935)),
    FOOD("Ăn uống", Color(0xFFF57C00)),
    INFO("Tiện ích", Color(0xFFFFA000)),
    OTHER("Khác", Color(0xFF78909C));

    companion object {
        /** Khớp thứ tự mảng poiTypes trong WebMapEditor/js/pois.js */
        private val EDITOR_TYPE_INDEX = listOf(
            TOILET,   // 0 WC
            ELEVATOR, // 1 Thang máy
            ELEVATOR, // 2 Thang cuốn
            STAIRS,   // 3 Cầu thang
            INFO,     // 4 ATM
            INFO,     // 5 Quầy lễ tân
            EXIT,     // 6 Lối ra
            OTHER,    // 7 Khác
        )

        fun fromRaw(type: String?, typeIndex: Int? = null): PoiCategory {
            fromTypeString(type)?.let { return it }
            typeIndex?.let { idx ->
                if (idx in EDITOR_TYPE_INDEX.indices) return EDITOR_TYPE_INDEX[idx]
            }
            return OTHER
        }

        private fun fromTypeString(type: String?): PoiCategory? {
            if (type.isNullOrBlank()) return null
            val normalized = normalizeLabel(type)

            when (normalized.uppercase()) {
                "TOILET", "RESTROOM", "WC" -> return TOILET
                "STAIRS", "STAIR" -> return STAIRS
                "ELEVATOR", "LIFT", "ESCALATOR" -> return ELEVATOR
                "EXIT" -> return EXIT
                "FOOD", "CAFE", "RESTAURANT" -> return FOOD
                "PHARMACY", "ATM", "INFO" -> return INFO
            }

            return when (normalized) {
                "wc" -> TOILET
                "restroom", "toilet", "nha ve sinh", "nha vs", "ve sinh" -> TOILET
                "stairs", "stair", "cau thang", "thang bo" -> STAIRS
                "elevator", "lift", "thang may", "thang cuon" -> ELEVATOR
                "exit", "loi ra", "cua ra" -> EXIT
                "food", "cafe", "an uong" -> FOOD
                "atm", "quay le tan", "le tan", "info", "tien ich", "diem moc" -> INFO
                "khac", "other" -> OTHER
                else -> null
            }
        }

        /** Bỏ dấu + lowercase để so khớp "Thang máy" / "Cầu thang" ổn định. */
        private fun normalizeLabel(raw: String): String {
            val noAccent = Normalizer.normalize(raw.trim(), Normalizer.Form.NFD)
                .replace(Regex("\\p{M}+"), "")
            return noAccent.lowercase()
        }
    }
}

fun com.khoaluan.indoornav.data.model.Poi.resolveCategory(): PoiCategory =
    PoiCategory.fromRaw(type ?: poiType, typeIndex)
