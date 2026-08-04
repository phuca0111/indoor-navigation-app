package com.khoaluan.indoornav.navigation.tpf







import android.content.Context
import android.hardware.SensorManager
import android.util.Log
import android.view.Surface
import android.view.WindowManager



import com.khoaluan.indoornav.data.model.MapData



import com.khoaluan.indoornav.navigation.graph.GraphEdge



import com.khoaluan.indoornav.navigation.graph.GraphModel



import com.khoaluan.indoornav.navigation.diagnostics.HeadingMotionRecorder
import com.khoaluan.indoornav.navigation.diagnostics.SensorSessionLogger



import com.khoaluan.indoornav.navigation.heading.DominantHeadingEstimator
import com.khoaluan.indoornav.navigation.heading.HeadingAssistFlags
import com.khoaluan.indoornav.navigation.heading.MapHeadingMath
import com.khoaluan.indoornav.navigation.heading.HeadingReferenceFrame
import com.khoaluan.indoornav.navigation.heading.HeadingSpinLogger
import com.khoaluan.indoornav.navigation.heading.MagFingerprintMap
import com.khoaluan.indoornav.navigation.heading.MagHeadingCorrectionGrid
import com.khoaluan.indoornav.navigation.heading.MagneticInterferenceGuard
import com.khoaluan.indoornav.navigation.heading.MagGuardState
import com.khoaluan.indoornav.navigation.heading.MagSeverity
import com.khoaluan.indoornav.navigation.heading.OrientationManager



import com.khoaluan.indoornav.navigation.pdr.MotionState



import com.khoaluan.indoornav.navigation.pdr.MotionStateEngine



import com.khoaluan.indoornav.navigation.pdr.PhoneContext
import com.khoaluan.indoornav.navigation.pdr.PhoneContextDetector
import com.khoaluan.indoornav.navigation.pdr.HoldStability



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

    private val pixelsPerMeter =
        if (mapData.scaleRatio > 0.0) (40.0 / mapData.scaleRatio).toFloat() else 80f

    /** Lưới Δ° theo tọa độ map — học khi mag OK, áp vào offset hướng. */
    private val headingCorrectionGrid =
        MagHeadingCorrectionGrid.fromMapData(mapData, pixelsPerMeter)

    /** Fingerprint |B| theo ô — học khi mag OK; anomaly → giảm tin la bàn. */
    private val magFingerprintMap =
        MagFingerprintMap.fromMapData(mapData, pixelsPerMeter)

    private var lastMagBx: Float = 0f
    private var lastMagBy: Float = 0f
    private var lastMagBz: Float = 0f
    private var hasMagFieldSample: Boolean = false

    private var lastAppliedGridDeltaDeg: Float = 0f
    /** Sau chạm map đổi chỗ: giữ Δ lưới cũ đến khi bắt đầu đi (máy chưa đổi môi trường mag). */
    private var holdGridDeltaAfterRelocate: Boolean = false



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

    /** Ước lượng ngồi/đứng/túi/đong đưa/chạm máy từ IMU. */
    private val phoneContextDetector = PhoneContextDetector()
    private val lastAccelSample = floatArrayOf(0f, 9.81f, 0f)
    private val lastLinSample = floatArrayOf(0f, 0f, 0f)
    private val lastGyroSample = floatArrayOf(0f, 0f, 0f)



    /** Phase 0.0 — JSONL sensor log (bật mặc định khi session định vị chạy). */
    var enableSensorLogging: Boolean = true



    private val sensorSessionLogger = SensorSessionLogger()
    private val headingMotionRecorder = HeadingMotionRecorder()
    private var lastHeadingSensorLogMs = 0L

    /** Bật ghi file xoay/hướng để gửi phân tích (JSONL trong sensor_logs/heading_*.jsonl). */
    fun startHeadingMotionLog(note: String = "spin_test"): String? {
        return headingMotionRecorder.start(
            appContext,
            mapOf(
                "note" to note,
                "map_bearing_offset" to mapNorthOffsetBaseDeg,
                "calib" to headingCalibrationDeg,
                "node_count" to graphModel.nodeMap.size,
            ),
        )
    }

    fun stopHeadingMotionLog(): String? = headingMotionRecorder.stop()

    fun isHeadingMotionLogging(): Boolean = headingMotionRecorder.isRecording

    fun headingMotionLogPath(): String? = headingMotionRecorder.currentFilePath

    fun headingMotionLogLines(): Int = headingMotionRecorder.linesWritten

    fun markHeadingMotionNote(text: String) {
        headingMotionRecorder.markNote(text)
    }



    /** Trạng thái chuyển động hiện tại (đọc từ UI/diagnostics nếu cần). */
    val motionState: MotionState
        get() = motionStateEngine.currentState



    var onMotionStateChanged: ((MotionState) -> Unit)? = null

    val phoneContext: PhoneContext
        get() = phoneContextDetector.current

    var onPhoneContextChanged: ((PhoneContext) -> Unit)? = null



    // Phase 0.5 — can Bac map (mapHeading = device - offset)
    private var mapNorthOffsetBaseDeg: Float = mapData.mapBearingOffset
    private var headingCalibrationDeg: Float = 0f

    /** Nhiễu từ trường → tắt tin RV; neo lại hướng theo last-good / hành lang. */
    private val magneticGuard = MagneticInterferenceGuard()
    /** Khớp guard trước mẫu |B|: WEAK/trust=0 — tránh OK→WEAK giả khi chưa đo từ trường. */
    private var lastMagSeverity: MagSeverity = MagSeverity.WEAK
    /** Map heading lúc từ trường còn ổn — dùng để kéo về khi bắt đầu nhiễu. */
    private var lastGoodMapHeadingDeg: Float? = null
    /** Calib trước khi reanchor nhiễu — khôi phục khi mag OK (tránh lệch 90° vĩnh viễn). */
    private var calibBeforeMagReanchorDeg: Float? = null
    /** Tự đảo 180° khi đi ngược hành lang (không bắt user bấm nút). */
    private var autoFlip180Votes: Int = 0
    private var lastAutoFlip180Ms: Long = 0L
    /** Vote từ residual ma trận / hướng đi vs device ~180°. */
    private var matrixFlip180Votes: Int = 0
    /** Sau mag recover: so với last-good — nếu RV nhảy ~180° thì tự đảo. */
    private var pendingAutoFlipCheckAgainstDeg: Float? = null
    /** Sau mag OK / GPS: thử xóa cal lớn sai bằng mag tuyệt đối. */
    private var pendingAbsoluteNorthRecover: Boolean = false
    private var lastGpsCourseCorrectMs: Long = 0L
    private var lastAbsoluteNorthRecoverMs: Long = 0L

    val magneticInterferenceActive: Boolean
        get() = lastMagSeverity == MagSeverity.SEVERE

    var onMagneticInterferenceChanged: ((interfered: Boolean, message: String?) -> Unit)? = null

    /** 3 lớp hướng: Device → Map → Movement → Navigation. */
    private val orientationManager = OrientationManager().also {
        it.setMapNorthOffset(mapData.mapBearingOffset)
    }

    init {
        // Chưa có mẫu từ trường → không tin RV (tránh init azimuth bẩn rồi "hold" khóa góc sai).
        rotationEngine.magneticTrust = 0f
    }

    val effectiveMapNorthOffsetDeg: Float
        get() = HeadingReferenceFrame.effectiveOffset(
            mapNorthOffsetBaseDeg,
            headingCalibrationDeg,
            lastAppliedGridDeltaDeg,
        )

    /** Δ° lưới đang áp vào mũi tên (mag OK thường = 0). */
    fun currentGridHeadingDeltaDeg(): Float = lastAppliedGridDeltaDeg

    /** Chuỗi debug ma trận Δ° (ô đã học). */
    fun headingGridDebugSummary(): String {
        val stored = headingCorrectionGrid.sample(pdrX, pdrY)
        val n = headingCorrectionGrid.sampleCountAt(pdrX, pdrY)
        val applied = lastAppliedGridDeltaDeg
        val signS = if (stored >= 0f) "+" else ""
        val signA = if (applied >= 0f) "+" else ""
        return "áp ${signA}${applied.toInt()}° | ô ${signS}${stored.toInt()}° (n=$n) | " +
            headingCorrectionGrid.debugMatrixSummary()
    }

    fun resetHeadingCorrectionGrid() {
        headingCorrectionGrid.reset()
        magFingerprintMap.reset()
        lastAppliedGridDeltaDeg = 0f
        syncOrientationOffset()
        Log.i("LocationEngine", "Heading correction grid + mag fingerprint reset")
    }

    fun setMapNorthOffsetBase(deg: Float) {
        mapNorthOffsetBaseDeg = deg
        syncOrientationOffset()
    }

    /** Căn Bắc publish (map_bearing_offset) — không gồm cal tạm / lưới. */
    fun mapNorthOffsetBaseDeg(): Float = mapNorthOffsetBaseDeg

    /** Calib tay / tạm phiên (có thể bị nhiễu ghi sai nếu không reset). */
    fun sessionHeadingCalibDeg(): Float = headingCalibrationDeg

    fun adjustHeadingCalibration(deltaDeg: Float) {
        headingCalibrationDeg = MapHeadingMath.normalizeDegrees(headingCalibrationDeg + deltaDeg)
        // Đang nhiễu: giữ luôn cal sau khi mag OK (vd. user bấm 180° đảo Bắc/Nam).
        if (calibBeforeMagReanchorDeg != null) {
            calibBeforeMagReanchorDeg = headingCalibrationDeg
        }
        syncOrientationOffset()
        orientationManager.clearLearnedMovementAndNavSmooth()
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        Log.d(
            "LocationEngine",
            "Heading calib offset=" + effectiveMapNorthOffsetDeg +
                " base=" + mapNorthOffsetBaseDeg +
                " cal=" + headingCalibrationDeg
        )
    }

    /** Đảo 180° — khi từ trường / la bàn hệ thống chỉ Nam thay vì Bắc. */
    fun invertHeading180() {
        adjustHeadingCalibration(180f)
        Log.i("LocationEngine", "Invert heading 180° → cal=$headingCalibrationDeg")
        if (isRunning) dispatchLocationUpdate()
    }

    fun resetHeadingCalibration() {
        headingCalibrationDeg = 0f
        syncOrientationOffset()
    }

    /**
     * Căn mũi tên theo cạnh hành lang gần nhất trên map.
     * Dùng khi map_bearing_offset = 0 / la bàn trong nhà lệch — Snap cảm biến thuần không đủ.
     * @return góc map đã căn, hoặc null nếu không tìm được cạnh gần.
     */
    fun snapHeadingToNearestCorridor(userX: Float, userY: Float): Float? {
        syncDisplayRotation()
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        val nearest = graphModel.findNearestEdge(userX, userY) ?: return null
        val (edge, distPx) = nearest
        if (distPx > 120f) return null

        val fwd = Math.toDegrees(edge.angleRad.toDouble()).toFloat()
        val bwd = Math.toDegrees(edge.reverseAngleRad.toDouble()).toFloat()
        val current = orientationManager.mapHeadingDeg
        val dFwd = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(current, fwd))
        val dBwd = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(current, bwd))
        val target = if (dFwd <= dBwd) fwd else bwd
        val align = if (dFwd <= dBwd) dFwd else dBwd
        if (align > CORRIDOR_REANCHOR_MAX_ALIGN_DEG) {
            Log.w(
                "LocationEngine",
                "Corridor snap skipped — lệch HL ${"%.0f".format(align)}° (không đổi Bắc tạm)",
            )
            return null
        }
        // Không cho Snap hành lang ghi cal > 40° (tránh biến hướng lệch thành Bắc tạm).
        val ok = tryApplySessionCalibCapped(
            targetMapHeadingDeg = target,
            gridDelta = headingCorrectionGrid.sample(userX, userY),
            maxAbsCalDeg = CORRIDOR_REANCHOR_MAX_ALIGN_DEG,
        )
        if (!ok) {
            Log.w("LocationEngine", "Corridor snap skipped — cần cal quá lớn so với device")
            return null
        }
        val nav = currentNavigationHeadingDeg()
        Log.i(
            "LocationEngine",
            "Corridor snap target=$target nav=$nav cal=$headingCalibrationDeg " +
                "edgeDist=$distPx device=${orientationManager.deviceHeadingDeg}",
        )
        if (isRunning) dispatchLocationUpdate()
        return nav
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
        // Nhiễu: không snap về raw 0° / hướng máy — đã seed theo hành lang / last-good.
        if (rotationEngine.magneticTrust < 0.5f) {
            pendingPostQrHeadingSnap = false
            Log.d("LocationEngine", "Post-QR snap skipped (mag trust low — keep seeded north frame)")
            return
        }
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
     * Sau QR / đặt vị trí khi nhiễu: neo device heading theo hành lang hoặc last-good map.
     * Tránh seed 0° biến hướng cầm máy thành Bắc map (ảnh + loglaban).
     */
    private fun seedHeadingAfterLocalization(preservedMapHeadingDeg: Float?) {
        val mapTarget = preferredCorridorMapHeadingNearUser(refMapHeadingDeg = preservedMapHeadingDeg)
            ?: preservedMapHeadingDeg
            ?: return
        // map = device − (base+cal+grid)  ⇒  device = map + offset
        val deviceSeed = MapHeadingMath.normalizeDegrees(
            mapTarget + mapNorthOffsetBaseDeg + headingCalibrationDeg + lastAppliedGridDeltaDeg,
        )
        rotationEngine.seedHeading(deviceSeed)
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        Log.i(
            "LocationEngine",
            "Seed heading after localize mapTarget=$mapTarget deviceSeed=$deviceSeed " +
                "(không dùng hướng máy = Bắc)",
        )
    }

    /** Hướng cạnh graph gần user (không yêu cầu đã gần hướng hiện tại). */
    private fun preferredCorridorMapHeadingNearUser(
        maxDistPx: Float = 120f,
        refMapHeadingDeg: Float? = lastGoodMapHeadingDeg,
    ): Float? {
        val nearest = graphModel.findNearestEdge(pdrX, pdrY) ?: return null
        val (edge, distPx) = nearest
        if (distPx > maxDistPx) return null
        val fwd = Math.toDegrees(edge.angleRad.toDouble()).toFloat()
        val bwd = Math.toDegrees(edge.reverseAngleRad.toDouble()).toFloat()
        val ref = refMapHeadingDeg
        return if (ref != null) {
            val dFwd = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(ref, fwd))
            val dBwd = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(ref, bwd))
            if (dFwd <= dBwd) fwd else bwd
        } else {
            fwd
        }
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

    /**
     * Nhiễu từ trường — cách hiệu chỉnh:
     * 1) Tắt blend Rotation Vector (có mag) → chỉ gyro quanh trọng lực.
     * 2) Neo map heading: hành lang → last-good (lưới Δ° vẫn áp qua effective offset).
     * 3) Khi mag OK: học lưới Δ° + fingerprint |B| theo tọa độ.
     * 4) Fingerprint anomaly → hạ trust dù accuracy còn OK.
     * 5) Hết nhiễu ổn định → resync la bàn thật.
     */
    private fun applyMagneticGuard(state: MagGuardState) {
        var effective = state
        // Fingerprint: |B| lệch ô đã survey → coi như nhiễu nhẹ (không tin RV đầy đủ).
        if (hasMagFieldSample && isRunning && state.severity == MagSeverity.OK) {
            val anomaly = magFingerprintMap.anomalyScore(pdrX, pdrY, lastMagBx, lastMagBy, lastMagBz)
            if (anomaly >= 0.65f) {
                effective = MagGuardState(
                    severity = MagSeverity.WEAK,
                    magneticTrust = MagneticInterferenceGuard.WEAK_MAG_TRUST.coerceAtMost(0.45f),
                    messageVi = "Từ trường lệch fingerprint ô — giảm tin la bàn",
                    fieldUt = state.fieldUt,
                    accuracy = state.accuracy,
                )
                Log.d(
                    "LocationEngine",
                    "Mag FP anomaly=${"%.2f".format(anomaly)} |B|=${state.fieldUt} " +
                        "expect=${magFingerprintMap.expectedNormUt(pdrX, pdrY)}",
                )
            }
        }

        val prev = lastMagSeverity
        rotationEngine.magneticTrust = effective.magneticTrust

        // Chưa có mẫu |B|: chỉ giữ trust=0, không reanchor / không banner nhiễu.
        val probePending = effective.fieldUt == null && effective.severity == MagSeverity.WEAK
        if (probePending) {
            lastMagSeverity = effective.severity
            return
        }

        if (effective.severity == MagSeverity.OK) {
            orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
            lastGoodMapHeadingDeg = orientationManager.mapHeadingDeg
            maybeLearnHeadingGridFromCorridor()
            maybeLearnMagFingerprint()
            // Cal trung bình (GPS indoor / nhiễu cũ ~60°) → xóa khi mag tin
            if (kotlin.math.abs(headingCalibrationDeg) >= 35f) {
                pendingAbsoluteNorthRecover = true
                maybeRecoverAbsoluteNorthFromMag()
            }
        }

        if (prev != MagSeverity.OK && effective.severity == MagSeverity.OK && isRunning) {
            // Không hoàn nguyên cal lớn ghi trong nhiễu (+90 / 180 tay sai) —
            // tin lại mag tuyệt đối (cal≈0). Chỉ giữ fine-tune nhỏ.
            val goodBeforeRecover = lastGoodMapHeadingDeg
            calibBeforeMagReanchorDeg?.let { saved ->
                if (kotlin.math.abs(saved) <= MAG_RECOVER_KEEP_CAL_MAX_DEG) {
                    headingCalibrationDeg = saved
                    Log.i("LocationEngine", "Mag recover: giữ cal nhỏ=$saved")
                } else {
                    headingCalibrationDeg = 0f
                    Log.i(
                        "LocationEngine",
                        "Mag recover: bỏ cal lớn=$saved → 0 (tin mag tuyệt đối / tránh Bắc 180° sai)",
                    )
                }
                calibBeforeMagReanchorDeg = null
            }
            // Mag đã OK → bỏ trừ lưới (giữ ô đã học cho lần nhiễu sau).
            lastAppliedGridDeltaDeg = 0f
            syncOrientationOffset()
            pendingAutoFlipCheckAgainstDeg = goodBeforeRecover
            requestHeadingResync("mag_recover")
            pendingAbsoluteNorthRecover = true
        }

        lastMagSeverity = effective.severity
        if (prev != effective.severity) {
            if (effective.severity == MagSeverity.SEVERE && prev != MagSeverity.SEVERE) {
                val how = reanchorHeadingOnMagneticInterference()
                val gridAbs = kotlin.math.abs(headingCorrectionGrid.sample(pdrX, pdrY))
                Log.i(
                    "LocationEngine",
                    "Mag ${effective.severity} → reanchor=$how field=${effective.fieldUt} " +
                        "acc=${effective.accuracy} gridΔ=$gridAbs"
                )
                val msg = when (how) {
                    "corridor" ->
                        "Nhiễu từ — căn theo hành lang / gyro. Đi vài bước, app tự đảo nếu ngược Bắc–Nam"
                    "grid" ->
                        "Nhiễu từ — áp lưới. Đi vài bước, app tự đảo nếu mũi tên ngược"
                    else ->
                        "Nhiễu từ — giữ gyro. Đi theo hành lang, app tự đảo 180° nếu hướng bị ngược"
                }
                onMagneticInterferenceChanged?.invoke(true, msg)
            } else if (effective.severity != MagSeverity.SEVERE && prev == MagSeverity.SEVERE) {
                onMagneticInterferenceChanged?.invoke(false, null)
            } else if (effective.severity == MagSeverity.SEVERE) {
                onMagneticInterferenceChanged?.invoke(true, effective.messageVi)
            }
            if (isRunning) dispatchLocationUpdate()
        }
    }

    /** Học fingerprint |B| tại ô hiện tại khi mag OK + đang đi + ít xoay. */
    private fun maybeLearnMagFingerprint() {
        if (!isRunning || !hasMagFieldSample) return
        if (rotationEngine.gyroMagnitude >= GRID_LEARN_MAX_GYRO) return
        if (!(motionStateEngine.allowsPositionUpdate || recentlyAcceptedStep())) return
        magFingerprintMap.observe(pdrX, pdrY, lastMagBx, lastMagBy, lastMagBz)
    }

    /** Học Δ° ô hiện tại khi mag OK, đang đi thật, gần hành lang — không học khi xoay tại chỗ. */
    private fun maybeLearnHeadingGridFromCorridor() {
        if (!isRunning) return
        if (lastMagSeverity != MagSeverity.OK) return
        // Xoay nhanh / đứng xoay: delta so với HL = hướng người dùng, không phải bias từ.
        if (rotationEngine.gyroMagnitude >= GRID_LEARN_MAX_GYRO) return
        if (!(motionStateEngine.allowsPositionUpdate || recentlyAcceptedStep())) return
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        // Chỉ học khi mũi tên đã gần trục hành lang (bias cục bộ), không ép học lệch lớn.
        val expected = findNearbyCorridorHeadingTarget(
            maxDistPx = 80f,
            referenceMapHeadingDeg = orientationManager.mapHeadingDeg,
            maxAlignDeg = GRID_LEARN_MAX_ALIGN_DEG,
        ) ?: return
        val delta = HeadingReferenceFrame.localGridDelta(
            deviceHeadingDeg = orientationManager.deviceHeadingDeg,
            baseDeg = mapNorthOffsetBaseDeg,
            calibDeg = headingCalibrationDeg,
            expectedMapHeadingDeg = expected,
        )
        // |Δ|~180°: tín hiệu đảo Bắc/Nam toàn cục — không nhét vào ô (ô chỉ bias nhỏ).
        maybeDetectFlipFromResidual(delta, source = "grid_learn")
        if (kotlin.math.abs(delta) > GRID_LEARN_MAX_DELTA_DEG) return
        headingCorrectionGrid.observe(pdrX, pdrY, delta)
        refreshGridOffsetIfNeeded()
    }

    /**
     * Dựa trên residual so với hướng chuẩn (hành lang / hướng đi):
     * - nhỏ → ma trận ô (bias cục bộ)
     * - ~180° lặp lại → đảo cal toàn phiên (Bắc↔Nam)
     */
    private fun maybeDetectFlipFromResidual(deltaDeg: Float, source: String) {
        val now = System.currentTimeMillis()
        if (now - lastAutoFlip180Ms < AUTO_FLIP_180_COOLDOWN_MS) return
        val mag = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(0f, deltaDeg))
        when {
            mag >= 150f -> {
                matrixFlip180Votes++
                Log.d(
                    "LocationEngine",
                    "Matrix/residual flip vote=$matrixFlip180Votes Δ=${"%.0f".format(deltaDeg)}° src=$source",
                )
                if (matrixFlip180Votes >= MATRIX_FLIP_180_VOTES_NEEDED) {
                    matrixFlip180Votes = 0
                    applyAutoFlip180(reason = "matrix_residual_180:$source")
                }
            }
            mag <= 35f -> matrixFlip180Votes = (matrixFlip180Votes - 1).coerceAtLeast(0)
            else -> { /* lệch trung bình: bỏ, không vote */ }
        }
    }

    /**
     * So device với hướng đi thật (Δ vị trí bước) + trục HL gần nhất.
     * Cho phép biết lệch ~180° dù mũi tên đang chỉ sai (khác learn-grid chỉ khi đã gần HL).
     */
    private fun maybeDetectFlipFromTravel(dx: Float, dy: Float) {
        val dist = kotlin.math.hypot(dx.toDouble(), dy.toDouble()).toFloat()
        if (dist < 2f) return
        val travelDeg = MapHeadingMath.normalizeDegrees(
            Math.toDegrees(kotlin.math.atan2(dx.toDouble(), -dy.toDouble())).toFloat(),
        )
        val nearest = graphModel.findNearestEdge(pdrX, pdrY) ?: return
        val (edge, distPx) = nearest
        if (distPx > 90f) return
        val fwd = Math.toDegrees(edge.angleRad.toDouble()).toFloat()
        val bwd = Math.toDegrees(edge.reverseAngleRad.toDouble()).toFloat()
        val dF = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(travelDeg, fwd))
        val dB = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(travelDeg, bwd))
        if (dF.coerceAtMost(dB) > 40f) return // chưa đi dọc HL
        val expected = if (dF <= dB) fwd else bwd
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        val delta = HeadingReferenceFrame.localGridDelta(
            deviceHeadingDeg = orientationManager.deviceHeadingDeg,
            baseDeg = mapNorthOffsetBaseDeg,
            calibDeg = headingCalibrationDeg,
            expectedMapHeadingDeg = expected,
        )
        maybeDetectFlipFromResidual(delta, source = "travel_vs_device")
    }

    /**
     * Khi nhiễu SEVERE — không ghi cal lớn (tránh lấy hướng lệch làm “Bắc tạm”):
     * 1) **grid** — ô đã học Δ° nhỏ, không đụng calib
     * 2) **corridor** — chỉ khi đang đi và đã gần trục HL ≤40° (cal cần ≤40°)
     * 3) **hold** — gyro/Game RV; mũi tên = device − (base+cal cũ); KHÔNG last_good
     */
    private fun reanchorHeadingOnMagneticInterference(): String {
        orientationManager.clearLearnedMovementAndNavSmooth()
        holdGridDeltaAfterRelocate = false
        if (calibBeforeMagReanchorDeg == null) {
            calibBeforeMagReanchorDeg = headingCalibrationDeg
        }
        // Trong nhiễu: luôn về cal=0 — không giữ “Bắc giả” từ last_good/QR lệch.
        headingCalibrationDeg = 0f

        val gridDelta = headingCorrectionGrid.sample(pdrX, pdrY)
        val gridSamples = headingCorrectionGrid.sampleCountAt(pdrX, pdrY)

        // 1) Lưới đủ mẫu → chỉ áp Δ ô, không đổi “tâm Bắc”
        if (gridSamples >= 2 && kotlin.math.abs(gridDelta) >= 1f) {
            lastAppliedGridDeltaDeg = gridDelta
            syncOrientationOffset()
            return "grid"
        }

        lastAppliedGridDeltaDeg = 0f
        val walking = motionStateEngine.allowsPositionUpdate || recentlyAcceptedStep()

        // 2) Corridor — chỉ chỉnh nhẹ khi đã gần hướng hành lang (không ép 90°)
        if (walking) {
            orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
            val corridor = findNearbyCorridorHeadingTarget(
                referenceMapHeadingDeg = orientationManager.mapHeadingDeg,
                maxAlignDeg = CORRIDOR_REANCHOR_MAX_ALIGN_DEG,
            )
            if (corridor != null &&
                tryApplySessionCalibCapped(corridor, gridDelta = 0f, maxAbsCalDeg = CORRIDOR_REANCHOR_MAX_ALIGN_DEG)
            ) {
                return "corridor"
            }
        }

        // 3) hold — không khóa last_good / không đổi Bắc
        syncOrientationOffset()
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        return "hold"
    }

    /**
     * Chỉ ghi calib tạm nếu |cal| ≤ [maxAbsCalDeg].
     * Tránh session log kiểu cal≈+112° biến hướng lệch thành tâm Bắc.
     */
    private fun tryApplySessionCalibCapped(
        targetMapHeadingDeg: Float,
        gridDelta: Float,
        maxAbsCalDeg: Float,
    ): Boolean {
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        val needed = HeadingReferenceFrame.calibrationToMatchTarget(
            orientationManager.deviceHeadingDeg,
            mapNorthOffsetBaseDeg,
            targetMapHeadingDeg,
            gridDelta,
        )
        val mag = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(0f, needed))
        if (mag > maxAbsCalDeg) {
            Log.i(
                "LocationEngine",
                "Skip session calib |cal|=${"%.1f".format(mag)}° > $maxAbsCalDeg (target=$targetMapHeadingDeg)",
            )
            return false
        }
        headingCalibrationDeg = needed
        lastAppliedGridDeltaDeg = gridDelta
        syncOrientationOffset()
        orientationManager.clearLearnedMovementAndNavSmooth()
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        return true
    }

    // applySessionCalib không giới hạn đã gỡ — chỉ dùng tryApplySessionCalibCapped.

    /**
     * Hướng cạnh graph gần user.
     * Chỉ trả về nếu lệch so với [referenceMapHeadingDeg] ≤ [maxAlignDeg].
     */
    private fun findNearbyCorridorHeadingTarget(
        maxDistPx: Float = 100f,
        referenceMapHeadingDeg: Float,
        maxAlignDeg: Float = CORRIDOR_REANCHOR_MAX_ALIGN_DEG,
    ): Float? {
        if (!isRunning) return null
        val nearest = graphModel.findNearestEdge(pdrX, pdrY) ?: return null
        val (edge, distPx) = nearest
        if (distPx > maxDistPx) return null
        val fwd = Math.toDegrees(edge.angleRad.toDouble()).toFloat()
        val bwd = Math.toDegrees(edge.reverseAngleRad.toDouble()).toFloat()
        val dFwd = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(referenceMapHeadingDeg, fwd))
        val dBwd = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(referenceMapHeadingDeg, bwd))
        val best = if (dFwd <= dBwd) fwd to dFwd else bwd to dBwd
        if (best.second > maxAlignDeg) return null
        return best.first
    }

    /** Học lưới khi mag OK — chỉ lấy cạnh gần hướng hiện tại (bias nhỏ). */
    private fun findNearbyCorridorHeadingTarget(maxDistPx: Float = 100f): Float? {
        val ref = lastGoodMapHeadingDeg ?: run {
            orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
            orientationManager.mapHeadingDeg
        }
        return findNearbyCorridorHeadingTarget(
            maxDistPx = maxDistPx,
            referenceMapHeadingDeg = ref,
            maxAlignDeg = GRID_LEARN_MAX_ALIGN_DEG,
        )
    }

    private fun refreshGridOffsetIfNeeded() {
        if (holdGridDeltaAfterRelocate) {
            if (motionStateEngine.allowsPositionUpdate || recentlyAcceptedStep()) {
                holdGridDeltaAfterRelocate = false
            } else {
                return
            }
        }
        // Mag OK: mũi tên = device − (base+cal). Lưới chỉ áp khi nhiễu SEVERE (tránh Δ~70° như log).
        val d = if (lastMagSeverity == MagSeverity.SEVERE) {
            headingCorrectionGrid.sample(pdrX, pdrY)
        } else {
            0f
        }
        if (kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(lastAppliedGridDeltaDeg, d)) < 0.5f) {
            return
        }
        lastAppliedGridDeltaDeg = d
        syncOrientationOffset()
    }

    private fun resetMagneticGuard() {
        magneticGuard.reset()
        rotationEngine.magneticTrust = 0f
        val wasInterfered = lastMagSeverity == MagSeverity.SEVERE
        lastMagSeverity = MagSeverity.WEAK
        lastGoodMapHeadingDeg = null
        calibBeforeMagReanchorDeg?.let { saved ->
            headingCalibrationDeg = saved
            calibBeforeMagReanchorDeg = null
            syncOrientationOffset()
        }
        if (wasInterfered) {
            onMagneticInterferenceChanged?.invoke(false, null)
        }
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
        // Mag recover: RV mới đảo ~180° so với last-good → tự đảo cal (không cần user).
        pendingAutoFlipCheckAgainstDeg?.let { good ->
            pendingAutoFlipCheckAgainstDeg = null
            val nowMap = orientationManager.mapHeadingDeg
            val jump = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(good, nowMap))
            if (jump >= 150f) {
                Log.i(
                    "LocationEngine",
                    "Auto-flip 180° after resync: lastGood=$good now=$nowMap jump=$jump",
                )
                applyAutoFlip180(reason = "mag_recover_vs_last_good")
            }
        }
        // Sau resync mag OK: thử bỏ cal lớn nếu frame tuyệt đối khớp HL.
        maybeRecoverAbsoluteNorthFromMag()
        Log.i(
            "LocationEngine",
            "Heading resync applied reason=$reason" +
                " mapH=" + orientationManager.mapHeadingDeg +
                " navH=" + currentNavigationHeadingDeg() +
                " pitch=" + rotationEngine.lastPitchDeg
        )
        if (isRunning) dispatchLocationUpdate()
    }

    private fun applyAutoFlip180(reason: String) {
        val now = System.currentTimeMillis()
        if (now - lastAutoFlip180Ms < AUTO_FLIP_180_COOLDOWN_MS) return
        lastAutoFlip180Ms = now
        autoFlip180Votes = 0
        matrixFlip180Votes = 0
        invertHeading180()
        Log.i("LocationEngine", "Auto-flip 180° applied reason=$reason cal=$headingCalibrationDeg")
        onMagneticInterferenceChanged?.invoke(
            lastMagSeverity == MagSeverity.SEVERE,
            "Đã tự đảo hướng 180° — mũi tên khớp hướng đi / hành lang",
        )
    }

    /**
     * Tự phát hiện Bắc–Nam bị đảo: hướng mũi tên dọc HL nhưng phía trước bị tường,
     * phía ngược lại mở → vote; đủ vote thì đảo cal 180° (không bắt bấm nút).
     */
    private fun maybeAutoFlip180FromWalk(attemptedHeadingDeg: Float, stepMovedPx: Float) {
        val now = System.currentTimeMillis()
        if (now - lastAutoFlip180Ms < AUTO_FLIP_180_COOLDOWN_MS) return
        val nearest = graphModel.findNearestEdge(pdrX, pdrY) ?: run {
            autoFlip180Votes = (autoFlip180Votes - 1).coerceAtLeast(0)
            return
        }
        val (edge, distPx) = nearest
        if (distPx > 80f) {
            autoFlip180Votes = (autoFlip180Votes - 1).coerceAtLeast(0)
            return
        }
        val fwd = Math.toDegrees(edge.angleRad.toDouble()).toFloat()
        val bwd = Math.toDegrees(edge.reverseAngleRad.toDouble()).toFloat()
        val probePx = (0.40f * pixelsPerMeter).coerceIn(14f, 32f)
        fun open(headingDeg: Float): Boolean {
            val rad = Math.toRadians(headingDeg.toDouble())
            val tx = pdrX + probePx * kotlin.math.sin(rad).toFloat()
            val ty = pdrY - probePx * kotlin.math.cos(rad).toFloat()
            return !graphModel.crossesWall(pdrX, pdrY, tx, ty)
        }
        val dFwd = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(attemptedHeadingDeg, fwd))
        val dBwd = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(attemptedHeadingDeg, bwd))
        val alongAxis = dFwd.coerceAtMost(dBwd) <= 40f
        val openFwd = open(attemptedHeadingDeg)
        val openBack = open(MapHeadingMath.normalizeDegrees(attemptedHeadingDeg + 180f))
        val blockedForward = stepMovedPx < 1.8f || !openFwd
        val inverted = alongAxis && blockedForward && openBack
        if (inverted) {
            autoFlip180Votes++
            Log.d(
                "LocationEngine",
                "Auto-flip vote=$autoFlip180Votes moved=$stepMovedPx " +
                    "openFwd=$openFwd openBack=$openBack h=$attemptedHeadingDeg",
            )
        } else if (openFwd && stepMovedPx >= 2.5f && alongAxis) {
            autoFlip180Votes = 0
        } else {
            autoFlip180Votes = (autoFlip180Votes - 1).coerceAtLeast(0)
        }
        if (autoFlip180Votes >= AUTO_FLIP_180_VOTES_NEEDED) {
            applyAutoFlip180(reason = "walk_against_corridor")
        }
    }

    /**
     * Căn Map theo hướng đi thật (Δ vị trí bước) — slew calib, không blend UI.
     * Mag nhiễu: ưu tiên travel (chuẩn tin hơn la bàn). Mag OK: chỉ chỉnh lệch vừa.
     */
    private fun tryTravelHeadingRecalibration() {
        if (!HeadingAssistFlags.ENABLE_TRAVEL_HEADING_RECALIB) return
        if (!OrientationManager.ENABLE_TRAVEL_HEADING_RECALIB) return
        if (System.currentTimeMillis() < turnFreezeUntilMs) return
        if (rotationEngine.gyroMagnitude >= GRID_LEARN_MAX_GYRO) return
        val minDisagree = when (lastMagSeverity) {
            MagSeverity.SEVERE -> 22f
            MagSeverity.WEAK -> 28f
            MagSeverity.OK -> 38f
        }
        val continuous = lastMagSeverity != MagSeverity.OK
        val target = orientationManager.peekMovementRecalibrationTarget(
            minDisagreeDeg = minDisagree,
            requireOfferGate = !continuous,
        ) ?: return
        // Mag OK: chỉ neo khi travel gần hành lang (tránh kéo theo bước snap sai)
        if (lastMagSeverity == MagSeverity.OK) {
            val corridor = findNearbyCorridorHeadingTarget(
                referenceMapHeadingDeg = target,
                maxAlignDeg = 28f,
            ) ?: return
            if (kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(target, corridor)) > 28f) return
        }
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        val desiredCal = MapHeadingMath.calibrationToMatchTarget(
            orientationManager.deviceHeadingDeg,
            mapNorthOffsetBaseDeg,
            target,
        )
        val delta = MapHeadingMath.shortestDeltaDegrees(headingCalibrationDeg, desiredCal)
        val maxStep = when (lastMagSeverity) {
            MagSeverity.SEVERE -> TRAVEL_RECALIB_SLEW_DEG
            MagSeverity.WEAK -> TRAVEL_RECALIB_SLEW_DEG * 0.85f
            MagSeverity.OK -> TRAVEL_RECALIB_SLEW_DEG * 0.55f
        }
        val step = delta.coerceIn(-maxStep, maxStep)
        headingCalibrationDeg = MapHeadingMath.normalizeDegrees(headingCalibrationDeg + step)
        syncOrientationOffset()
        if (!continuous && kotlin.math.abs(delta) <= MOVEMENT_RECALIB_DONE_DEG) {
            orientationManager.markRecalibrationDone()
            Log.i(
                "LocationEngine",
                "Travel→MapHeading recalib DONE target=$target cal=$headingCalibrationDeg mag=$lastMagSeverity",
            )
        } else {
            Log.d(
                "LocationEngine",
                "Travel→MapHeading recalib slew step=$step remain=$delta mag=$lastMagSeverity",
            )
        }
    }

    /**
     * HDE nhẹ: đi thẳng gần 0/90/180/270° → kéo calib về cardinal vài độ/bước.
     */
    private fun maybeApplyLightHde() {
        if (!HeadingAssistFlags.ENABLE_LIGHT_HDE) return
        if (System.currentTimeMillis() < turnFreezeUntilMs) return
        if (rotationEngine.gyroMagnitude >= GRID_LEARN_MAX_GYRO) return
        if (!(motionStateEngine.allowsPositionUpdate || recentlyAcceptedStep())) return
        val travel = orientationManager.movementHeadingDeg
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        val mapH = orientationManager.mapHeadingDeg
        val card = DominantHeadingEstimator.softTargetDeg(mapH, travel) ?: return
        // Chỉ khi gần hành lang cùng trục (tránh ép ở ngã tư / chéo)
        findNearbyCorridorHeadingTarget(
            referenceMapHeadingDeg = card,
            maxAlignDeg = 25f,
        ) ?: return
        val desiredCal = MapHeadingMath.calibrationToMatchTarget(
            orientationManager.deviceHeadingDeg,
            mapNorthOffsetBaseDeg,
            card,
        )
        val delta = MapHeadingMath.shortestDeltaDegrees(headingCalibrationDeg, desiredCal)
        if (kotlin.math.abs(delta) < 2f) return
        val step = delta.coerceIn(-HDE_SLEW_DEG, HDE_SLEW_DEG)
        headingCalibrationDeg = MapHeadingMath.normalizeDegrees(headingCalibrationDeg + step)
        syncOrientationOffset()
        Log.d(
            "LocationEngine",
            "HDE soft pull mapH=$mapH → $card step=$step cal=$headingCalibrationDeg",
        )
    }

    /** Legacy gate — UI blend tắt; dùng [tryTravelHeadingRecalibration]. */
    private fun tryMovementRecalibration() {
        tryTravelHeadingRecalibration()
    }

    /**
     * Seed / cập nhật Map Heading từ GPS course (Bắc thật).
     * Lệch ≥120° → snap calib; lệch vừa → slew. Dùng cả lúc vào indoor và GPS assist.
     */
    fun seedFromOutdoorGpsCourse(trueNorthBearingDeg: Float) {
        if (!HeadingAssistFlags.ENABLE_GPS_HEADING_ASSIST) {
            pendingOutdoorGpsCourseDeg = null
            Log.d("LocationEngine", "GPS heading assist OFF — bỏ seed course")
            return
        }
        pendingOutdoorGpsCourseDeg = MapHeadingMath.normalizeDegrees(trueNorthBearingDeg)
        Log.d("LocationEngine", "Pending outdoor GPS course seed=$pendingOutdoorGpsCourseDeg")
        tryApplyOutdoorGpsCourseSeed()
    }

    /** GPS course lúc đang indoor (cửa sổ / sân / ra ngoài tạm) — sửa Bắc 180° sai. */
    fun applyGpsCourseCorrection(trueNorthBearingDeg: Float): Boolean {
        if (!HeadingAssistFlags.ENABLE_GPS_HEADING_ASSIST) return false
        // Mag ổn → tin la bàn tuyệt đối. GPS indoor (multipath) dễ lệch ~60° so với key la bàn.
        if (lastMagSeverity == MagSeverity.OK && rotationEngine.magneticTrust >= 0.85f) {
            Log.d(
                "LocationEngine",
                "GPS course ignored — mag OK (tránh kéo mũi tên lệch so với la bàn)",
            )
            return false
        }
        val course = MapHeadingMath.normalizeDegrees(trueNorthBearingDeg)
        if (!hasRotationVectorFix) {
            pendingOutdoorGpsCourseDeg = course
            return false
        }
        val now = System.currentTimeMillis()
        if (now - lastGpsCourseCorrectMs < GPS_COURSE_CORRECT_COOLDOWN_MS) return false
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        val desired = MapHeadingMath.calibrationToMatchGpsCourse(
            orientationManager.deviceHeadingDeg,
            mapNorthOffsetBaseDeg,
            course,
        )
        val delta = MapHeadingMath.shortestDeltaDegrees(headingCalibrationDeg, desired)
        if (kotlin.math.abs(delta) < 8f) return false
        lastGpsCourseCorrectMs = now
        // GPS độc lập tọa độ → tin hơn cal tay/PDR: lệch ≥60° snap, còn lại slew mạnh
        if (kotlin.math.abs(delta) >= 60f) {
            headingCalibrationDeg = desired
            Log.i(
                "LocationEngine",
                "GPS course SNAP course=$course Δcal=$delta → cal=$desired",
            )
        } else {
            val step = delta.coerceIn(-GPS_COURSE_SLEW_DEG, GPS_COURSE_SLEW_DEG)
            headingCalibrationDeg = MapHeadingMath.normalizeDegrees(headingCalibrationDeg + step)
            Log.i(
                "LocationEngine",
                "GPS course slew course=$course step=$step cal=$headingCalibrationDeg",
            )
        }
        lastAppliedGridDeltaDeg = 0f
        pendingOutdoorGpsCourseDeg = null
        syncOrientationOffset()
        orientationManager.clearLearnedMovementAndNavSmooth()
        if (isRunning) dispatchLocationUpdate()
        return true
    }

    private fun tryApplyOutdoorGpsCourseSeed() {
        val course = pendingOutdoorGpsCourseDeg ?: return
        if (!hasRotationVectorFix) return
        pendingOutdoorGpsCourseDeg = null
        applyGpsCourseCorrection(course)
    }

    /**
     * Khi mag OK: tin la bàn tuyệt đối — xóa cal lệch so với la bàn key
     * (GPS indoor ~60°, +90/180 lúc nhiễu).
     */
    private fun maybeRecoverAbsoluteNorthFromMag() {
        if (lastMagSeverity != MagSeverity.OK) return
        if (rotationEngine.magneticTrust < 0.95f) return
        if (rotationEngine.gyroMagnitude >= GRID_LEARN_MAX_GYRO) return
        val now = System.currentTimeMillis()
        val force = pendingAbsoluteNorthRecover
        if (!force && now - lastAbsoluteNorthRecoverMs < ABSOLUTE_NORTH_RECOVER_COOLDOWN_MS) return
        if (!force && kotlin.math.abs(headingCalibrationDeg) < 35f) return

        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        val device = orientationManager.deviceHeadingDeg
        val mapZero = MapHeadingMath.deviceToMapHeading(device, mapNorthOffsetBaseDeg)
        val mapNow = orientationManager.mapHeadingDeg
        val travel = orientationManager.movementHeadingDeg
        val corridor = findNearbyCorridorHeadingTarget(
            referenceMapHeadingDeg = mapZero,
            maxAlignDeg = 45f,
        )
        val ref = when {
            corridor != null -> corridor
            travel != null -> travel
            else -> null
        }

        var cleared = false
        if (ref != null) {
            val alignZero = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(mapZero, ref))
            val alignNow = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(mapNow, ref))
            if (alignZero <= 40f && alignNow >= 120f) {
                headingCalibrationDeg = 0f
                cleared = true
                Log.i(
                    "LocationEngine",
                    "Absolute mag recover: cal→0 (mapZero khớp HL/travel, mapNow lệch ~180°) " +
                        "ref=$ref zero=$mapZero now=$mapNow",
                )
            } else if (alignZero <= 35f && kotlin.math.abs(headingCalibrationDeg) >= 70f) {
                val desired = MapHeadingMath.calibrationToMatchTarget(
                    device, mapNorthOffsetBaseDeg, ref,
                )
                if (kotlin.math.abs(desired) <= 45f) {
                    headingCalibrationDeg = desired
                    cleared = true
                    Log.i(
                        "LocationEngine",
                        "Absolute mag recover: cal→$desired (khớp HL bằng mag tuyệt đối)",
                    )
                }
            }
        }
        // Cal ~±180° / |cal| rất lớn + mag OK: bỏ — publish north đáng tin hơn chỉnh tay lúc nhiễu
        if (!cleared && kotlin.math.abs(headingCalibrationDeg) >= 150f) {
            headingCalibrationDeg = 0f
            cleared = true
            Log.i("LocationEngine", "Absolute mag recover: clear |cal|≥150° → 0")
        }
        // Lệch trung bình (thường GPS indoor ~60°): mag OK → về Bắc tuyệt đối (cal=0)
        // để mũi tên khớp la bàn key; giữ fine-tune nhỏ |cal|<35°.
        if (!cleared && kotlin.math.abs(headingCalibrationDeg) >= 35f) {
            val before = headingCalibrationDeg
            headingCalibrationDeg = 0f
            cleared = true
            Log.i(
                "LocationEngine",
                "Absolute mag recover: clear mid cal=$before → 0 (khớp la bàn khi không nhiễu)",
            )
        }

        if (cleared) {
            lastAbsoluteNorthRecoverMs = now
            pendingAbsoluteNorthRecover = false
            lastAppliedGridDeltaDeg = 0f
            syncOrientationOffset()
            orientationManager.clearLearnedMovementAndNavSmooth()
            onMagneticInterferenceChanged?.invoke(
                false,
                null,
            )
            if (isRunning) dispatchLocationUpdate()
        } else if (force && kotlin.math.abs(headingCalibrationDeg) < 35f) {
            pendingAbsoluteNorthRecover = false
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
        val magHold = rotationEngine.magneticTrust < 0.5f
        return orientationManager.navigationHeading(
            walking = walking,
            turning = turning,
            magneticHold = magHold,
        )
    }

    /** Device heading (Bắc địa lý) — kim N trên CompassButton. */
    fun currentDeviceHeadingDeg(): Float {
        orientationManager.updateDeviceHeading(rotationEngine.smoothHeading.value)
        return orientationManager.deviceHeadingDeg
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



    private var lastStepLengthMeters = 0.25f // khớp sải chân danh định StepDetector







    // Scale: pixelsPerMeter khai báo sớm (cạnh graphModel) để lưới hướng dùng được



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
private val TRAVEL_RECALIB_SLEW_DEG = 10f
private val MOVEMENT_RECALIB_DONE_DEG = 6f
/** HDE nhẹ: kéo về cardinal mỗi bước. */
private val HDE_SLEW_DEG = 4f
/** Mag recover: chỉ giữ cal tay nhỏ; bỏ +90/+180 ghi lúc nhiễu. */
private val MAG_RECOVER_KEEP_CAL_MAX_DEG = 40f
private val ABSOLUTE_NORTH_RECOVER_COOLDOWN_MS = 8_000L
private val GPS_COURSE_CORRECT_COOLDOWN_MS = 6_000L
private val GPS_COURSE_SLEW_DEG = 25f

/** Sau QR: vài bước đầu ngắn hơn — tránh chấm đã ra hành lang trước khi tới cửa */
private var stepsSinceLocalization = 0

/** Khoa vi tri sau QR: ngan sensor moi bat sinh WALKING/buoc gia — khong can 3s (cam giac tre khi di ngay) */
private var positionLockUntilMs: Long = 0L
private val QR_POSITION_LOCK_MS = 800L
/** Chỉ snap hành lang khi hướng đã gần trục cạnh (tránh ép vuông góc ~90°). */
private val CORRIDOR_REANCHOR_MAX_ALIGN_DEG = 40f
/** Học lưới: chỉ bias từ cục bộ nhỏ; không học khi xoay tại chỗ (log Δ~70°). */
private val GRID_LEARN_MAX_ALIGN_DEG = 25f
private val GRID_LEARN_MAX_DELTA_DEG = 25f
private val GRID_LEARN_MAX_GYRO = 0.35f
/** Tự đảo Bắc–Nam khi đi ngược HL. */
private val AUTO_FLIP_180_VOTES_NEEDED = 3
private val AUTO_FLIP_180_COOLDOWN_MS = 20_000L
/** Residual ~180° từ so device↔hành lang / hướng đi. */
private val MATRIX_FLIP_180_VOTES_NEEDED = 4
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

    /** Cạnh path chỉ đường — khi có, chấm user bám đường xanh thay vì cạnh graph lân cận. */
    private var routeSnapEdges: List<GraphEdge> = emptyList()
    /** Chỉ số cạnh + t đã đi trên route — tránh snap kéo ngược về đỉnh góc. */
    private var routeSnapEdgeIndex: Int = 0
    private var routeSnapT: Float = 0f

    fun setRouteSnapEdges(edges: List<GraphEdge>) {
        routeSnapEdges = edges
        routeSnapEdgeIndex = 0
        routeSnapT = 0f
        if (edges.isEmpty()) return
        // Giống fix cũ (e86ee98): bám cạnh path A* — chỉ kéo VUÔNG GÓC, không nhảy dọc tới đích.
        seedRouteSnapProgressFromCurrentPosition()
        snapLaterallyToCurrentRouteEdge(strength = 0.95f)
        // Quan trọng: cập nhật committed — nếu không, lúc STILL sẽ pin lại vị trí lệch cũ.
        committedX = pdrX
        committedY = pdrY
        qrAnchorX = pdrX
        qrAnchorY = pdrY
        dispatchLocationUpdate()
    }

    /** Gán progress route = cạnh gần PDR nhất trên toàn path (thuần khoảng cách). */
    private fun seedRouteSnapProgressFromCurrentPosition() {
        if (routeSnapEdges.isEmpty()) return
        var bestIdx = 0
        var bestT = 0f
        var bestDist = Float.MAX_VALUE
        for (idx in routeSnapEdges.indices) {
            val edge = routeSnapEdges[idx]
            val (dist, t) = projectToSegment(
                pdrX, pdrY,
                edge.sourceX, edge.sourceY,
                edge.targetX, edge.targetY,
            )
            if (dist < bestDist) {
                bestDist = dist
                bestIdx = idx
                bestT = t
            }
        }
        routeSnapEdgeIndex = bestIdx
        routeSnapT = bestT
    }

    /** Kéo PDR lên chiếu của cạnh route hiện tại — không đổi tiến độ dọc path. */
    private fun snapLaterallyToCurrentRouteEdge(strength: Float) {
        if (routeSnapEdges.isEmpty()) return
        val idx = routeSnapEdgeIndex.coerceIn(0, routeSnapEdges.lastIndex)
        val edge = routeSnapEdges[idx]
        val t = routeSnapT.coerceIn(0f, 1f)
        val projX = edge.sourceX + t * (edge.targetX - edge.sourceX)
        val projY = edge.sourceY + t * (edge.targetY - edge.sourceY)
        val dx = pdrX - projX
        val dy = pdrY - projY
        val dist = kotlin.math.sqrt(dx * dx + dy * dy)
        if (dist > 4.5f * pixelsPerMeter) return
        if (graphModel.crossesWall(pdrX, pdrY, projX, projY)) return
        pdrX += (projX - pdrX) * strength.coerceIn(0f, 1f)
        pdrY += (projY - pdrY) * strength.coerceIn(0f, 1f)
    }







    init {



        setupSensors()



    }







    private fun setupSensors() {



        // Linear Accel: MotionStateEngine (G3 gate) + RealtimeMotionEstimator (velocity)



        sensorCollector.onLinearAccelUpdate = { values, _ ->



            lastLinSample[0] = values[0]
            lastLinSample[1] = values[1]
            lastLinSample[2] = values[2]
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

            refreshPhoneContext()



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
                            snapPosition(currentNavigationHeadingDeg(), forceStrong = false)
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



            lastGyroSample[0] = values[0]
            lastGyroSample[1] = values[1]
            lastGyroSample[2] = values[2]
            refreshPhoneContext()

            rotationEngine.updateGyro(values, timestampNs)

            // Khi nhiễu từ trường: đẩy UI theo gyro / Game RV
            val magHold = rotationEngine.magneticTrust < 0.5f
            if (isRunning && (!hasRotationVectorFix || magHold)) {
                dispatchLocationUpdate()
            }



        }

        // Game RV (không mag): khi nhiễu — xoay máy bám delta, tránh lệch gyro thô
        sensorCollector.onGameRotationUpdate = { values, _ ->
            syncDisplayRotation()
            rotationEngine.updateGameRotationVector(values)
            if (isRunning && rotationEngine.magneticTrust < 0.5f) {
                dispatchLocationUpdate()
            }
        }







        // Từ trường: accuracy + |B| → tự hiệu chỉnh khi nhiễu / trả la bàn khi hết
        sensorCollector.onMagneticUpdate = { values, _ ->
            lastMagBx = values[0]
            lastMagBy = values[1]
            lastMagBz = values[2]
            hasMagFieldSample = true
            applyMagneticGuard(
                magneticGuard.onFieldSample(values[0], values[1], values[2], System.currentTimeMillis())
            )
        }
        sensorCollector.onMagneticAccuracyChanged = { accuracy ->
            applyMagneticGuard(
                magneticGuard.onAccuracy(accuracy, System.currentTimeMillis())
            )
        }
        sensorCollector.onRotationAccuracyChanged = { accuracy ->
            if (accuracy <= MagneticInterferenceGuard.ACCURACY_UNRELIABLE) {
                applyMagneticGuard(
                    magneticGuard.onAccuracy(accuracy, System.currentTimeMillis())
                )
            }
        }

        // Gia tốc -> Đếm bước chân



        sensorCollector.onAccelUpdate = { values, timestampNs ->
            lastAccelSample[0] = values[0]
            lastAccelSample[1] = values[1]
            lastAccelSample[2] = values[2]
            orientationManager.updateAccelForPose(values[0], values[1], values[2])
            rotationEngine.updateGravity(values[0], values[1], values[2])
            stepDetector.onAccelData(values[0], values[1], values[2])
            refreshPhoneContext()
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

    private fun refreshPhoneContext() {
        val changed = phoneContextDetector.update(
            ax = lastAccelSample[0],
            ay = lastAccelSample[1],
            az = lastAccelSample[2],
            linX = lastLinSample[0],
            linY = lastLinSample[1],
            linZ = lastLinSample[2],
            gx = lastGyroSample[0],
            gy = lastGyroSample[1],
            gz = lastGyroSample[2],
            motion = motionStateEngine.currentState,
        )
        val ctx = phoneContextDetector.current
        orientationManager.setSwingHeadingUnreliable(ctx.stability == HoldStability.SWINGING)
        if (changed != null) {
            sensorSessionLogger.logEvent(
                "phone_context",
                mapOf(
                    "label" to changed.labelVi,
                    "body" to changed.body.name,
                    "carry" to changed.carry.name,
                    "stability" to changed.stability.name,
                )
            )
            onPhoneContextChanged?.invoke(changed)
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
        // Tự ghi heading_*.jsonl trong sensor_logs cùng lúc với session_*.jsonl.
        headingMotionRecorder.start(
            appContext,
            mapOf(
                "note" to "auto_with_sensor",
                "anchor" to anchor,
                "map_bearing_offset" to mapNorthOffsetBaseDeg,
                "calib" to headingCalibrationDeg,
                "node_count" to graphModel.nodeMap.size,
            ),
        )
        motionStateEngine.reset()
        phoneContextDetector.reset()
        orientationManager.setSwingHeadingUnreliable(false)
    }

    private fun endSensorLogging() {
        sensorCollector.sensorLogger = null
        sensorSessionLogger.stopSession()
        headingMotionRecorder.stop()
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
        routeSnapEdgeIndex = 0
        routeSnapT = 0f
        stepsSinceLocalization = 0
        qrAnchorX = pdrX
        qrAnchorY = pdrY
        committedX = pdrX
        committedY = pdrY
        positionLockUntilMs = System.currentTimeMillis() + QR_POSITION_LOCK_MS
        lastAcceptedStepMs = 0L
        motionStateEngine.reset()
        phoneContextDetector.reset()
        orientationManager.setSwingHeadingUnreliable(false)
        realtimeMotionEstimator.reset()
        rotationEngine.setWalking(false)
        // Không khóa hướng vào nhà — mũi tên theo đầu máy; Bắc = map_bearing_offset (không cal tạm).
        val preservedMapHeading = lastGoodMapHeadingDeg
            ?: orientationManager.mapHeadingDeg.takeIf { isRunning }
        headingCalibrationDeg = 0f
        calibBeforeMagReanchorDeg = null
        lastAppliedGridDeltaDeg = 0f
        lastGoodMapHeadingDeg = null
        resetMagneticGuard()
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
        // Nhiễu / chưa có mag: neo theo hành lang — không để hướng máy = Bắc map.
        seedHeadingAfterLocalization(preservedMapHeading)
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

    /** Giữ vị trí sau neo cầu thang / QR — chặn bước PDR trong durationMs. */
    fun lockPositionFor(durationMs: Long) {
        val ms = durationMs.coerceAtLeast(0L)
        positionLockUntilMs = System.currentTimeMillis() + ms
        qrAnchorX = pdrX
        qrAnchorY = pdrY
        committedX = pdrX
        committedY = pdrY
    }

    /** Mở khóa PDR ngay — bước chân tiếp tục cập nhật vị trí. */
    fun clearPositionLock() {
        positionLockUntilMs = 0L
    }







    /** Bắt đầu khi có toạ độ x, y (Fallback khi map chưa vẽ đồ thị) */



    fun startWithPosition(x: Float, y: Float) {

        pdrX = x

        pdrY = y

        hasRotationVectorFix = false

        tpfEngine.particles.clear() // Không chạy TPF được vì không có node

        // Giống QR: reset smoother — tránh mũi tên kẹt góc cũ.
        // Không seed 0° (hướng máy = Bắc); neo theo hành lang / last-good.
        if (isRunning) {
            sensorCollector.stop()
        }
        val preservedMapHeading = lastGoodMapHeadingDeg
            ?: orientationManager.mapHeadingDeg.takeIf { isRunning }
        headingCalibrationDeg = 0f
        calibBeforeMagReanchorDeg = null
        lastAppliedGridDeltaDeg = 0f
        lastGoodMapHeadingDeg = null
        resetMagneticGuard()
        rotationEngine.reset()
        orientationManager.reset()
        syncOrientationOffset()
        seedHeadingAfterLocalization(preservedMapHeading)
        pendingPostQrHeadingSnap = true
        pendingOutdoorGpsCourseDeg = null
        qrAnchorX = pdrX
        qrAnchorY = pdrY
        committedX = pdrX
        committedY = pdrY

        beginSensorLogging("pos:$x,$y")

        sensorCollector.start()
        rotationEngine.invertAzimuth180 = false

        isRunning = true

        dispatchLocationUpdate()

    }

    /**
     * Đặt lại vị trí trên map nhưng **giữ nguyên hướng** (đứng yên chỉ chạm chỗ khác).
     * Không reset RV/smoother — tránh la bàn nhảy 90°/270° theo cạnh hành lang gần điểm mới.
     * Luôn xoay file sensor/heading mới để session “đặt vị trí” tách biệt khi phân tích.
     */
    fun relocatePreservingHeading(x: Float, y: Float) {
        pdrX = x
        pdrY = y
        qrAnchorX = x
        qrAnchorY = y
        committedX = x
        committedY = y
        tpfEngine.particles.clear()
        tpfEngine.reseedNearPosition(x, y, Math.toRadians(currentNavigationHeadingDeg().toDouble()).toFloat())
        holdGridDeltaAfterRelocate = true

        // Mỗi lần đặt vị trí đứng → file heading/session mới (kể cả khi đã isRunning).
        beginSensorLogging("relocate:$x,$y")

        // Không giữ cal tạm làm “Bắc giả” khi user đổi chỗ / nhiễu.
        headingCalibrationDeg = 0f
        calibBeforeMagReanchorDeg = null
        lastAppliedGridDeltaDeg = 0f
        lastGoodMapHeadingDeg = null

        // Nhiễu SEVERE: reanchor tại chỗ mới (grid/corridor nhẹ hoặc hold — không last_good).
        if (lastMagSeverity == MagSeverity.SEVERE) {
            val how = reanchorHeadingOnMagneticInterference()
            Log.i("LocationEngine", "Relocate under SEVERE → reanchor=$how")
            val msg = when (how) {
                "corridor" -> "Từ trường nhiễu — đã căn nhẹ theo hành lang; tránh loa/kim loại"
                "grid" -> "Từ trường nhiễu — đã áp lưới chuẩn; tránh loa/kim loại"
                else -> "Từ trường nhiễu — giữ hướng gyro (không đổi Bắc); tránh loa/kim loại"
            }
            onMagneticInterferenceChanged?.invoke(true, msg)
        } else {
            syncOrientationOffset()
        }

        if (!isRunning) {
            sensorCollector.start()
            isRunning = true
        }
        Log.i(
            "LocationEngine",
            "Relocate preserve heading xy=($x,$y) navH=${currentNavigationHeadingDeg()} " +
                "gridHold=$lastAppliedGridDeltaDeg mag=$lastMagSeverity"
        )
        dispatchLocationUpdate()
    }

    fun stop() {



        endSensorLogging()



        sensorCollector.stop()



        isRunning = false



        hasRotationVectorFix = false

        resetMagneticGuard()



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
            // User đang đi thật → bỏ lock sớm (tránh đứng yên ở cầu thang 4s)
            if (motionStateEngine.allowsPositionUpdate || energyHint) {
                positionLockUntilMs = 0L
                Log.d("LocationEngine", "Position lock cleared early (walking)")
            } else {
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
            // Không forceStrong snap — kéo mạnh về vertex làm kẹt góc khi đang rẽ
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
        var safeStepM = (stepLengthMeters * ramp).coerceIn(0.18f, 0.42f)
        graphModel.findNearestEdge(pdrX, pdrY)?.let { (edge, _) ->
            val cap = (edge.distanceMeters * 0.70f).coerceIn(0.16f, 0.42f)
            if (safeStepM > cap) safeStepM = cap
        }
        lastStepLengthMeters = safeStepM

        val stepPx = safeStepM * pixelsPerMeter
        val hx = kotlin.math.sin(currentHeadingRad)
        val hy = -kotlin.math.cos(currentHeadingRad)

        // G3c: PDR dẫn đường — tiến theo Navigation Heading, chặn tường, rồi snap graph
        val beforeX = pdrX
        val beforeY = pdrY
        val alongBeforeM = if (routeSnapEdges.isNotEmpty()) routeProgressMeters() else 0f
        val rawX = pdrX + stepPx * hx
        val rawY = pdrY + stepPx * hy
        val blocked = moveWithWallBlock(beforeX, beforeY, rawX, rawY)
        pdrX = blocked.first
        pdrY = blocked.second
        // Đang chỉ đường: nếu bước không tiến ĐỌC path (hướng lệch / kẹt cửa),
        // đẩy dọc đường xanh — tránh đứng yên trước “cửa ra” trong khi UI vẫn “Đi thẳng Xm”.
        if (routeSnapEdges.isNotEmpty()) {
            snapPosition(currentHeadingDeg, forceStrong = true)
            val alongDeltaM = routeProgressMeters() - alongBeforeM
            val needAlongM = (stepPx / pixelsPerMeter.coerceAtLeast(1f)) * 0.35f
            if (alongDeltaM < needAlongM) {
                advanceAlongRouteBy(stepPx)
            }
        }
        val stepMovedPx = kotlin.math.hypot(
            (pdrX - beforeX).toDouble(),
            (pdrY - beforeY).toDouble()
        ).toFloat()
        if (stepMovedPx >= 0.5f) {
            orientationManager.onStepDisplacement(pdrX - beforeX, pdrY - beforeY)
            maybeDetectFlipFromTravel(pdrX - beforeX, pdrY - beforeY)
        } else {
            // Heading sai → đâm tường: vẫn học hướng từ cạnh còn đi được
            learnHeadingWhenStepBlocked(beforeX, beforeY, currentHeadingDeg)
        }
        // Tự đảo 180° nếu đi ngược hành lang (nhiễu Bắc/Nam) — không cần user bấm nút.
        maybeAutoFlip180FromWalk(currentHeadingDeg, stepMovedPx)
        // Hướng đi (travel) + HDE nhẹ → slew calib; không blend UI mũi tên.
        tryTravelHeadingRecalibration()
        maybeApplyLightHde()
        // Mag đã ổn: ưu tiên la bàn tuyệt đối hơn cal tay sai lúc nhiễu.
        maybeRecoverAbsoluteNorthFromMag()
        snapPosition(currentHeadingDeg, forceStrong = true)
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
        if (tpfAligned && routeSnapEdges.isEmpty()) {
            tpfStuckStepCount = 0
            pdrX += (after!!.first - pdrX) * 0.20f
            pdrY += (after.second - pdrY) * 0.20f
            snapPosition(currentHeadingDeg, forceStrong = true)
        } else {
            tpfStuckStepCount++
            tpfEngine.reseedNearPosition(pdrX, pdrY, currentHeadingRad, searchRadiusPx = 90f)
            preferPdrUntilMs = nowMs + 800L
            if (routeSnapEdges.isNotEmpty()) {
                snapPosition(currentHeadingDeg, forceStrong = true)
            }
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

        refreshGridOffsetIfNeeded()

        val heading = currentNavigationHeadingDeg()
        HeadingSpinLogger.log(
            gyro = rotationEngine.gyroMagnitude,
            magTrust = rotationEngine.magneticTrust,
            magSeverity = lastMagSeverity.name,
            deviceDeg = orientationManager.deviceHeadingDeg,
            mapDeg = orientationManager.mapHeadingDeg,
            navDeg = heading,
            baseDeg = mapNorthOffsetBaseDeg,
            calibDeg = headingCalibrationDeg,
            gridDeg = currentGridHeadingDeltaDeg(),
        )
        headingMotionRecorder.sample(
            gyro = rotationEngine.gyroMagnitude,
            magTrust = rotationEngine.magneticTrust,
            magSeverity = lastMagSeverity.name,
            deviceDeg = orientationManager.deviceHeadingDeg,
            mapDeg = orientationManager.mapHeadingDeg,
            navDeg = heading,
            baseDeg = mapNorthOffsetBaseDeg,
            calibDeg = headingCalibrationDeg,
            gridDeg = currentGridHeadingDeltaDeg(),
            x = pdrX,
            y = pdrY,
        )
        // Mirror vào sensor_logs để gửi 1 file session_*.jsonl cũng đủ phân tích hướng.
        if (sensorSessionLogger.isEnabled) {
            val nowMs = System.currentTimeMillis()
            val gyro = rotationEngine.gyroMagnitude
            val interval = if (gyro >= 0.35f) 50L else 150L
            if (nowMs - lastHeadingSensorLogMs >= interval) {
                lastHeadingSensorLogMs = nowMs
                sensorSessionLogger.logEvent(
                    "heading",
                    mapOf(
                        "gyro" to gyro,
                        "trust" to rotationEngine.magneticTrust,
                        "mag" to lastMagSeverity.name,
                        "dev" to orientationManager.deviceHeadingDeg,
                        "map" to orientationManager.mapHeadingDeg,
                        "nav" to heading,
                        "base" to mapNorthOffsetBaseDeg,
                        "cal" to headingCalibrationDeg,
                        "grid" to currentGridHeadingDeltaDeg(),
                        "x" to pdrX,
                        "y" to pdrY,
                    ),
                )
            }
        }

 // FIX 4: Detect heading change to relax off-route during turns
 val headingDelta = lastDispatchedHeading?.let { prev ->
 val diff = kotlin.math.abs(heading - prev)
 if (diff > 180f) 360f - diff else diff
 } ?: 0f
 if (headingDelta > HEADING_CHANGE_ANGLE_DEG) {
 headingChangeRelaxUntilMs = System.currentTimeMillis() + HEADING_CHANGE_RELAX_MS
 Log.d("LocationEngine", "Heading change: " + "%.1f".format(headingDelta) + "deg, relax until " + headingChangeRelaxUntilMs)
 }
 // Chỉ đóng băng vị trí khi xoay TẠI CHỖ (đóng cửa) — không chặn bước khi đang đi và rẽ góc
 val walkingNow = motionStateEngine.allowsPositionUpdate || recentlyAcceptedStep()
 if (headingDelta > TURN_FREEZE_HEADING_DEG && !walkingNow) {
  val nowFreeze = System.currentTimeMillis()
  // Không gia hạn liên tục khi heading vẫn đổi — tránh kẹt góc suốt lúc xoay người
  if (nowFreeze >= turnFreezeUntilMs) {
   turnFreezeUntilMs = nowFreeze + TURN_FREEZE_MS
   Log.d("LocationEngine", "Turn-freeze " + "%.1f".format(headingDelta) + "deg (standing)")
  }
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
            // G3a: ngồi/đứng yên — pin về vị trí cam kết
            // Khi đang chỉ đường: vẫn bám ngang path (fix lỗi lệch cạnh hành lang song song)
            if (routeSnapEdges.isNotEmpty()) {
                pdrX = committedX
                pdrY = committedY
                snapLaterallyToCurrentRouteEdge(strength = 1f)
                committedX = pdrX
                committedY = pdrY
            } else {
                pdrX = committedX
                pdrY = committedY
            }
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
        if (routeSnapEdges.isNotEmpty()) {
            applySnapToRoute(forceStrong = false)
            return
        }
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
     * Khi đang bám đường xanh (routeSnap): không wall-block — polygon tường hay che lỗ cửa
     * làm PDR đứng yên trước “cửa ra” dù path A* vẫn còn.
     */
    private fun moveWithWallBlock(fromX: Float, fromY: Float, toX: Float, toY: Float): Pair<Float, Float> {
        if (routeSnapEdges.isNotEmpty()) {
            return toX to toY
        }
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

    /**
     * Khi bước bị kẹt (hướng lệch / tường che cửa): vẫn tiến dọc path A* theo độ dài bước.
     * Tránh đứng yên trước cửa trong lúc chỉ đường còn “Đi thẳng Xm”.
     */
    private fun advanceAlongRouteBy(stepPx: Float) {
        if (routeSnapEdges.isEmpty() || stepPx < 0.5f) return
        var idx = routeSnapEdgeIndex.coerceIn(0, routeSnapEdges.lastIndex)
        var t = routeSnapT.coerceIn(0f, 1f)
        var remain = stepPx
        var guard = 0
        while (remain > 0.5f && guard++ < 8) {
            val edge = routeSnapEdges[idx]
            val abX = edge.targetX - edge.sourceX
            val abY = edge.targetY - edge.sourceY
            val len = kotlin.math.hypot(abX.toDouble(), abY.toDouble()).toFloat().coerceAtLeast(1e-3f)
            val leftOnEdge = (1f - t) * len
            if (remain <= leftOnEdge || idx >= routeSnapEdges.lastIndex) {
                val dt = (remain / len).coerceIn(0f, 1f - t)
                t = (t + dt).coerceIn(0f, 1f)
                remain = 0f
                break
            }
            remain -= leftOnEdge
            idx++
            t = 0f
        }
        val edge = routeSnapEdges[idx]
        pdrX = edge.sourceX + t * (edge.targetX - edge.sourceX)
        pdrY = edge.sourceY + t * (edge.targetY - edge.sourceY)
        routeSnapEdgeIndex = idx
        routeSnapT = t
        Log.d(
            "LocationEngine",
            "advanceAlongRoute idx=$idx t=${"%.2f".format(t)} remainPx=${"%.1f".format(remain)}",
        )
    }

    /** Mét đã đi dọc routeSnap (theo edge index + t). */
    private fun routeProgressMeters(): Float {
        if (routeSnapEdges.isEmpty()) return 0f
        val idx = routeSnapEdgeIndex.coerceIn(0, routeSnapEdges.lastIndex)
        var meters = 0f
        for (i in 0 until idx) {
            meters += routeSnapEdges[i].distanceMeters
        }
        meters += routeSnapEdges[idx].distanceMeters * routeSnapT.coerceIn(0f, 1f)
        return meters
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

    /** Bám path chỉ đường (đường xanh) khi đang navigate. */
    private fun snapPosition(headingDeg: Float, forceStrong: Boolean) {
        if (routeSnapEdges.isNotEmpty()) {
            applySnapToRoute(forceStrong)
        } else {
            applySnapToEdge(headingDeg, forceStrong)
        }
    }

    private fun projectToSegment(
        px: Float,
        py: Float,
        ax: Float,
        ay: Float,
        bx: Float,
        by: Float,
    ): Pair<Float, Float> {
        val abX = bx - ax
        val abY = by - ay
        val abLenSq = abX * abX + abY * abY
        if (abLenSq <= 1e-6f) {
            val dx = px - ax
            val dy = py - ay
            return kotlin.math.sqrt(dx * dx + dy * dy) to 0f
        }
        val t = (((px - ax) * abX + (py - ay) * abY) / abLenSq).coerceIn(0f, 1f)
        val projX = ax + t * abX
        val projY = ay + t * abY
        val dx = px - projX
        val dy = py - projY
        return kotlin.math.sqrt(dx * dx + dy * dy) to t
    }

    private fun applySnapToRoute(forceStrong: Boolean) {
        if (routeSnapEdges.isEmpty()) return
        val headingDeg = currentNavigationHeadingDeg()
        val hx = kotlin.math.sin(Math.toRadians(headingDeg.toDouble())).toFloat()
        val hy = (-kotlin.math.cos(Math.toRadians(headingDeg.toDouble()))).toFloat()

        var bestProjX = pdrX
        var bestProjY = pdrY
        var bestScore = Float.MAX_VALUE
        var bestEdgeIdx = routeSnapEdgeIndex
        var bestT = routeSnapT
        var found = false

        fun considerRange(
            startIdx: Int,
            endIdx: Int,
            allowBackward: Boolean,
            distancePrimary: Boolean,
        ) {
            val s = startIdx.coerceIn(0, routeSnapEdges.lastIndex)
            val e = endIdx.coerceIn(0, routeSnapEdges.lastIndex)
            if (s > e) return
            for (idx in s..e) {
                val edge = routeSnapEdges[idx]
                val (dist, t) = projectToSegment(
                    pdrX, pdrY,
                    edge.sourceX, edge.sourceY,
                    edge.targetX, edge.targetY,
                )
                val tUse = if (!allowBackward && idx == routeSnapEdgeIndex) {
                    t.coerceAtLeast(routeSnapT - 0.08f)
                } else {
                    t
                }
                val projX2 = edge.sourceX + tUse * (edge.targetX - edge.sourceX)
                val projY2 = edge.sourceY + tUse * (edge.targetY - edge.sourceY)
                // Chiếu lên chính cạnh route: không bỏ vì crossesWall (cửa hay bị polygon tường che).
                // Chỉ bỏ khi nhảy lệch xa khỏi cạnh (>1.5m) và đoạn đó cắt tường.
                if (dist > 1.5f * pixelsPerMeter &&
                    graphModel.crossesWall(pdrX, pdrY, projX2, projY2)
                ) {
                    continue
                }

                val abX = edge.targetX - edge.sourceX
                val abY = edge.targetY - edge.sourceY
                val abLen = kotlin.math.hypot(abX.toDouble(), abY.toDouble()).toFloat().coerceAtLeast(1e-3f)
                val alongX = abX / abLen
                val alongY = abY / abLen
                val align = (alongX * hx + alongY * hy).coerceIn(-1f, 1f)

                // Quét cả route: CHỈ theo khoảng cách — progressBonus sẽ kéo chấm tới cầu thang đích.
                val score = if (distancePrimary) {
                    dist - (align + 1f) * 0.05f * pixelsPerMeter
                } else {
                    val progressBonus =
                        (idx - s) * 0.15f * pixelsPerMeter + tUse * 0.35f * pixelsPerMeter
                    val alignBonus = (align + 1f) * 0.25f * pixelsPerMeter
                    dist - progressBonus - alignBonus
                }

                if (score < bestScore) {
                    bestScore = score
                    bestProjX = projX2
                    bestProjY = projY2
                    bestEdgeIdx = idx
                    bestT = tUse
                    found = true
                }
            }
        }

        val startIdx = routeSnapEdgeIndex.coerceIn(0, routeSnapEdges.lastIndex)
        val endIdx = (routeSnapEdgeIndex + 2).coerceAtMost(routeSnapEdges.lastIndex)
        considerRange(startIdx, endIdx, allowBackward = false, distancePrimary = false)

        // Lệch khỏi cửa sổ hẹp: tìm lại cạnh gần nhất (thuần khoảng cách), không nhảy đích
        val dxWin = pdrX - bestProjX
        val dyWin = pdrY - bestProjY
        val distWin = if (found) {
            kotlin.math.sqrt(dxWin * dxWin + dyWin * dyWin)
        } else {
            Float.MAX_VALUE
        }
        if (!found || distWin > 1.2f * pixelsPerMeter) {
            considerRange(
                0,
                routeSnapEdges.lastIndex,
                allowBackward = true,
                distancePrimary = true,
            )
        }

        if (!found) return

        // Chỉ nhảy cạnh kế khi ĐANG ĐI và gần hết cạnh — không khi đứng yên/forceStrong
        if (!forceStrong &&
            realtimeMotionEstimator.isMoving &&
            bestEdgeIdx < routeSnapEdges.lastIndex &&
            bestT >= 0.88f
        ) {
            val next = routeSnapEdges[bestEdgeIdx + 1]
            val nabX = next.targetX - next.sourceX
            val nabY = next.targetY - next.sourceY
            val nLen = kotlin.math.hypot(nabX.toDouble(), nabY.toDouble()).toFloat().coerceAtLeast(1e-3f)
            val nAlign = (nabX / nLen) * hx + (nabY / nLen) * hy
            if (nAlign > 0.35f) {
                val (ndist, nt) = projectToSegment(
                    pdrX, pdrY,
                    next.sourceX, next.sourceY,
                    next.targetX, next.targetY,
                )
                // Phải thực sự gần đỉnh nối — tránh teleport dọc path
                if (ndist < 0.7f * pixelsPerMeter) {
                    bestEdgeIdx = bestEdgeIdx + 1
                    bestT = nt.coerceAtLeast(0.02f)
                    bestProjX = next.sourceX + bestT * (next.targetX - next.sourceX)
                    bestProjY = next.sourceY + bestT * (next.targetY - next.sourceY)
                }
            }
        }

        val maxDistPx = 2.5f * pixelsPerMeter
        val dx = pdrX - bestProjX
        val dy = pdrY - bestProjY
        val distPx = kotlin.math.sqrt(dx * dx + dy * dy)
        if (distPx >= maxDistPx) return
        // Chặn teleport dọc path: chỉ cho phép kéo ngang trong ~1.8m mỗi lần snap
        if (distPx > 1.8f * pixelsPerMeter) {
            snapLaterallyToCurrentRouteEdge(strength = if (forceStrong) 0.9f else 0.7f)
            return
        }
        // Bám route: cho phép snap ngắn qua lỗ cửa dù polygon tường cắt đoạn chiếu.

        val snapStrength = when {
            forceStrong -> 0.85f
            !realtimeMotionEstimator.isMoving -> {
                if (distPx < 0.5f * pixelsPerMeter) 0.9f else 0.75f
            }
            else -> 0.7f
        }
        pdrX += (bestProjX - pdrX) * snapStrength
        pdrY += (bestProjY - pdrY) * snapStrength
        routeSnapEdgeIndex = bestEdgeIdx
        routeSnapT = bestT
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



