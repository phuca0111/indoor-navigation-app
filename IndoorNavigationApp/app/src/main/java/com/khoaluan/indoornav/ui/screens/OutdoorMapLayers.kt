package com.khoaluan.indoornav.ui.screens

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color as AndroidColor
import android.graphics.Paint
import android.graphics.Path
import com.khoaluan.indoornav.data.model.Building
import kotlin.math.cos
import kotlin.math.sin
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.Point
import org.maplibre.geojson.Polygon

/**
 * GeoJsonSource + SymbolLayer/FillLayer cho marker địa điểm, con trỏ GPS người dùng
 * (chấm xanh / mũi tên định hướng) và vòng tròn độ chính xác — thay thế Marker/Polygon
 * overlay của osmdroid.
 */
internal object OutdoorMapLayers {
    const val PLACE_SOURCE_ID = "outdoor_places_source"
    const val PLACE_LAYER_ID = "outdoor_places_layer"
    const val PROP_BUILDING_ID = "buildingId"

    private const val USER_SOURCE_ID = "outdoor_user_source"
    private const val USER_LAYER_ID = "outdoor_user_layer"
    private const val USER_ACCURACY_SOURCE_ID = "outdoor_user_accuracy_source"
    private const val USER_ACCURACY_LAYER_ID = "outdoor_user_accuracy_layer"

    private const val ICON_PLACE_PIN = "outdoor_place_pin_icon"
    private const val ICON_USER_DOT = "outdoor_user_dot_icon"
    private const val ICON_USER_ARROW = "outdoor_user_arrow_icon"

    private const val PROP_ICON = "icon"
    private const val PROP_HEADING = "heading"

    private fun emptyCollection() = FeatureCollection.fromFeatures(emptyList())

    fun ensureLayers(style: Style) {
        if (style.getImage(ICON_PLACE_PIN) == null) {
            style.addImage(ICON_PLACE_PIN, createPlacePinBitmap())
        }
        if (style.getImage(ICON_USER_DOT) == null) {
            style.addImage(ICON_USER_DOT, createBlueDotBitmap())
        }
        if (style.getImage(ICON_USER_ARROW) == null) {
            style.addImage(ICON_USER_ARROW, createNavArrowBitmap())
        }

        if (style.getSource(PLACE_SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(PLACE_SOURCE_ID, emptyCollection()))
        }
        if (style.getLayer(PLACE_LAYER_ID) == null) {
            style.addLayer(
                SymbolLayer(PLACE_LAYER_ID, PLACE_SOURCE_ID).withProperties(
                    PropertyFactory.iconImage(ICON_PLACE_PIN),
                    PropertyFactory.iconAnchor(Property.ICON_ANCHOR_BOTTOM),
                    PropertyFactory.iconAllowOverlap(true),
                    PropertyFactory.iconIgnorePlacement(true),
                ),
            )
        }

        if (style.getSource(USER_ACCURACY_SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(USER_ACCURACY_SOURCE_ID, emptyCollection()))
        }
        if (style.getLayer(USER_ACCURACY_LAYER_ID) == null) {
            style.addLayerBelow(
                FillLayer(USER_ACCURACY_LAYER_ID, USER_ACCURACY_SOURCE_ID).withProperties(
                    PropertyFactory.fillColor(AndroidColor.parseColor("#332D8CFF")),
                    PropertyFactory.fillOutlineColor(AndroidColor.parseColor("#882D8CFF")),
                ),
                PLACE_LAYER_ID,
            )
        }

        if (style.getSource(USER_SOURCE_ID) == null) {
            style.addSource(GeoJsonSource(USER_SOURCE_ID, emptyCollection()))
        }
        if (style.getLayer(USER_LAYER_ID) == null) {
            style.addLayer(
                SymbolLayer(USER_LAYER_ID, USER_SOURCE_ID).withProperties(
                    PropertyFactory.iconImage(Expression.get(PROP_ICON)),
                    PropertyFactory.iconRotate(Expression.get(PROP_HEADING)),
                    PropertyFactory.iconRotationAlignment(Property.ICON_ROTATION_ALIGNMENT_MAP),
                    PropertyFactory.iconAllowOverlap(true),
                    PropertyFactory.iconIgnorePlacement(true),
                ),
            )
        }
    }

    fun updatePlaces(style: Style, buildings: List<Building>) {
        val features = buildings.mapNotNull { b ->
            val gps = b.gpsLocation ?: return@mapNotNull null
            if (gps.lat == 0.0 && gps.lng == 0.0) return@mapNotNull null
            Feature.fromGeometry(Point.fromLngLat(gps.lng, gps.lat)).apply {
                addStringProperty(PROP_BUILDING_ID, b.id)
            }
        }
        (style.getSource(PLACE_SOURCE_ID) as? GeoJsonSource)?.setGeoJson(FeatureCollection.fromFeatures(features))
    }

    fun updateUserLocation(style: Style, point: LatLng, headingDeg: Float?, showArrow: Boolean) {
        val feature = Feature.fromGeometry(Point.fromLngLat(point.longitude, point.latitude)).apply {
            addStringProperty(PROP_ICON, if (showArrow) ICON_USER_ARROW else ICON_USER_DOT)
            addNumberProperty(PROP_HEADING, (headingDeg ?: 0f).toDouble())
        }
        (style.getSource(USER_SOURCE_ID) as? GeoJsonSource)?.setGeoJson(FeatureCollection.fromFeature(feature))
    }

    fun updateUserAccuracy(style: Style, center: LatLng, radiusMeters: Double) {
        val polygon = geoCirclePolygon(center, radiusMeters)
        (style.getSource(USER_ACCURACY_SOURCE_ID) as? GeoJsonSource)?.setGeoJson(
            FeatureCollection.fromFeature(Feature.fromGeometry(polygon)),
        )
    }

    /** Vòng tròn địa lý bán kính mét thực (giống Polygon.pointsAsCircle của osmdroid). */
    private fun geoCirclePolygon(center: LatLng, radiusMeters: Double, steps: Int = 48): Polygon {
        val earthRadiusM = 6371000.0
        val latRad = Math.toRadians(center.latitude)
        val lngRad = Math.toRadians(center.longitude)
        val angularDistance = radiusMeters / earthRadiusM
        val ring = (0..steps).map { i ->
            val bearing = 2.0 * Math.PI * i / steps
            val lat2 = Math.asin(
                sin(latRad) * cos(angularDistance) +
                    cos(latRad) * sin(angularDistance) * cos(bearing),
            )
            val lng2 = lngRad + Math.atan2(
                sin(bearing) * sin(angularDistance) * cos(latRad),
                cos(angularDistance) - sin(latRad) * sin(lat2),
            )
            Point.fromLngLat(Math.toDegrees(lng2), Math.toDegrees(lat2))
        }
        return Polygon.fromLngLats(listOf(ring))
    }

    private fun createBlueDotBitmap(): Bitmap {
        val size = 64
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val cx = size / 2f
        val cy = size / 2f

        val halo = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0x332D8CFF.toInt()
            style = Paint.Style.FILL
        }
        canvas.drawCircle(cx, cy, size * 0.48f, halo)

        val white = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFFFFFFF.toInt()
            style = Paint.Style.FILL
        }
        canvas.drawCircle(cx, cy, size * 0.28f, white)

        val blue = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF1A73E8.toInt()
            style = Paint.Style.FILL
        }
        canvas.drawCircle(cx, cy, size * 0.18f, blue)
        return bmp
    }

    /** Mũi tên hướng đi — map-aligned nên "rotate" luôn là hướng la bàn tuyệt đối. */
    private fun createNavArrowBitmap(): Bitmap {
        val size = 96
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val cx = size / 2f
        val cy = size / 2f
        val halo = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0x332D8CFF.toInt()
            style = Paint.Style.FILL
        }
        canvas.drawCircle(cx, cy, size * 0.42f, halo)
        val arrow = Path().apply {
            moveTo(cx, cy - size * 0.38f)
            lineTo(cx - size * 0.22f, cy + size * 0.28f)
            lineTo(cx, cy + size * 0.12f)
            lineTo(cx + size * 0.22f, cy + size * 0.28f)
            close()
        }
        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF1A73E8.toInt()
            style = Paint.Style.FILL
        }
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFFFFFFF.toInt()
            style = Paint.Style.STROKE
            strokeWidth = 4f
            strokeJoin = Paint.Join.ROUND
        }
        canvas.drawPath(arrow, fill)
        canvas.drawPath(arrow, stroke)
        return bmp
    }

    /** Ghim địa điểm hình giọt nước (khác màu với ghim điểm đến trong [OutdoorRouteMapHelpers]). */
    private fun createPlacePinBitmap(): Bitmap {
        val size = 72
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val cx = size / 2f
        val topR = size * 0.30f
        val path = Path().apply {
            moveTo(cx - topR, size * 0.32f)
            cubicTo(cx - topR, size * 0.14f, cx + topR, size * 0.14f, cx + topR, size * 0.32f)
            cubicTo(cx + topR, size * 0.52f, cx, size * 0.62f, cx, size * 0.94f)
            cubicTo(cx, size * 0.62f, cx - topR, size * 0.52f, cx - topR, size * 0.32f)
            close()
        }
        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF4285F4.toInt()
            style = Paint.Style.FILL
        }
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFFFFFFF.toInt()
            style = Paint.Style.STROKE
            strokeWidth = 3f
        }
        canvas.drawPath(path, fill)
        canvas.drawPath(path, stroke)
        val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFFFFFFFF.toInt()
            style = Paint.Style.FILL
        }
        canvas.drawCircle(cx, size * 0.32f, size * 0.11f, dot)
        return bmp
    }
}
