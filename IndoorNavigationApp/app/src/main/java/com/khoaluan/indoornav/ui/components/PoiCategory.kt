package com.khoaluan.indoornav.ui.components

import androidx.compose.ui.graphics.Color
import java.text.Normalizer

/**
 * Loại POI — màu + emoji khớp `Backend_server/utils/poiCatalog.js`
 * và `WebMapEditor/js/pois.js` để Editor / App cùng một ngôn ngữ hình ảnh.
 */
enum class PoiCategory(
    val labelVi: String,
    val labelEn: String,
    val color: Color,
    /** Cùng emoji catalog / Editor — Android vẽ emoji thay vì glyph tự chế. */
    val emoji: String,
) {
    TOILET("Nhà vệ sinh", "Restroom", Color(0xFF3498DB), "🚻"),
    STAIRS("Cầu thang", "Stairs", Color(0xFF9B59B6), "🪜"),
    ELEVATOR("Thang máy", "Elevator", Color(0xFF9B59B6), "🛗"),
    EXIT("Lối ra", "Exit", Color(0xFFE74C3C), "🚪"),
    ATM("Máy ATM", "ATM", Color(0xFF27AE60), "🏧"),
    FOOD("Nhà hàng", "Food", Color(0xFFF97316), "🍽️"),
    PARKING("Bãi đỗ xe", "Parking", Color(0xFF2563EB), "🅿️"),
    MEDICAL("Phòng y tế", "Medical", Color(0xFFDC2626), "➕"),
    SECURITY("Phòng bảo vệ", "Security", Color(0xFF475569), "🛡️"),
    SAFETY("Bình chữa cháy", "Fire extinguisher", Color(0xFFEF4444), "🧯"),
    INFO("Quầy thông tin", "Information", Color(0xFF0EA5E9), "ℹ️"),
    OTHER("Khác", "Other", Color(0xFF95A5A6), "📍");

    val label: String
        get() = if (com.khoaluan.indoornav.ui.i18n.AppLocaleHolder.isEn()) labelEn else labelVi

    companion object {
        /** Khớp thứ tự mảng poiTypes trong WebMapEditor/js/pois.js */
        private val EDITOR_TYPE_INDEX = listOf(
            TOILET,   // 0 WC
            ELEVATOR, // 1 Thang máy
            ELEVATOR, // 2 Thang cuốn → cùng emoji/màu elevator group
            STAIRS,   // 3 Cầu thang
            ATM,      // 4 Máy ATM
            INFO,     // 5 Quầy lễ tân
            EXIT,     // 6 Lối ra
            OTHER,    // 7 Khác
            FOOD,     // 8 Nhà hàng
            FOOD,     // 9 Quán cà phê
            PARKING,  // 10 Bãi đỗ xe
            MEDICAL,  // 11 Phòng y tế
            SECURITY, // 12 Phòng bảo vệ
            INFO,     // 13 Quầy thông tin
            INFO,     // 14 Khu vực chờ
            INFO,     // 15 Máy bán hàng
            SAFETY,   // 16 Bình chữa cháy
        )

        /**
         * Không dừng ở OTHER sớm: bản đồ cũ thường có poi_type="OTHER" dù tên/type là "Thang máy".
         * Thứ tự: key chuẩn (≠ OTHER) → type label → typeIndex → tên POI → OTHER.
         */
        fun fromRaw(
            type: String? = null,
            typeIndex: Int? = null,
            poiTypeKey: String? = null,
            name: String? = null,
        ): PoiCategory {
            preferNonOther(fromTypeString(poiTypeKey))?.let { return it }
            preferNonOther(fromTypeString(type))?.let { return it }
            typeIndex?.let { idx ->
                if (idx in EDITOR_TYPE_INDEX.indices) {
                    preferNonOther(EDITOR_TYPE_INDEX[idx])?.let { return it }
                }
            }
            preferNonOther(fromTypeString(name))?.let { return it }
            fromTypeString(poiTypeKey)?.let { return it }
            fromTypeString(type)?.let { return it }
            return OTHER
        }

        private fun preferNonOther(cat: PoiCategory?): PoiCategory? =
            if (cat != null && cat != OTHER) cat else null

        private fun fromTypeString(type: String?): PoiCategory? {
            if (type.isNullOrBlank()) return null
            val normalized = normalizeLabel(type)

            when (normalized.uppercase()) {
                "TOILET", "RESTROOM", "WC" -> return TOILET
                "STAIRS", "STAIR" -> return STAIRS
                "ELEVATOR", "LIFT", "ESCALATOR" -> return ELEVATOR
                "EXIT" -> return EXIT
                "ATM" -> return ATM
                "FOOD", "CAFE", "RESTAURANT" -> return FOOD
                "PARKING" -> return PARKING
                "MEDICAL", "PHARMACY", "FIRST_AID" -> return MEDICAL
                "SECURITY" -> return SECURITY
                "FIRE_EXTINGUISHER", "SAFETY" -> return SAFETY
                "INFO", "RECEPTION", "WAITING", "VENDING" -> return INFO
                "OTHER", "LOCKER" -> return OTHER
            }

            return when {
                normalized in setOf("wc", "restroom", "toilet", "nha ve sinh", "nha vs", "ve sinh") -> TOILET
                normalized in setOf("stairs", "stair", "cau thang", "thang bo") -> STAIRS
                normalized in setOf("elevator", "lift", "thang may", "thang cuon") -> ELEVATOR
                normalized.startsWith("thang may") || normalized.contains("thang may") -> ELEVATOR
                normalized.contains("thang cuon") -> ELEVATOR
                normalized in setOf("exit", "loi ra", "cua ra", "loi thoat") -> EXIT
                normalized in setOf("atm", "may atm", "cay atm", "rut tien") ||
                    normalized.contains("atm") -> ATM
                normalized in setOf("food", "cafe", "an uong", "nha hang", "quan ca phe", "do an") -> FOOD
                normalized in setOf("parking", "bai do xe") -> PARKING
                normalized in setOf("medical", "pharmacy", "phong y te", "y te", "nha thuoc") -> MEDICAL
                normalized in setOf("security", "phong bao ve", "bao ve") -> SECURITY
                normalized in setOf("fire extinguisher", "binh chua chay", "an toan", "pccc") -> SAFETY
                normalized in setOf(
                    "quay le tan", "le tan", "quay thong tin", "khu vuc cho",
                    "may ban hang", "info", "tien ich", "diem moc",
                ) -> INFO
                // Khớp Editor: chưa có loại LOCKER → OTHER (📍), không gán INFO "i"
                normalized in setOf("tu giu do", "locker", "giu do", "khac", "other") ||
                    normalized.contains("giu do") ||
                    normalized.contains("locker") -> OTHER
                else -> null
            }
        }

        private fun normalizeLabel(raw: String): String {
            val noAccent = Normalizer.normalize(raw.trim(), Normalizer.Form.NFD)
                .replace(Regex("\\p{M}+"), "")
            return noAccent.lowercase().replace('đ', 'd')
        }
    }
}

fun com.khoaluan.indoornav.data.model.Poi.resolveCategory(): PoiCategory =
    PoiCategory.fromRaw(
        type = type,
        typeIndex = typeIndex,
        poiTypeKey = poiType ?: poiTypeCamel,
        name = name,
    )
