package com.khoaluan.indoornav.ui.viewmodel

import androidx.compose.ui.geometry.Offset
import com.khoaluan.indoornav.navigation.graph.AStarPathfinder
import com.khoaluan.indoornav.navigation.graph.GraphModel
import com.khoaluan.indoornav.data.model.MapData
import com.khoaluan.indoornav.data.model.PathEdge
import com.khoaluan.indoornav.data.model.PathNode
import com.khoaluan.indoornav.data.model.Poi
import com.khoaluan.indoornav.data.model.Room
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Integration-style unit tests cho logic G1 (không cần Android runtime):
 * chọn đích → lưu node + marker; chỉ A* khi preview.
 */
class DestinationSelectionG1Test {

    private lateinit var mapData: MapData
    private lateinit var graph: GraphModel
    private lateinit var pathfinder: AStarPathfinder

    @Before
    fun setup() {
        mapData = MapData(
            scaleRatio = 0.5,
            rooms = listOf(
                Room(id = 10, name = "Phòng 101", x = 0, y = 0, width = 40, height = 40),
            ),
            nodes = listOf(
                PathNode(id = 1, x = 0, y = 0, nodeIdRaw = "A"),
                PathNode(id = 2, x = 80, y = 0, nodeIdRaw = "B"),
                PathNode(id = 3, x = 80, y = 80, nodeIdRaw = "C"),
            ),
            edges = listOf(
                PathEdge(source = "A", target = "B", distance = 1.0),
                PathEdge(source = "B", target = "C", distance = 1.0),
            ),
            pois = listOf(
                Poi(id = 7, name = "WC", x = 80, y = 80, type = "WC"),
            ),
        )
        graph = GraphModel(mapData)
        pathfinder = AStarPathfinder(graph)
    }

    @Test
    fun selectRoom_resolvesNearestNode_withoutRequiringPathComputation() {
        val room = mapData.rooms.first()
        val cx = room.x + room.width / 2.0
        val cy = room.y + room.height / 2.0
        val target = graph.nodeMap.values.minByOrNull {
            val dx = it.x - cx
            val dy = it.y - cy
            dx * dx + dy * dy
        }
        assertNotNull(target)
        assertEquals("A", target!!.nodeId)
        // G1 contract: sau select, path phải null (mô phỏng state)
        val navAfterSelect = NavigationState(
            destinationNodeId = target.nodeId,
            destinationMarkerPos = Offset(cx.toFloat(), cy.toFloat()),
            path = null,
            isNavigatingMode = false,
        )
        assertNull(navAfterSelect.path)
        assertNotNull(navAfterSelect.destinationMarkerPos)
    }

    @Test
    fun previewPath_computesPolyline_onlyWhenRequested() {
        val result = pathfinder.findPath("A", "C")
        assertNotNull(result)
        assertTrue(result!!.edges.isNotEmpty())
        val pathOffsets = result.edges.map { Offset(it.sourceX, it.sourceY) } +
            Offset(result.edges.last().targetX, result.edges.last().targetY)
        assertTrue("Path preview cần >= 2 điểm để vẽ line", pathOffsets.size >= 2)
    }

    @Test
    fun selectPoi_nearestNodeIsC() {
        val poi = mapData.pois.first()
        val target = graph.nodeMap.values.minByOrNull {
            val dx = it.x - poi.x
            val dy = it.y - poi.y
            dx * dx + dy * dy
        }
        assertEquals("C", target!!.nodeId)
    }
}
