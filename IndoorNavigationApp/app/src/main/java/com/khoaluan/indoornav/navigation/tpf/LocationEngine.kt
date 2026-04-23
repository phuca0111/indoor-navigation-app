package com.khoaluan.indoornav.navigation.tpf

import android.content.Context
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.navigation.graph.GraphModel
import com.khoaluan.indoornav.navigation.pdr.HeadingEstimator
import com.khoaluan.indoornav.navigation.pdr.SensorCollector
import com.khoaluan.indoornav.navigation.pdr.StepDetector
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * FILE: LocationEngine.kt
 * MỤC ĐÍCH: Là "Bộ Tổng Tham Mưu" kết hợp toàn bộ Lớp 1 (PDR) và Lớp 2 (TPF).
 * Nó nhận dữ liệu thô, xử lý qua PDR để lấy từng bước di chuyển, 
 * sau đó bơm vào TPF để định vị 1D dọc hành lang. 
 * Nếu TPF phân tán quá mức (Confidence thấp), nó rơi tự do xuống dùng PDR thuần (Fallback).
 */
class LocationEngine(
    context: Context,
    mapData: MapData
) {
    // ── Nền tảng Đồ thị và Thuật toán ──
    private val graphModel = GraphModel(mapData)
    private val tpfEngine = TopologicalParticleFilter(graphModel)

    // ── Cảm biến Lớp 1 (PDR) ──
    private val sensorCollector = SensorCollector(context)
    private val stepDetector = StepDetector()
    private val headingEstimator = HeadingEstimator(alpha = 0.99f)

    // ── Trạng thái Điều hướng ──
    var isRunning = false
        private set

    // Tọa độ PDR thuần (dành cho Fallback và so sánh)
    private var pdrX = 0f
    private var pdrY = 0f
    private var hasRotationVectorFix = false

    // Scale từ pixel sang mét
    private val pixelsPerMeter = if (mapData.scaleRatio > 0.0) (40.0 / mapData.scaleRatio).toFloat() else 80f

    // ── Callback xuất dữ liệu ra Lớp 3 (UI) ──
    /**
     * x, y: Tọa độ pixel trên bản đồ
     * heading: Hướng (độ)
     * confidence: Mức độ tin cậy (0.0 -> 1.0)
     * isTpfActive: True nếu dùng TPF, False nếu fallback xuống PDR
     */
    var onLocationUpdated: ((x: Float, y: Float, heading: Float, confidence: Float, isTpfActive: Boolean) -> Unit)? = null

    init {
        setupSensors()
    }

    private fun setupSensors() {
        // Tích hợp hệ thống xoay siêu mượt của Google (Thay thế La bàn)
        sensorCollector.onRotationUpdate = { values, _ ->
            hasRotationVectorFix = true
            headingEstimator.updateRotationVector(values)
        }

        // Con quay hồi chuyển (Giữ làm phao cứu sinh Fallback nếu máy không hỗ trợ Hardware Game Rotation)
        sensorCollector.onGyroUpdate = { values, timestampNs ->
            if (!hasRotationVectorFix) {
                headingEstimator.updateGyro(values, timestampNs)
            }
        }

        // Gia tốc -> Đếm bước chân
        sensorCollector.onAccelUpdate = { values, timestampNs ->
            stepDetector.onAccelData(values[0], values[1], values[2])
        }

        // Cảm biến phần cứng chuyên đếm bước (Xử lý được tay đi tĩnh)
        sensorCollector.onStepSensorUpdate = {
            stepDetector.onHardwareStep()
        }

        // Callback khi có 1 bước chân thực sự xảy ra
        stepDetector.onStepDetected = { stepLengthMeters ->
            handleStep(stepLengthMeters)
        }
    }

    /** Bắt đầu khi người dùng Quét QR tại một điểm xuất phát */
    fun startWithQR(nodeId: String) {
        val node = graphModel.nodeMap[nodeId] ?: return
        pdrX = node.x.toFloat()
        pdrY = node.y.toFloat()
        hasRotationVectorFix = false
        
        tpfEngine.initializeAtNode(nodeId)
        
        sensorCollector.start()
        isRunning = true
        dispatchLocationUpdate()
    }

    /** Ngừng điều hướng */
    fun stop() {
        sensorCollector.stop()
        isRunning = false
        hasRotationVectorFix = false
    }

    private fun handleStep(stepLengthMeters: Float) {
        val currentHeadingDeg = headingEstimator.getHeading()
        val currentHeadingRad = Math.toRadians(currentHeadingDeg.toDouble()).toFloat()

        // 1. CẬP NHẬT LỚP 1 (PDR THUẦN TÚY)
        val stepLengthPx = stepLengthMeters * pixelsPerMeter
        // Chú ý hệ trục Y của Canvas ngược với toán học (Y hướng xuống)
        pdrX += stepLengthPx * kotlin.math.sin(currentHeadingRad)
        pdrY -= stepLengthPx * kotlin.math.cos(currentHeadingRad)

        // 2. CẬP NHẬT LỚP 2 (TPF ENGINE)
        tpfEngine.processStep(stepLengthMeters, currentHeadingRad)

        dispatchLocationUpdate()
    }

    /** Đưa dữ liệu tọa độ lên màn hình */
    private fun dispatchLocationUpdate() {
        val heading = headingEstimator.getHeading()
        val tpfLocation = tpfEngine.getEstimatedLocation()
        
        // Tính độ phân tán để ra Confidence Score (1.0 = hội tụ hoàn toàn, 0.0 = rời rạc)
        val confidence = calculateConfidence(tpfLocation)

        // Logic Fallback: Nếu độ tin cậy < 0.3 thì rớt xuống dùng PDR thuần
        val isTpfActive = confidence >= 0.3f && tpfLocation != null

        if (isTpfActive && tpfLocation != null) {
            onLocationUpdated?.invoke(tpfLocation.first, tpfLocation.second, heading, confidence, true)
            // Đồng bộ PDR theo TPF để tránh PDR trôi đi quá xa khi TPF vẫn đang tốt
            pdrX = tpfLocation.first
            pdrY = tpfLocation.second
        } else {
            onLocationUpdated?.invoke(pdrX, pdrY, heading, confidence, false)
        }
    }

    /** Hàm tính mức độ tin cậy của TPF dựa trên phương sai sai số của các hạt */
    private fun calculateConfidence(meanLocation: Pair<Float, Float>?): Float {
        if (meanLocation == null || tpfEngine.particles.isEmpty()) return 0f

        var varianceSum = 0f
        var validCount = 0
        for (p in tpfEngine.particles) {
            val edge = graphModel.edges.find { it.id == p.edgeId } ?: continue
            val px = edge.sourceX + p.progress * (edge.targetX - edge.sourceX)
            val py = edge.sourceY + p.progress * (edge.targetY - edge.sourceY)
            
            varianceSum += (px - meanLocation.first).pow(2) + (py - meanLocation.second).pow(2)
            validCount++
        }
        
        if (validCount == 0) return 0f
        
        val stdDevPx = sqrt(varianceSum / validCount)
        val stdDevMeters = stdDevPx / pixelsPerMeter
        
        // Nếu độ phân tán < 1 mét -> 100% tin cậy. 
        // Phân tán > 5 mét -> 0% tin cậy -> Rớt mạng
        val maxSpreadMeters = 5f
        val confidence = 1f - (stdDevMeters / maxSpreadMeters).coerceIn(0f, 1f)
        
        return confidence
    }
    
    // Getter để lấy particles cho Debug View
    fun getParticles() = tpfEngine.particles
}
