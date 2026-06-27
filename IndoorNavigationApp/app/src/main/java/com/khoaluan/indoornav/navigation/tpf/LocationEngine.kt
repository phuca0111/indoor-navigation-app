package com.khoaluan.indoornav.navigation.tpf







import android.content.Context
import android.util.Log



import com.khoaluan.indoornav.data.model.MapData



import com.khoaluan.indoornav.navigation.graph.GraphEdge



import com.khoaluan.indoornav.navigation.graph.GraphModel



import com.khoaluan.indoornav.navigation.pdr.MotionState



import com.khoaluan.indoornav.navigation.pdr.RealtimeMotionEstimator



import com.khoaluan.indoornav.navigation.pdr.RotationEngine



import com.khoaluan.indoornav.navigation.pdr.SensorCollector



import com.khoaluan.indoornav.navigation.pdr.StepDetector



import kotlin.math.pow



import kotlin.math.sqrt
import kotlin.math.abs







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







    // Issue 19: O(1) edge lookup thay vì O(E) linear search



    private val edgeMap: Map<String, GraphEdge> = graphModel.edges.associateBy { it.id }







    // Issue 18: Spatial grid index để giảm edges duyệt trong applySnapToEdge()



    // Cell size 100px, map chia thành grid. Mỗi cell lưu list edges đi qua.



    private val edgeGrid: Map<Pair<Int, Int>, List<GraphEdge>> = buildEdgeGrid(graphModel.edges, cellSizePx = 100f)







    private fun buildEdgeGrid(edges: List<GraphEdge>, cellSizePx: Float): Map<Pair<Int, Int>, List<GraphEdge>> {



        val grid = mutableMapOf<Pair<Int, Int>, MutableList<GraphEdge>>()



        for (edge in edges) {



            val minX = minOf(edge.sourceX, edge.targetX)



            val maxX = maxOf(edge.sourceX, edge.targetX)



            val minY = minOf(edge.sourceY, edge.targetY)



            val maxY = maxOf(edge.sourceY, edge.targetY)



            val startCellX = (minX / cellSizePx).toInt()



            val endCellX = (maxX / cellSizePx).toInt()



            val startCellY = (minY / cellSizePx).toInt()



            val endCellY = (maxY / cellSizePx).toInt()



            for (cx in startCellX..endCellX) {



                for (cy in startCellY..endCellY) {



                    grid.getOrPut(Pair(cx, cy)) { mutableListOf() }.add(edge)



                }



            }



        }



        return grid



    }







    private val tpfEngine = TopologicalParticleFilter(graphModel)







    // ── Cảm biến Lớp 1 (PDR) ──



    private val sensorCollector = SensorCollector(context)



    private val stepDetector = StepDetector()



    private val rotationEngine = RotationEngine()



    private val realtimeMotionEstimator = RealtimeMotionEstimator()







    // ── Trạng thái Điều hướng ──



    var isRunning = false



        private set







    // Tọa độ PDR và Continuous Prediction



    private var pdrX = 0f



    private var pdrY = 0f



    private var hasRotationVectorFix = false



    private var lastUpdateTimeNs = 0L







    // Issue 23: Lưu step length gần nhất để tính micro-step tỷ lệ



    private var lastStepLengthMeters = 0.5f // default 0.5m







    // Scale từ pixel sang mét



    private val pixelsPerMeter = if (mapData.scaleRatio > 0.0) (40.0 / mapData.scaleRatio).toFloat() else 80f

private var lastDispatchedHeading: Float? = null
private var headingChangeRelaxUntilMs: Long = 0L
private val HEADING_CHANGE_ANGLE_DEG = 45f
private val HEADING_CHANGE_RELAX_MS = 3000L









    // ── Callback xuất dữ liệu ra Lớp 3 (UI) ──



    /**



     * x, y: Tọa độ pixel trên bản đồ



     * heading: Hướng (độ)



     * confidence: Mức độ tin cậy (0.0 -> 1.0)



     * isTpfActive: True nếu dùng TPF, False nếu fallback xuống PDR



     */



    var onLocationUpdated: ((x: Float, y: Float, heading: Float, confidence: Float, isTpfActive: Boolean) -> Unit)? = null



    var onStepEvent: ((stepLengthMeters: Float, totalSteps: Int, totalDistance: Float) -> Unit)? = null







    init {



        setupSensors()



    }







    private fun setupSensors() {



        // Tích hợp Linear Acceleration cho RealtimeMotionEstimator



        sensorCollector.onLinearAccelUpdate = { values, _ ->



            val triggeredMicroStep = realtimeMotionEstimator.processLinearAcceleration(values[0], values[1], values[2])







            // Tối ưu hóa CPU & Pin: Giảm tần số cảm biến nếu đứng yên



            sensorCollector.setDynamicRate(realtimeMotionEstimator.isMoving)







            if (triggeredMicroStep && isRunning) {



                val currentHeadingRad = Math.toRadians(rotationEngine.smoothHeading.value.toDouble()).toFloat()



                // Issue 23: Dùng micro-step length tỷ lệ với step length thực (lastStepLengthMeters)



                // Thay vì giá trị cố định 0.4m, dùng 40% của bước chân thực để scale theo map



                // FIX: Đảm bảo micro-step ≥ 0.2m để tránh particles di chuyển quá ít (noise)



                val microStepLength = maxOf(lastStepLengthMeters * 0.4f, 0.2f)



                tpfEngine.processStep(microStepLength, currentHeadingRad)



            }



        }







        // Tích hợp hệ thống xoay siêu mượt của Google và Continuous Prediction



        sensorCollector.onRotationUpdate = { values, timestampNs ->



            hasRotationVectorFix = true



            rotationEngine.updateRotationVector(values)



            



            if (isRunning) {



                // Nội suy vị trí liên tục (Continuous Prediction) ở ~50Hz



                if (lastUpdateTimeNs > 0L) {



                    val dt = (timestampNs - lastUpdateTimeNs) / 1_000_000_000f



                    // Nếu đang đi bộ (ngay cả khi đi rất êm - micro step) và dt hợp lý



                    if (dt in 0.001f..0.1f && realtimeMotionEstimator.isMoving) {



                        val currentHeadingRad = Math.toRadians(rotationEngine.smoothHeading.value.toDouble()).toFloat()



                        



                        // 1. CONTINUOUS PREDICTION



                        // PDR chỉ tự cộng dồn khi TPF KHÔNG chạy (fallback mode)



                        // Nếu TPF đang active, vị trí sẽ do dispatchLocationUpdate() quyết định



                        val isTpfActive = calculateConfidence(tpfEngine.getEstimatedLocation()) >= 0.3f



                        



                        if (!isTpfActive) {



                            val ds = realtimeMotionEstimator.pseudoVelocity * dt



                            val dsPx = ds * pixelsPerMeter



                            pdrX += dsPx * kotlin.math.sin(currentHeadingRad)



                            pdrY -= dsPx * kotlin.math.cos(currentHeadingRad)



                            // Snap-to-edge chỉ áp dụng ở PDR fallback mode



                            applySnapToEdge(rotationEngine.smoothHeading.value)



                        }



                    }



                }



                lastUpdateTimeNs = timestampNs



                dispatchLocationUpdate()



            }



        }







        // Con quay hồi chuyển (Giữ làm phao cứu sinh Fallback nếu máy không hỗ trợ Hardware Game Rotation)



        sensorCollector.onGyroUpdate = { values, timestampNs ->



            if (!hasRotationVectorFix) {



                rotationEngine.updateGyro(values, timestampNs)



                // WHY: Fallback gyro-only cũng phải cập nhật heading realtime



                // để bản đồ/la bàn xoay theo điện thoại kể cả khi chưa bước.



                if (isRunning) {



                    dispatchLocationUpdate()



                }



            } else {



                // Vẫn cập nhật Gyro cho RotationEngine để tính Adaptive Alpha (Độ mượt biến thiên)



                rotationEngine.updateGyro(values, timestampNs)



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







    // Bat dau dinh vi khi quet QR: khoi tao TPF tai nodeId



    // Tra ve true neu nodeId ton tai va khoi dong thanh cong



    // Tra ve false neu nodeId khong ton tai trong do thi



    fun startWithQR(nodeId: String): Boolean {



        val node = graphModel.nodeMap[nodeId]



        if (node == null) {



            // Node khong ton tai: khong the khoi dong dinh vi



            // Tra ve false de UI bao loi cho user



            return false



        }



        pdrX = node.x.toFloat()



        pdrY = node.y.toFloat()



        hasRotationVectorFix = false







        tpfEngine.initializeAtNode(nodeId)







        sensorCollector.start()



        isRunning = true



        dispatchLocationUpdate()



        return true



    }







    /** Bắt đầu khi có toạ độ x, y (Fallback khi map chưa vẽ đồ thị) */



    fun startWithPosition(x: Float, y: Float) {



        pdrX = x



        pdrY = y



        hasRotationVectorFix = false



        



        tpfEngine.particles.clear() // Không chạy TPF được vì không có node



        



        sensorCollector.start()



        isRunning = true



        dispatchLocationUpdate()



    }







    /** Ngừng điều hướng */



    fun stop() {



        sensorCollector.stop()



        isRunning = false



        hasRotationVectorFix = false



        rotationEngine.reset()



    }







    private fun handleStep(stepLengthMeters: Float) {



        val currentHeadingDeg = rotationEngine.smoothHeading.value



        val currentHeadingRad = Math.toRadians(currentHeadingDeg.toDouble()).toFloat()







        // Issue 23: Lưu step length để dùng cho micro-step (scale theo map)



        lastStepLengthMeters = stepLengthMeters







        // Bước chân thực sự



        tpfEngine.processStep(stepLengthMeters, currentHeadingRad)







        onStepEvent?.invoke(stepLengthMeters, stepDetector.stepCount, stepDetector.totalDistanceM)







        // Không cần gọi dispatchLocationUpdate ở đây vì onRotationUpdate gọi liên tục rồi



    }







    /** Đưa dữ liệu tọa độ lên màn hình */



    private fun dispatchLocationUpdate() {



        val heading = rotationEngine.smoothHeading.value

 // FIX 4: Detect heading change to relax off-route during turns
 val headingDelta = lastDispatchedHeading?.let { prev ->
 val diff = kotlin.math.abs(heading - prev)
 if (diff > 180f) 360f - diff else diff
 } ?: 0f
 if (headingDelta > HEADING_CHANGE_ANGLE_DEG) {
 headingChangeRelaxUntilMs = System.currentTimeMillis() + HEADING_CHANGE_RELAX_MS
 Log.d("LocationEngine", "Heading change: " + "%.1f".format(headingDelta) + "deg, relax until " + headingChangeRelaxUntilMs)
 }
 lastDispatchedHeading = heading



        val tpfLocation = tpfEngine.getEstimatedLocation()



        



        // Tính độ phân tán để ra Confidence Score (1.0 = hội tụ hoàn toàn, 0.0 = rời rạc)



        val confidence = calculateConfidence(tpfLocation)







        // Logic Fallback: Nếu độ tin cậy < 0.3 thì rớt xuống dùng PDR thuần



        val isTpfActive = confidence >= 0.3f && tpfLocation != null







        if (isTpfActive && tpfLocation != null) {



            // FIX: Sử dụng adaptive lerp tốc độ cao hơn



            // Nếu lệch quá 3m → snap ngay lập tức (đã drift xa quá)



            // Nếu lệch nhỏ → lerp mượt 40% mỗi frame (nhanh gấp 3x so với 0.15f)



            val dx = tpfLocation.first - pdrX



            val dy = tpfLocation.second - pdrY



            val distPx = sqrt(dx * dx + dy * dy)



            val gapMeters = distPx / pixelsPerMeter



            



            if (gapMeters > 3f) {



                // Lệch > 3m: Snap thẳng về (tránh "đứng mãi ở phòng cũ")



                pdrX = tpfLocation.first



                pdrY = tpfLocation.second



            } else {



                // Lệch nhỏ: Lerp nhanh 40% để bám sát TPF realtime



                pdrX += dx * 0.40f



                pdrY += dy * 0.40f



            }



            



            onLocationUpdated?.invoke(pdrX, pdrY, heading, confidence, true)



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



            // Issue 19: O(1) lookup thay vì O(E) linear search



            val edge = edgeMap[p.edgeId] ?: continue



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







    // Logic Soft Snap-to-Edge để chống đi xuyên tường và drift



    fun isHeadingChangeRelaxed(): Boolean {



 return System.currentTimeMillis() < headingChangeRelaxUntilMs



 }











 private fun applySnapToEdge(headingDeg: Float) {



        var bestProjX = pdrX



        var bestProjY = pdrY



        var minDistanceSq = Float.MAX_VALUE







        val headingRad = Math.toRadians(headingDeg.toDouble())



        // Giả định trục Y hướng xuống trong canvas: 0 độ là North (Y-), 90 độ là East (X+)



        val hx = kotlin.math.sin(headingRad).toFloat()



        val hy = -kotlin.math.cos(headingRad).toFloat()







        // Issue 18: Spatial grid lookup thay vì duyệt tất cả edges



        val cellSize = 100f



        val cx = (pdrX / cellSize).toInt()



        val cy = (pdrY / cellSize).toInt()



        val candidateEdges = mutableSetOf<GraphEdge>()



        for (dx in -1..1) {



            for (dy in -1..1) {



                edgeGrid[Pair(cx + dx, cy + dy)]?.let { candidateEdges.addAll(it) }



            }



        }







        for (edge in candidateEdges) {



            val ex = edge.targetX - edge.sourceX



            val ey = edge.targetY - edge.sourceY







            val edgeLenSq = ex*ex + ey*ey



            if (edgeLenSq < 0.1f) continue



            val edgeLen = sqrt(edgeLenSq)



            val evx = ex / edgeLen



            val evy = ey / edgeLen







            // Heading-aware edge filtering



            val dot = hx * evx + hy * evy



            val angleDiff = kotlin.math.acos(kotlin.math.abs(dot).coerceIn(-1f, 1f))



            if (Math.toDegrees(angleDiff.toDouble()) > 60.0) continue // Bỏ qua edge bị lệch hướng > 60 độ







            // Tính Projection điểm PDR lên đường thẳng Edge



            val px = pdrX - edge.sourceX



            val py = pdrY - edge.sourceY



            var t = (px * ex + py * ey) / edgeLenSq



            t = t.coerceIn(0f, 1f) // Clamping để chiếu lên đúng đoạn thẳng (không ra ngoài 2 đầu node)







            val projX = edge.sourceX + t * ex



            val projY = edge.sourceY + t * ey







            val dx = pdrX - projX



            val dy = pdrY - projY



            val distSq = dx*dx + dy*dy







            if (distSq < minDistanceSq) {



                minDistanceSq = distSq



                bestProjX = projX



                bestProjY = projY



            }



        }







        val maxDistPx = 1.5f * pixelsPerMeter



        if (minDistanceSq < maxDistPx * maxDistPx) {



            val distPx = sqrt(minDistanceSq)



            // Issue: Khi user cầm điện thoại đứng yên, PDR drift nhỏ nhưng vẫn dao động.



            // Nếu user đứng yên (isMoving = false), tăng lực snap để kéo PDR về edge nhanh hơn.



            // Nếu distance rất nhỏ (< 0.5m) và đứng yên, snap hoàn toàn (không dùng lerp).



            val snapStrength = if (!realtimeMotionEstimator.isMoving) {



                if (distPx < 0.5f * pixelsPerMeter) 1.0f else 0.5f  // snap mạnh hoặc hoàn toàn



            } else {



                0.15f  // snap nhẹ khi đang di chuyển



            }







            if (snapStrength >= 1.0f) {



                pdrX = bestProjX



                pdrY = bestProjY



            } else {



                pdrX += (bestProjX - pdrX) * snapStrength



                pdrY += (bestProjY - pdrY) * snapStrength



            }



        }



    }



}



