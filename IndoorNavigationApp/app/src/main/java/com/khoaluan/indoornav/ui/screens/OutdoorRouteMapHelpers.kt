package com.khoaluan.indoornav.ui.screens

import android.graphics.Color as AndroidColor
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import com.khoaluan.indoornav.data.api.OutdoorRouteResponse
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline

internal const val OUTDOOR_ROUTE_ID = "outdoor_route"
internal const val OUTDOOR_DEST_ID = "outdoor_dest"

internal fun clearOutdoorRouteOverlays(map: MapView) {
    val remove = map.overlays.filter { o ->
        (o is Polyline && o.id == OUTDOOR_ROUTE_ID) ||
            (o is Marker && (o.id == OUTDOOR_DEST_ID || o.id == OUTDOOR_ROUTE_ID))
    }
    map.overlays.removeAll(remove)
    map.invalidate()
}

internal fun drawOutdoorRouteOnMap(
    context: Context,
    map: MapView,
    route: OutdoorRouteResponse,
    fitBounds: Boolean = true,
) {
    clearOutdoorRouteOverlays(map)
    val pts = route.polyline.mapNotNull { p ->
        if (p.lat == 0.0 && p.lng == 0.0) null else GeoPoint(p.lat, p.lng)
    }
    if (pts.size < 2) return

    val line = Polyline().apply {
        id = OUTDOOR_ROUTE_ID
        setPoints(pts)
        outlinePaint.color = AndroidColor.parseColor("#1A73E8")
        outlinePaint.strokeWidth = 14f
        outlinePaint.strokeCap = Paint.Cap.ROUND
        outlinePaint.strokeJoin = Paint.Join.ROUND
        outlinePaint.isAntiAlias = true
    }
    map.overlays.add(0, line)

    val dest = route.to ?: route.polyline.lastOrNull()?.let {
        com.khoaluan.indoornav.data.api.OutdoorLatLng(it.lat, it.lng)
    }
    if (dest != null) {
        val marker = Marker(map).apply {
            id = OUTDOOR_DEST_ID
            position = GeoPoint(dest.lat, dest.lng)
            title = "Đích"
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            icon = BitmapDrawable(context.resources, createDestPinBitmap())
            setInfoWindow(null)
        }
        map.overlays.add(marker)
    }

    if (fitBounds) {
        map.zoomToBoundingBox(BoundingBox.fromGeoPoints(pts), true, 120)
    }
    map.invalidate()
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
