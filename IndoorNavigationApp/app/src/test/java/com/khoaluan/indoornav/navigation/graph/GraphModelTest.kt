package com.khoaluan.indoornav.navigation.graph

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.PathNode
import com.khoaluan.indoornav.data.model.PathEdge
import kotlin.math.*

/**
 * Unit tests cho GraphModel.
 * Mục tiêu: Đảm bảo đồ thị được xây dựng đúng từ MapData,
 * bao gồm edges (cả 2 chiều), adjacency list, và pixel-to-meter conversion.
 */
class GraphModelTest {

    private lateinit var graphModel: GraphModel

    @Before
    fun setup() {
        val mapData = MapData(
            scaleRatio = 0.5,
            rooms = emptyList(),
            nodes = listOf(
                PathNode(id = 1, x = 0, y = 0, nodeIdRaw = "A"),
                PathNode(id = 2, x = 80, y = 0, nodeIdRaw = "B"), // 80px = 1m với scaleRatio 0.5 (pxPerMeter = 80)
                PathNode(id = 3, x = 80, y = 80, nodeIdRaw = "C")
            ),
            edges = listOf(
                PathEdge(source = "A", target = "B", distance = 1.0), // 1m
                PathEdge(source = "B", target = "C", distance = 1.0)
            ),
            walls = emptyList(),
            pois = emptyList()
        )
        graphModel = GraphModel(mapData)
    }

    @Test
    fun `nodeMap contains all nodes with correct IDs`() {
        assertEquals(3, graphModel.nodeMap.size)
        assertTrue(graphModel.nodeMap.containsKey("A"))
        assertTrue(graphModel.nodeMap.containsKey("B"))
        assertTrue(graphModel.nodeMap.containsKey("C"))
    }

    @Test
    fun `edges list contains both directions for each original edge`() {
        val edges = graphModel.edges
        // 2 original edges -> 4 directed edges
        assertEquals(4, edges.size)

        val hasAtoB = edges.any { it.sourceNodeId == "A" && it.targetNodeId == "B" }
        val hasBtoA = edges.any { it.sourceNodeId == "B" && it.targetNodeId == "A" }
        val hasBtoC = edges.any { it.sourceNodeId == "B" && it.targetNodeId == "C" }
        val hasCtoB = edges.any { it.sourceNodeId == "C" && it.targetNodeId == "B" }

        assertTrue("Missing edge A->B", hasAtoB)
        assertTrue("Missing edge B->A", hasBtoA)
        assertTrue("Missing edge B->C", hasBtoC)
        assertTrue("Missing edge C->B", hasCtoB)
    }

    @Test
    fun `adjacency lists contain outgoing edges for each node`() {
        val adjA = graphModel.adjacency["A"] ?: emptyList()
        val adjB = graphModel.adjacency["B"] ?: emptyList()
        val adjC = graphModel.adjacency["C"] ?: emptyList()

        assertEquals(1, adjA.size) // A -> B
        assertEquals("B", adjA[0].targetNodeId)

        assertEquals(2, adjB.size) // B -> A, B -> C
        val bTargets = adjB.map { it.targetNodeId }.sorted()
        assertEquals(listOf("A", "C"), bTargets)

        assertEquals(1, adjC.size) // C -> B
        assertEquals("B", adjC[0].targetNodeId)
    }

    @Test
    fun `pixelsToMeters converts correctly with scaleRatio 0_5`() {
        // pixelsPerMeter = 40.0 / scaleRatio = 40 / 0.5 = 80
        // 80px = 1m
        val meters = graphModel.pixelsToMeters(80f)
        assertEquals(1.0f, meters, 0.001f)

        // 160px = 2m
        val meters2 = graphModel.pixelsToMeters(160f)
        assertEquals(2.0f, meters2, 0.001f)
    }

    @Test
    fun `edge distanceMeters matches given distance`() {
        val edges = graphModel.edges
        val aToB = edges.first { it.sourceNodeId == "A" && it.targetNodeId == "B" }
        // Given distance 1.0m in PathEdge, and scaleRatio 0.5, distance should be 1.0m
        assertEquals(1.0f, aToB.distanceMeters, 0.01f)
    }

    @Test
    fun `getPositionOnEdge interpolates correctly`() {
        val edges = graphModel.edges
        val aToB = edges.first { it.sourceNodeId == "A" && it.targetNodeId == "B" }

        // Node A at (0,0), B at (80,0)
        val start = graphModel.getPositionOnEdge(aToB, 0f)
        assertEquals(0f, start.first, 0.001f)
        assertEquals(0f, start.second, 0.001f)

        val mid = graphModel.getPositionOnEdge(aToB, 0.5f)
        assertEquals(40f, mid.first, 0.001f)
        assertEquals(0f, mid.second, 0.001f)

        val end = graphModel.getPositionOnEdge(aToB, 1f)
        assertEquals(80f, end.first, 0.001f)
        assertEquals(0f, end.second, 0.001f)
    }

    @Test
    fun `getEdgesFromNode returns empty list for non-existent node`() {
        val edges = graphModel.getEdgesFromNode("Z")
        assertTrue(edges.isEmpty())
    }

    @Test
    fun `findNearestEdge returns closest edge to a point`() {
        // Point near middle of edge A-B (40,5)
        val result = graphModel.findNearestEdge(40f, 5f)
        assertNotNull(result)
        val (edge, progress) = result!!

        // Should be edge A-B (or B-A)
        assertTrue(
            (edge.sourceNodeId == "A" && edge.targetNodeId == "B") ||
            (edge.sourceNodeId == "B" && edge.targetNodeId == "A")
        )

        // Progress should be around 0.5 (midpoint)
        assertTrue(progress in 0.45f..0.55f)
    }

    @Test
    fun `angleRad calculation for horizontal edge eastward is PI_2`() {
        // Edge từ A(0,0) đến B(80,0): dx=80, dy=0
        // angle = atan2(dx, -dy) = atan2(80, 0) = π/2 (90°) vì -dy = 0, atan2(+,0) = π/2
        // Wait: atan2(y,x) but they use atan2(dx, -dy)
        // dx=80, -dy=0 → atan2(80, 0) = π/2 (90 degrees) — East direction
        val edges = graphModel.edges
        val aToB = edges.first { it.sourceNodeId == "A" && it.targetNodeId == "B" }
        val expectedAngle = Math.PI / 2
        assertEquals(expectedAngle, aToB.angleRad.toDouble(), 0.01)
    }

    @Test
    fun `reverseAngleRad is opposite of angleRad`() {
        val edges = graphModel.edges
        val aToB = edges.first { it.sourceNodeId == "A" && it.targetNodeId == "B" }
        val bToA = edges.first { it.sourceNodeId == "B" && it.targetNodeId == "A" }

        // reverseAngleRad của A->B nên bằng angleRad của B->A
        assertEquals(bToA.angleRad, aToB.reverseAngleRad, 0.001f)
    }
}
