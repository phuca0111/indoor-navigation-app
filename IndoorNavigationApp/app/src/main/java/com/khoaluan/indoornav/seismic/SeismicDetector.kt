package com.khoaluan.indoornav.seismic

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Kết quả vượt vòng loại on-device (band-pass + STA/LTA + sustain).
 */
data class SeismicTrigger(
    /** Peak biên độ đã lọc (m/s²). */
    val peakFilteredMs2: Float,
    /** Tỷ lệ STA/LTA lớn nhất trong đợt. */
    val maxStaLtaRatio: Float,
    /** Thời gian duy trì trên ngưỡng (ms). */
    val durationMs: Long,
    /** STA trung bình trong đợt. */
    val meanSta: Float,
)

/**
 * Hướng 1 — xử lý trên máy:
 * gravity → linear magnitude → band-pass 1–10 Hz → STA/LTA → duy trì ≥1.5s (loại spike).
 */
class SeismicDetector(
    private val staSec: Float = 0.8f,
    private val ltaSec: Float = 15f,
    /** Ngưỡng R = STA/LTA (thường 3–5). */
    private val ratioThreshold: Float = 3.5f,
    /** Biên độ lọc tối thiểu kèm tỷ lệ (tránh nhiễu số khi LTA ~0). */
    private val minFilteredMs2: Float = 0.12f,
    /** Spike sạc/va chạm thường <0.2s; sóng địa chấn cần duy trì lâu hơn. */
    private val sustainMs: Long = 1_600L,
    private val assumedFsHz: Float = 50f,
) {
    private val bandPass = BandPassFilter(lowCutoffHz = 1f, highCutoffHz = 10f)

    private var gravityX = 0f
    private var gravityY = 0f
    private var gravityZ = 9.81f
    private var gravityPrimed = false

    private var lastTsNs: Long = 0L

    private val staLen = (staSec * assumedFsHz).toInt().coerceAtLeast(8)
    private val ltaLen = (ltaSec * assumedFsHz).toInt().coerceAtLeast(staLen * 4)
    private val ring = FloatArray(ltaLen)
    /** Khi đầy: vị trí ghi tiếp = mẫu cũ nhất. */
    private var writeIdx = 0
    private var filled = 0
    private var staSum = 0.0
    private var ltaSum = 0.0

    private var aboveSinceMs = 0L
    private var peakFiltered = 0f
    private var peakRatio = 0f
    private var staAccum = 0.0
    private var staSamples = 0

    /**
     * Đưa mẫu accelerometer thô (m/s²).
     * @return [SeismicTrigger] khi kết thúc một đợt rung đạt chuẩn; ngược lại null.
     */
    fun onSample(
        x: Float,
        y: Float,
        z: Float,
        timestampNs: Long = System.nanoTime(),
        nowMs: Long = System.currentTimeMillis(),
    ): SeismicTrigger? {
        val dtSec = if (lastTsNs == 0L) {
            1f / assumedFsHz
        } else {
            ((timestampNs - lastTsNs).coerceAtLeast(1_000_000L) / 1_000_000_000f)
                .coerceIn(0.002f, 0.1f)
        }
        lastTsNs = timestampNs

        val linearMag = removeGravity(x, y, z)
        val filtered = abs(bandPass.process(linearMag, dtSec))
        val ratio = pushAndRatio(filtered)

        if (filled < ltaLen) return null

        val candidate = ratio >= ratioThreshold && filtered >= minFilteredMs2

        if (candidate) {
            if (aboveSinceMs == 0L) {
                aboveSinceMs = nowMs
                peakFiltered = filtered
                peakRatio = ratio
                staAccum = 0.0
                staSamples = 0
            } else {
                peakFiltered = maxOf(peakFiltered, filtered)
                peakRatio = maxOf(peakRatio, ratio)
            }
            staAccum += filtered
            staSamples += 1
            return null
        }

        if (aboveSinceMs != 0L) {
            val held = nowMs - aboveSinceMs
            val peak = peakFiltered
            val maxR = peakRatio
            val meanSta = if (staSamples > 0) (staAccum / staSamples).toFloat() else peak
            aboveSinceMs = 0L
            peakFiltered = 0f
            peakRatio = 0f
            staAccum = 0.0
            staSamples = 0

            if (held >= sustainMs && maxR >= ratioThreshold && peak >= minFilteredMs2) {
                return SeismicTrigger(
                    peakFilteredMs2 = peak,
                    maxStaLtaRatio = maxR,
                    durationMs = held,
                    meanSta = meanSta,
                )
            }
        }
        return null
    }

    private fun removeGravity(x: Float, y: Float, z: Float): Float {
        val alpha = if (gravityPrimed) 0.94f else 0.5f
        gravityX = alpha * gravityX + (1 - alpha) * x
        gravityY = alpha * gravityY + (1 - alpha) * y
        gravityZ = alpha * gravityZ + (1 - alpha) * z
        gravityPrimed = true
        val dx = x - gravityX
        val dy = y - gravityY
        val dz = z - gravityZ
        return sqrt(dx * dx + dy * dy + dz * dz)
    }

    /** @return R = STA / LTA */
    private fun pushAndRatio(amp: Float): Float {
        val a = amp.coerceAtLeast(0f)

        if (filled < ltaLen) {
            ring[filled] = a
            filled += 1

            val staN = minOf(filled, staLen)
            var sSta = 0.0
            val start = filled - staN
            for (i in start until filled) sSta += ring[i]
            var sLta = 0.0
            for (i in 0 until filled) sLta += ring[i]

            if (filled == ltaLen) {
                writeIdx = 0
                staSum = sSta
                ltaSum = sLta
            }

            val sta = (sSta / staN).toFloat()
            val lta = (sLta / filled).toFloat().coerceAtLeast(1e-4f)
            return sta / lta
        }

        // Đầy: writeIdx = cũ nhất
        val leavingLta = ring[writeIdx]
        val leavingSta = ring[(writeIdx - staLen + ltaLen) % ltaLen]

        ltaSum += a - leavingLta
        staSum += a - leavingSta
        if (staSum < 0) staSum = 0.0
        if (ltaSum < 0) ltaSum = 0.0

        ring[writeIdx] = a
        writeIdx = (writeIdx + 1) % ltaLen

        val sta = (staSum / staLen).toFloat()
        val lta = (ltaSum / ltaLen).toFloat().coerceAtLeast(1e-4f)
        return sta / lta
    }

    fun reset() {
        bandPass.reset()
        gravityX = 0f
        gravityY = 0f
        gravityZ = 9.81f
        gravityPrimed = false
        lastTsNs = 0L
        ring.fill(0f)
        writeIdx = 0
        filled = 0
        staSum = 0.0
        ltaSum = 0.0
        aboveSinceMs = 0L
        peakFiltered = 0f
        peakRatio = 0f
        staAccum = 0.0
        staSamples = 0
    }

    fun warmupRemainingSec(): Float {
        val left = (ltaLen - filled).coerceAtLeast(0)
        return left / assumedFsHz
    }
}
