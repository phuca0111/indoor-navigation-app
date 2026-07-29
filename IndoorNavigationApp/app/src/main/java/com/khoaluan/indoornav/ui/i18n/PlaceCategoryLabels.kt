package com.khoaluan.indoornav.ui.i18n

import java.text.Normalizer

/**
 * Nhãn hiển thị danh mục Place theo locale (API vẫn dùng mall/school/…).
 */
object PlaceCategoryLabels {
    fun display(raw: String?, locale: String = AppLocaleHolder.tag): String {
        if (raw.isNullOrBlank()) return ""
        val en = locale.equals("en", ignoreCase = true)
        return when (normalizeKey(raw)) {
            "mall", "shopping", "shopping_mall" -> if (en) "Mall" else "Trung tâm thương mại"
            "school", "university", "education" -> if (en) "School" else "Trường học"
            "hospital", "clinic", "medical" -> if (en) "Hospital" else "Bệnh viện"
            "office", "business" -> if (en) "Office" else "Văn phòng"
            "hotel" -> if (en) "Hotel" else "Khách sạn"
            "restaurant", "food", "cafe" -> if (en) "Food" else "Ăn uống"
            "parking" -> if (en) "Parking" else "Bãi đỗ xe"
            "station", "transit" -> if (en) "Transit" else "Ga / Bến"
            "indoor" -> if (en) "Indoor" else "Trong nhà"
            "other", "khac" -> if (en) "Other" else "Khác"
            else -> raw.trim().replaceFirstChar { it.uppercaseChar() }
        }
    }

    fun filterChips(locale: String = AppLocaleHolder.tag): List<Pair<String, String>> {
        val en = locale.equals("en", ignoreCase = true)
        return if (en) {
            listOf(
                "" to "All",
                "mall" to "Mall",
                "school" to "School",
                "hospital" to "Hospital",
                "office" to "Office",
            )
        } else {
            listOf(
                "" to "Tất cả",
                "mall" to "Trung tâm TM",
                "school" to "Trường học",
                "hospital" to "Bệnh viện",
                "office" to "Văn phòng",
            )
        }
    }

    /**
     * Khớp chip lọc outdoor với category API **hoặc** suy luận từ tên/địa chỉ
     * (nhiều Place đang để category rỗng).
     */
    fun matchesFilter(
        filterKey: String,
        category: String?,
        name: String? = null,
        address: String? = null,
    ): Boolean {
        val key = normalizeKey(filterKey)
        if (key.isEmpty()) return true
        val cat = normalizeKey(category.orEmpty())
        if (cat.isNotEmpty()) {
            val aliases = aliasesFor(key)
            if (cat == key || cat in aliases || aliases.any { cat.contains(it) }) return true
        }
        val blob = normalizeKey(listOfNotNull(name, address).joinToString(" "))
        if (blob.isEmpty()) return false
        return nameHintsFor(key).any { blob.contains(it) }
    }

    private fun aliasesFor(key: String): Set<String> = when (key) {
        "mall" -> setOf("mall", "shopping", "shopping_mall", "trung tam thuong mai", "trung tam tm")
        "school" -> setOf("school", "university", "education", "truong hoc", "dai hoc")
        "hospital" -> setOf("hospital", "clinic", "medical", "benh vien", "phong kham")
        "office" -> setOf("office", "business", "van phong")
        else -> setOf(key)
    }

    private fun nameHintsFor(key: String): List<String> = when (key) {
        "mall" -> listOf(
            "aeon", "vincom", "lotte", "mega market", "coopmart", "big c", "emart",
            "trung tam thuong mai", "tttm", "shopping mall", "mall ",
        )
        "school" -> listOf(
            "truong ", "dai hoc", "hoc vien", "thpt", "thcs", "tieu hoc",
            "university", "school", "college",
        )
        "hospital" -> listOf(
            "benh vien", "phong kham", "y te", "trung tam y",
            "hospital", "clinic", "medical",
        )
        "office" -> listOf(
            "van phong", "toa nha", "office", "building", "bitexco", "landmark",
        )
        else -> emptyList()
    }

    private fun normalizeKey(raw: String): String {
        val noAccent = Normalizer.normalize(raw.trim(), Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
        return noAccent.lowercase()
            .replace('đ', 'd')
            .replace('_', ' ')
            .replace(Regex("\\s+"), " ")
            .trim()
    }
}

fun proposalStatusVi(status: String?, locale: String = AppLocaleHolder.tag): String {
    val en = locale.equals("en", ignoreCase = true)
    return when (status?.uppercase()) {
        "DRAFT" -> if (en) "Draft" else "Nháp"
        "SUBMITTED", "PENDING" -> if (en) "Submitted" else "Đã gửi"
        "IN_REVIEW" -> if (en) "In review" else "Đang duyệt"
        "APPROVED" -> if (en) "Approved" else "Đã duyệt"
        "REJECTED" -> if (en) "Rejected" else "Từ chối"
        "DUPLICATE" -> if (en) "Duplicate" else "Trùng lặp"
        else -> status ?: "—"
    }
}

fun reportStatusVi(status: String?, locale: String = AppLocaleHolder.tag): String {
    val en = locale.equals("en", ignoreCase = true)
    return when (status?.uppercase()) {
        "OPEN" -> if (en) "Open" else "Đang mở"
        "RESOLVED" -> if (en) "Resolved" else "Đã xử lý"
        "DISMISSED" -> if (en) "Dismissed" else "Bỏ qua"
        "CLOSED" -> if (en) "Closed" else "Đã đóng"
        else -> status ?: "—"
    }
}

fun workspaceStatusVi(status: String?, locale: String = AppLocaleHolder.tag): String {
    val en = locale.equals("en", ignoreCase = true)
    return when (status?.uppercase()) {
        "DRAFT" -> if (en) "Draft" else "Nháp"
        "SUBMITTED", "IN_REVIEW", "PENDING" -> if (en) "Pending" else "Chờ duyệt"
        "PUBLISHED" -> if (en) "Published" else "Đã xuất bản"
        "REJECTED" -> if (en) "Rejected" else "Từ chối"
        "ARCHIVED" -> if (en) "Archived" else "Lưu trữ"
        else -> status ?: "—"
    }
}
