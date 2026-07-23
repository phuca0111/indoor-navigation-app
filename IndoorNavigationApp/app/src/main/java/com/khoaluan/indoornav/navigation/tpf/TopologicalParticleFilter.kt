package com.khoaluan.indoornav.navigation.tpf

import com.khoaluan.indoornav.navigation.graph.GraphEdge
import com.khoaluan.indoornav.navigation.graph.GraphModel
import java.util.Random
import kotlin.math.*

/**
 * Topological Particle Filter.
 *
 * Fix 14/07 (lần 3): ngoài phòng bị đứng yên —
 * khi kẹt cạnh cửa / graph đứt nối, snap không gian sang cạnh khớp heading
 * + reseed nếu mean không dịch sau bước chân.
 */
class TopologicalParticleFilter(
    private val graphModel: GraphModel,
    private val numParticles: Int = 60
) {
    var particles = mutableListOf<TopologicalParticle>()
        private set

    private val random = Random()
    private val edgeMap by lazy { graphModel.edges.associateBy { it.id } }
    private val PERPENDICULAR_THRESHOLD_RAD = (PI / 4.0).toFloat()

    fun initializeAtNode(nodeId: String) {
        particles.clear()
        val connectedEdges = graphModel.getEdgesFromNode(nodeId)
        if (connectedEdges.isEmpty()) return

        val weights = connectedEdges.map { max(0.35f, it.distanceMeters) }
        val sumW = weights.sum()
        for (i in 0 until numParticles) {
            var r = random.nextFloat() * sumW
            var idx = 0
            while (idx < connectedEdges.lastIndex && r > weights[idx]) {
                r -= weights[idx]
                idx++
            }
            particles.add(TopologicalParticle(connectedEdges[idx].id, 0.0f, 1.0f / numParticles))
        }
    }

    fun processStep(stepLengthM: Float, userHeadingRad: Float) {
        if (particles.isEmpty() || stepLengthM <= 0f) return

        val before = getEstimatedLocation()
        val noiseStdDevM = stepLengthM * 0.15f
        var totalWeight = 0f

        for (p in particles) {
            val noisyStep = max(0.01f, stepLengthM + (random.nextGaussian() * noiseStdDevM).toFloat())
            moveParticle(p, noisyStep, userHeadingRad + (random.nextGaussian() * 0.12f).toFloat())

            val edge = edgeMap[p.edgeId]
            p.weight = if (edge != null) {
                val diff = edgeHeadingMismatch(edge, userHeadingRad)
                exp(-(diff * diff) / (2 * 0.70f * 0.70f))
            } else {
                0f
            }
            totalWeight += p.weight
        }
        resample(totalWeight)

        // Mean không dịch → reseed bám vị trí hiện tại (KHÔNG bước thêm — tránh nhảy xa khi xoay)
        val after = getEstimatedLocation()
        if (before != null && after != null) {
            val movedPx = hypot(after.first - before.first, after.second - before.second)
            if (movedPx < 12f) {
                reseedNearPosition(after.first, after.second, userHeadingRad)
            }
        }
    }

    fun reseedNearPosition(
        x: Float,
        y: Float,
        userHeadingRad: Float,
        searchRadiusPx: Float = 90f,
    ) {
        val nearby = ArrayList<Pair<GraphEdge, Float>>()
        val seen = HashSet<String>()
        for (e in graphModel.edges) {
            val key = undirectedKey(e)
            if (!seen.add(key)) continue
            if (minDistanceToEdge(e, x, y) > searchRadiusPx) continue
            nearby.add(e to edgeHeadingMismatch(e, userHeadingRad))
        }

        val aligned = nearby
            .filter { it.second <= (PI / 3.0).toFloat() }
            .sortedWith(
                compareBy(
                    { it.second },
                    { minDistanceToEdge(it.first, x, y) }
                )
            )
        val pool: List<GraphEdge> = when {
            aligned.isNotEmpty() -> aligned.take(4).map { it.first }
            nearby.isNotEmpty() -> nearby.sortedBy { it.second }.take(3).map { it.first }
            else -> {
                val nearest = graphModel.findNearestEdge(x, y) ?: return
                particles.clear()
                repeat(numParticles) {
                    particles.add(
                        TopologicalParticle(
                            nearest.first.id,
                            nearest.second.coerceIn(0f, 1f),
                            1f / numParticles
                        )
                    )
                }
                return
            }
        }

        particles.clear()
        for (i in 0 until numParticles) {
            val e = pool[i % pool.size]
            particles.add(TopologicalParticle(e.id, projectProgressOntoEdge(e, x, y), 1f / numParticles))
        }
    }

    private fun moveParticle(p: TopologicalParticle, distanceM: Float, userHeadingRad: Float) {
        var remainingDist = distanceM
        var jumps = 0

        while (remainingDist > 0 && jumps < 6) {
            tryRealignParticleToHeading(p, userHeadingRad)

            var edge = edgeMap[p.edgeId] ?: break
            var mismatch = edgeHeadingMismatch(edge, userHeadingRad)

            if (mismatch > PERPENDICULAR_THRESHOLD_RAD) {
                val xy = particlePosition(p)
                if (xy != null && snapParticleToNearbyAlignedEdge(p, xy.first, xy.second, userHeadingRad)) {
                    edge = edgeMap[p.edgeId] ?: break
                    mismatch = edgeHeadingMismatch(edge, userHeadingRad)
                }
            }

            if (mismatch > PERPENDICULAR_THRESHOLD_RAD) {
                val atDoorMouth = p.progress <= 0.02f || p.progress >= 0.98f
                remainingDist = advanceAlongDoorTowardHallway(p, edge, remainingDist, userHeadingRad)
                if (!atDoorMouth) {
                    // Đang bò trong cạnh cửa: hết bước tại đây, chưa sang HL
                    remainingDist = 0f
                    break
                }
                // Đã đứng ở miệng cửa từ trước → cho phép sang cạnh hành lang ở bước này
                jumps++
                continue
            }

            val diffForward = abs(shortestAngleDeltaRad(userHeadingRad, edge.angleRad))
            val diffBackward = abs(shortestAngleDeltaRad(userHeadingRad, edge.reverseAngleRad))
            val movingForward = diffForward < diffBackward
            val deltaProgress = remainingDist / edge.distanceMeters.coerceAtLeast(0.01f)

            if (movingForward) {
                if (p.progress + deltaProgress <= 1.0f) {
                    p.progress += deltaProgress
                    remainingDist = 0f
                } else {
                    remainingDist -= (1.0f - p.progress) * edge.distanceMeters
                    p.progress = 1.0f
                    val nextEdge = selectNextEdge(edge.targetNodeId, edge.id, userHeadingRad)
                    if (nextEdge == null) remainingDist = 0f
                    else {
                        p.edgeId = nextEdge.id
                        p.progress = 0f
                    }
                }
            } else {
                if (p.progress - deltaProgress >= 0.0f) {
                    p.progress -= deltaProgress
                    remainingDist = 0f
                } else {
                    remainingDist -= p.progress * edge.distanceMeters
                    p.progress = 0f
                    val nextEdge = selectNextEdge(edge.sourceNodeId, edge.id, userHeadingRad)
                    if (nextEdge == null) remainingDist = 0f
                    else {
                        p.edgeId = nextEdge.id
                        p.progress = 0f
                    }
                }
            }
            jumps++
        }
    }

    private fun snapParticleToNearbyAlignedEdge(
        p: TopologicalParticle,
        x: Float,
        y: Float,
        userHeadingRad: Float,
        searchRadiusPx: Float = 55f,
    ): Boolean {
        // Chỉ xét cạnh nối topology gần (1–2 hop) — không nhảy spatial sang hành lang trong phòng nhỏ
        val current = edgeMap[p.edgeId] ?: return false
        val candidates = collectNearbyEdges(current)
        var best: GraphEdge? = null
        var bestScore = Float.MAX_VALUE
        val seen = HashSet<String>()
        for (e in candidates) {
            val key = undirectedKey(e)
            if (!seen.add(key)) continue
            if (undirectedKey(e) == undirectedKey(current)) continue
            val dist = minDistanceToEdge(e, x, y)
            if (dist > searchRadiusPx) continue
            val m = edgeHeadingMismatch(e, userHeadingRad)
            if (m > (PI / 2.5).toFloat()) continue
            val score = m * 90f + dist
            if (score < bestScore) {
                bestScore = score
                best = e
            }
        }
        val chosen = best ?: return false
        p.edgeId = chosen.id
        p.progress = projectProgressOntoEdge(chosen, x, y)
        return true
    }

    private fun advanceAlongDoorTowardHallway(
        p: TopologicalParticle,
        edge: GraphEdge,
        remainingDist: Float,
        userHeadingRad: Float,
    ): Float {
        val sourceBest = bestOutboundMismatch(edge.sourceNodeId, edge.id, userHeadingRad)
        val targetBest = bestOutboundMismatch(edge.targetNodeId, edge.id, userHeadingRad)
        val goToTarget = targetBest <= sourceBest
        var left = remainingDist

        // Đã ở miệng cửa → chuyển sang cạnh khớp heading (hành lang), giữ phần bước còn lại
        if (goToTarget && p.progress >= 0.98f) {
            val next = selectNextEdge(edge.targetNodeId, edge.id, userHeadingRad) ?: return 0f
            p.edgeId = next.id
            p.progress = 0f
            return left
        }
        if (!goToTarget && p.progress <= 0.02f) {
            val next = selectNextEdge(edge.sourceNodeId, edge.id, userHeadingRad) ?: return 0f
            p.edgeId = next.id
            p.progress = 0f
            return left
        }

        if (goToTarget) {
            val need = (1f - p.progress) * edge.distanceMeters
            if (left < need) {
                p.progress += left / edge.distanceMeters.coerceAtLeast(0.01f)
            } else {
                p.progress = 1f
            }
        } else {
            val need = p.progress * edge.distanceMeters
            if (left < need) {
                p.progress -= left / edge.distanceMeters.coerceAtLeast(0.01f)
            } else {
                p.progress = 0f
            }
        }
        return 0f
    }

    private fun bestOutboundMismatch(nodeId: String, excludeEdgeId: String, userHeadingRad: Float): Float {
        val outs = graphModel.getEdgesFromNode(nodeId).filter {
            it.id != excludeEdgeId && undirectedKey(it) != edgeMap[excludeEdgeId]?.let { e -> undirectedKey(e) }
        }
        if (outs.isEmpty()) return Float.MAX_VALUE
        return outs.minOf { edgeHeadingMismatch(it, userHeadingRad) }
    }

    private fun edgeHeadingMismatch(edge: GraphEdge, userHeadingRad: Float): Float {
        val d1 = abs(shortestAngleDeltaRad(userHeadingRad, edge.angleRad))
        val d2 = abs(shortestAngleDeltaRad(userHeadingRad, edge.reverseAngleRad))
        return min(d1, d2)
    }

    private fun tryRealignParticleToHeading(p: TopologicalParticle, userHeadingRad: Float) {
        val edge = edgeMap[p.edgeId] ?: return
        val currentMismatch = edgeHeadingMismatch(edge, userHeadingRad)
        if (currentMismatch <= PERPENDICULAR_THRESHOLD_RAD) return

        val xy = particlePosition(p) ?: return
        val candidates = collectNearbyEdges(edge)
        var best: GraphEdge? = null
        var bestMismatch = currentMismatch
        for (c in candidates) {
            if (undirectedKey(c) == undirectedKey(edge)) continue
            val m = edgeHeadingMismatch(c, userHeadingRad)
            if (m + 0.05f < bestMismatch) {
                bestMismatch = m
                best = c
            }
        }
        val chosen = best ?: return
        val shared = listOf(edge.sourceNodeId, edge.targetNodeId)
        p.edgeId = chosen.id
        p.progress = when {
            chosen.sourceNodeId in shared -> 0f
            chosen.targetNodeId in shared -> 1f
            else -> projectProgressOntoEdge(chosen, xy.first, xy.second)
        }
    }

    private fun collectNearbyEdges(edge: GraphEdge): List<GraphEdge> {
        val out = LinkedHashMap<String, GraphEdge>()
        for (n in listOf(edge.sourceNodeId, edge.targetNodeId)) {
            for (e1 in graphModel.getEdgesFromNode(n)) {
                out[e1.id] = e1
                for (e2 in graphModel.getEdgesFromNode(e1.targetNodeId)) out[e2.id] = e2
                for (e2 in graphModel.getEdgesFromNode(e1.sourceNodeId)) out[e2.id] = e2
            }
        }
        return out.values.toList()
    }

    private fun particlePosition(p: TopologicalParticle): Pair<Float, Float>? {
        val edge = edgeMap[p.edgeId] ?: return null
        return (edge.sourceX + p.progress * (edge.targetX - edge.sourceX)) to
            (edge.sourceY + p.progress * (edge.targetY - edge.sourceY))
    }

    private fun selectNextEdge(nodeId: String, currentEdgeId: String, userHeadingRad: Float): GraphEdge? {
        val currentKey = edgeMap[currentEdgeId]?.let { undirectedKey(it) }
        val connected = graphModel.getEdgesFromNode(nodeId).filter {
            it.id != currentEdgeId && undirectedKey(it) != currentKey
        }
        if (connected.isEmpty()) return null
        if (connected.size == 1) return connected[0]
        val ranked = connected.sortedBy { edgeHeadingMismatch(it, userHeadingRad) }
        val good = ranked.filter { edgeHeadingMismatch(it, userHeadingRad) <= PERPENDICULAR_THRESHOLD_RAD }
        val pool = if (good.isNotEmpty()) good else ranked
        return if (random.nextFloat() < 0.85f || pool.size < 2) pool[0] else pool[1]
    }

    private fun undirectedKey(edge: GraphEdge): String {
        val a = edge.sourceNodeId
        val b = edge.targetNodeId
        return if (a <= b) "$a|$b" else "$b|$a"
    }

    private fun minDistanceToEdge(e: GraphEdge, x: Float, y: Float): Float {
        val dx = e.targetX - e.sourceX
        val dy = e.targetY - e.sourceY
        val len2 = dx * dx + dy * dy
        if (len2 < 1e-3f) return hypot(x - e.sourceX, y - e.sourceY)
        val t = (((x - e.sourceX) * dx + (y - e.sourceY) * dy) / len2).coerceIn(0f, 1f)
        return hypot(x - (e.sourceX + t * dx), y - (e.sourceY + t * dy))
    }

    private fun projectProgressOntoEdge(e: GraphEdge, x: Float, y: Float): Float {
        val dx = e.targetX - e.sourceX
        val dy = e.targetY - e.sourceY
        val len2 = dx * dx + dy * dy
        if (len2 < 1e-3f) return 0f
        return (((x - e.sourceX) * dx + (y - e.sourceY) * dy) / len2).coerceIn(0f, 1f)
    }

    private fun resample(totalWeight: Float) {
        if (totalWeight <= 0f) {
            for (p in particles) p.weight = 1f / numParticles
            return
        }
        for (p in particles) p.weight /= totalWeight
        val newParticles = mutableListOf<TopologicalParticle>()
        val step = 1.0f / numParticles
        var r = random.nextFloat() * step
        var c = particles[0].weight
        var i = 0
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

    fun getEstimatedLocation(): Pair<Float, Float>? {
        if (particles.isEmpty()) return null
        var sumX = 0f
        var sumY = 0f
        var sumW = 0f
        for (p in particles) {
            val edge = edgeMap[p.edgeId] ?: continue
            val w = p.weight.coerceAtLeast(1e-4f)
            sumX += w * (edge.sourceX + p.progress * (edge.targetX - edge.sourceX))
            sumY += w * (edge.sourceY + p.progress * (edge.targetY - edge.sourceY))
            sumW += w
        }
        if (sumW <= 0f) return null
        return Pair(sumX / sumW, sumY / sumW)
    }

    fun getDominantEdge(): GraphEdge? {
        if (particles.isEmpty()) return null
        val counts = particles.groupBy { it.edgeId }.mapValues { it.value.size }
        val id = counts.maxByOrNull { it.value }?.key ?: return null
        return edgeMap[id]
    }
}
