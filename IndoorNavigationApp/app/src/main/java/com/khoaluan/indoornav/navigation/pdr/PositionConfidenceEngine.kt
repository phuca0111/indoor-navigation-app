package com.khoaluan.indoornav.navigation.pdr

import kotlin.math.max

/**
 * FILE: PositionConfidenceEngine.kt
 * MỤC ĐÍCH: Tính toán độ tin cậy của hệ thống định vị dựa trên sự trôi dạt (Drift)
 * của cảm biến quán tính (PDR) và thời gian trôi qua kể từ lần quét QR (Ground Truth) gần nhất.
 */
class PositionConfidenceEngine {

    private var lastGroundTruthTimeMs: Long = 0L

    // Ngưỡng thời gian (milliseconds) để đánh giá độ tin cậy
    companion object {
        const val TIME_HIGH_ACCURACY_LIMIT_MS = 3 * 60 * 1000L  // 3 phút đầu cực chuẩn
        const val TIME_MEDIUM_ACCURACY_LIMIT_MS = 10 * 60 * 1000L // Dưới 10 phút tạm ổn
        const val TIME_INVALID_LIMIT_MS = 30 * 60 * 1000L // 30 phút là hết hạn, bắt quét lại QR
        
        const val DRIFT_RATE_METERS_PER_MINUTE = 0.5f // Giả định sai số trôi 0.5 mét mỗi phút
    }

    /**
     * Cập nhật thời điểm nhận Ground Truth (từ việc quét mã QR)
     */
    fun updateGroundTruth(timestampMs: Long = System.currentTimeMillis()) {
        lastGroundTruthTimeMs = timestampMs
    }

    /**
     * Tính độ tin cậy hiện tại (%) dựa vào thời gian từ lần quét QR cuối cùng
     * @return Giá trị từ 0.0f (0%) đến 1.0f (100%)
     */
    fun calculateCurrentConfidence(): Float {
        if (lastGroundTruthTimeMs == 0L) return 0.0f // Chưa từng quét QR -> Tin cậy 0%

        val timeElapsedMs = System.currentTimeMillis() - lastGroundTruthTimeMs
        
        return when {
            timeElapsedMs <= TIME_HIGH_ACCURACY_LIMIT_MS -> {
                // Giảm nhẹ từ 100% xuống 85% trong 3 phút đầu
                val decay = (timeElapsedMs.toFloat() / TIME_HIGH_ACCURACY_LIMIT_MS) * 0.15f
                1.0f - decay
            }
            timeElapsedMs <= TIME_MEDIUM_ACCURACY_LIMIT_MS -> {
                // Giảm từ 85% xuống 60% từ phút thứ 3 đến phút thứ 10
                val progress = (timeElapsedMs - TIME_HIGH_ACCURACY_LIMIT_MS).toFloat() / 
                               (TIME_MEDIUM_ACCURACY_LIMIT_MS - TIME_HIGH_ACCURACY_LIMIT_MS)
                0.85f - (progress * 0.25f)
            }
            timeElapsedMs <= TIME_INVALID_LIMIT_MS -> {
                // Giảm từ 60% xuống 10% từ phút 10 đến phút 30
                val progress = (timeElapsedMs - TIME_MEDIUM_ACCURACY_LIMIT_MS).toFloat() / 
                               (TIME_INVALID_LIMIT_MS - TIME_MEDIUM_ACCURACY_LIMIT_MS)
                0.60f - (progress * 0.50f)
            }
            else -> 0.0f // Sau 30 phút, mất hoàn toàn độ tin cậy
        }
    }

    /**
     * Ước tính bán kính sai số (Drift Radius) tính bằng mét
     */
    fun estimateDriftRadiusMeters(): Float {
        if (lastGroundTruthTimeMs == 0L) return Float.MAX_VALUE

        val minutesElapsed = (System.currentTimeMillis() - lastGroundTruthTimeMs) / (60 * 1000f)
        return max(1.0f, minutesElapsed * DRIFT_RATE_METERS_PER_MINUTE)
    }

    /**
     * Kiểm tra xem hệ thống có cần buộc người dùng quét lại QR không (App Lifecycle Recovery)
     */
    fun needsRelocalization(): Boolean {
        if (lastGroundTruthTimeMs == 0L) return true
        val timeElapsedMs = System.currentTimeMillis() - lastGroundTruthTimeMs
        return timeElapsedMs > TIME_INVALID_LIMIT_MS
    }
}
