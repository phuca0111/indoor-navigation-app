package com.khoaluan.indoornav.ui.components

import androidx.compose.ui.graphics.Color
import java.text.Normalizer

/**
 * Loại POI — **khớp 1:1** `WebMapEditor/js/pois.js` + `Backend_server/utils/poiCatalog.js`
 * (key, nhãn VI, màu, emoji).
 */
enum class PoiCategory(
    val key: String,
    val labelVi: String,
    val labelEn: String,
    val color: Color,
    val emoji: String,
) {
    TOILET("TOILET", "Nhà vệ sinh", "Restroom", Color(0xFF3498DB), "🚻"),
    ELEVATOR("ELEVATOR", "Thang máy", "Elevator", Color(0xFF9B59B6), "🛗"),
    ESCALATOR("ESCALATOR", "Thang cuốn", "Escalator", Color(0xFF9B59B6), "↗️"),
    STAIRS("STAIRS", "Cầu thang", "Stairs", Color(0xFF9B59B6), "🪜"),
    ATM("ATM", "Máy ATM", "ATM", Color(0xFF27AE60), "🏧"),
    RECEPTION("RECEPTION", "Quầy lễ tân", "Reception", Color(0xFFE67E22), "💁"),
    EXIT("EXIT", "Lối ra", "Exit", Color(0xFFE74C3C), "🚪"),
    ASSEMBLY_POINT("ASSEMBLY_POINT", "Điểm tập trung", "Assembly point", Color(0xFF16A34A), "🏃"),
    OTHER("OTHER", "Khác", "Other", Color(0xFF95A5A6), "📍"),
    FOOD("FOOD", "Nhà hàng", "Food", Color(0xFFF97316), "🍽️"),
    CAFE("CAFE", "Quán cà phê", "Cafe", Color(0xFF92400E), "☕"),
    PARKING("PARKING", "Bãi đỗ xe", "Parking", Color(0xFF2563EB), "🅿️"),
    MEDICAL("MEDICAL", "Phòng y tế", "Medical", Color(0xFFDC2626), "➕"),
    SECURITY("SECURITY", "Phòng bảo vệ", "Security", Color(0xFF475569), "🛡️"),
    INFO("INFO", "Quầy thông tin", "Information", Color(0xFF0EA5E9), "ℹ️"),
    WAITING("WAITING", "Khu vực chờ", "Waiting area", Color(0xFF14B8A6), "🪑"),
    VENDING("VENDING", "Máy bán hàng", "Vending machine", Color(0xFF8B5CF6), "🥤"),
    SAFETY("FIRE_EXTINGUISHER", "Bình chữa cháy", "Fire extinguisher", Color(0xFFEF4444), "🧯");

    val label: String
        get() = if (com.khoaluan.indoornav.ui.i18n.AppLocaleHolder.isEn()) labelEn else labelVi

    /** Nhóm filter chip (FOOD gồm CAFE; INFO gồm lễ tân/chờ/bán hàng; ELEVATOR gồm thang cuốn). */
    fun matchesFilter(filter: PoiCategory): Boolean = when (filter) {
        FOOD -> this == FOOD || this == CAFE
        INFO -> this == INFO || this == RECEPTION || this == WAITING || this == VENDING
        ELEVATOR -> this == ELEVATOR || this == ESCALATOR
        SAFETY -> this == SAFETY
        else -> this == filter
    }

    companion object {
        /** Thứ tự đúng `poiTypes[]` trong WebMapEditor/js/pois.js */
        private val EDITOR_TYPE_INDEX = listOf(
            TOILET,          // 0
            ELEVATOR,        // 1
            ESCALATOR,       // 2
            STAIRS,          // 3
            ATM,             // 4
            RECEPTION,       // 5
            EXIT,            // 6
            ASSEMBLY_POINT,  // 7
            OTHER,           // 8
            FOOD,            // 9
            CAFE,            // 10
            PARKING,         // 11
            MEDICAL,         // 12
            SECURITY,        // 13
            INFO,            // 14
            WAITING,         // 15
            VENDING,         // 16
            SAFETY,          // 17
        )

        /** INFO/OTHER là generic — không được đè tên rõ “nhà vệ sinh”. */
        private fun PoiCategory.isSpecific(): Boolean =
            this != OTHER && this != INFO

        /**
         * Gộp tín hiệu giống Editor.
         * Ưu tiên **tên** cụ thể trước poiType/type — map cũ hay đổi tên (vd. "Thang máy")
         * nhưng còn type=TOILET mặc định từ Editor.
         */
        fun fromRaw(
            type: String? = null,
            typeIndex: Int? = null,
            poiTypeKey: String? = null,
            name: String? = null,
        ): PoiCategory {
            val fromKey = fromTypeString(poiTypeKey)
            val fromType = fromTypeString(type)
            val fromName = fromTypeString(name)
            val fromIdx = typeIndex?.let { idx -> EDITOR_TYPE_INDEX.getOrNull(idx) }

            // 1) Tên cụ thể thắng (tránh icon WC + nhãn "Thang máy")
            fromName?.takeIf { it.isSpecific() }?.let { return it }

            // 2) poiType / type cụ thể
            listOfNotNull(fromKey, fromType)
                .firstOrNull { it.isSpecific() }
                ?.let { return it }

            // 3) typeIndex cụ thể (bản chỉ còn index)
            fromIdx?.takeIf { it.isSpecific() }?.let { return it }

            // 4) INFO / generic còn lại
            listOfNotNull(fromName, fromKey, fromType, fromIdx)
                .firstOrNull { it != OTHER }
                ?.let { return it }

            return OTHER
        }

        private fun fromTypeString(type: String?): PoiCategory? {
            if (type.isNullOrBlank()) return null
            val normalized = normalizeLabel(type)

            when (normalized.uppercase()) {
                "TOILET", "RESTROOM", "WC" -> return TOILET
                "ELEVATOR", "LIFT" -> return ELEVATOR
                "ESCALATOR" -> return ESCALATOR
                "STAIRS", "STAIR" -> return STAIRS
                "ATM" -> return ATM
                "RECEPTION" -> return RECEPTION
                "EXIT" -> return EXIT
                "ASSEMBLY_POINT", "ASSEMBLY" -> return ASSEMBLY_POINT
                "OTHER", "LOCKER" -> return OTHER
                "FOOD", "RESTAURANT" -> return FOOD
                "CAFE", "COFFEE" -> return CAFE
                "PARKING" -> return PARKING
                "MEDICAL", "FIRST_AID" -> return MEDICAL
                "PHARMACY" -> return MEDICAL
                "SECURITY" -> return SECURITY
                "INFO", "INFORMATION" -> return INFO
                "WAITING" -> return WAITING
                "VENDING" -> return VENDING
                "FIRE_EXTINGUISHER", "SAFETY" -> return SAFETY
            }

            return when {
                normalized in setOf("wc", "restroom", "toilet", "nha ve sinh", "nha vs", "ve sinh") ||
                    normalized.contains("ve sinh") ||
                    normalized.contains("restroom") -> TOILET
                normalized in setOf("thang cuon", "escalator") ||
                    normalized.contains("thang cuon") -> ESCALATOR
                normalized in setOf("elevator", "lift", "thang may") ||
                    normalized.contains("thang may") -> ELEVATOR
                normalized in setOf("stairs", "stair", "cau thang", "thang bo") ||
                    normalized.contains("cau thang") -> STAIRS
                normalized in setOf("atm", "may atm", "cay atm", "rut tien") ||
                    normalized.contains("atm") -> ATM
                normalized in setOf("quay le tan", "le tan", "reception") -> RECEPTION
                normalized in setOf("exit", "loi ra", "cua ra", "loi thoat") ||
                    normalized.contains("loi thoat") ||
                    normalized.contains("thoat hiem") -> EXIT
                normalized in setOf(
                    "assembly", "assembly point", "diem tap trung", "tap trung", "diem tap hop",
                ) -> ASSEMBLY_POINT
                normalized in setOf("food", "an uong", "nha hang", "do an", "bep", "nha bep", "kitchen") ||
                    normalized.contains("nha hang") -> FOOD
                normalized in setOf("cafe", "quan ca phe", "ca phe", "tra sua", "coffee") ||
                    normalized.contains("ca phe") -> CAFE
                normalized in setOf("parking", "bai do xe", "gui xe", "do xe") -> PARKING
                normalized in setOf("medical", "pharmacy", "phong y te", "y te", "nha thuoc", "so cuu") -> MEDICAL
                normalized in setOf("security", "phong bao ve", "bao ve", "an ninh") -> SECURITY
                normalized in setOf("quay thong tin", "thong tin", "huong dan", "info", "information") -> INFO
                normalized in setOf("khu vuc cho", "ghe cho", "waiting") -> WAITING
                normalized in setOf("may ban hang", "ban hang tu dong", "vending") -> VENDING
                normalized in setOf("fire extinguisher", "binh chua chay", "chua chay", "pccc", "an toan") -> SAFETY
                normalized in setOf("tu giu do", "locker", "giu do", "khac", "other", "diem moc", "tien ich") ||
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
