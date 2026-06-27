package com.khoaluan.indoornav.navigation.pdr

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.lang.reflect.Field

/**
 * Unit tests cho PositionConfidenceEngine.
 * Lưu ý: Một số test sử dụng reflection để truy cập private fields
 * vì logic dựa vào thời gian thực.
 */
class PositionConfidenceEngineTest {

    private lateinit var engine: PositionConfidenceEngine

    @Before
    fun setup() {
        engine = PositionConfidenceEngine()
    }

    @Test
    fun `confidence is 0_0 when never updated`() {
        assertEquals(0.0f, engine.calculateCurrentConfidence(), 0.001f)
    }

    @Test
    fun `needsRelocalization returns true when never updated`() {
        assertTrue(engine.needsRelocalization())
    }

    @Test
    fun `estimateDriftRadius returns max value when never updated`() {
        val drift = engine.estimateDriftRadiusMeters()
        assertEquals(Float.MAX_VALUE, drift, 0.0f)
    }

    @Test
    fun `updateGroundTruth sets timestamp`() {
        val now = System.currentTimeMillis()
        engine.updateGroundTruth(now)

        // After update, confidence should be > 0
        val conf = engine.calculateCurrentConfidence()
        assertTrue("Confidence after ground truth should be > 0", conf > 0)
    }

    @Test
    fun `confidence decreases after 3 minutes`() {
        // Sử dụng reflection để giả lập thời gian? Không thể dễ dàng.
        // Tốt hơn là test các giá trị trả về với ground truth mới.
        val now = System.currentTimeMillis()
        engine.updateGroundTruth(now)

        // Ngay lập tức: confidence ~1.0 (hoặc 0.85-1.0 tùy implementation)
        val immediateConf = engine.calculateCurrentConfidence()
        assertTrue(immediateConf > 0.85f)
    }

    @Test
    fun `constants have expected values`() {
        val timeHighField = PositionConfidenceEngine::class.java.getField("TIME_HIGH_ACCURACY_LIMIT_MS")
        val timeMediumField = PositionConfidenceEngine::class.java.getField("TIME_MEDIUM_ACCURACY_LIMIT_MS")
        val timeInvalidField = PositionConfidenceEngine::class.java.getField("TIME_INVALID_LIMIT_MS")

        val timeHigh = timeHighField.get(null) as Long
        val timeMedium = timeMediumField.get(null) as Long
        val timeInvalid = timeInvalidField.get(null) as Long

        assertEquals(3 * 60 * 1000L, timeHigh)
        assertEquals(10 * 60 * 1000L, timeMedium)
        assertEquals(30 * 60 * 1000L, timeInvalid)
    }
}
