package com.khoaluan.indoornav.ui.screens

import android.graphics.Color as AndroidColor
import android.util.Log
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.Point

/**
 * Nhãn tiếng Việt Hoàng Sa / Trường Sa / Biển Đông (GeoJSON) — giống web maplibre-basemap.js.
 */
internal object VietnamSovereigntyMapLabels {
    const val SOURCE_ID = "vn-island-labels"
    const val ARCH_LAYER_ID = "vn-island-labels-arch"
    const val LABEL_LAYER_ID = "vn-island-labels-text"

    private const val TAG = "VnIslandLabels"
    private const val PROP_NAME = "name"
    private const val PROP_SUB = "sub"
    private const val PROP_KIND = "kind"
    private const val PROP_MINZOOM = "minzoom"

    private data class IslandPoint(
        val name: String,
        val sub: String = "",
        val lng: Double,
        val lat: Double,
        val minZoom: Float,
        val kind: String = "place",
    )

    private val ISLAND_POINTS = listOf(
        // Hiện từ zoom xa (toàn cảnh VN)
        IslandPoint("Quần đảo Hoàng Sa", "Việt Nam", 112.28, 16.78, 3.5f, kind = "arch"),
        IslandPoint("Quần đảo Trường Sa", "Việt Nam", 114.75, 9.95, 3.5f, kind = "arch"),
        IslandPoint("Biển Đông", "", 113.55, 14.15, 3f, kind = "arch"),
        // Zoom gần
        IslandPoint("Đảo Phú Lâm", lng = 112.337, lat = 16.834, minZoom = 8f),
        IslandPoint("Đảo Cây", lng = 112.269, lat = 16.98, minZoom = 9f),
        IslandPoint("Đảo Linh Côn", lng = 112.728, lat = 16.668, minZoom = 9f),
        IslandPoint("Đảo Duy Mộng", lng = 111.835, lat = 16.514, minZoom = 9f),
        IslandPoint("Đảo Quang Hòa", lng = 111.71, lat = 16.452, minZoom = 9f),
        IslandPoint("Đảo Hoàng Sa", lng = 111.608, lat = 16.514, minZoom = 9f),
        IslandPoint("Đảo Hữu Nhật", lng = 111.582, lat = 16.506, minZoom = 10f),
        IslandPoint("Đảo Quang Ảnh", lng = 111.506, lat = 16.448, minZoom = 10f),
        IslandPoint("Đảo Tri Tôn", lng = 111.203, lat = 15.784, minZoom = 8f),
        IslandPoint("Nhóm An Vĩnh", lng = 112.35, lat = 16.9, minZoom = 7f),
        IslandPoint("Nhóm Lưỡi Liềm", lng = 111.7, lat = 16.5, minZoom = 7f),
        IslandPoint("Bãi Bình Sơn", lng = 112.5, lat = 17.1, minZoom = 9f),
        IslandPoint("Đảo Trường Sa", lng = 111.92, lat = 8.646, minZoom = 8f),
        IslandPoint("Đảo Song Tử Tây", lng = 114.331, lat = 11.428, minZoom = 8f),
        IslandPoint("Đảo Song Tử Đông", lng = 114.354, lat = 11.453, minZoom = 9f),
        IslandPoint("Đảo Sinh Tồn", lng = 114.328, lat = 9.885, minZoom = 8f),
        IslandPoint("Đảo Nam Yết", lng = 114.367, lat = 10.183, minZoom = 9f),
        IslandPoint("Đảo Sơn Ca", lng = 114.572, lat = 10.229, minZoom = 9f),
        IslandPoint("Đảo An Bang", lng = 112.922, lat = 7.892, minZoom = 8f),
        IslandPoint("Đá Tây", lng = 114.28, lat = 11.43, minZoom = 10f),
    )

    private fun featureCollection(): FeatureCollection {
        val features = ISLAND_POINTS.map { p ->
            Feature.fromGeometry(Point.fromLngLat(p.lng, p.lat)).apply {
                addStringProperty(PROP_NAME, p.name)
                addStringProperty(PROP_SUB, p.sub)
                addStringProperty(PROP_KIND, p.kind)
                addNumberProperty(PROP_MINZOOM, p.minZoom.toDouble())
            }
        }
        return FeatureCollection.fromFeatures(features)
    }

    private fun removeIfPresent(style: Style) {
        try {
            if (style.getLayer(ARCH_LAYER_ID) != null) style.removeLayer(ARCH_LAYER_ID)
            if (style.getLayer(LABEL_LAYER_ID) != null) style.removeLayer(LABEL_LAYER_ID)
            if (style.getSource(SOURCE_ID) != null) style.removeSource(SOURCE_ID)
        } catch (e: Exception) {
            Log.w(TAG, "removeIfPresent: ${e.message}")
        }
    }

    /** Thêm / làm mới source + layer nhãn Việt (luôn trên cùng). */
    fun ensureLabels(style: Style) {
        removeIfPresent(style)
        try {
            style.addSource(GeoJsonSource(SOURCE_ID, featureCollection()))

            val archText = Expression.switchCase(
                Expression.gt(
                    Expression.length(Expression.get(PROP_SUB)),
                    Expression.literal(0),
                ),
                Expression.concat(
                    Expression.get(PROP_NAME),
                    Expression.literal("\n"),
                    Expression.get(PROP_SUB),
                ),
                Expression.get(PROP_NAME),
            )

            style.addLayer(
                SymbolLayer(ARCH_LAYER_ID, SOURCE_ID)
                    .withProperties(
                        PropertyFactory.textField(archText),
                        PropertyFactory.textFont(arrayOf("Noto Sans Bold")),
                        PropertyFactory.textSize(
                            Expression.interpolate(
                                Expression.linear(),
                                Expression.zoom(),
                                Expression.stop(3, 12f),
                                Expression.stop(6, 14f),
                                Expression.stop(10, 17f),
                            ),
                        ),
                        PropertyFactory.textAnchor(Property.TEXT_ANCHOR_CENTER),
                        PropertyFactory.textLineHeight(1.2f),
                        PropertyFactory.textAllowOverlap(true),
                        PropertyFactory.textIgnorePlacement(true),
                        PropertyFactory.textOptional(false),
                        PropertyFactory.textColor(AndroidColor.parseColor("#0F172A")),
                        PropertyFactory.textHaloColor(AndroidColor.parseColor("#FFFFFF")),
                        PropertyFactory.textHaloWidth(2.2f),
                        PropertyFactory.symbolZOrder(Property.SYMBOL_Z_ORDER_SOURCE),
                    )
                    .withFilter(Expression.eq(Expression.get(PROP_KIND), Expression.literal("arch")))
                    .also { it.minZoom = 3f },
            )

            style.addLayer(
                SymbolLayer(LABEL_LAYER_ID, SOURCE_ID)
                    .withProperties(
                        PropertyFactory.textField(Expression.get(PROP_NAME)),
                        PropertyFactory.textFont(arrayOf("Noto Sans Regular")),
                        PropertyFactory.textSize(
                            Expression.interpolate(
                                Expression.linear(),
                                Expression.zoom(),
                                Expression.stop(7, 11f),
                                Expression.stop(11, 14f),
                                Expression.stop(14, 16f),
                            ),
                        ),
                        PropertyFactory.textAnchor(Property.TEXT_ANCHOR_CENTER),
                        PropertyFactory.textAllowOverlap(true),
                        PropertyFactory.textIgnorePlacement(false),
                        PropertyFactory.textOptional(true),
                        PropertyFactory.textColor(AndroidColor.parseColor("#0F172A")),
                        PropertyFactory.textHaloColor(AndroidColor.parseColor("#FFFFFF")),
                        PropertyFactory.textHaloWidth(1.8f),
                    )
                    .withFilter(
                        Expression.all(
                            Expression.eq(Expression.get(PROP_KIND), Expression.literal("place")),
                            Expression.gte(Expression.zoom(), Expression.get(PROP_MINZOOM)),
                        ),
                    )
                    .also { it.minZoom = 7f },
            )
        } catch (e: Exception) {
            Log.e(TAG, "ensureLabels failed", e)
            // Fallback không set text-font (một số build thiếu Noto)
            try {
                if (style.getSource(SOURCE_ID) == null) {
                    style.addSource(GeoJsonSource(SOURCE_ID, featureCollection()))
                }
                if (style.getLayer(ARCH_LAYER_ID) == null) {
                    style.addLayer(
                        SymbolLayer(ARCH_LAYER_ID, SOURCE_ID)
                            .withProperties(
                                PropertyFactory.textField(Expression.get(PROP_NAME)),
                                PropertyFactory.textSize(14f),
                                PropertyFactory.textAllowOverlap(true),
                                PropertyFactory.textColor(AndroidColor.parseColor("#0F172A")),
                                PropertyFactory.textHaloColor(AndroidColor.WHITE),
                                PropertyFactory.textHaloWidth(2f),
                            )
                            .withFilter(
                                Expression.eq(Expression.get(PROP_KIND), Expression.literal("arch")),
                            )
                            .also { it.minZoom = 3f },
                    )
                }
                if (style.getLayer(LABEL_LAYER_ID) == null) {
                    style.addLayer(
                        SymbolLayer(LABEL_LAYER_ID, SOURCE_ID)
                            .withProperties(
                                PropertyFactory.textField(Expression.get(PROP_NAME)),
                                PropertyFactory.textSize(13f),
                                PropertyFactory.textAllowOverlap(true),
                                PropertyFactory.textColor(AndroidColor.parseColor("#0F172A")),
                                PropertyFactory.textHaloColor(AndroidColor.WHITE),
                                PropertyFactory.textHaloWidth(1.5f),
                            )
                            .withFilter(
                                Expression.eq(Expression.get(PROP_KIND), Expression.literal("place")),
                            )
                            .also { it.minZoom = 7f },
                    )
                }
            } catch (e2: Exception) {
                Log.e(TAG, "ensureLabels fallback failed", e2)
            }
        }
    }
}
