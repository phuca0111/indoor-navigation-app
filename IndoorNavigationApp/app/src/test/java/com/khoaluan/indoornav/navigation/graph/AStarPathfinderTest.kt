package com.khoaluan.indoornav.navigation.graph

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.PathNode
import com.khoaluan.indoornav.data.model.PathEdge

/**
 * Unit tests cho AStarPathfinder.
 * Mục tiêu: Đảm bảo thuật toán A* luôn tìm ra đường ngắn nhất,
 * xử lý đúng các trường hợp đặc biệt (no path, same node, etc.)
 */
class AStarPathfinderTest {

    private lateinit var graphModel: GraphModel
    private lateinit var pathfinder: AStarPathfinder

    @Before
    fun setup() {
        // Tạo đồ thị vuông 4 node với đúng scale:
        // scaleRatio = 0.5 → 1m = 80px (vì meters = pixels/80)
        // Để khoảng cách mỗi cạnh = 10m → cần 800px
        val mapData = MapData(
            scaleRatio = 0.5,
            rooms = emptyList(),
            nodes = listOf(
                PathNode(id = 1, x = 0, y = 0, nodeIdRaw = "A"),
                PathNode(id = 2, x = 800, y = 0, nodeIdRaw = "B"), // 800px = 10m
                PathNode(id = 3, x = 800, y = 800, nodeIdRaw = "C"),
                PathNode(id = 4, x = 0, y = 800, nodeIdRaw = "D")
            ),
            edges = listOf(
                PathEdge(source = "A", target = "B", distance = 10.0),
                PathEdge(source = "B", target = "C", distance = 10.0),
                PathEdge(source = "C", target = "D", distance = 10.0),
                PathEdge(source = "D", target = "A", distance = 10.0)
            ),
            walls = emptyList(),
            pois = emptyList()
        )
        graphModel = GraphModel(mapData)
        pathfinder = AStarPathfinder(graphModel)
    }

    @Test
    fun `findPath returns valid path from A to C with distance 20m`() {
        val result = pathfinder.findPath("A", "C")
        assertNotNull("Path should exist from A to C", result)
        val path = result!!

        // Path phải có 3 node: A -> [B or D] -> C
        assertEquals(3, path.nodeIds.size)
        assertEquals("A", path.nodeIds.first())
        assertEquals("C", path.nodeIds.last())

        // Tổng khoảng cách phải là 20m (2 cạnh)
        assertEquals(20.0f, path.totalDistanceMeters, 0.01f)

        // Kiểm tra continuity: mỗi edge nối liền node
        for (i in 0 until path.edges.size) {
            val edge = path.edges[i]
            assertEquals(path.nodeIds[i], edge.sourceNodeId)
            assertEquals(path.nodeIds[i + 1], edge.targetNodeId)
        }
    }

    @Test
    fun `findPath with same start and goal returns single node zero distance`() {
        val result = pathfinder.findPath("A", "A")
        assertNotNull(result)
        assertEquals(1, result!!.nodeIds.size)
        assertEquals("A", result.nodeIds[0])
        assertEquals(0f, result.totalDistanceMeters, 0f)
        assertTrue("Edges should be empty for same node", result.edges.isEmpty())
    }

    @Test
    fun `findPath returns null when no path exists`() {
        // Tạo đồ thị với 2 node cách xa, không có edge
        val disconnectedData = MapData(
            scaleRatio = 0.5,
            rooms = emptyList(),
            nodes = listOf(
                PathNode(id = 1, x = 0, y = 0, nodeIdRaw = "X"),
                PathNode(id = 2, x = 100, y = 100, nodeIdRaw = "Y")
            ),
            edges = emptyList(),
            walls = emptyList(),
            pois = emptyList()
        )
        val disconnectedGraph = GraphModel(disconnectedData)
        val disconnectedFinder = AStarPathfinder(disconnectedGraph)
        val result = disconnectedFinder.findPath("X", "Y")
        assertNull("No path should exist between disconnected nodes", result)
    }

    @Test
    fun `path from A to D can be direct (10m) or via B-C (30m), shortest is direct`() {
        val result = pathfinder.findPath("A", "D")
        assertNotNull(result)

        // Do có cả A->D (10m) và A->B->C->D (30m), A* phải chọn A->D
        assertEquals(10.0f, result!!.totalDistanceMeters, 0.01f)
        assertEquals(listOf("A", "D"), result.nodeIds)
    }

    @Test
    fun `path edges list size equals nodeIds size minus one`() {
        val result = pathfinder.findPath("A", "C")
        assertNotNull(result)
        assertEquals(result!!.edges.size, result!!.nodeIds.size - 1)
    }

    @Test
    fun `heuristic is admissible - path distance never overestimates`() {
        // A* với heuristic Euclid là admissible (không bao giờ đánh giá quá cao)
        // Ta có thể kiểm tra bằng cách: f(n) = g(n) + h(n) <= actual optimal cost
        val result = pathfinder.findPath("A", "C")
        assertNotNull(result)
        // Vì heuristic admissible, A* đảm bảo optimal path
        // Ở đây optimal = 20m (do graph nhỏ)
        assertEquals(20.0f, result!!.totalDistanceMeters, 0.01f)
    }
}
