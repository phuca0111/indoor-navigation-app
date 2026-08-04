package com.khoaluan.indoornav.ui.screens

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint
import com.khoaluan.indoornav.data.api.OutdoorLatLng
import com.khoaluan.indoornav.data.api.OutdoorRouteResponse
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point

/**
 * Đường đi bộ ngoài trời (outdoor route) + ghim điểm đến — GeoJsonSource + LineLayer/SymbolLayer.
 * Thay thế Polyline/Marker overlay của osmdroid.
 */
internal object OutdoorRouteMapHelpers {
    private const val ROUTE_SOURCE_ID = "outdoor_route_source"
    private const val ROUTE_LAYER_ID = "outdoor_route_layer"
    private const val DEST_SOURCE_ID = "outdoor_dest_source"
    private const val DEST_LAYER_ID = "outdoor_dest_layer"
    private const val DEST_ICON_ID = "outdoor_dest_pin_icon"

    private fun emptyCollection() = FeatureCollection.fromFeatures(emptyList())

    fun ensureLayers(style: Style) {
        if (style.getImage(DEST_ICON_ID) == null) {
            style.addImage(DEST_ICON_ID, createDestPinBitmap())
        }
        if (style.getSource(ROUTE_SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(ROUTE_SOURCE_ID, emptyCollection()))
        }
        if (style.getLayer(ROUTE_LAYER_ID) == null) {
            style.addLayerBelow(
                LineLayer(ROUTE_LAYER_ID, ROUTE_SOURCE_ID).withProperties(
                    PropertyFactory.lineColor(AndroidColor.parseColor("#1A73E8")),
                    PropertyFactory.lineWidth(6f),
                    PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
                    PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
                    PropertyFactory.lineOpacity(0.95f),
                ),
                OutdoorMapLayers.PLACE_LAYER_ID,
            )
        }
        if (style.getSource(DEST_SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(DEST_SOURCE_ID, emptyCollection()))
        }
        if (style.getLayer(DEST_LAYER_ID) == null) {
            style.addLayer(
                SymbolLayer(DEST_LAYER_ID, DEST_SOURCE_ID).withProperties(
                    PropertyFactory.iconImage(DEST_ICON_ID),
                    PropertyFactory.iconAnchor(Property.ICON_ANCHOR_BOTTOM),
                    PropertyFactory.iconAllowOverlap(true),
                    PropertyFactory.iconIgnorePlacement(true),
                ),
            )
        }
    }

    fun clearRoute(style: Style) {
        (style.getSource(ROUTE_SOURCE_ID) as? GeoJsonSource)?.setGeoJson(emptyCollection())
        (style.getSource(DEST_SOURCE_ID) as? GeoJsonSource)?.setGeoJson(emptyCollection())
    }

    /** Vẽ đường đi + ghim đích; trả về bounds để fit camera (null nếu route rỗng). */
    fun drawRoute(style: Style, route: OutdoorRouteResponse): LatLngBounds? {
        ensureLayers(style)
        val pts = route.polyline.mapNotNull { p ->
            if (p.lat == 0.0 && p.lng == 0.0) null else LatLng(p.lat, p.lng)
        }
        if (pts.size < 2) {
            clearRoute(style)
            return null
        }

        val lineString = LineString.fromLngLats(pts.map { Point.fromLngLat(it.longitude, it.latitude) })
        (style.getSource(ROUTE_SOURCE_ID) as? GeoJsonSource)?.setGeoJson(
            FeatureCollection.fromFeature(Feature.fromGeometry(lineString)),
        )

        val dest = route.to ?: route.polyline.lastOrNull()?.let { OutdoorLatLng(it.lat, it.lng) }
        (style.getSource(DEST_SOURCE_ID) as? GeoJsonSource)?.setGeoJson(
            if (dest != null) {
                FeatureCollection.fromFeature(Feature.fromGeometry(Point.fromLngLat(dest.lng, dest.lat)))
            } else {
                emptyCollection()
            },
        )

        val boundsBuilder = LatLngBounds.Builder()
        pts.forEach { boundsBuilder.include(it) }
        return boundsBuilder.build()
    }

    private fun createDestPinBitmap(): Bitmap {
        val size = 72
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = AndroidColor.parseColor("#EA4335")
        canvas.drawCircle(size / 2f, size / 2.4f, size / 3.2f, paint)
        paint.color = AndroidColor.WHITE
        canvas.drawCircle(size / 2f, size / 2.4f, size / 7f, paint)
        return bmp
    }
}
