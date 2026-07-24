package com.khoaluan.indoornav.navigation.graph

import com.google.gson.Gson
import com.khoaluan.indoornav.data.model.MapResponse
import com.khoaluan.indoornav.data.model.sanitized
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * Contract smoke cho vòng Publish WebEditor → API public → Android → A*.
 * Fixture dùng đúng tên field snake_case của payload đã publish; các field
 * chỉ dành cho editor phải được Gson bỏ qua an toàn.
 */
class PublishAndroidContractTest {
    @Test
    fun publishedPayload_deserializesAndFindsPathFromQrAnchor() {
        val publishedResponse = """
            {
              "building_id": "building-contract",
              "floor_number": 1,
              "version": 7,
              "map_data": {
                "scale_ratio": 1.0,
                "background_image": null,
                "rooms": [],
                "walls": [],
                "doors": [],
                "pois": [
                  { "id": 9, "name": "Y tế", "x": 20, "y": 10, "type": "Phòng y tế", "poiType": "MEDICAL", "typeIndex": 11, "size": 64 }
                ],
                "nodes": [
                  { "id": 1, "x": 0, "y": 0 },
                  { "id": 2, "x": 40, "y": 0 },
                  { "id": 3, "x": 80, "y": 0 }
                ],
                "edges": [
                  { "source": "1", "target": "2", "distance": 1.0 },
                  { "source": "2", "target": "3", "distance": 1.0 }
                ],
                "qr_anchors": [
                  { "qr_id": "QR-START", "x": 0, "y": 0, "node_id": "1" }
                ],
                "bgScale": 1.0,
                "bgScaleX": 2.0,
                "bgScaleY": 0.75,
                "ltScale": 1.5,
                "advancedFeatures": { "constraints": [], "xrefs": [] }
              }
            }
        """.trimIndent()

        val response = Gson().fromJson(publishedResponse, MapResponse::class.java)
        val mapData = response.mapData.sanitized()
        val startNodeId = mapData.qrAnchors.single().nodeId
        assertEquals("1", startNodeId)
        assertEquals(3, mapData.nodes.size)
        assertEquals(2, mapData.edges.size)
        assertEquals(2.0f, mapData.bgScaleX, 0.0001f)
        assertEquals(0.75f, mapData.bgScaleY, 0.0001f)
        assertEquals("MEDICAL", mapData.pois.single().poiType)
        assertEquals(64f, mapData.pois.single().size, 0.0001f)

        val result = AStarPathfinder(GraphModel(mapData)).findPath(startNodeId!!, "3")
        assertNotNull(result)
        assertEquals(listOf("1", "2", "3"), result!!.nodeIds)
        assertEquals(2.0f, result.totalDistanceMeters, 0.0001f)
    }

    @Test
    fun legacyPayload_withoutAxisScale_fallsBackToUniformScale() {
        val response = Gson().fromJson(
            """
                {
                  "building_id": "legacy",
                  "floor_number": 1,
                  "version": 1,
                  "map_data": {
                    "scale_ratio": 1.0,
                    "bgScale": 2.5,
                    "rooms": [],
                    "nodes": [],
                    "edges": [],
                    "walls": [],
                    "doors": [],
                    "pois": [{ "id": 1, "x": 0, "y": 0 }],
                    "qr_anchors": []
                  }
                }
            """.trimIndent(),
            MapResponse::class.java
        )
        val mapData = response.mapData.sanitized()
        assertEquals(2.5f, mapData.bgScaleX, 0.0001f)
        assertEquals(2.5f, mapData.bgScaleY, 0.0001f)
        assertEquals(24f, mapData.pois.single().size, 0.0001f)
    }
}
