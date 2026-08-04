package com.khoaluan.indoornav.navigation.heading

import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.PathNode
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Một ô đã có mẫu trong lưới hiệu chỉnh hướng. */
data class MagGridCellSnapshot(
    val col: Int,
    val row: Int,
    val deltaDeg: Float,
    val sampleCount: Int,
    val centerX: Float,
    val centerY: Float,
)

/**
 * Lưới hiệu chỉnh hướng la bàn theo tọa độ map (Δ° / ô).
 *
 * Học khi mag ổn: so device heading với hướng chuẩn cạnh graph.
 * sample(x,y) → 0 nếu ô chưa đủ mẫu.
 */
class MagHeadingCorrectionGrid(
    private val originX: Float,
    private val originY: Float,
    private val cellSizePx: Float,
    private val cols: Int,
    private val rows: Int,
    private val minSamplesToApply: Int = 4,
    private val emaAlpha: Float = 0.2f,
    private val maxAbsDeltaDeg: Float = 30f,
) {
    private data class Cell(var deltaDeg: Float = 0f, var sampleCount: Int = 0)

    private val cells = Array(rows * cols) { Cell() }

    val cellCount: Int get() = cells.size
    val gridCols: Int get() = cols
    val gridRows: Int get() = rows
    val gridCellSizePx: Float get() = cellSizePx

    fun sample(x: Float, y: Float): Float {
        val cell = cellAt(x, y) ?: return 0f
        if (cell.sampleCount < minSamplesToApply) return 0f
        return cell.deltaDeg
    }

    fun sampleCountAt(x: Float, y: Float): Int = cellAt(x, y)?.sampleCount ?: 0

    /**
     * Ghi nhận lệch cục bộ tại (x,y).
     * [deltaDeg] thường từ [HeadingReferenceFrame.localGridDelta].
     */
    fun observe(x: Float, y: Float, deltaDeg: Float) {
        val cell = cellAt(x, y) ?: return
        var d = MapHeadingMath.normalizeDegrees(deltaDeg)
        // Kẹp bias cục bộ — tránh ô lưu ±70° như session heading_20260802_193937
        if (kotlin.math.abs(d) > maxAbsDeltaDeg) {
            d = if (d >= 0f) maxAbsDeltaDeg else -maxAbsDeltaDeg
        }
        if (cell.sampleCount == 0) {
            cell.deltaDeg = d
        } else {
            val err = MapHeadingMath.shortestDeltaDegrees(cell.deltaDeg, d)
            cell.deltaDeg = MapHeadingMath.normalizeDegrees(cell.deltaDeg + emaAlpha * err)
            if (kotlin.math.abs(cell.deltaDeg) > maxAbsDeltaDeg) {
                cell.deltaDeg = if (cell.deltaDeg >= 0f) maxAbsDeltaDeg else -maxAbsDeltaDeg
            }
        }
        cell.sampleCount = (cell.sampleCount + 1).coerceAtMost(10_000)
    }

    fun reset() {
        for (c in cells) {
            c.deltaDeg = 0f
            c.sampleCount = 0
        }
    }

    /** Các ô đã học (≥1 mẫu), sắp |Δ| giảm dần — để debug / xem ma trận. */
    fun snapshotFilledCells(): List<MagGridCellSnapshot> {
        val out = ArrayList<MagGridCellSnapshot>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val cell = cells[r * cols + c]
                if (cell.sampleCount <= 0) continue
                out.add(
                    MagGridCellSnapshot(
                        col = c,
                        row = r,
                        deltaDeg = cell.deltaDeg,
                        sampleCount = cell.sampleCount,
                        centerX = originX + (c + 0.5f) * cellSizePx,
                        centerY = originY + (r + 0.5f) * cellSizePx,
                    )
                )
            }
        }
        return out.sortedByDescending { abs(it.deltaDeg) }
    }

    /**
     * Chuỗi xem nhanh ma trận (ô đã học).
     * Ví dụ: `lưới 8x6 cs=120 | ô(2,1)=+68° n=5 | ô(3,1)=+71° n=3`
     */
    fun debugMatrixSummary(maxCells: Int = 12): String {
        val filled = snapshotFilledCells()
        val header = "lưới ${cols}x${rows} cs=${cellSizePx.roundToInt()}px filled=${filled.size}"
        if (filled.isEmpty()) return "$header | (trống — chưa học)"
        val parts = filled.take(maxCells).joinToString(" | ") { cell ->
            val sign = if (cell.deltaDeg >= 0f) "+" else ""
            "ô(${cell.col},${cell.row})=${sign}${cell.deltaDeg.roundToInt()}° n=${cell.sampleCount}"
        }
        val more = if (filled.size > maxCells) " | …+${filled.size - maxCells}" else ""
        return "$header | $parts$more"
    }

    private fun cellAt(x: Float, y: Float): Cell? {
        if (cols <= 0 || rows <= 0 || cellSizePx <= 0f) return null
        val c = floor((x - originX) / cellSizePx).toInt()
        val r = floor((y - originY) / cellSizePx).toInt()
        if (c !in 0 until cols || r !in 0 until rows) return null
        return cells[r * cols + c]
    }

    companion object {
        /** ~2.5 m / ô, kẹp kích thước px hợp lý. */
        fun cellSizeForPixelsPerMeter(pixelsPerMeter: Float): Float =
            (2.5f * pixelsPerMeter).coerceIn(48f, 220f)

        fun fromMapData(mapData: MapData, pixelsPerMeter: Float): MagHeadingCorrectionGrid {
            val cell = cellSizeForPixelsPerMeter(pixelsPerMeter)
            return fromNodes(mapData.nodes, cell)
        }

        fun fromNodes(nodes: List<PathNode>, cellSizePx: Float): MagHeadingCorrectionGrid {
            if (nodes.isEmpty()) {
                return MagHeadingCorrectionGrid(
                    originX = 0f,
                    originY = 0f,
                    cellSizePx = cellSizePx.coerceAtLeast(1f),
                    cols = 1,
                    rows = 1,
                )
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
            return MagHeadingCorrectionGrid(
                originX = minX,
                originY = minY,
                cellSizePx = cellSizePx,
                cols = cols,
                rows = rows,
            )
        }

        fun create(
            originX: Float,
            originY: Float,
            widthPx: Float,
            heightPx: Float,
            cellSizePx: Float,
            minSamplesToApply: Int = 2,
        ): MagHeadingCorrectionGrid {
            val cs = cellSizePx.coerceAtLeast(1f)
            val cols = max(1, kotlin.math.ceil(widthPx / cs).toInt())
            val rows = max(1, kotlin.math.ceil(heightPx / cs).toInt())
            return MagHeadingCorrectionGrid(
                originX = originX,
                originY = originY,
                cellSizePx = cs,
                cols = cols,
                rows = rows,
                minSamplesToApply = minSamplesToApply,
            )
        }
    }
}
