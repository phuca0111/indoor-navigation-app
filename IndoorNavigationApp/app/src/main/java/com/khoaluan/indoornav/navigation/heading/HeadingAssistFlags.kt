package com.khoaluan.indoornav.navigation.heading

/**
 * Cờ thử nghiệm hiệu chỉnh hướng — tắt = hành vi “như cũ” (không GPS assist / không travel / HDE).
 *
 * Thử #2 (GPS course): đã tắt — GPS indoor/multipath dễ lệch ~60–90° so với la bàn key.
 * #1 (travel/HDE từ bước PDR): mặc định tắt — PDR tự tham chiếu, thực tế kém tin.
 */
object HeadingAssistFlags {
    /**
     * #2 — GPS course cập nhật calib Map Heading.
     * Tắt: mũi tên chỉ theo la bàn (RV/mag) − map_bearing_offset, không bị GPS indoor kéo lệch.
     */
    const val ENABLE_GPS_HEADING_ASSIST = false

    /** #1 — slew calib theo Δ bước PDR. Mặc định tắt (vô dụng khi không có GPS độc lập). */
    const val ENABLE_TRAVEL_HEADING_RECALIB = false

    /** #1 — HDE kéo 0/90/180/270. Mặc định tắt cùng travel. */
    const val ENABLE_LIGHT_HDE = false
}
