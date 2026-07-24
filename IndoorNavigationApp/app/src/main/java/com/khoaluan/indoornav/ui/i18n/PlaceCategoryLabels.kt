package com.khoaluan.indoornav.ui.i18n

/**
 * Nhãn hiển thị danh mục Place theo locale (API vẫn dùng mall/school/…).
 */
object PlaceCategoryLabels {
    fun display(raw: String?, locale: String = AppLocaleHolder.tag): String {
        if (raw.isNullOrBlank()) return ""
        val en = locale.equals("en", ignoreCase = true)
        return when (raw.trim().lowercase()) {
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
