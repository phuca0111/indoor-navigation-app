package com.khoaluan.indoornav.navigation.heading

import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.PathNode
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Magnetic fingerprint thô theo ô map: học |B| (μT) khi mag ổn.
 *
 * Online: so |B| hiện tại với ô đang đứng → anomaly cao = từ trường lạ
 * (giảm tin la bàn dù accuracy Android còn “OK”).
 * Không nhảy vị trí theo fingerprint (tránh nhảy sai); chỉ hỗ trợ heading trust.
 */
class MagFingerprintMap(
    private val originX: Float,
    private val originY: Float,
    private val cellSizePx: Float,
    private val cols: Int,
    private val rows: Int,
    private val minSamplesToMatch: Int = 3,
    private val emaAlpha: Float = 0.25f,
) {
    private data class Cell(
        var magNormUt: Float = 0f,
        var sampleCount: Int = 0,
    )

    private val cells = Array(rows * cols) { Cell() }

    val filledCellCount: Int
        get() = cells.count { it.sampleCount > 0 }

    fun observe(x: Float, y: Float, bx: Float, by: Float, bz: Float) {
        val cell = cellAt(x, y) ?: return
        val norm = sqrt(bx * bx + by * by + bz * bz)
        if (norm < 5f || norm > 200f) return
        if (cell.sampleCount == 0) {
            cell.magNormUt = norm
        } else {
            cell.magNormUt += emaAlpha * (norm - cell.magNormUt)
        }
        cell.sampleCount = (cell.sampleCount + 1).coerceAtMost(10_000)
    }

    /**
     * 0 = khớp fingerprint ô; 1 = lệch mạnh / chưa survey.
     * Ô chưa đủ mẫu → 0 (không phạt).
     */
    fun anomalyScore(x: Float, y: Float, bx: Float, by: Float, bz: Float): Float {
        val cell = cellAt(x, y) ?: return 0f
        if (cell.sampleCount < minSamplesToMatch) return 0f
        val norm = sqrt(bx * bx + by * by + bz * bz)
        val err = abs(norm - cell.magNormUt)
        // |ΔB| ~12 μT → anomaly≈1
        return (err / 12f).coerceIn(0f, 1f)
    }

    fun sampleCountAt(x: Float, y: Float): Int = cellAt(x, y)?.sampleCount ?: 0

    fun expectedNormUt(x: Float, y: Float): Float? {
        val cell = cellAt(x, y) ?: return null
        if (cell.sampleCount < minSamplesToMatch) return null
        return cell.magNormUt
    }

    fun reset() {
        for (c in cells) {
            c.magNormUt = 0f
            c.sampleCount = 0
        }
    }

    private fun cellAt(x: Float, y: Float): Cell? {
        if (cols <= 0 || rows <= 0 || cellSizePx <= 0f) return null
        val c = floor((x - originX) / cellSizePx).toInt()
        val r = floor((y - originY) / cellSizePx).toInt()
        if (c !in 0 until cols || r !in 0 until rows) return null
        return cells[r * cols + c]
    }

    companion object {
        fun fromMapData(mapData: MapData, pixelsPerMeter: Float): MagFingerprintMap {
            val cell = MagHeadingCorrectionGrid.cellSizeForPixelsPerMeter(pixelsPerMeter)
            return fromNodes(mapData.nodes, cell)
        }

        fun fromNodes(nodes: List<PathNode>, cellSizePx: Float): MagFingerprintMap {
            if (nodes.isEmpty()) {
                return MagFingerprintMap(0f, 0f, cellSizePx.coerceAtLeast(1f), 1, 1)
            }
            var minX = Float.POSITIVE_INFINITY
            var minY = Float.POSITIVE_INFINITY
            var maxX = Float.NEGATIVE_INFINITY
            var maxY = Float.NEGATIVE_INFINITY
            for (n in nodes) {
                minX = min(minX, n.x.toFloat())
                minY = min(minY, n.y.toFloat())
                maxX = max(maxX, n.x.toFloat())
                maxY = max(maxY, n.y.toFloat())
            }
            val pad = cellSizePx
            minX -= pad
            minY -= pad
            maxX += pad
            maxY += pad
            val spanX = max(maxX - minX, cellSizePx)
            val spanY = max(maxY - minY, cellSizePx)
            val cols = max(1, kotlin.math.ceil(spanX / cellSizePx).toInt())
            val rows = max(1, kotlin.math.ceil(spanY / cellSizePx).toInt())
            return MagFingerprintMap(minX, minY, cellSizePx, cols, rows)
        }
    }
}
