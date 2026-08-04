package com.khoaluan.indoornav.ui.screens

import android.util.Log
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.geojson.Point
import org.maplibre.geojson.Polygon

/**
 * Basemap MapLibre: OpenFreeMap Liberty (vector).
 * - Ưu tiên nhãn tiếng Việt; không fallback `name` (hay là chữ Trung).
 * - Zoom gần Biển Đông / Hoàng Sa / Trường Sa: ẩn hết chữ OSM basemap
 *   (thay bằng [VietnamSovereigntyMapLabels]).
 * - Fallback raster nếu Liberty không tải được (MapView lifecycle / mạng tile).
 */
internal object OutdoorBasemapTiles {
    const val LIBERTY_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty"
    private const val TAG = "OutdoorBasemap"

    /** Raster Voyager (Carto) — fallback khi vector Liberty fail. */
    val RASTER_FALLBACK_STYLE_JSON: String = """
    {
      "version": 8,
      "name": "Carto Voyager Raster",
      "sources": {
        "carto": {
          "type": "raster",
          "tiles": [
            "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
            "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
          ],
          "tileSize": 256,
          "attribution": "© OpenStreetMap © CARTO",
          "maxzoom": 20
        }
      },
      "layers": [
        { "id": "carto-raster", "type": "raster", "source": "carto" }
      ]
    }
    """.trimIndent()

    val hoangSaPolygon: Polygon = Polygon.fromLngLats(
        listOf(
            listOf(
                Point.fromLngLat(110.5, 15.0),
                Point.fromLngLat(114.2, 15.0),
                Point.fromLngLat(114.2, 18.0),
                Point.fromLngLat(110.5, 18.0),
                Point.fromLngLat(110.5, 15.0),
            ),
        ),
    )

    val truongSaPolygon: Polygon = Polygon.fromLngLats(
        listOf(
            listOf(
                Point.fromLngLat(110.5, 6.0),
                Point.fromLngLat(118.5, 6.0),
                Point.fromLngLat(118.5, 13.0),
                Point.fromLngLat(110.5, 13.0),
                Point.fromLngLat(110.5, 6.0),
            ),
        ),
    )

    /** Vùng biển rộng — dùng khi quyết định ẩn toàn bộ chữ OSM theo camera. */
    private data class SeaBox(
        val south: Double,
        val west: Double,
        val north: Double,
        val east: Double,
    )

    private val eastSeaBoxes = listOf(
        SeaBox(15.0, 110.5, 18.0, 114.2),
        SeaBox(6.0, 110.5, 13.0, 118.5),
        // Mở rộng thêm phần Biển Đông giữa hai quần đảo (tránh chữ Trung khi zoom gần biển)
        SeaBox(13.0, 110.5, 15.0, 116.0),
    )

    private val inSeaBoundary: Expression = Expression.any(
        Expression.within(hoangSaPolygon),
        Expression.within(truongSaPolygon),
    )

    /** Chỉ vi / en / latin — không `name`, không `name:zh`. */
    private val vietnameseLabelExpression: Expression = Expression.coalesce(
        Expression.get("name:vi"),
        Expression.get("name_vi"),
        Expression.get("name:en"),
        Expression.get("name_en"),
        Expression.get("name:latin"),
        Expression.get("name_int"),
        Expression.literal(""),
    )

    private val blankInSeaTextField: Expression = Expression.switchCase(
        inSeaBoundary,
        Expression.literal(""),
        vietnameseLabelExpression,
    )

    private fun isAppOverlayLayer(id: String): Boolean =
        id.startsWith("outdoor_") ||
            id.startsWith("vn-island") ||
            id == VietnamSovereigntyMapLabels.ARCH_LAYER_ID ||
            id == VietnamSovereigntyMapLabels.LABEL_LAYER_ID

    /**
     * Đổi text-field mọi symbol layer basemap sang ưu tiên tiếng Việt;
     * trong Hoàng Sa/Trường Sa để chuỗi rỗng.
     */
    fun preferVietnameseLabels(style: Style) {
        style.layers.forEach { layer ->
            if (layer !is SymbolLayer) return@forEach
            if (isAppOverlayLayer(layer.id)) return@forEach
            try {
                layer.setProperties(PropertyFactory.textField(blankInSeaTextField))
            } catch (e: Exception) {
                try {
                    layer.setProperties(PropertyFactory.textField(vietnameseLabelExpression))
                } catch (e2: Exception) {
                    Log.w(TAG, "textField ${layer.id}: ${e2.message}")
                }
            }
            try {
                layer.setProperties(
                    PropertyFactory.iconOpacity(
                        Expression.switchCase(
                            inSeaBoundary,
                            Expression.literal(0f),
                            Expression.literal(1f),
                        ),
                    ),
                    PropertyFactory.textOpacity(
                        Expression.switchCase(
                            inSeaBoundary,
                            Expression.literal(0f),
                            Expression.literal(1f),
                        ),
                    ),
                )
            } catch (e: Exception) {
                Log.w(TAG, "opacity ${layer.id}: ${e.message}")
            }
        }
    }

    fun isEastSeaCloseZoom(center: LatLng, zoom: Double): Boolean {
        if (zoom < 7.5) return false
        return eastSeaBoxes.any { box ->
            center.latitude in box.south..box.north &&
                center.longitude in box.west..box.east
        }
    }

    /**
     * Zoom gần vùng Biển Đông / quần đảo → ẩn hết chữ + icon basemap (OSM),
     * giữ layer app (place, user, route, nhãn Việt).
     */
    fun setBasemapSymbolsVisible(style: Style, visible: Boolean) {
        val vis = if (visible) Property.VISIBLE else Property.NONE
        style.layers.forEach { layer ->
            if (layer !is SymbolLayer) return@forEach
            if (isAppOverlayLayer(layer.id)) return@forEach
            try {
                layer.setProperties(PropertyFactory.visibility(vis))
            } catch (e: Exception) {
                Log.w(TAG, "visibility ${layer.id}: ${e.message}")
            }
        }
    }
}
