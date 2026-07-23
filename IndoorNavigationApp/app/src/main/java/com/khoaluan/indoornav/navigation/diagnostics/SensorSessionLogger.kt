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
 * Phase 0.0 — ghi sensor JSONL để Replay/Metrics sau này.
 * Không ảnh hưởng thuật toán định vị (chỉ ghi).
 *
 * File: Android/data/<pkg>/files/sensor_logs/session_<ts>.jsonl
 */
class SensorSessionLogger {

    private val enabled = AtomicBoolean(false)
    private var writer: BufferedWriter? = null
    private var file: File? = null
    private var sessionStartElapsedNs = 0L
    private val lastLogNsByType = HashMap<String, Long>()
    private var lineCount = 0

    /** Giới hạn tần số ghi cho sensor liên tục (~20Hz). STEP / event không giới hạn. */
    var minIntervalNs: Long = 50_000_000L

    val isEnabled: Boolean get() = enabled.get()
    val currentFilePath: String? get() = file?.absolutePath
    val linesWritten: Int get() = lineCount

    fun startSession(
        context: Context,
        meta: Map<String, Any?> = emptyMap()
    ): String? {
        stopSession()
        return try {
            val dir = File(context.getExternalFilesDir(null), "sensor_logs")
            dir.mkdirs()
            val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
            val out = File(dir, "session_$stamp.jsonl")
            val bw = out.bufferedWriter()
            file = out
            writer = bw
            sessionStartElapsedNs = System.nanoTime()
            lineCount = 0
            lastLogNsByType.clear()
            enabled.set(true)

            writeRaw(
                buildObject(
                    "t" to 0,
                    "type" to "session_start",
                    "wall_ms" to System.currentTimeMillis(),
                    "meta" to meta.filterValues { it != null }
                )
            )
            Log.i(TAG, "Sensor logging started: ${out.absolutePath}")
            out.absolutePath
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start sensor logging", e)
            enabled.set(false)
            null
        }
    }

    fun logSensor(type: String, values: FloatArray, timestampNs: Long, force: Boolean = false) {
        if (!enabled.get()) return
        if (!force && !shouldLog(type, timestampNs)) return
        writeRaw(
            formatSensorLine(
                tMs = elapsedMs(),
                type = type,
                sensorNs = timestampNs,
                values = values
            )
        )
    }

    fun logEvent(type: String, fields: Map<String, Any?> = emptyMap()) {
        if (!enabled.get()) return
        val all = LinkedHashMap<String, Any?>()
        all["t"] = elapsedMs()
        all["type"] = type
        fields.forEach { (k, v) -> if (v != null) all[k] = v }
        writeRaw(buildObject(all))
    }

    fun stopSession(): String? {
        if (!enabled.getAndSet(false)) {
            closeQuietly()
            return file?.absolutePath
        }
        return try {
            writeRaw(
                buildObject(
                    "t" to elapsedMs(),
                    "type" to "session_end",
                    "lines" to (lineCount + 1)
                )
            )
            closeQuietly()
            val path = file?.absolutePath
            Log.i(TAG, "Sensor logging stopped: $path ($lineCount lines)")
            path
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop sensor logging", e)
            closeQuietly()
            file?.absolutePath
        }
    }

    private fun shouldLog(type: String, timestampNs: Long): Boolean {
        val last = lastLogNsByType[type] ?: 0L
        if (timestampNs - last < minIntervalNs) return false
        lastLogNsByType[type] = timestampNs
        return true
    }

    private fun elapsedMs(): Long =
        (System.nanoTime() - sessionStartElapsedNs) / 1_000_000L

    @Synchronized
    private fun writeRaw(line: String) {
        val w = writer ?: return
        try {
            w.write(line)
            w.newLine()
            lineCount++
            if (lineCount % 50 == 0) w.flush()
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
        private const val TAG = "SensorSessionLogger"

        fun formatSensorLine(
            tMs: Long,
            type: String,
            sensorNs: Long,
            values: FloatArray
        ): String = buildObject(
            "t" to tMs,
            "type" to type,
            "sensor_ns" to sensorNs,
            "values" to values.toList()
        )

        fun buildObject(vararg pairs: Pair<String, Any?>): String =
            buildObject(pairs.toMap())

        fun buildObject(fields: Map<String, Any?>): String {
            val body = fields.entries.joinToString(",") { (k, v) ->
                "\"$k\":${jsonValue(v)}"
            }
            return "{$body}"
        }

        private fun jsonValue(v: Any?): String = when (v) {
            null -> "null"
            is Number -> if (v is Float || v is Double) {
                String.format(Locale.US, "%.6f", v.toDouble())
            } else {
                v.toString()
            }
            is Boolean -> v.toString()
            is FloatArray -> v.toList().let { jsonValue(it) }
            is Iterable<*> -> v.joinToString(prefix = "[", postfix = "]") { jsonValue(it) }
            is Map<*, *> -> {
                val inner = v.entries.joinToString(",") { (ik, iv) ->
                    "\"$ik\":${jsonValue(iv)}"
                }
                "{$inner}"
            }
            else -> "\"${v.toString().replace("\"", "\\\"")}\""
        }
    }
}
