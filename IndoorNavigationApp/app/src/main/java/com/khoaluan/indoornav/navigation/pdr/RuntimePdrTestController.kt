package com.khoaluan.indoornav.navigation.pdr

import android.content.Context
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.navigation.tpf.LocationEngine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class PdrTestState(
    val x: Float = 0f,
    val y: Float = 0f,
    val heading: Float = 0f,
    val confidence: Float = 1f,
    val isTpfActive: Boolean = false,
    val stepCount: Int = 0,
    val stepLength: Float = 0f,
    val totalDistance: Float = 0f
)

/**
 * FILE: RuntimePdrTestController.kt
 * MỤC ĐÍCH: Là môi trường Test Mode cho PDRTestScreen.
 * KHÔNG tính toán lại thuật toán. Bọc (wrap) chính xác LocationEngine (runtime pipeline thật)
 * và chỉ expose dữ liệu (StateFlow) cho PDRTestScreen vẽ UI.
 * Nhờ đó, bất cứ khi nào LocationEngine thay đổi thuật toán, PDRTestScreen sẽ tự động được cập nhật.
 */
class RuntimePdrTestController(context: Context) {
    // Khởi tạo LocationEngine thật với MapData trống (Fallback mode - PDR thuần)
    private val locationEngine = LocationEngine(context, MapData())

    private val _testState = MutableStateFlow(PdrTestState())
    val testState: StateFlow<PdrTestState> = _testState.asStateFlow()

    init {
        // Subscribe vào pipeline runtime thật
        locationEngine.onLocationUpdated = { x, y, heading, confidence, isTpf ->
            _testState.value = _testState.value.copy(
                x = x,
                y = y,
                heading = heading,
                confidence = confidence,
                isTpfActive = isTpf
            )
        }

        locationEngine.onStepEvent = { stepLength, totalSteps, totalDistance ->
            _testState.value = _testState.value.copy(
                stepCount = totalSteps,
                stepLength = stepLength,
                totalDistance = totalDistance
            )
        }
    }

    fun start() {
        // Bắt đầu từ toạ độ (0, 0)
        locationEngine.startWithPosition(0f, 0f)
    }

    fun stop() {
        locationEngine.stop()
    }

    fun reset() {
        locationEngine.stop()
        _testState.value = PdrTestState()
        locationEngine.startWithPosition(0f, 0f)
    }
}
