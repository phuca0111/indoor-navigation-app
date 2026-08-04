package com.khoaluan.indoornav.navigation.diagnostics

import android.content.Context
import android.util.Log
import java.io.BufferedWriter
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Ghi session xoay/hướng ra file JSONL để gửi phân tích (chat / luận văn).
 *
 * Cùng thư mục sensor_logs để dễ tìm trên MTP:
 * Android/data/<package>/files/sensor_logs/heading_YYYYMMDD_HHmmss.jsonl
 * Mỗi dòng = 1 mẫu heading fusion (+ gyro/mag trust).
 */
class HeadingMotionRecorder {

    private val enabled = AtomicBoolean(false)
    private var writer: BufferedWriter? = null
    private var file: File? = null
    private var sessionStartNs = 0L
    private var lineCount = 0
    private var lastSampleMs = 0L

    /** ~20 Hz khi xoay; đứng yên thưa hơn. */
    var minIntervalMs: Long = 50L

    val isRecording: Boolean get() = enabled.get()
    val currentFilePath: String? get() = file?.absolutePath
    val linesWritten: Int get() = lineCount

    fun start(context: Context, meta: Map<String, Any?> = emptyMap()): String? {
        stop()
        return try {
            // Cùng folder với SensorSessionLogger — MTP/File Explorer chỉ cần mở sensor_logs.
            val dir = File(context.getExternalFilesDir(null), "sensor_logs")
            if (!dir.exists() && !dir.mkdirs()) {
                Log.e(TAG, "mkdirs failed: ${dir.absolutePath}")
                return null
            }
            val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
            val out = File(dir, "heading_$stamp.jsonl")
            val bw = out.bufferedWriter()
            file = out
            writer = bw
            sessionStartNs = System.nanoTime()
            lineCount = 0
            lastSampleMs = 0L
            enabled.set(true)
            writeLine(
                SensorSessionLogger.buildObject(
                    "t" to 0,
                    "type" to "heading_session_start",
                    "wall_ms" to System.currentTimeMillis(),
                    "meta" to meta.filterValues { it != null },
                )
            )
            // Flush ngay để file xuất hiện trên MTP dù session còn chạy.
            bw.flush()
            Log.i(TAG, "Heading motion log started: ${out.absolutePath}")
            out.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "start failed", e)
            enabled.set(false)
            null
        }
    }

    fun sample(
        gyro: Float,
        magTrust: Float,
        magSeverity: String,
        deviceDeg: Float,
        mapDeg: Float,
        navDeg: Float,
        baseDeg: Float,
        calibDeg: Float,
        gridDeg: Float,
        x: Float? = null,
        y: Float? = null,
        force: Boolean = false,
    ) {
        if (!enabled.get()) return
        val now = System.currentTimeMillis()
        val interval = if (gyro >= 0.35f) minIntervalMs else minIntervalMs * 3
        if (!force && now - lastSampleMs < interval) return
        lastSampleMs = now
        val fields = LinkedHashMap<String, Any?>()
        fields["t"] = elapsedMs()
        fields["type"] = "heading"
        fields["gyro"] = gyro
        fields["trust"] = magTrust
        fields["mag"] = magSeverity
        fields["dev"] = deviceDeg
        fields["map"] = mapDeg
        fields["nav"] = navDeg
        fields["base"] = baseDeg
        fields["cal"] = calibDeg
        fields["grid"] = gridDeg
        if (x != null) fields["x"] = x
        if (y != null) fields["y"] = y
        writeLine(SensorSessionLogger.buildObject(fields))
    }

    fun markNote(note: String) {
        if (!enabled.get()) return
        writeLine(
            SensorSessionLogger.buildObject(
                "t" to elapsedMs(),
                "type" to "note",
                "text" to note,
            )
        )
    }

    fun stop(): String? {
        if (!enabled.getAndSet(false)) {
            closeQuietly()
            return file?.absolutePath
        }
        return try {
            writeLine(
                SensorSessionLogger.buildObject(
                    "t" to elapsedMs(),
                    "type" to "heading_session_end",
                    "lines" to (lineCount + 1),
                )
            )
            closeQuietly()
            val path = file?.absolutePath
            Log.i(TAG, "Heading motion log stopped: $path ($lineCount lines)")
            path
        } catch (e: Exception) {
            Log.e(TAG, "stop failed", e)
            closeQuietly()
            file?.absolutePath
        }
    }

    private fun elapsedMs(): Long =
        (System.nanoTime() - sessionStartNs) / 1_000_000L

    @Synchronized
    private fun writeLine(line: String) {
        val w = writer ?: return
        try {
            w.write(line)
            w.newLine()
            lineCount++
            if (lineCount % 20 == 0) w.flush()
        } catch (e: Exception) {
            Log.e(TAG, "write failed", e)
        }
    }

    private fun closeQuietly() {
        try {
            writer?.flush()
            writer?.close()
        } catch (_: Exception) {
        }
        writer = null
    }

    companion object {
        private const val TAG = "HeadingMotionRecorder"
    }
}
