package com.khoaluan.indoornav.navigation.tpf

import com.khoaluan.indoornav.navigation.graph.GraphEdge
import com.khoaluan.indoornav.navigation.graph.GraphModel
import java.util.Random
import kotlin.math.*

/**
 * FILE: TopologicalParticleFilter.kt
 * MỤC ĐÍCH: Engine cốt lõi của Lớp 2. Chạy thuật toán lọc Hạt trên đồ thị.
 */
class TopologicalParticleFilter(
    private val graphModel: GraphModel,
    private val numParticles: Int = 60
) {
    var particles = mutableListOf<TopologicalParticle>()
        private set

    private val random = Random()
    private val edgeMap by lazy { graphModel.edges.associateBy { it.id } }

    /** Khởi tạo (Rải) 60 hạt ở xung quanh Node khi người dùng quét QR */
    fun initializeAtNode(nodeId: String) {
        particles.clear()
        // GraphModel đã loại các cạnh bị chặn bởi tường.
        val connectedEdges = graphModel.getEdgesFromNode(nodeId)
        if (connectedEdges.isEmpty()) return

        // Dải đều 60 hạt ngẫu nhiên ra các con đường nối với QR code
        for (i in 0 until numParticles) {
            val idx = random.nextInt(connectedEdges.size)
            val edge = connectedEdges[idx]
            // Luôn bắt đầu từ source (progress = 0)
            particles.add(TopologicalParticle(edge.id, 0.0f, 1.0f / numParticles))
        }
    }

    /** 
     * Gọi hàm này MỖI KHI PDR PHÁT HIỆN 1 BƯỚC CHÂN 
     * @param stepLengthM chiều dài bước chân từ Weinberg (mét)
     * @param userHeadingRad góc hướng ngực người dùng từ La bàn/Gyro (radian)
     */
    fun processStep(stepLengthM: Float, userHeadingRad: Float) {
        if (particles.isEmpty() || stepLengthM <= 0f) return

        // Mức độ tin cậy của PDR: ta rắc thêm % nhiễu (Gaussian) để đề phòng hạt bị dính cục
        val noiseStdDevM = stepLengthM * 0.15f  // Bước 1m thì nhiễu 0.15m
        var totalWeight = 0f

        // BƯỚC 1 & 2: TIẾN HẠT (PREDICT) & CHẤM ĐIỂM (UPDATE WEIGHT)
        for (p in particles) {
            // Noise động học (Prediction model)
            val noisyStep = max(0.01f, stepLengthM + (random.nextGaussian() * noiseStdDevM).toFloat())
            
            // Xê dịch hạt trên hành lang
            moveParticle(p, noisyStep, userHeadingRad + (random.nextGaussian() * 0.2f).toFloat())

            // Cập nhật sinh tồn: "Hạt này có đang đi dọc theo đường mà người dùng đang hướng tới không?"
            val edge = edgeMap[p.edgeId]
            if (edge != null) {
                // Hành lang có 2 hướng đi (vd: 0 độ và 180 độ)
                var angle1 = edge.angleRad
                var angle2 = edge.reverseAngleRad

                // Tìm hướng gần nhất với la bàn của người dùng
                val diff1 = shortestAngleDeltaRad(userHeadingRad, angle1)
                val diff2 = shortestAngleDeltaRad(userHeadingRad, angle2)
                val diff = min(abs(diff1), abs(diff2))

                // Gaussian function: Lệch 0 độ -> 100 điểm, Lệch 90 độ -> Điểm cùi tự hủy
                val sigma = 0.785f // StdDev góc ~ 45 độ
                p.weight = exp(-(diff * diff) / (2 * sigma * sigma))
            } else {
                p.weight = 0f
            }
            totalWeight += p.weight
        }

        // BƯỚC 3: RESAMPLE (CHỌN LỌC TỰ NHIÊN)
        resample(totalWeight)
    }

    /** 
     * Tiến hạt tới trước dọc theo Graph 1 chiều. Nếu trúng ngã ba sẽ rẽ đại (sau đó sẽ bị Resample trừng phạt nếu rẽ sai)
     */
    private fun moveParticle(p: TopologicalParticle, distanceM: Float, userHeadingRad: Float) {
        var remainingDist = distanceM
        var jumps = 0 // chống vô cực
        
        while (remainingDist > 0 && jumps < 5) {
            val edge = edgeMap[p.edgeId] ?: break
            
            // Do GraphEdge đã là cạnh có hướng từ source -> target
            val diffForward = abs(shortestAngleDeltaRad(userHeadingRad, edge.angleRad))
            val diffBackward = abs(shortestAngleDeltaRad(userHeadingRad, edge.reverseAngleRad))
            
            val movingForward = diffForward < diffBackward
            val deltaProgress = remainingDist / edge.distanceMeters
            
            if (movingForward) {
                if (p.progress + deltaProgress <= 1.0f) {
                    p.progress += deltaProgress
                    remainingDist = 0f
                } else {
                    remainingDist -= (1.0f - p.progress) * edge.distanceMeters
                    p.progress = 1.0f
                    // ĐỤNG NGÃ 3 (Target Node)
                    val nextEdge = selectRandomNextEdge(edge.targetNodeId, edge.id)
                    if (nextEdge == null) { remainingDist = 0f } else {
                        // GraphEdge mới luôn xuất phát từ targetNodeId
                        p.edgeId = nextEdge.id
                        p.progress = 0.0f
                    }
                }
            } else {
                if (p.progress - deltaProgress >= 0.0f) {
                    p.progress -= deltaProgress
                    remainingDist = 0f
                } else {
                    remainingDist -= p.progress * edge.distanceMeters
                    p.progress = 0.0f
                    // ĐỤNG NGÃ 3 (Source Node) - Lùi về điểm bắt đầu
                    val nextEdge = selectRandomNextEdge(edge.sourceNodeId, edge.id)
                    if (nextEdge == null) { remainingDist = 0f } else {
                        p.edgeId = nextEdge.id
                        p.progress = 0.0f
                    }
                }
            }
            jumps++
        }
    }

    /** Nếu đứng giữa ngã 3 (Node), chọn đại 1 hành lang để rẽ vào */
    private fun selectRandomNextEdge(nodeId: String, currentEdgeId: String): GraphEdge? {
        // Chỉ lấy cạnh hợp lệ đã qua kiểm tra wall constraints
        val connected = graphModel.getEdgesFromNode(nodeId).filter { it.id != currentEdgeId }
        // Tránh tình trạng hạt bị quay ngoắt 180 độ ngay lập tức do chọn lại cạnh ngược hướng (trừ khi ngõ cụt)
        // Nếu không có cạnh nào khác, nó tự dừng
        if (connected.isEmpty()) return null
        return connected[random.nextInt(connected.size)]
    }

    /** Bánh xe Roulette: Nhân bản hạt sống khỏe, Tiêu hủy hạt lệch hướng */
    private fun resample(totalWeight: Float) {
        if (totalWeight <= 0f) {
            // Lỗi kỹ thuật ngẫu nhiên: Reset đồng đều không trừng phạt
            for (p in particles) p.weight = 1f / numParticles
            return
        }

        for (p in particles) p.weight /= totalWeight // Chuẩn hóa tổng = 1.0

        val newParticles = mutableListOf<TopologicalParticle>()
        val step = 1.0f / numParticles
        var r = random.nextFloat() * step
        var c = particles[0].weight
        var i = 0

        // Thuật toán Rút Mẫu Hệ Thống (Systematic Resampling) -> Tránh hao mòn CPU
        for (m in 0 until numParticles) {
            val u = r + m * step
            while (u > c && i < numParticles - 1) {
                i++
                c += particles[i].weight
            }
            newParticles.add(particles[i].clone())
        }
        
        particles = newParticles
        for (p in particles) p.weight = 1f / numParticles
    }

    private fun shortestAngleDeltaRad(a: Float, b: Float): Float {
        var delta = (b - a) % (2 * PI).toFloat()
        if (delta > PI) delta -= (2 * PI).toFloat()
        if (delta < -PI) delta += (2 * PI).toFloat()
        return delta
    }
    
    /** Tính toán vị trí tịnh tiến trung bình (Mean) của 60 hạt -> Đây là vị trí người dùng */
    fun getEstimatedLocation(): Pair<Float, Float>? {
        if (particles.isEmpty()) return null
        var sumX = 0f
        var sumY = 0f
        var validParticles = 0
        
        for (p in particles) {
            val edge = edgeMap[p.edgeId] ?: continue
            sumX += edge.sourceX + p.progress * (edge.targetX - edge.sourceX)
            sumY += edge.sourceY + p.progress * (edge.targetY - edge.sourceY)
            validParticles++
        }
        if (validParticles == 0) return null
        return Pair(sumX / validParticles, sumY / validParticles)
    }

    /**
     * Tìm cạnh (Edge) chiếm ưu thế nhất (nơi đa số các hạt đang ở đó)
     * Dùng cho thuật toán Corridor Bias (nắn hướng theo hành lang)
     */
    fun getDominantEdge(): GraphEdge? {
        if (particles.isEmpty()) return null
        
        // Đếm số hạt trên mỗi cạnh
        val counts = particles.groupBy { it.edgeId }.mapValues { it.value.size }
        val dominantEdgeId = counts.maxByOrNull { it.value }?.key ?: return null
        
        return edgeMap[dominantEdgeId]
    }
}
