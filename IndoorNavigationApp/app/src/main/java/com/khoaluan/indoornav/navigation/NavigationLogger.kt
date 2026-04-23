package com.khoaluan.indoornav.navigation

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

/**
 * FILE: NavigationLogger.kt
 * MỤC ĐÍCH: Ghi log CSV toàn bộ sự kiện navigation để phân tích lỗi sau test
 * LƯU TẠI: /sdcard/Android/data/.../files/logs/session_<timestamp>.csv
 * CÁCH DÙNG: NavigationLogger.logStep(...), NavigationLogger.exportToFile(context)
 */
object NavigationLogger {

    private val entries = java.util.Collections.synchronizedList(mutableListOf<String>())
    private val sessionStart = System.currentTimeMillis()

    // Thống kê nhanh
    private var totalSteps = 0
    private var totalDistM = 0f

    // ── Các hàm ghi log ──────────────────────────────────────────────────────

    /** Ghi log chi tiết mỗi khi phát hiện 1 bước chân */
    fun logStepDetails(accelPeak: Float, accelValley: Float, threshold: Float, kWeinberg: Float, stepLength: Float) {
        totalSteps++
        totalDistM += stepLength
        entries.add("${ts()},STEP_DETAILED,${f(accelPeak)},${f(accelValley)},${f(threshold)},${f(kWeinberg)},${f(stepLength)},${f(totalDistM)}")
    }

    /** Ghi log con quay hồi chuyển độc lập */
    fun logGyro(gyroZWorld: Float, dt: Float, deltaHeading: Float) {
        entries.add("${ts()},GYRO_RAW,${f(gyroZWorld)},${f(dt)},${f(deltaHeading)}")
    }

    /** Ghi log quá trình trộn mượt (Fusion) của La bàn */
    fun logCompass(rawCompassDeg: Float, fusedHeading: Float, alpha: Float) {
        entries.add("${ts()},COMPASS_FUSION,${f(rawCompassDeg)},${f(fusedHeading)},${f(alpha)}")
    }

    /** Ghi log sau mỗi lần TPF cập nhật (mỗi bước chân) */
    fun logTPFUpdate(
        alive: Int, confidence: Float, spread: Float,
        edgeId: String, progress: Float, x: Float, y: Float
    ) {
        entries.add("${ts()},TPF_UPDATE,$alive,${f(confidence)},${f(spread)},$edgeId,${f(progress)},${f(x)},${f(y)}")
    }

    /** Ghi log khi hạt phân nhánh tại Node giao lộ */
    fun logBranch(nodeId: String, heading: Float, branches: Int, weights: String) {
        entries.add("${ts()},BRANCH,$nodeId,${f(heading)},$branches,$weights")
    }

    /** Ghi log sau mỗi lần Resample hạt */
    fun logResample(before: Int, after: Int, removed: Int, exploration: Int) {
        entries.add("${ts()},RESAMPLE,$before,$after,$removed,$exploration")
    }

    /** Ghi log khi quét QR — drift_before là khoảng cách lệch TRƯỚC khi reset (cm) */
    fun logQRScan(qrId: String, edgeId: String, progress: Float, x: Float, y: Float, driftCm: Float) {
        entries.add("${ts()},QR_SCAN,$qrId,$edgeId,${f(progress)},${f(x)},${f(y)},${f(driftCm)}")
    }

    /** Ghi log khi chuyển về PDR_ONLY do confidence thấp */
    fun logFallback(confidence: Float, reason: String, from: String, to: String) {
        entries.add("${ts()},FALLBACK,${f(confidence)},$reason,$from,$to")
    }

    /** Ghi log mỗi khi NavMode thay đổi */
    fun logModeChange(from: String, to: String, trigger: String) {
        entries.add("${ts()},MODE_CHANGE,$from,$to,$trigger")
    }

    // ── Xuất log ─────────────────────────────────────────────────────────────

    /**
     * Xuất toàn bộ log ra file CSV
     * @return đường dẫn tuyệt đối của file vừa tạo
     */
    fun exportToFile(context: Context): String {
        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val dir = File(context.getExternalFilesDir(null), "logs")
        dir.mkdirs()
        val file = File(dir, "session_$timestamp.csv")
        val header = "timestamp_ms,event_type,v1,v2,v3,v4,v5,v6,v7"
        val content = synchronized(entries) {
            entries.joinToString("\n")
        }
        file.writeText(header + "\n" + content)
        return file.absolutePath
    }

    /** Tóm tắt phiên test hiện tại */
    fun getSummary(): String {
        val copy = synchronized(entries) { entries.toList() }
        val fallbacks = copy.count { ",FALLBACK," in it }
        val branches  = copy.count { ",BRANCH,"  in it }
        val qrScans   = copy.count { ",QR_SCAN," in it }
        val duration  = (System.currentTimeMillis() - sessionStart) / 1000
        return buildString {
            appendLine("═══ Session Summary ═══")
            appendLine("Duration : ${duration}s")
            appendLine("Steps    : $totalSteps")
            appendLine("Distance : ${"%.2f".format(totalDistM)}m")
            appendLine("Events   : ${entries.size}")
            appendLine("Branches : $branches")
            appendLine("Fallbacks: $fallbacks")
            append("QR Scans : $qrScans")
        }
    }

    fun clear() {
        synchronized(entries) {
            entries.clear()
        }
        totalSteps = 0
        totalDistM = 0f
    }

    fun getCount() = entries.size

    // ── Helpers ───────────────────────────────────────────────────────────────
    private fun ts() = System.currentTimeMillis() - sessionStart
    private fun f(v: Float) = String.format(Locale.US, "%.4f", v)
}
