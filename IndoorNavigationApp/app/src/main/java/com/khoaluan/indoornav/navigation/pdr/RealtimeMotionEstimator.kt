package com.khoaluan.indoornav.navigation.pdr



import kotlin.math.sqrt



/**

 * FILE: RealtimeMotionEstimator.kt

 * MỤC ĐÍCH: Tính toán năng lượng di chuyển (Motion Energy) liên tục bằng Linear Acceleration.

 * Thay vì chỉ chờ sự kiện bước chân (Hard step), class này nội suy pseudo-velocity

 * và phát hiện Micro-steps ngay cả khi điện thoại cầm rất chắc và ít rung.

 */

class RealtimeMotionEstimator {



    var isMoving: Boolean = false

        private set



    var pseudoVelocity: Float = 0f

        private set



    var motionConfidence: Float = 1.0f

        private set



    // Bộ lọc thông thấp (Low-Pass Filter) cho năng lượng dao động

    private var filteredEnergy: Float = 0f

    private val alpha = 0.65f



    // Stationary Detection (Stop Detector)

    private var continuousLowEnergyMs: Long = 0L

    private var lastFrameTimeMs: Long = System.currentTimeMillis()



    // Micro-step Logic

    private var stableVelocityDurationMs: Long = 0L



    // Ngưỡng phát hiện chuyển động

private val MICRO_MOTION_THRESHOLD = 0.5f

private val HARD_MOTION_THRESHOLD = 0.8f

private val STATIONARY_THRESHOLD = 0.15f



    // Vận tốc mặc định tối đa khi đi bộ (m/s)

    private val MAX_WALKING_VELOCITY = 1.25f



    private var lastMoveTimeMs: Long = 0L

    private val KEEP_ALIVE_MOVING_MS = 250L // 0.25s debounce



    /**

     * Nhận dữ liệu Sensor.TYPE_LINEAR_ACCELERATION (Đã lọc trọng lực)

     */

    fun processLinearAcceleration(x: Float, y: Float, z: Float): Boolean {

        val rawEnergy = sqrt(x * x + y * y + z * z)

        val now = System.currentTimeMillis()

        val dtMs = (now - lastFrameTimeMs).coerceAtLeast(1)

        lastFrameTimeMs = now

        

        // Cập nhật bộ lọc EMA

        filteredEnergy = alpha * filteredEnergy + (1f - alpha) * rawEnergy



        var triggeredMicroStep = false



        // STATIONARY DETECTION (Stop Detector)

        if (filteredEnergy < STATIONARY_THRESHOLD) {

            continuousLowEnergyMs += dtMs

            if (continuousLowEnergyMs > 1000L) { // Đứng im quá 1 giây

                isMoving = false

                pseudoVelocity = 0f // Force dừng hẳn

                motionConfidence = 1.0f

                stableVelocityDurationMs = 0L

                return false

            }

        } else {

            continuousLowEnergyMs = 0L

        }



        // MOTION LOGIC

        if (filteredEnergy > MICRO_MOTION_THRESHOLD) {

            isMoving = true

            lastMoveTimeMs = now

            

            // Tính toán pseudoVelocity dựa trên mức độ rung

            val energyRatio = (filteredEnergy - MICRO_MOTION_THRESHOLD) / (HARD_MOTION_THRESHOLD - MICRO_MOTION_THRESHOLD)

            val targetVelocity = 0.3f + energyRatio.coerceIn(0f, 1f) * (MAX_WALKING_VELOCITY - 0.3f)

            

            // Làm mượt vận tốc nội suy

            pseudoVelocity = pseudoVelocity * 0.75f + targetVelocity * 0.25f

            

            // Kiểm tra tính ổn định để trigger Micro-step

            if (pseudoVelocity > 0.4f && energyRatio < 1.0f) {

                stableVelocityDurationMs += dtMs

                if (stableVelocityDurationMs > 400L) { // Đạt độ ổn định 400ms

                    triggeredMicroStep = true

                    stableVelocityDurationMs = 0L // Reset sau khi bơm bước

                }

            } else {

                stableVelocityDurationMs = 0L

            }



            motionConfidence = if (filteredEnergy > HARD_MOTION_THRESHOLD) 1.0f else 0.8f

            

        } else {

            // VELOCITY DECAY (Chống trôi ma)

            if (now - lastMoveTimeMs > KEEP_ALIVE_MOVING_MS) {

                isMoving = false

                pseudoVelocity *= 0.92f // Decay mượt mà mỗi frame

                if (pseudoVelocity < 0.1f) pseudoVelocity = 0f

                motionConfidence = 0.5f

                stableVelocityDurationMs = 0L

            } else {

                // Vẫn trong KEEP_ALIVE, giảm tốc độ nhẹ

                pseudoVelocity *= 0.98f

            }

        }

        

        return triggeredMicroStep

    }

}

