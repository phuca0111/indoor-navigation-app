package com.khoaluan.indoornav.navigation.tpf

/**
 * FILE: TopologicalParticle.kt
 * MỤC ĐÍCH: Biểu diễn một Hạt (Particle) di chuyển 1D trên đồ thị.
 * THAY VÌ (x, y) 2D tự do dễ bị đi xuyên tường, TPF buộc hạt phải nằm trên hành lang.
 */
data class TopologicalParticle(
    var edgeId: String,  // Hạt đang nằm trên cạnh nào
    var progress: Float, // Vị trí trên cạnh (% từ 0.0f đến 1.0f)
    var weight: Float = 1.0f // Trọng số sinh tồn (càng khớp với hướng đi thật thì càng cao)
) {
    fun clone() = TopologicalParticle(edgeId, progress, weight)
}
