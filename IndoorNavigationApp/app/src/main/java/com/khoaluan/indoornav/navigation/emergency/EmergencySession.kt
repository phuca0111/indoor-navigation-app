package com.khoaluan.indoornav.navigation.emergency

/**
 * Phiên khẩn cấp trên client — overlay cảnh báo + chế độ sơ tán.
 * Lưu ý nền tảng: không “cướp OS”; dùng full-screen in-app + (sau này) full-screen intent / FCM.
 */
enum class EmergencyPhase {
    /** Màn hình cảnh báo full-bleed — chưa chỉ đường. */
    ALERT,
    /** Chưa chắc tầng đang đứng — hỏi user chọn tầng trước khi sơ tán. */
    AWAITING_FLOOR,
    /** Chờ chọn vị trí đứng (chạm map / QR) rồi mới chỉ đường thoát hiểm. */
    AWAITING_LOCATION,
    /** Đang chỉ đường tới lối thoát / điểm an toàn. */
    EVACUATING,
}

/** Polygon vùng nguy hiểm (toạ độ map) để vẽ overlay + chặn path. */
data class HazardZoneDraw(
    val id: String = "",
    val hazardType: String = "OTHER",
    val name: String = "",
    val floorNumber: Int? = null,
    val points: List<Pair<Float, Float>> = emptyList(),
)

data class EmergencySession(
    val active: Boolean = false,
    val phase: EmergencyPhase = EmergencyPhase.ALERT,
    val incidentType: String = "FIRE",
    val title: String = "",
    val body: String = "",
    val buildingId: String? = null,
    val incidentId: String? = null,
    val targetLabel: String? = null,
    val needsQr: Boolean = false,
    val error: String? = null,
    /** User đã xác nhận tầng (hoặc app chắc nhờ QR/chạm map trên đúng tầng). */
    val floorConfirmed: Boolean = false,
    /** Tầng có EXIT khi tầng hiện tại không sơ tán được — dùng nút 「Xuống tầng lối thoát」. */
    val suggestedExitFloor: Int? = null,
    val blockedNodeIds: Set<String> = emptySet(),
    val blockedEdgeKeys: Set<String> = emptySet(),
    val hazardZones: List<HazardZoneDraw> = emptyList(),
) {
    companion object {
        fun headlineForType(type: String): String = when (type.uppercase()) {
            "FIRE" -> "CHÁY NỔ"
            "EARTHQUAKE" -> "ĐỘNG ĐẤT"
            "FLOOD" -> "NGẬP LỤT"
            "GAS" -> "RÒ KHÍ ĐỘC"
            else -> "CẢNH BÁO KHẨN CẤP"
        }

        fun bodyForType(type: String): String = when (type.uppercase()) {
            "FIRE" ->
                "Nguy hiểm cháy nổ. Giữ bình tĩnh, không dùng thang máy. " +
                    "Hệ thống sẽ chỉ đường tới lối thoát hiểm an toàn, tránh vùng nguy hiểm."
            "EARTHQUAKE" ->
                "Động đất / rung chấn. Tránh vật dễ đổ, tìm lối thoát hoặc điểm tập trung an toàn."
            "FLOOD" ->
                "Nguy cơ ngập lụt. Di chuyển theo lộ trình sơ tán, ưu tiên lối thoát cao / an toàn."
            "GAS" ->
                "Phát hiện rò khí. Không tạo tia lửa, không dùng thang máy. Ra ngoài theo lối thoát gần nhất."
            else ->
                "Sự cố khẩn cấp tại công trình. Làm theo hướng dẫn sơ tán trên ứng dụng."
        }

        fun defaultTitle(type: String, custom: String?): String {
            val c = custom?.trim().orEmpty()
            return if (c.isNotEmpty()) c else headlineForType(type)
        }
    }
}

/**
 * Sự cố ACTIVE tại tòa đang mở — giữ sau khi user bấm Đóng
 * để hiện banner “Chỉ đường thoát hiểm” lại.
 */
data class BuildingActiveEmergency(
    val incidentId: String,
    val incidentType: String = "FIRE",
    val title: String = "",
    val body: String = "",
    val buildingId: String,
)
