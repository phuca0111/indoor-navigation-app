package com.khoaluan.indoornav.navigation.tpf







import android.content.Context
import android.hardware.SensorManager
import android.util.Log
import android.view.Surface
import android.view.WindowManager



import com.khoaluan.indoornav.data.model.MapData



import com.khoaluan.indoornav.navigation.graph.GraphEdge



import com.khoaluan.indoornav.navigation.graph.GraphModel



import com.khoaluan.indoornav.navigation.diagnostics.SensorSessionLogger



import com.khoaluan.indoornav.navigation.heading.MapHeadingMath
import com.khoaluan.indoornav.navigation.heading.OrientationManager



import com.khoaluan.indoornav.navigation.pdr.MotionState



import com.khoaluan.indoornav.navigation.pdr.MotionStateEngine



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



    private val appContext = context.applicationContext



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



    /** G3: cổng STILL/WALKING — chỉ WALKING mới cho phép dịch vị trí. */
    private val motionStateEngine = MotionStateEngine()



    /** Phase 0.0 — JSONL sensor log (bật mặc định khi session định vị chạy). */
    var enableSensorLogging: Boolean = true



    private val sensorSessionLogger = SensorSessionLogger()



    /** Trạng thái chuyển động hiện tại (đọc từ UI/diagnostics nếu cần). */
    val motionState: MotionState
        get() = motionStateEngine.currentState



    var onMotionStateChanged: ((MotionState) -> Unit)? = null



    // Phase 0.5 — can Bac map (mapHeading = device - offset)
    private var mapNorthOffsetBaseDeg: Float = mapData.mapBearingOffset
    private var headingCalibrationDeg: Float = 0f

    /** 3 lớp hướng: Device → Map → Movement → Navigation. */
    private val orientationManager = OrientationManager().also {
        it.setMapNorthOffset(mapData.mapBearingOffset)
    }

    val effectiveMapNorthOffsetDeg: Float
        get() = MapHeadingMath.combineOffset(mapNorthOffsetBaseDeg, headingCalibrationDeg)

    fun setMapNorthOffsetBase(deg: Float) {
        mapNorthOffsetBaseDeg = deg
        syncOrientationOffset()
    }

    fun adjustHeadingCalibration(deltaDeg: Float) {
        headingCalibrationDeg = MapHeadingMath.normalizeDegrees(headingCalibrationDeg + deltaDeg)
        syncOrientationOffset()
        Log.d(
            "LocationEngine",
            "Heading calib offset=" + effectiveMapNorthOffsetDeg +
                " base=" + mapNorthOffsetBaseDeg +
                " cal=" + headingCalibrationDeg
        )
    }

    fun resetHeadingCalibration() {
        headingCalibrationDeg = 0f
        syncOrientationOffset()
    }

    private fun syncOrientationOffset() {
        orientationManager.setMapNorthOffset(effectiveMapNorthOffsetDeg)
    }

    /**
     * Không khóa hướng “vào nhà” / không snap 0° màn hình sau QR.
     * QR chỉ neo vị trí; hướng = MapHeading (Device − mapNorthOffset).
     */
    private var pendingQrFacingMapDeg: Float? = null
    private var qrHeadingLockDone: Boolean = true
    private var qrHeadingLockStartedAtMs: Long = 0L
    private val QR_HEADING_LOCK_WAIT_FLAT_MS = 4000L
    private val qrLockHeadingSamples = mutableListOf<Float>()
    private val QR_LOCK_MIN_SAMPLES = 10

    private fun tryApplyQrHeadingLock() {
        return
    }

    /** Sau QR: reset smoother; khi máy nằm chỉ snap raw — không đổi mapNorthOffset. */
    private var pendingPostQrHeadingSnap: Boolean = false

    /**
     * Sau resume / nút Snap: đợi 1 mẫu RV mới rồi snap absolute heading.
     * Giữ mapNorthOffset (Publish + calib tay); xóa Movement đã học.
     */
    private var pendingHeadingResync: Boolean = false
    private var pendingHeadingResyncReason: String = ""

    /**
     * Course GPS ngoài trời (Bắc thật) chờ seed sau khi RV sẵn sàng.
     * Chỉ dùng một lần lúc vào indoor — không tin GPS trong nhà.
     */
    private var pendingOutdoorGpsCourseDeg: Float? = null

    private fun tryPostQrHeadingSnap() {
        if (!pendingPostQrHeadingSnap) return
        if (!hasRotationVectorFix) return
        // Không chờ máy nằm: khi nhìn map (pitch lớn) vẫn phải snap heading,
        // nếu không smoother kẹt 0° và mũi tên “đứng im” sau QR.
        rotationEngine.snapToRawHeading()
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        pendingPostQrHeadingSnap = false
        Log.d(
            "LocationEngine",
            "Post-QR sensor snap mapH=" + orientationManager.mapHeadingDeg +
                " navH=" + currentNavigationHeadingDeg() +
                " pitch=" + rotationEngine.lastPitchDeg
        )
        tryApplyOutdoorGpsCourseSeed()
        if (isRunning) dispatchLocationUpdate()
    }

    /**
     * Gọi khi app về foreground hoặc user bấm “Snap hướng”.
     * Mẫu RV kế tiếp sẽ ghi đè góc trôi (đặc biệt sau đổi tab / đi nhiều vòng).
     */
    fun requestHeadingResync(reason: String = "manual") {
        if (!isRunning) return
        if (!sensorCollector.isRunning) {
            sensorCollector.start()
        }
        syncDisplayRotation()
        orientationManager.clearLearnedMovementAndNavSmooth()
        rotationEngine.invalidateAbsoluteHeading()
        hasRotationVectorFix = false
        pendingHeadingResync = true
        pendingHeadingResyncReason = reason
        Log.i("LocationEngine", "Heading resync requested reason=$reason")
    }

    private fun tryPendingHeadingResync() {
        if (!pendingHeadingResync) return
        if (!hasRotationVectorFix) return
        rotationEngine.snapToRawHeading()
        orientationManager.clearLearnedMovementAndNavSmooth()
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        val reason = pendingHeadingResyncReason
        pendingHeadingResync = false
        pendingHeadingResyncReason = ""
        Log.i(
            "LocationEngine",
            "Heading resync applied reason=$reason" +
                " mapH=" + orientationManager.mapHeadingDeg +
                " navH=" + currentNavigationHeadingDeg() +
                " pitch=" + rotationEngine.lastPitchDeg
        )
        if (isRunning) dispatchLocationUpdate()
    }

    /**
     * Căn Map theo hướng đi — từ từ tối đa [MOVEMENT_RECALIB_SLEW_DEG]/bước,
     * tránh mũi tên nhảy loạn khi snap một phát.
     */
    private fun tryMovementRecalibration() {
        val target = orientationManager.peekMovementRecalibrationTarget() ?: return
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        val desiredCal = MapHeadingMath.calibrationToMatchTarget(
            orientationManager.deviceHeadingDeg,
            mapNorthOffsetBaseDeg,
            target,
        )
        val delta = MapHeadingMath.shortestDeltaDegrees(headingCalibrationDeg, desiredCal)
        val step = delta.coerceIn(-MOVEMENT_RECALIB_SLEW_DEG, MOVEMENT_RECALIB_SLEW_DEG)
        headingCalibrationDeg = MapHeadingMath.normalizeDegrees(headingCalibrationDeg + step)
        syncOrientationOffset()
        if (kotlin.math.abs(delta) <= MOVEMENT_RECALIB_DONE_DEG) {
            orientationManager.markRecalibrationDone()
            Log.i(
                "LocationEngine",
                "Movement→MapHeading recalib DONE target=$target cal=$headingCalibrationDeg"
            )
        } else {
            Log.d(
                "LocationEngine",
                "Movement→MapHeading recalib slew step=$step remain=$delta mapH=" +
                    orientationManager.mapHeadingDeg
            )
        }
    }

    /**
     * Bước bị tường chặn hết: học hướng từ cạnh graph còn đi được
     * (tránh kẹt “heading sai → đâm tường → không Displacement → không học hướng”).
     */
    private fun learnHeadingWhenStepBlocked(x: Float, y: Float, attemptedHeadingDeg: Float) {
        val nearest = graphModel.findNearestEdge(x, y) ?: return
        val (edge, distPx) = nearest
        if (distPx > 50f) return
        val fwd = Math.toDegrees(edge.angleRad.toDouble()).toFloat()
        val bwd = Math.toDegrees(edge.reverseAngleRad.toDouble()).toFloat()
        val probePx = (0.35f * pixelsPerMeter).coerceIn(12f, 28f)
        fun open(headingDeg: Float): Boolean {
            val rad = Math.toRadians(headingDeg.toDouble())
            val tx = x + probePx * kotlin.math.sin(rad).toFloat()
            val ty = y - probePx * kotlin.math.cos(rad).toFloat()
            return !graphModel.crossesWall(x, y, tx, ty)
        }
        val candidates = listOf(fwd, bwd).filter { open(it) }
        val chosen = when {
            candidates.isEmpty() -> return
            candidates.size == 1 -> candidates[0]
            else -> candidates.minBy { h ->
                kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(attemptedHeadingDeg, h))
            }
        }
        // Chỉ học nếu gần hướng hiện tại — tránh đảo 180° làm mũi tên loạn
        val navNow = orientationManager.mapHeadingDeg
        if (kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(navNow, chosen)) > 75f) {
            return
        }
        orientationManager.onStepHeadingSample(chosen)
        Log.d("LocationEngine", "Blocked-step heading sample=$chosen (attempted=$attemptedHeadingDeg)")
    }

    /**
     * Seed Map Heading từ GPS course ngoài trời (một lần sau QR).
     * mapHeading → (gpsCourse − mapNorthOffsetBase), không phụ thuộc QR Facing.
     */
    fun seedFromOutdoorGpsCourse(trueNorthBearingDeg: Float) {
        pendingOutdoorGpsCourseDeg = MapHeadingMath.normalizeDegrees(trueNorthBearingDeg)
        Log.d("LocationEngine", "Pending outdoor GPS course seed=$pendingOutdoorGpsCourseDeg")
        tryApplyOutdoorGpsCourseSeed()
    }

    private fun tryApplyOutdoorGpsCourseSeed() {
        val course = pendingOutdoorGpsCourseDeg ?: return
        if (!hasRotationVectorFix) return
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        val device = orientationManager.deviceHeadingDeg
        headingCalibrationDeg = MapHeadingMath.calibrationToMatchGpsCourse(
            deviceHeadingDeg = device,
            mapNorthOffsetBaseDeg = mapNorthOffsetBaseDeg,
            gpsCourseTrueNorthDeg = course,
        )
        syncOrientationOffset()
        pendingOutdoorGpsCourseDeg = null
        Log.i(
            "LocationEngine",
            "Outdoor GPS→MapHeading seed course=$course device=$device cal=$headingCalibrationDeg" +
                " mapH=" + orientationManager.mapHeadingDeg
        )
        if (isRunning) dispatchLocationUpdate()
    }

    /** Đồng bộ xoay màn hình → biết đầu/đít theo UI (dọc/ngang). */
    private fun syncDisplayRotation() {
        val rotation = try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                appContext.display?.rotation
            } else {
                @Suppress("DEPRECATION")
                (appContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager)
                    .defaultDisplay.rotation
            }
        } catch (_: Exception) {
            null
        } ?: Surface.ROTATION_0
        rotationEngine.displayRotation = rotation
    }

    /** Map Heading thuần (Device − offset) — không Movement. */
    fun currentMapHeadingDeg(): Float {
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        return orientationManager.mapHeadingDeg
    }

    /** Navigation Heading — UI mũi tên + PDR/TPF (NORTH_UP). */
    fun currentNavigationHeadingDeg(): Float {
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        val walking = motionStateEngine.allowsPositionUpdate || recentlyAcceptedStep()
        val turning = System.currentTimeMillis() < turnFreezeUntilMs
        return orientationManager.navigationHeading(walking = walking, turning = turning)
    }

    /** H10 — true một lần khi conflict heading kéo dài; caller hiện snackbar QR. */
    fun consumeHeadingConflictQrSuggestion(): Boolean {
        if (!orientationManager.suggestQrDueToConflict) return false
        orientationManager.clearConflictQrSuggestion()
        return true
    }

    val isHeadingConflict: Boolean
        get() = orientationManager.isHeadingConflict




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

/** Khi TPF kẹt / trượt vuông góc heading — ưu tiên PDR tạm thời */
private var preferPdrUntilMs: Long = 0L
private var tpfStuckStepCount: Int = 0

/** Xoay người tại chỗ (đóng cửa…): chỉ cập nhật heading, KHÔNG dịch vị trí */
private var turnFreezeUntilMs: Long = 0L
/** Chỉ đóng băng khi đổi hướng rõ (quẹo/đóng cửa), không dùng gyro thrash lúc đi bộ */
private val TURN_FREEZE_HEADING_DEG = 55f
private val TURN_FREEZE_MS = 450L
/** Recalib Map←Movement: tối đa ° mỗi bước chân (mượt, không snap). */
private val MOVEMENT_RECALIB_SLEW_DEG = 8f
private val MOVEMENT_RECALIB_DONE_DEG = 6f

/** Sau QR: vài bước đầu ngắn hơn — tránh chấm đã ra hành lang trước khi tới cửa */
private var stepsSinceLocalization = 0

/** Khoa vi tri sau QR: ngan sensor moi bat sinh WALKING/buoc gia — khong can 3s (cam giac tre khi di ngay) */
private var positionLockUntilMs: Long = 0L
private val QR_POSITION_LOCK_MS = 800L
private var qrAnchorX = 0f
private var qrAnchorY = 0f
/** Vi tri "cam ket" — STILL thi pin ve day, chi doi khi co buoc that */
private var committedX = 0f
private var committedY = 0f
/** Sau buoc that: khong gate/pin STILL gia trong ~1.2s (KHONG phai do tre bat dau di) */
private var lastAcceptedStepMs: Long = 0L
private val STEP_STILL_GRACE_MS = 1200L

private fun recentlyAcceptedStep(nowMs: Long = System.currentTimeMillis()): Boolean =
    lastAcceptedStepMs > 0L && nowMs - lastAcceptedStepMs < STEP_STILL_GRACE_MS










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



        // Linear Accel: MotionStateEngine (G3 gate) + RealtimeMotionEstimator (velocity)



        sensorCollector.onLinearAccelUpdate = { values, _ ->



            val stateChanged = motionStateEngine.onLinearAccel(values[0], values[1], values[2])



            if (stateChanged) {
                rotationEngine.setWalking(motionStateEngine.allowsPositionUpdate)
                if (!motionStateEngine.allowsPositionUpdate) {
                    orientationManager.onStill()
                }
                onMotionStateChanged?.invoke(motionStateEngine.currentState)



                sensorSessionLogger.logEvent(
                    "motion_state",
                    mapOf(
                        "state" to motionStateEngine.currentState.name,
                        "energy" to motionStateEngine.filteredEnergy
                    )
                )



                Log.d(
                    "LocationEngine",
                    "MotionState → ${motionStateEngine.currentState} energy=${"%.2f".format(motionStateEngine.filteredEnergy)}"
                )



            }



            val triggeredMicroStep =
                realtimeMotionEstimator.processLinearAcceleration(values[0], values[1], values[2])



            sensorCollector.setDynamicRate(motionStateEngine.allowsPositionUpdate)



            // G3a: STILL → không micro-step



            // Micro-step chỉ làm mượt khi PDR thuần — KHÔNG bơm TPF (TPF+micro dễ kéo chấm ra HL sớm)
            if (
                triggeredMicroStep &&
                isRunning &&
                motionStateEngine.allowsPositionUpdate &&
                System.currentTimeMillis() >= preferPdrUntilMs &&
                System.currentTimeMillis() >= turnFreezeUntilMs
            ) {
                val conf = calculateConfidence(tpfEngine.getEstimatedLocation())
                if (conf < 0.3f) {
                    // PDR fallback path: micro đã được continuous prediction lo; không processStep TPF
                }
                // Có TPF: bỏ micro-step trên graph
            }



        }







        // Tích hợp hệ thống xoay siêu mượt của Google và Continuous Prediction



        sensorCollector.onRotationUpdate = { values, timestampNs ->



            hasRotationVectorFix = true

            syncDisplayRotation()
            rotationEngine.updateRotationVector(values)
            tryApplyQrHeadingLock()
            tryPostQrHeadingSnap()
            tryPendingHeadingResync()
            tryApplyOutdoorGpsCourseSeed()



            if (isRunning) {



                // Nội suy vị trí liên tục (Continuous Prediction) ở ~50Hz



                if (lastUpdateTimeNs > 0L) {



                    val dt = (timestampNs - lastUpdateTimeNs) / 1_000_000_000f



                    // G3a: Continuous khi WALKING, hoặc vừa có bước thật (tránh khựng giữa chu kỳ)



                    if (dt in 0.001f..0.1f &&
                        (motionStateEngine.allowsPositionUpdate || recentlyAcceptedStep())
                    ) {



                        val currentHeadingRad = Math.toRadians(currentNavigationHeadingDeg().toDouble()).toFloat()



                        



                        // 1. CONTINUOUS PREDICTION



                        // PDR chỉ tự cộng dồn khi TPF KHÔNG chạy (fallback mode)



                        // Nếu TPF đang active, vị trí sẽ do dispatchLocationUpdate() quyết định



                        // Chi continuous sau khi da co it nhat 1 buoc that (ngoi im khong troi)
                        val nowCont = System.currentTimeMillis()
                        val turning = nowCont < turnFreezeUntilMs
                        val qrLocked = nowCont < positionLockUntilMs
                        if (!turning && !qrLocked && stepsSinceLocalization >= 1) {
                            val ds = realtimeMotionEstimator.pseudoVelocity * dt
                            val dsPx = (ds.coerceAtMost(0.7f) * pixelsPerMeter)
                            val fromX = pdrX
                            val fromY = pdrY
                            val toX = pdrX + dsPx * kotlin.math.sin(currentHeadingRad)
                            val toY = pdrY - dsPx * kotlin.math.cos(currentHeadingRad)
                            val blocked = moveWithWallBlock(fromX, fromY, toX, toY)
                            pdrX = blocked.first
                            pdrY = blocked.second
                            applySnapToEdge(currentNavigationHeadingDeg(), forceStrong = false)
                            clampToWalkableGraph()
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
                // Vẫn cập nhật Gyro cho RotationEngine để tính Adaptive Alpha
                rotationEngine.updateGyro(values, timestampNs)
            }



        }







        // Gia tốc -> Đếm bước chân



        sensorCollector.onAccelUpdate = { values, timestampNs ->
            orientationManager.updateAccelForPose(values[0], values[1], values[2])
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




    private fun beginSensorLogging(anchor: String) {
        if (!enableSensorLogging) return
        sensorCollector.sensorLogger = sensorSessionLogger
        sensorSessionLogger.startSession(
            appContext,
            mapOf(
                "anchor" to anchor,
                "node_count" to graphModel.nodeMap.size,
                "edge_count" to graphModel.edges.size,
                "seed" to System.currentTimeMillis(),
                "map_north_offset" to effectiveMapNorthOffsetDeg
            )
        )
        motionStateEngine.reset()
    }

    private fun endSensorLogging() {
        sensorCollector.sensorLogger = null
        sensorSessionLogger.stopSession()
    }

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
        preferPdrUntilMs = 0L
        tpfStuckStepCount = 0
        turnFreezeUntilMs = 0L
        stepsSinceLocalization = 0
        qrAnchorX = pdrX
        qrAnchorY = pdrY
        committedX = pdrX
        committedY = pdrY
        positionLockUntilMs = System.currentTimeMillis() + QR_POSITION_LOCK_MS
        lastAcceptedStepMs = 0L
        motionStateEngine.reset()
        realtimeMotionEstimator.reset()
        rotationEngine.setWalking(false)
        // Không khóa hướng vào nhà — mũi tên theo đầu máy
        headingCalibrationDeg = 0f
        qrHeadingLockDone = true
        qrHeadingLockStartedAtMs = System.currentTimeMillis()
        qrLockHeadingSamples.clear()
        pendingQrFacingMapDeg = null
        // Quét lại trong map: bỏ heading/smoother cũ (tư thế camera) — tránh lệch ~10°
        if (isRunning) {
            sensorCollector.stop()
        }
        rotationEngine.reset()
        orientationManager.reset()
        syncOrientationOffset()
        pendingPostQrHeadingSnap = true
        pendingOutdoorGpsCourseDeg = null
        Log.d(
            "LocationEngine",
            "QR start node=" + nodeId + " xy=(" + pdrX + "," + pdrY +
                ") lockMs=" + QR_POSITION_LOCK_MS +
                " heading=OrientationManager (QR=position only)"
        )







        beginSensorLogging("qr:$nodeId")



        sensorCollector.start()
        rotationEngine.invertAzimuth180 = false
        Log.d("LocationEngine", "Heading: mapHeading = device - offset (head-follow, no +180)")



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



        



        beginSensorLogging("pos:$x,$y")



        sensorCollector.start()
        rotationEngine.invertAzimuth180 = false



        isRunning = true



        dispatchLocationUpdate()



    }







    /** Ngừng điều hướng */



    fun stop() {



        endSensorLogging()



        sensorCollector.stop()



        isRunning = false



        hasRotationVectorFix = false



        rotationEngine.setWalking(false)
        rotationEngine.reset()



    }







    private fun handleStep(stepLengthMeters: Float) {



        // G3a: ngồi/đứng yên — bỏ qua bước ảo; bước thật / đang đi thì không gate.
        // KHÔNG chờ 2s mới chạy: grace chỉ áp dụng SAU khi đã có bước được chấp nhận.



        val nowGate = System.currentTimeMillis()
        val energyHint = motionStateEngine.filteredEnergy >= 0.9f
        if (!motionStateEngine.allowsPositionUpdate &&
            !recentlyAcceptedStep(nowGate) &&
            !energyHint
        ) {



            sensorSessionLogger.logEvent(
                "step_gated",
                mapOf(
                    "reason" to "STILL",
                    "step_length_m" to stepLengthMeters,
                    "energy" to motionStateEngine.filteredEnergy
                )
            )



            Log.d("LocationEngine", "Step gated (STILL), len=$stepLengthMeters")



            return



        }

        // Bước thật (hoặc năng lượng đã lên) → vào/giữ WALKING ngay, không đợi hold 450ms
        motionStateEngine.noteStep()
        rotationEngine.setWalking(true)



        val currentHeadingDeg = currentNavigationHeadingDeg()



        val currentHeadingRad = Math.toRadians(currentHeadingDeg.toDouble()).toFloat()







        // Issue 23: step length cho micro-step (dùng bản đã clamp bên dưới)



        // Bước chân thực sự



        val nowMs = System.currentTimeMillis()
        if (nowMs < positionLockUntilMs) {
            sensorSessionLogger.logEvent(
                "step_gated",
                mapOf("reason" to "QR_LOCK", "step_length_m" to stepLengthMeters)
            )
            Log.d("LocationEngine", "Step gated (QR_LOCK)")
            pdrX = qrAnchorX
            pdrY = qrAnchorY
            dispatchLocationUpdate()
            return
        }
        // Chi dong bang ngan khi vua doi huong lon
        if (nowMs < turnFreezeUntilMs) {
            sensorSessionLogger.logEvent(
                "step_gated",
                mapOf(
                    "reason" to "TURN",
                    "step_length_m" to stepLengthMeters,
                    "remain_ms" to (turnFreezeUntilMs - nowMs)
                )
            )
            Log.d("LocationEngine", "Step gated (TURN) remain=" + (turnFreezeUntilMs - nowMs))
            applySnapToEdge(currentHeadingDeg, forceStrong = true)
            dispatchLocationUpdate()
            return
        }

        stepsSinceLocalization++
        lastAcceptedStepMs = nowMs
        val ramp = when {
            stepsSinceLocalization <= 2 -> 0.50f
            stepsSinceLocalization <= 4 -> 0.75f
            else -> 1.0f
        }
        var safeStepM = (stepLengthMeters * ramp).coerceIn(0.32f, 0.48f)
        graphModel.findNearestEdge(pdrX, pdrY)?.let { (edge, _) ->
            val cap = (edge.distanceMeters * 0.70f).coerceIn(0.30f, 0.48f)
            if (safeStepM > cap) safeStepM = cap
        }
        lastStepLengthMeters = safeStepM

        val stepPx = safeStepM * pixelsPerMeter
        val hx = kotlin.math.sin(currentHeadingRad)
        val hy = -kotlin.math.cos(currentHeadingRad)

        // G3c: PDR dẫn đường — tiến theo Navigation Heading, chặn tường, rồi snap graph
        val beforeX = pdrX
        val beforeY = pdrY
        val rawX = pdrX + stepPx * hx
        val rawY = pdrY + stepPx * hy
        val blocked = moveWithWallBlock(beforeX, beforeY, rawX, rawY)
        pdrX = blocked.first
        pdrY = blocked.second
        val stepMovedPx = kotlin.math.hypot(
            (pdrX - beforeX).toDouble(),
            (pdrY - beforeY).toDouble()
        ).toFloat()
        if (stepMovedPx >= 0.5f) {
            orientationManager.onStepDisplacement(pdrX - beforeX, pdrY - beforeY)
        } else {
            // Heading sai → đâm tường: vẫn học hướng từ cạnh còn đi được
            learnHeadingWhenStepBlocked(beforeX, beforeY, currentHeadingDeg)
        }
        tryMovementRecalibration()
        applySnapToEdge(currentHeadingDeg, forceStrong = true)
        clampToWalkableGraph()

        // TPF chạy song song để giữ particle; chỉ blend nhẹ khi cùng hướng (không gần cửa ⊥)
        val before = tpfEngine.getEstimatedLocation()
        tpfEngine.processStep(safeStepM, currentHeadingRad)
        val after = tpfEngine.getEstimatedLocation()
        val alongHeadingPx = if (before != null && after != null) {
            (after.first - before.first) * hx + (after.second - before.second) * hy
        } else 0f
        val movedPx = if (before != null && after != null) {
            kotlin.math.sqrt(
                (after.first - before.first) * (after.first - before.first) +
                    (after.second - before.second) * (after.second - before.second)
            )
        } else 0f

        val nearDoor = isNearDoorLikeEdge(currentHeadingRad)
        val tpfAligned = after != null && alongHeadingPx >= stepPx * 0.20f && !nearDoor
        if (tpfAligned) {
            tpfStuckStepCount = 0
            pdrX += (after!!.first - pdrX) * 0.20f
            pdrY += (after.second - pdrY) * 0.20f
            applySnapToEdge(currentHeadingDeg, forceStrong = true)
        } else {
            tpfStuckStepCount++
            tpfEngine.reseedNearPosition(pdrX, pdrY, currentHeadingRad, searchRadiusPx = 90f)
            preferPdrUntilMs = nowMs + 800L
        }

        sensorSessionLogger.logEvent(
            "step",
            mapOf(
                "step_length_m" to safeStepM,
                "heading_deg" to currentHeadingDeg,
                "motion" to motionStateEngine.currentState.name,
                "tpf_along_px" to alongHeadingPx,
                "tpf_moved_px" to movedPx,
                "near_door" to nearDoor,
                "ramp" to ramp,
                "hw_step" to stepDetector.hasHardwareSensorTriggered
            )
        )

        onStepEvent?.invoke(safeStepM, stepDetector.stepCount, stepDetector.totalDistanceM)
        committedX = pdrX
        committedY = pdrY
        dispatchLocationUpdate()
    }







    /** Đưa dữ liệu tọa độ lên màn hình */



    private fun dispatchLocationUpdate() {



        val heading = currentNavigationHeadingDeg()

 // FIX 4: Detect heading change to relax off-route during turns
 val headingDelta = lastDispatchedHeading?.let { prev ->
 val diff = kotlin.math.abs(heading - prev)
 if (diff > 180f) 360f - diff else diff
 } ?: 0f
 if (headingDelta > HEADING_CHANGE_ANGLE_DEG) {
 headingChangeRelaxUntilMs = System.currentTimeMillis() + HEADING_CHANGE_RELAX_MS
 Log.d("LocationEngine", "Heading change: " + "%.1f".format(headingDelta) + "deg, relax until " + headingChangeRelaxUntilMs)
 }
 // Xoay người tại chỗ (vd. đóng cửa): đóng băng vị trí ~1.5s
 if (headingDelta > TURN_FREEZE_HEADING_DEG) {
 turnFreezeUntilMs = System.currentTimeMillis() + TURN_FREEZE_MS
 Log.d("LocationEngine", "Turn-freeze " + "%.1f".format(headingDelta) + "deg")
 }
 lastDispatchedHeading = heading



        val tpfLocation = tpfEngine.getEstimatedLocation()



        



        // Tính độ phân tán để ra Confidence Score (1.0 = hội tụ hoàn toàn, 0.0 = rời rạc)



        val confidence = calculateConfidence(tpfLocation)







        // Logic Fallback: Nếu độ tin cậy < 0.3 thì rớt xuống dùng PDR thuần



        // G3c: vi tri LUON theo PDR+snap — TPF khong keo nguoc (gay dung yen khi TPF 90%)
        val preferPdr = System.currentTimeMillis() < preferPdrUntilMs ||
            isNearDoorLikeEdge(Math.toRadians(heading.toDouble()).toFloat())
        if (System.currentTimeMillis() < positionLockUntilMs) {
            pdrX = qrAnchorX
            pdrY = qrAnchorY
        } else if (!motionStateEngine.allowsPositionUpdate && !recentlyAcceptedStep()) {
            // G3a: ngoi/dung yen — pin ve vi tri cam ket (khong troi 5m)
            // Grace sau buoc that: khong pin giua chu ky buoc (tranh khung)
            pdrX = committedX
            pdrY = committedY
        } else {
            clampToWalkableGraph()
            committedX = pdrX
            committedY = pdrY
        }
        val showTpfBadge = !preferPdr && confidence >= 0.55f && tpfLocation != null
        onLocationUpdated?.invoke(pdrX, pdrY, heading, confidence, showTpfBadge)
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











    /**
     * G3c: cạnh "giống cửa" = ngắn hoặc lệch hướng đi > ~50°.
     * Gần cửa → ưu tiên PDR+snap, tránh TPF kéo ra hành lang sớm.
     */
    
    /** Keo ve canh graph gan nhat neu ra xa duong di (tranh dam tuong). */
    private fun clampToWalkableGraph() {
        val nearest = graphModel.findNearestEdge(pdrX, pdrY) ?: return
        val edge = nearest.first
        val progress = nearest.second.coerceIn(0f, 1f)
        val ex = edge.sourceX + progress * (edge.targetX - edge.sourceX)
        val ey = edge.sourceY + progress * (edge.targetY - edge.sourceY)
        val dx = pdrX - ex
        val dy = pdrY - ey
        val dist = kotlin.math.sqrt(dx * dx + dy * dy)
        // Trước 2.5m quá rộng → dễ xuyên tường; siết ~0.7m
        val maxDist = 0.7f * pixelsPerMeter
        if (dist > maxDist) {
            // Không kéo xuyên tường (vd. phòng → HL qua tường)
            if (graphModel.crossesWall(pdrX, pdrY, ex, ey)) {
                Log.d("LocationEngine", "clamp skipped (crosses wall) edge=" + edge.id)
                return
            }
            pdrX = ex
            pdrY = ey
            Log.d("LocationEngine", "clampToWalkableGraph distPx=" + dist + " -> " + edge.id)
        }
    }

    /**
     * Chặn đâm tường: nếu đoạn from→to cắt tường thì chỉ tiến tới sát tường rồi bám graph.
     */
    private fun moveWithWallBlock(fromX: Float, fromY: Float, toX: Float, toY: Float): Pair<Float, Float> {
        if (!graphModel.crossesWall(fromX, fromY, toX, toY)) {
            return toX to toY
        }
        var lo = 0f
        var hi = 1f
        var bestT = 0f
        repeat(10) {
            val mid = (lo + hi) * 0.5f
            val mx = fromX + (toX - fromX) * mid
            val my = fromY + (toY - fromY) * mid
            if (graphModel.crossesWall(fromX, fromY, mx, my)) {
                hi = mid
            } else {
                bestT = mid
                lo = mid
            }
        }
        val t = (bestT * 0.92f).coerceAtLeast(0f)
        val nx = fromX + (toX - fromX) * t
        val ny = fromY + (toY - fromY) * t
        Log.d("LocationEngine", "wall-block t=" + "%.2f".format(t))
        return nx to ny
    }

private fun isNearDoorLikeEdge(userHeadingRad: Float): Boolean {
        val nearest = graphModel.findNearestEdge(pdrX, pdrY) ?: return false
        val edge = nearest.first
        val dx = edge.targetX - edge.sourceX
        val dy = edge.targetY - edge.sourceY
        val len2 = dx * dx + dy * dy
        if (len2 < 1e-3f) return false
        val t = (((pdrX - edge.sourceX) * dx + (pdrY - edge.sourceY) * dy) / len2).coerceIn(0f, 1f)
        val px = edge.sourceX + t * dx
        val py = edge.sourceY + t * dy
        val distPx = kotlin.math.sqrt((pdrX - px) * (pdrX - px) + (pdrY - py) * (pdrY - py))
        if (distPx > 1.2f * pixelsPerMeter) return false

        val headingDeg = Math.toDegrees(userHeadingRad.toDouble()).toFloat()
        val d1 = kotlin.math.abs(
            com.khoaluan.indoornav.navigation.heading.MapHeadingMath.shortestDeltaDegrees(
                headingDeg,
                Math.toDegrees(edge.angleRad.toDouble()).toFloat()
            )
        )
        val d2 = kotlin.math.abs(
            com.khoaluan.indoornav.navigation.heading.MapHeadingMath.shortestDeltaDegrees(
                headingDeg,
                Math.toDegrees(edge.reverseAngleRad.toDouble()).toFloat()
            )
        )
        val mismatchDeg = minOf(d1, d2)
        val shortEdge = edge.distanceMeters < 2.2f
        return mismatchDeg > 50f || (shortEdge && mismatchDeg > 35f)
    }

 private fun applySnapToEdge(headingDeg: Float, forceStrong: Boolean = false) {



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



            if (Math.toDegrees(angleDiff.toDouble()) > 50.0) continue // Hành lang hẹp: chỉ bám cạnh gần hướng đi







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
            // Bỏ cạnh nếu kéo tới đó phải xuyên tường
            if (graphModel.crossesWall(pdrX, pdrY, projX, projY)) continue

            if (distSq < minDistanceSq) {



                minDistanceSq = distSq



                bestProjX = projX



                bestProjY = projY



            }



        }







        val maxDistPx = 1.0f * pixelsPerMeter



        if (minDistanceSq < maxDistPx * maxDistPx) {



            val distPx = sqrt(minDistanceSq)



            // Issue: Khi user cầm điện thoại đứng yên, PDR drift nhỏ nhưng vẫn dao động.



            // Nếu user đứng yên (isMoving = false), tăng lực snap để kéo PDR về edge nhanh hơn.



            // Nếu distance rất nhỏ (< 0.5m) và đứng yên, snap hoàn toàn (không dùng lerp).



            val snapStrength = when {
                forceStrong -> 1.0f
                !realtimeMotionEstimator.isMoving -> {
                    if (distPx < 0.5f * pixelsPerMeter) 1.0f else 0.7f
                }
                else -> 0.55f
            }

            if (graphModel.crossesWall(pdrX, pdrY, bestProjX, bestProjY)) {
                Log.d("LocationEngine", "snap skipped (crosses wall)")
                return
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



