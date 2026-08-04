package com.khoaluan.indoornav.ui.screens

import android.Manifest
import android.content.ComponentCallbacks2
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.zIndex
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.khoaluan.indoornav.data.api.GeocodeHitDto
import com.khoaluan.indoornav.data.api.OutdoorRouteResponse
import com.khoaluan.indoornav.data.api.OverpassHitDto
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.data.model.GPSLocation
import android.widget.Toast
import androidx.compose.runtime.rememberCoroutineScope
import com.khoaluan.indoornav.navigation.outdoor.OutdoorTurnByTurn
import com.khoaluan.indoornav.navigation.voice.NavigationTtsController
import com.khoaluan.indoornav.ui.i18n.trStatic
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.khoaluan.indoornav.ui.components.AccountAvatar
import com.khoaluan.indoornav.ui.components.PlacePreviewSheet
import com.khoaluan.indoornav.ui.components.ProposeEditSheet
import com.khoaluan.indoornav.ui.components.SearchResultPanel
import com.khoaluan.indoornav.ui.i18n.LocalAppLocale
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.search.BuildingSearchText
import com.khoaluan.indoornav.ui.viewmodel.BuildingListUiState
import com.khoaluan.indoornav.ui.viewmodel.MapViewModel
import com.khoaluan.indoornav.ui.viewmodel.PlaceListUiState
import kotlinx.coroutines.delay
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapLibreMapOptions
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style

private fun ContextHasLocationPermission(context: android.content.Context): Boolean {
    val fine = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_FINE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    val coarse = ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    return fine || coarse
}

/**
 * Màn Địa điểm — MapLibre (vector, OpenFreeMap Liberty) + con trỏ GPS (chấm xanh) kiểu Google Maps.
 */
@Composable
fun BuildingListScreen(
    viewModel: MapViewModel,
    onBuildingClick: (String) -> Unit,
    onTestPDR: () -> Unit = {},
    isLoggedIn: Boolean = false,
    accountLabel: String? = null,
    /** URL ảnh Google — hiện trên thanh tìm kiếm kiểu Maps. */
    avatarUrl: String? = null,
    onLoginClick: () -> Unit = {},
    onLogoutClick: () -> Unit = {},
    onOpenProfile: () -> Unit = {},
    pendingPlaceSlug: String? = null,
    pendingFloor: Int? = null,
    onPendingPlaceConsumed: () -> Unit = {},
    onDeepLinkEnterIndoor: (buildingId: String, floor: Int?) -> Unit = { _, _ -> },
    /** GĐ4 — vào indoor với tầng + focus POI */
    onIndoorSearchEnter: (buildingId: String, floor: Int, poiId: Int?, totalFloors: Int) -> Unit =
        { id, _, _, _ -> onBuildingClick(id) },
    /**
     * false khi bị che bởi indoor / PDR / User Hub — pause MapLibre GL nhưng
     * không destroy View (tránh màn trắng khi quay lại).
     */
    mapSurfaceActive: Boolean = true,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val state by viewModel.buildingListState.collectAsState()
    val favoriteIds by viewModel.favoritePlaceIds.collectAsState()
    val followingIds by viewModel.followingPlaceIds.collectAsState()
    val placeNotice by viewModel.placeNotice.collectAsState()
    val placeListState by viewModel.placeListState.collectAsState()
    val explorer by viewModel.buildingExplorer.collectAsState()
    val explorerLoading by viewModel.buildingExplorerLoading.collectAsState()
    val placeReviews by viewModel.placeReviews.collectAsState()
    val placeReviewsLoading by viewModel.placeReviewsLoading.collectAsState()
    val indoorHits by viewModel.indoorSearchHits.collectAsState()
    val indoorSearchLoading by viewModel.indoorSearchLoading.collectAsState()
    val osmHits by viewModel.geocodeHits.collectAsState()
    val osmLoading by viewModel.geocodeLoading.collectAsState()
    val overpassHits by viewModel.overpassHits.collectAsState()
    val overpassLoading by viewModel.overpassLoading.collectAsState()
    var query by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<Building?>(null) }
    var showPlaceDetail by remember { mutableStateOf(false) }
    var showAllReviews by remember { mutableStateOf(false) }
    var showSearchResults by remember { mutableStateOf(false) }
    var showReviewDialog by remember { mutableStateOf(false) }
    var reviewInitialRating by remember { mutableStateOf(5) }
    var showReportDialog by remember { mutableStateOf(false) }
    var showProposeDialog by remember { mutableStateOf(false) }
    var mapView by remember { mutableStateOf<MapView?>(null) }
    var maplibreMap by remember { mutableStateOf<MapLibreMap?>(null) }
    var mapStyle by remember { mutableStateOf<Style?>(null) }
    var userPoint by remember { mutableStateOf<LatLng?>(null) }
    var userAccuracyM by remember { mutableStateOf(0f) }
    var didCenterOnUser by remember { mutableStateOf(false) }
    var didFitBuildings by remember { mutableStateOf(false) }
    var hasLocationPermission by remember {
        mutableStateOf(ContextHasLocationPermission(context))
    }
    val scope = rememberCoroutineScope()
    var outdoorRoute by remember { mutableStateOf<OutdoorRouteResponse?>(null) }
    var outdoorDestBuilding by remember { mutableStateOf<Building?>(null) }
    var outdoorNavigating by remember { mutableStateOf(false) }
    var outdoorRoutePreviewing by remember { mutableStateOf(false) }
    var outdoorLoading by remember { mutableStateOf(false) }
    var outdoorInstruction by remember { mutableStateOf<String?>(null) }
    var outdoorRemainingM by remember { mutableStateOf(0f) }
    var outdoorDistanceToNextM by remember { mutableStateOf(0f) }
    var outdoorManeuver by remember { mutableStateOf<String?>(null) }
    var outdoorEtaS by remember { mutableStateOf(0) }
    var outdoorArrived by remember { mutableStateOf(false) }
    var outdoorApproachingIndoor by remember { mutableStateOf(false) }
    var showHandoffDialog by remember { mutableStateOf(false) }
    var handoffPrompted by remember { mutableStateOf(false) }
    var outdoorFollowCamera by remember { mutableStateOf(true) }
    /** Hướng đi (độ, 0=Bắc). */
    var outdoorHeadingDeg by remember { mutableStateOf<Float?>(null) }
    /** Tốc độ GPS gần nhất (m/s) — chọn GPS bearing vs la bàn. */
    var outdoorSpeedMps by remember { mutableStateOf(0f) }
    val outdoorTts = remember { NavigationTtsController(context) }

    fun smoothHeading(rawIn: Float, prev: Float?): Float {
        val raw = ((rawIn % 360f) + 360f) % 360f
        if (prev == null) return raw
        val delta = ((raw - prev + 540f) % 360f) - 180f
        return ((prev + delta * 0.35f) % 360f + 360f) % 360f
    }

    /** Google: đang nav + follow → heading-up; còn lại → north-up. */
    fun headingUpActive(): Boolean = outdoorNavigating && outdoorFollowCamera

    fun animateFollowTo(point: LatLng, zoom: Double? = null) {
        val map = maplibreMap ?: return
        val builder = CameraPosition.Builder(map.cameraPosition).target(point)
        if (zoom != null) builder.zoom(zoom)
        map.easeCamera(CameraUpdateFactory.newCameraPosition(builder.build()), 450)
    }
    DisposableEffect(Unit) {
        onDispose { outdoorTts.shutdown() }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        hasLocationPermission =
            (result[Manifest.permission.ACCESS_FINE_LOCATION] == true) ||
                (result[Manifest.permission.ACCESS_COARSE_LOCATION] == true)
        if (hasLocationPermission) {
            viewModel.fetchBuildings(enableGeofence = true)
        }
    }

    fun requestLocationPermission() {
        permissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ),
        )
    }

    fun openAppSettings() {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", context.packageName, null),
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    // Quay lại app từ Settings → refresh quyền
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                hasLocationPermission = ContextHasLocationPermission(context)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val buildings = (state as? BuildingListUiState.Success)?.buildings.orEmpty()
    val filtered = remember(buildings, query, category) {
        val q = query.trim()
        val cat = category.trim()
        val base = buildings.filter { b ->
            PlaceCategoryLabels.matchesFilter(
                filterKey = cat,
                category = b.category,
                name = b.name,
                address = b.address,
            )
        }
        if (q.isEmpty()) base
        else BuildingSearchText.filterRanked(query = q, items = base, limit = 40)
    }
    val searchLoading = placeListState is PlaceListUiState.Loading
    // Đọc giá trị mới nhất bên trong OnMapClickListener (được gắn 1 lần trong factory).
    val filteredState = rememberUpdatedState(filtered)

    fun enterIndoor(building: Building) {
        val pid = building.placeId
        when {
            building.id.startsWith("place:") && !pid.isNullOrBlank() ->
                viewModel.resolveIndoorBuildingFromPlace(pid, onBuildingClick)
            else -> onBuildingClick(building.id)
        }
    }

    fun sharePlace(building: Building) {
        val slugOrId = building.placeSlug?.takeIf { it.isNotBlank() }
            ?: building.placeId
            ?: building.id
        val link = "https://indoor-navigation-app-sqiu.onrender.com/outdoor/place/$slugOrId"
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, building.name)
            putExtra(Intent.EXTRA_TEXT, "${building.name}\n$link")
        }
        context.startActivity(Intent.createChooser(send, "Chia sẻ địa điểm"))
    }

    fun openGoogleMapsFallback(building: Building) {
        val gps = building.gpsLocation ?: return
        val uri = Uri.parse(
            "https://www.google.com/maps/dir/?api=1&destination=${gps.lat},${gps.lng}",
        )
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    }

    fun stopOutdoorNav() {
        outdoorNavigating = false
        outdoorRoutePreviewing = false
        outdoorRoute = null
        outdoorDestBuilding = null
        outdoorInstruction = null
        outdoorDistanceToNextM = 0f
        outdoorManeuver = null
        outdoorArrived = false
        outdoorApproachingIndoor = false
        showHandoffDialog = false
        handoffPrompted = false
        outdoorLoading = false
        outdoorFollowCamera = true
        outdoorHeadingDeg = null
        outdoorSpeedMps = 0f
        outdoorTts.resetLastSpoken()
        outdoorTts.setEnabled(false)
        mapStyle?.let { style ->
            OutdoorRouteMapHelpers.clearRoute(style)
        }
        maplibreMap?.let { map ->
            map.easeCamera(
                CameraUpdateFactory.newCameraPosition(
                    CameraPosition.Builder(map.cameraPosition).bearing(0.0).build(),
                ),
                300,
            )
        }
    }

    fun startOutdoorNavigation() {
        val route = outdoorRoute ?: return
        val dest = outdoorDestBuilding ?: return
        val origin = userPoint ?: return
        outdoorRoutePreviewing = false
        outdoorNavigating = true
        outdoorArrived = false
        outdoorApproachingIndoor = false
        handoffPrompted = false
        showHandoffDialog = false
        outdoorFollowCamera = true
        selected = null
        val arriveTh = OutdoorTurnByTurn.arriveThresholdMeters(dest.activationRadius)
        val g0 = OutdoorTurnByTurn.guidance(
            route,
            origin.latitude,
            origin.longitude,
            arriveThresholdM = arriveTh,
        )
        outdoorInstruction = g0.instruction
        outdoorRemainingM = g0.remainingM
        outdoorDistanceToNextM = g0.distanceToNextM
        outdoorManeuver = g0.maneuver
        outdoorEtaS = g0.etaSeconds
        outdoorTts.setEnabled(true)
        outdoorTts.resetLastSpoken()
        outdoorTts.speakTurnByTurn(
            instruction = g0.instruction,
            distanceM = g0.distanceToNextM,
            segmentId = "step-${g0.stepIndex}",
            scale = NavigationTtsController.Scale.OUTDOOR,
        )
        animateFollowTo(LatLng(origin.latitude, origin.longitude), zoom = 17.0)
    }

    /** Điểm OSM/Nominatim → Building giả để tái dùng OSRM + OutdoorNavPanel (không Indoor). */
    fun buildingFromOsmHit(hit: GeocodeHitDto): Building =
        Building(
            id = "osm:${hit.id}",
            name = hit.name,
            address = hit.displayName,
            gpsLocation = GPSLocation(lat = hit.lat, lng = hit.lng),
            hasPublishedIndoor = false,
        )

    fun buildingFromOverpassHit(hit: OverpassHitDto): Building =
        Building(
            id = hit.id,
            name = hit.name,
            address = hit.displayName,
            gpsLocation = GPSLocation(lat = hit.lat, lng = hit.lng),
            hasPublishedIndoor = false,
        )

    fun openDirections(building: Building, autoStart: Boolean = false) {
        val gps = building.gpsLocation ?: return
        val origin = userPoint
        if (origin == null) {
            Toast.makeText(
                context,
                trStatic(
                    "Cần GPS để chỉ đường trong app. Đang mở Google Maps…",
                    "GPS needed. Opening Google Maps…",
                ),
                Toast.LENGTH_SHORT,
            ).show()
            openGoogleMapsFallback(building)
            return
        }
        if (!hasLocationPermission) {
            requestLocationPermission()
            openGoogleMapsFallback(building)
            return
        }

        outdoorLoading = true
        outdoorDestBuilding = building
        showPlaceDetail = false
        outdoorNavigating = false
        outdoorRoutePreviewing = false
        scope.launch {
            try {
                val res = withContext(Dispatchers.IO) {
                    RetrofitClient.getApiService().getOutdoorRoute(
                        fromLat = origin.latitude,
                        fromLng = origin.longitude,
                        toLat = gps.lat,
                        toLng = gps.lng,
                        profile = "foot",
                    )
                }
                val body = res.body()
                if (!res.isSuccessful || body == null || body.polyline.size < 2) {
                    Toast.makeText(
                        context,
                        body?.message
                            ?: trStatic(
                                "Không lấy được đường. Mở Google Maps…",
                                "Route failed. Opening Google Maps…",
                            ),
                        Toast.LENGTH_SHORT,
                    ).show()
                    stopOutdoorNav()
                    openGoogleMapsFallback(building)
                    return@launch
                }
                outdoorRoute = body
                outdoorRemainingM = body.distanceM
                outdoorEtaS = body.durationS
                outdoorArrived = false
                outdoorApproachingIndoor = false
                handoffPrompted = false
                showHandoffDialog = false
                selected = null
                mapStyle?.let { style ->
                    val bounds = OutdoorRouteMapHelpers.drawRoute(style, body)
                    val map = maplibreMap
                    if (bounds != null && map != null) {
                        map.easeCamera(CameraUpdateFactory.newLatLngBounds(bounds, 120), 500)
                    }
                }
                if (autoStart) {
                    startOutdoorNavigation()
                } else {
                    outdoorRoutePreviewing = true
                    outdoorNavigating = false
                    outdoorFollowCamera = false
                }
            } catch (_: Exception) {
                Toast.makeText(
                    context,
                    trStatic("Lỗi mạng. Mở Google Maps…", "Network error. Opening Google Maps…"),
                    Toast.LENGTH_SHORT,
                ).show()
                stopOutdoorNav()
                openGoogleMapsFallback(building)
            } finally {
                outdoorLoading = false
            }
        }
    }

    LaunchedEffect(query, category) {
        kotlinx.coroutines.delay(350)
        viewModel.fetchPlaces(
            query = query.trim().ifEmpty { null },
            category = category.trim().ifEmpty { null },
        )
        val q = query.trim()
        if (q.length >= 2) {
            viewModel.searchIndoorPois(q)
            viewModel.fetchGeocode(
                query = q,
                lat = userPoint?.latitude,
                lng = userPoint?.longitude,
            )
        } else {
            viewModel.clearIndoorSearch()
            viewModel.clearGeocode()
        }
    }

    LaunchedEffect(showSearchResults, userPoint?.latitude, userPoint?.longitude) {
        if (!showSearchResults) return@LaunchedEffect
        val p = userPoint ?: return@LaunchedEffect
        kotlinx.coroutines.delay(400)
        viewModel.fetchOverpassNearby(p.latitude, p.longitude, radiusM = 250)
    }

    LaunchedEffect(selected?.id) {
        val id = selected?.id
        if (id.isNullOrBlank() || id.startsWith("place:")) {
            viewModel.clearBuildingExplorer()
        } else {
            viewModel.fetchBuildingExplorer(id)
        }
    }

    LaunchedEffect(isLoggedIn) {
        if (isLoggedIn) viewModel.refreshFollowingPlaces()
    }

    LaunchedEffect(pendingPlaceSlug, pendingFloor) {
        val slug = pendingPlaceSlug?.trim().orEmpty()
        if (slug.isEmpty()) return@LaunchedEffect
        val floorHint = pendingFloor
        viewModel.openPlaceDeepLink(slug) { b ->
            selected = b
            val g = b.gpsLocation
            if (g != null && maplibreMap != null) {
                animateFollowTo(LatLng(g.lat, g.lng), zoom = 17.0)
            }
            if (floorHint != null && b.hasPublishedIndoor == true && !b.id.startsWith("place:")) {
                onDeepLinkEnterIndoor(b.id, floorHint)
            }
        }
        onPendingPlaceConsumed()
    }

    LaunchedEffect(selected?.placeId, selected?.placeSlug) {
        val key = selected?.placeSlug?.takeIf { it.isNotBlank() }
            ?: selected?.placeId?.takeIf { it.isNotBlank() }
            ?: return@LaunchedEffect
        viewModel.recordPlaceView(key)
    }

    LaunchedEffect(Unit) {
        // Chưa có quyền → xin ngay khi vào map
        if (!hasLocationPermission) {
            requestLocationPermission()
        }
    }

    // Lắng nghe GPS → cập nhật con trỏ
    DisposableEffect(
        hasLocationPermission,
        state is BuildingListUiState.Success,
        outdoorNavigating,
        outdoorRoute?.distanceM,
    ) {
        if (!hasLocationPermission || state !is BuildingListUiState.Success) {
            return@DisposableEffect onDispose { }
        }
        val lm = context.getSystemService(LocationManager::class.java)
            ?: return@DisposableEffect onDispose { }

        fun applyFix(loc: Location) {
            userPoint = LatLng(loc.latitude, loc.longitude)
            userAccuracyM = loc.accuracy.coerceAtLeast(8f)
            if (loc.hasSpeed()) outdoorSpeedMps = loc.speed

            // GPS bearing tin cậy khi đang di chuyển nhanh (xe / chạy); đi bộ chậm dùng la bàn
            val speedOk = loc.hasSpeed() && loc.speed >= 1.2f // ~4.3 km/h
            val bearingOk = loc.hasBearing()
            if (bearingOk && (speedOk || outdoorHeadingDeg == null)) {
                outdoorHeadingDeg = smoothHeading(loc.bearing, outdoorHeadingDeg)
            }

            val route = outdoorRoute
            if (outdoorNavigating && route != null) {
                val dest = outdoorDestBuilding
                val canHandoff = dest?.hasPublishedIndoor == true
                val arriveTh = OutdoorTurnByTurn.arriveThresholdMeters(dest?.activationRadius)
                val approachTh = OutdoorTurnByTurn.approachThresholdMeters(dest?.activationRadius)
                val g = OutdoorTurnByTurn.guidance(
                    route,
                    loc.latitude,
                    loc.longitude,
                    arriveThresholdM = arriveTh,
                )
                outdoorInstruction = g.instruction
                outdoorRemainingM = g.remainingM
                outdoorDistanceToNextM = g.distanceToNextM
                outdoorManeuver = g.maneuver
                outdoorEtaS = g.etaSeconds
                outdoorApproachingIndoor =
                    canHandoff && !g.arrived && g.remainingM <= approachTh
                if (g.arrived && !outdoorArrived) {
                    outdoorArrived = true
                    outdoorTts.resetLastSpoken()
                    outdoorTts.speakInstruction("Đã đến nơi")
                    if (canHandoff && !handoffPrompted) {
                        handoffPrompted = true
                        showHandoffDialog = true
                    }
                } else if (!g.arrived) {
                    outdoorTts.speakTurnByTurn(
                        instruction = g.instruction,
                        distanceM = g.distanceToNextM,
                        segmentId = "step-${g.stepIndex}",
                        scale = NavigationTtsController.Scale.OUTDOOR,
                    )
                }
                if (outdoorFollowCamera) {
                    // Google nav: heading-up + camera follow
                    animateFollowTo(LatLng(loc.latitude, loc.longitude))
                }
            }
        }

        @Suppress("DEPRECATION")
        val last = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
        if (last != null) applyFix(last)

        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) = applyFix(location)
            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) = Unit
        }

        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    if (outdoorNavigating) 800L else 1500L,
                    if (outdoorNavigating) 2f else 3f,
                    listener,
                    Looper.getMainLooper(),
                )
            }
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    2000L,
                    8f,
                    listener,
                    Looper.getMainLooper(),
                )
            }
        } catch (_: SecurityException) {
        }

        onDispose {
            try {
                lm.removeUpdates(listener)
            } catch (_: Exception) {
            }
        }
    }

    // La bàn khi đứng / đi bộ chậm (GPS bearing ưu tiên khi đi nhanh)
    DisposableEffect(hasLocationPermission) {
        if (!hasLocationPermission) {
            return@DisposableEffect onDispose { }
        }
        val sm = context.getSystemService(SensorManager::class.java)
            ?: return@DisposableEffect onDispose { }
        val sensor = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
            ?: sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
            ?: return@DisposableEffect onDispose { }
        val rotMat = FloatArray(9)
        val orient = FloatArray(3)
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                if (outdoorSpeedMps >= 1.2f) return
                SensorManager.getRotationMatrixFromVector(rotMat, event.values)
                SensorManager.getOrientation(rotMat, orient)
                // Android azimuth Đông=-90°; bearing map Đông=90° → đảo dấu
                val azimuthDeg = -Math.toDegrees(orient[0].toDouble()).toFloat()
                outdoorHeadingDeg = smoothHeading(azimuthDeg, outdoorHeadingDeg)
            }
            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }
        sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_UI)
        onDispose {
            sm.unregisterListener(listener)
        }
    }

    // Heading-up: xoay camera ngay khi hướng đổi (khi đang follow nav); bearing map-aligned
    // của icon người dùng (OutdoorMapLayers) tự bù trừ nên chỉ cần xoay camera ở đây.
    LaunchedEffect(outdoorHeadingDeg, outdoorNavigating, outdoorFollowCamera, maplibreMap) {
        val map = maplibreMap ?: return@LaunchedEffect
        if (headingUpActive()) {
            outdoorHeadingDeg?.let { heading ->
                map.easeCamera(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.Builder(map.cameraPosition).bearing(heading.toDouble()).build(),
                    ),
                    250,
                )
            }
        } else if (!outdoorNavigating) {
            // Duyệt map / hết nav → north-up
            if (map.cameraPosition.bearing != 0.0) {
                map.easeCamera(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.Builder(map.cameraPosition).bearing(0.0).build(),
                    ),
                    250,
                )
            }
        }
    }

    // Lifecycle MapView — pause khi mapSurfaceActive=false; không destroy khi chỉ bị overlay che.
    DisposableEffect(lifecycleOwner, mapView, mapSurfaceActive) {
        val mv = mapView
        if (mv == null) {
            onDispose { }
        } else {
            fun reviveMapGl(reason: String) {
                if (!mapSurfaceActive) return
                try {
                    val life = lifecycleOwner.lifecycle.currentState
                    if (life.isAtLeast(Lifecycle.State.STARTED)) mv.onStart()
                    if (life.isAtLeast(Lifecycle.State.RESUMED)) mv.onResume()
                    val map = maplibreMap
                    if (map != null && mv.width > 0 && mv.height > 0) {
                        map.triggerRepaint()
                        val cam = map.cameraPosition
                        map.moveCamera(
                            CameraUpdateFactory.newCameraPosition(
                                CameraPosition.Builder(cam).build(),
                            ),
                        )
                    }
                    android.util.Log.d("OutdoorMap", "reviveMapGl ($reason)")
                } catch (e: Exception) {
                    android.util.Log.w("OutdoorMap", "reviveMapGl: ${e.message}")
                }
            }
            val observer = LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_START -> {
                        if (mapSurfaceActive) mv.onStart()
                    }
                    Lifecycle.Event.ON_RESUME -> {
                        if (mapSurfaceActive) {
                            mv.onResume()
                            mv.post { reviveMapGl("lifecycle_resume") }
                            mv.postDelayed({ reviveMapGl("lifecycle_resume_delay") }, 200)
                        }
                    }
                    Lifecycle.Event.ON_PAUSE -> mv.onPause()
                    Lifecycle.Event.ON_STOP -> mv.onStop()
                    else -> Unit
                }
            }
            lifecycleOwner.lifecycle.addObserver(observer)
            if (mapSurfaceActive) {
                val life = lifecycleOwner.lifecycle.currentState
                if (life.isAtLeast(Lifecycle.State.STARTED)) mv.onStart()
                if (life.isAtLeast(Lifecycle.State.RESUMED)) mv.onResume()
                mv.post { reviveMapGl("attach") }
                mv.postDelayed({ reviveMapGl("attach_delay") }, 250)
            } else {
                try {
                    mv.onPause()
                    mv.onStop()
                } catch (_: Exception) {
                }
            }
            val componentCallbacks = object : ComponentCallbacks2 {
                override fun onLowMemory() {
                    mv.onLowMemory()
                }
                override fun onTrimMemory(level: Int) = Unit
                override fun onConfigurationChanged(newConfig: android.content.res.Configuration) = Unit
            }
            context.applicationContext.registerComponentCallbacks(componentCallbacks)
            onDispose {
                lifecycleOwner.lifecycle.removeObserver(observer)
                context.applicationContext.unregisterComponentCallbacks(componentCallbacks)
            }
        }
    }

    DisposableEffect(mapView) {
        val mv = mapView
        onDispose {
            if (mv == null) return@onDispose
            try {
                mv.onPause()
                mv.onStop()
            } catch (_: Exception) {
            }
            try {
                mv.onDestroy()
            } catch (_: Exception) {
            }
            if (mapView === mv) {
                mapView = null
                maplibreMap = null
                mapStyle = null
            }
        }
    }

    LaunchedEffect(mapSurfaceActive, mapView) {
        val mv = mapView ?: return@LaunchedEffect
        if (mapSurfaceActive) {
            try {
                val life = lifecycleOwner.lifecycle.currentState
                if (life.isAtLeast(Lifecycle.State.STARTED)) mv.onStart()
                if (life.isAtLeast(Lifecycle.State.RESUMED)) mv.onResume()
                maplibreMap?.triggerRepaint()
                kotlinx.coroutines.delay(120)
                maplibreMap?.triggerRepaint()
                kotlinx.coroutines.delay(350)
                maplibreMap?.let { map ->
                    map.triggerRepaint()
                    val cam = map.cameraPosition
                    map.moveCamera(
                        CameraUpdateFactory.newCameraPosition(CameraPosition.Builder(cam).build()),
                    )
                }
            } catch (e: Exception) {
                android.util.Log.w("OutdoorMap", "resume after overlay: ${e.message}")
            }
        } else {
            try {
                mv.onPause()
                mv.onStop()
            } catch (_: Exception) {
            }
        }
    }

    // Sau overlay đầy màn (chi tiết địa điểm / route preview) — ép MapLibre vẽ lại
    LaunchedEffect(showPlaceDetail, outdoorRoutePreviewing, outdoorNavigating, outdoorLoading, mapSurfaceActive) {
        if (!mapSurfaceActive) return@LaunchedEffect
        kotlinx.coroutines.delay(80)
        val mv = mapView ?: return@LaunchedEffect
        try {
            if (lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                mv.onResume()
                maplibreMap?.triggerRepaint()
            }
        } catch (_: Exception) {
        }
    }

    LaunchedEffect(
        userPoint,
        userAccuracyM,
        mapStyle,
        outdoorNavigating,
        outdoorHeadingDeg,
    ) {
        val style = mapStyle ?: return@LaunchedEffect
        val point = userPoint ?: return@LaunchedEffect

        OutdoorMapLayers.updateUserAccuracy(style, point, userAccuracyM.toDouble())
        OutdoorMapLayers.updateUserLocation(
            style = style,
            point = point,
            headingDeg = outdoorHeadingDeg,
            showArrow = outdoorNavigating || outdoorHeadingDeg != null,
        )

        if (!didCenterOnUser) {
            didCenterOnUser = true
            animateFollowTo(point, zoom = 16.5)
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        when (state) {
            is BuildingListUiState.Loading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = Color(0xFF1A73E8))
                }
            }
            is BuildingListUiState.Error -> {
                val msg = (state as BuildingListUiState.Error).message
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = "Lỗi kết nối: $msg", color = Color(0xFFD93025))
                }
            }
            is BuildingListUiState.Success -> {
                AndroidView(
                    modifier = Modifier
                        .fillMaxSize()
                        .onSizeChanged { size ->
                            // Compose đổi size (mở search, dialog…) → ép MapLibre vẽ lại
                            if (mapSurfaceActive && size.width > 0 && size.height > 0) {
                                mapView?.post {
                                    try {
                                        mapView?.onResume()
                                        maplibreMap?.triggerRepaint()
                                    } catch (_: Exception) {
                                    }
                                }
                            }
                        },
                    factory = { ctx ->
                        MapLibre.getInstance(ctx)
                        // textureMode: bắt buộc với Compose overlay — SurfaceView hay trắng
                        // đến khi UI khác gây relayout (vd. mở ô tìm kiếm).
                        val mapOptions = MapLibreMapOptions.createFromAttributes(ctx)
                            .textureMode(true)
                        MapView(ctx, mapOptions).apply {
                            onCreate(null)
                            onStart()
                            onResume()
                            mapView = this

                            fun kickRender(map: MapLibreMap) {
                                if (width <= 0 || height <= 0) return
                                try {
                                    onResume()
                                    map.triggerRepaint()
                                    // Nudge camera → native resize framebuffer sau layout đầu
                                    val cam = map.cameraPosition
                                    map.moveCamera(CameraUpdateFactory.zoomTo(cam.zoom))
                                } catch (e: Exception) {
                                    android.util.Log.w("OutdoorMap", "kickRender: ${e.message}")
                                }
                            }

                            addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
                                maplibreMap?.let { kickRender(it) }
                            }

                            getMapAsync { map ->
                                maplibreMap = map
                                map.uiSettings.isAttributionEnabled = true
                                map.cameraPosition = CameraPosition.Builder()
                                    .target(LatLng(10.762622, 106.660172))
                                    .zoom(14.0)
                                    .build()

                                fun onStyleReady(style: Style, usedFallback: Boolean) {
                                    try {
                                        OutdoorMapLayers.ensureLayers(style)
                                        OutdoorRouteMapHelpers.ensureLayers(style)
                                        if (!usedFallback) {
                                            OutdoorBasemapTiles.preferVietnameseLabels(style)
                                            VietnamSovereigntyMapLabels.ensureLabels(style)
                                        }
                                        OutdoorMapLayers.updatePlaces(style, filteredState.value)
                                        val cam = map.cameraPosition
                                        val target = cam.target
                                        if (target != null && !usedFallback) {
                                            OutdoorBasemapTiles.setBasemapSymbolsVisible(
                                                style,
                                                visible = !OutdoorBasemapTiles.isEastSeaCloseZoom(
                                                    target,
                                                    cam.zoom,
                                                ),
                                            )
                                        }
                                    } catch (e: Exception) {
                                        android.util.Log.e("OutdoorMap", "onStyleReady: ${e.message}", e)
                                    }
                                    mapStyle = style
                                    if (usedFallback) {
                                        Toast.makeText(
                                            ctx,
                                            trStatic(
                                                "Nền Liberty lỗi — dùng bản đồ raster",
                                                "Liberty failed — using raster basemap",
                                            ),
                                            Toast.LENGTH_SHORT,
                                        ).show()
                                    }
                                    post { kickRender(map) }
                                    postDelayed({ kickRender(map) }, 150)
                                    postDelayed({ kickRender(map) }, 600)
                                }

                                fun loadRasterFallback() {
                                    map.setStyle(
                                        Style.Builder().fromJson(OutdoorBasemapTiles.RASTER_FALLBACK_STYLE_JSON),
                                    ) { style -> onStyleReady(style, usedFallback = true) }
                                }

                                var libertyFailed = false
                                addOnDidFailLoadingMapListener { message ->
                                    android.util.Log.e("OutdoorMap", "Map load fail: $message")
                                    if (!libertyFailed) {
                                        libertyFailed = true
                                        loadRasterFallback()
                                    }
                                }

                                map.setStyle(Style.Builder().fromUri(OutdoorBasemapTiles.LIBERTY_STYLE_URL)) { style ->
                                    onStyleReady(style, usedFallback = false)
                                }

                                postDelayed({
                                    if (mapStyle == null && !libertyFailed) {
                                        libertyFailed = true
                                        android.util.Log.w("OutdoorMap", "Style timeout → raster fallback")
                                        loadRasterFallback()
                                    }
                                }, 8_000L)

                                map.addOnMapClickListener { latLng ->
                                    val screenPoint = map.projection.toScreenLocation(latLng)
                                    val features = map.queryRenderedFeatures(
                                        screenPoint,
                                        OutdoorMapLayers.PLACE_LAYER_ID,
                                    )
                                    val clickedId = features.firstOrNull()
                                        ?.getStringProperty(OutdoorMapLayers.PROP_BUILDING_ID)
                                    val building = clickedId?.let { id ->
                                        filteredState.value.firstOrNull { it.id == id }
                                    }
                                    if (building != null) {
                                        selected = building
                                        showSearchResults = false
                                    } else {
                                        selected = null
                                        showPlaceDetail = false
                                    }
                                    true
                                }

                                map.addOnCameraIdleListener {
                                    val style = map.style ?: return@addOnCameraIdleListener
                                    if (style.getLayer("carto-raster") != null) return@addOnCameraIdleListener
                                    val cam = map.cameraPosition
                                    val target = cam.target ?: return@addOnCameraIdleListener
                                    OutdoorBasemapTiles.setBasemapSymbolsVisible(
                                        style,
                                        visible = !OutdoorBasemapTiles.isEastSeaCloseZoom(
                                            target,
                                            cam.zoom,
                                        ),
                                    )
                                }

                                map.addOnCameraMoveStartedListener { reason ->
                                    if (reason == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE &&
                                        outdoorNavigating &&
                                        outdoorFollowCamera
                                    ) {
                                        outdoorFollowCamera = false
                                    }
                                }

                                post { kickRender(map) }
                            }
                        }
                    },
                    update = { view ->
                        if (mapSurfaceActive) {
                            try {
                                view.onResume()
                                maplibreMap?.triggerRepaint()
                            } catch (_: Exception) {
                            }
                        }
                        mapStyle?.let { style ->
                            OutdoorMapLayers.updatePlaces(style, filtered)
                        }
                    },
                )
            }
        }

        if (!hasLocationPermission && state is BuildingListUiState.Success) {
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(start = 16.dp, end = 72.dp, bottom = 16.dp)
                    .zIndex(20f),
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFFFFF3E0),
                shadowElevation = 6.dp,
            ) {
                Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                    Text(
                        text = tr(
                            "Cần quyền vị trí để hiện con trỏ GPS trên map.",
                            "Location permission is required to show your GPS marker.",
                        ),
                        color = Color(0xFFE65100),
                        fontSize = 13.sp,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Row {
                        Button(
                            onClick = { requestLocationPermission() },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1A73E8)),
                        ) {
                            Text(tr("Cấp quyền", "Allow"))
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        TextButton(onClick = { openAppSettings() }) {
                            Text(tr("Mở Cài đặt", "Open Settings"), color = Color(0xFFE65100))
                        }
                    }
                }
            }
        }

        if (!outdoorRoutePreviewing && !outdoorNavigating) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp)
                .align(Alignment.TopCenter),
        ) {
            Surface(
                shape = RoundedCornerShape(28.dp),
                color = Color.White,
                shadowElevation = 4.dp,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = {
                            query = it
                            showSearchResults = true
                        },
                        modifier = Modifier.weight(1f),
                        placeholder = {
                            Text(
                                text = tr(
                                    "Tìm tên, địa chỉ, GPS, danh mục…",
                                    "Search name, address, GPS, category…",
                                ),
                                color = Color(0xFF5F6368),
                            )
                        },
                        singleLine = true,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Rounded.Search,
                                contentDescription = null,
                                tint = Color(0xFF5F6368),
                            )
                        },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = {
                                    query = ""
                                    showSearchResults = true
                                    viewModel.clearGeocode()
                                    viewModel.clearIndoorSearch()
                                }) {
                                    Icon(
                                        imageVector = Icons.Rounded.Close,
                                        contentDescription = tr("Xóa", "Clear"),
                                    )
                                }
                            }
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Color.Transparent,
                            unfocusedBorderColor = Color.Transparent,
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                        ),
                    )
                    Box(
                        modifier = Modifier.padding(end = 6.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        AccountAvatar(
                            photoUrl = avatarUrl?.takeIf { it.isNotBlank() },
                            displayName = accountLabel,
                            loggedIn = isLoggedIn,
                            size = 32.dp,
                            contentDescription = if (isLoggedIn) {
                                tr("Tài khoản", "Account")
                            } else {
                                tr("Đăng nhập", "Sign in")
                            },
                            onClick = {
                                if (isLoggedIn) onOpenProfile()
                                else onLoginClick()
                            },
                        )
                    }
                    IconButton(onClick = onTestPDR) {
                        Icon(
                            imageVector = Icons.Rounded.Build,
                            contentDescription = tr("Thử PDR", "Try PDR"),
                            tint = Color(0xFF5F6368),
                        )
                    }
                }
            }
            if (!isLoggedIn) {
                Text(
                    text = tr(
                        "Khách · chạm avatar để đăng nhập",
                        "Guest · tap the avatar to sign in",
                    ),
                    fontSize = 11.sp,
                    color = Color(0xFF5F6368),
                    modifier = Modifier.padding(start = 16.dp, top = 6.dp),
                )
            }
            val locale = LocalAppLocale.current
            val categories = PlaceCategoryLabels.filterChips(locale)
            var categoryNotice by remember { mutableStateOf<String?>(null) }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                categories.forEach { (value, label) ->
                    FilterChip(
                        selected = category == value,
                        onClick = {
                            category = value
                            selected = null
                            showPlaceDetail = false
                            if (value.isEmpty()) {
                                showSearchResults = false
                                categoryNotice = null
                            } else {
                                showSearchResults = true
                                // Đếm sau recomposition — dùng buildings hiện tại + matcher mới
                                val n = buildings.count {
                                    PlaceCategoryLabels.matchesFilter(value, it.category, it.name, it.address)
                                }
                                categoryNotice = if (n == 0) {
                                    trStatic(
                                        "Không có “$label” gần đây trên bản đồ",
                                        "No “$label” found on the map nearby",
                                    )
                                } else {
                                    trStatic(
                                        "Có $n “$label” — chạm marker hoặc danh sách bên dưới",
                                        "$n “$label” — tap a marker or the list below",
                                    )
                                }
                                // Fit camera tới kết quả
                                val map = maplibreMap
                                if (map != null && n > 0) {
                                    val pts = buildings.mapNotNull { b ->
                                        if (!PlaceCategoryLabels.matchesFilter(value, b.category, b.name, b.address)) {
                                            return@mapNotNull null
                                        }
                                        val g = b.gpsLocation ?: return@mapNotNull null
                                        if (g.lat == 0.0 && g.lng == 0.0) null else LatLng(g.lat, g.lng)
                                    }
                                    if (pts.size == 1) {
                                        animateFollowTo(pts.first(), zoom = 16.0)
                                    } else if (pts.isNotEmpty()) {
                                        val bounds = LatLngBounds.Builder().apply {
                                            pts.forEach { include(it) }
                                        }.build()
                                        map.easeCamera(CameraUpdateFactory.newLatLngBounds(bounds, 120), 500)
                                    }
                                }
                            }
                        },
                        label = { Text(label, fontSize = 12.sp) },
                    )
                }
            }
            categoryNotice?.let { notice ->
                LaunchedEffect(notice) {
                    kotlinx.coroutines.delay(2800)
                    if (categoryNotice == notice) categoryNotice = null
                }
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 4.dp, vertical = 6.dp),
                    shape = RoundedCornerShape(10.dp),
                    color = Color(0xFFF1F3F4),
                ) {
                    Row(
                        modifier = Modifier.padding(start = 12.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = notice,
                            modifier = Modifier.weight(1f),
                            fontSize = 12.sp,
                            color = Color(0xFF3C4043),
                        )
                        TextButton(onClick = { categoryNotice = null }) {
                            Text("✕", color = Color(0xFF5F6368), fontSize = 12.sp)
                        }
                    }
                }
            }

            if (showSearchResults && selected == null && !showPlaceDetail &&
                !outdoorRoutePreviewing && !outdoorNavigating &&
                (query.isNotBlank() || category.isNotBlank() || overpassHits.isNotEmpty() || overpassLoading)
            ) {
                Spacer(modifier = Modifier.height(8.dp))
                SearchResultPanel(
                    query = query.trim(),
                    results = filtered,
                    loading = searchLoading,
                    indoorHits = indoorHits,
                    indoorLoading = indoorSearchLoading,
                    osmHits = osmHits,
                    osmLoading = osmLoading,
                    overpassHits = overpassHits,
                    overpassLoading = overpassLoading,
                    onSelect = { b ->
                        selected = b
                        showSearchResults = false
                        val g = b.gpsLocation
                        if (g != null && maplibreMap != null) {
                            animateFollowTo(LatLng(g.lat, g.lng), zoom = 17.0)
                        }
                    },
                    onSelectIndoor = { hit ->
                        showSearchResults = false
                        query = ""
                        viewModel.clearIndoorSearch()
                        onIndoorSearchEnter(
                            hit.buildingId,
                            hit.floorNumber,
                            hit.poiId,
                            hit.totalFloors.coerceAtLeast(1),
                        )
                    },
                    onSelectOsm = { hit ->
                        showSearchResults = false
                        query = ""
                        viewModel.clearGeocode()
                        selected = null
                        animateFollowTo(LatLng(hit.lat, hit.lng), zoom = 16.0)
                        openDirections(buildingFromOsmHit(hit))
                    },
                    onSelectOverpass = { hit ->
                        showSearchResults = false
                        query = ""
                        viewModel.clearOverpassNearby()
                        selected = null
                        animateFollowTo(LatLng(hit.lat, hit.lng), zoom = 16.0)
                        openDirections(buildingFromOverpassHit(hit))
                    },
                )
            }
        }
        }

        FloatingActionButton(
            onClick = {
                if (!hasLocationPermission) {
                    requestLocationPermission()
                    return@FloatingActionButton
                }
                if (maplibreMap == null) return@FloatingActionButton
                // Google: bấm vị trí của tôi → bật lại follow + heading-up (nếu đang nav)
                outdoorFollowCamera = true
                val point = userPoint
                if (point != null) {
                    animateFollowTo(point, zoom = 17.0)
                    return@FloatingActionButton
                }
                val lm = context.getSystemService(LocationManager::class.java) ?: return@FloatingActionButton
                @Suppress("DEPRECATION")
                val last = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                    ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                if (last != null) {
                    val gp = LatLng(last.latitude, last.longitude)
                    userPoint = gp
                    userAccuracyM = last.accuracy.coerceAtLeast(8f)
                    animateFollowTo(gp, zoom = 17.0)
                }
            },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = when {
                    outdoorNavigating -> 220.dp
                    outdoorRoutePreviewing -> 260.dp
                    selected != null -> 200.dp
                    else -> 100.dp
                }),
            containerColor = Color.White,
            contentColor = Color(0xFF1A73E8),
        ) {
            Icon(
                imageVector = Icons.Rounded.LocationOn,
                contentDescription = tr("Vị trí của tôi", "My location"),
            )
        }

        val chosen = selected
        LaunchedEffect(chosen?.id, chosen?.placeId) {
            val pid = chosen?.placeId
            if (!pid.isNullOrBlank()) {
                viewModel.refreshFavoriteState(pid)
                viewModel.fetchPlaceReviews(pid)
                viewModel.recordHistory(
                    type = "VIEW_PLACE",
                    placeId = pid,
                    buildingId = chosen?.id,
                    label = chosen?.name,
                )
            } else {
                viewModel.fetchPlaceReviews(null)
            }
        }

        if (outdoorLoading) {
            Box(
                modifier = Modifier
                    .align(Alignment.Center)
                    .zIndex(50f)
                    .background(Color(0xCCFFFFFF), RoundedCornerShape(12.dp))
                    .padding(20.dp),
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color(0xFF1A73E8))
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(tr("Đang tính đường…", "Calculating route…"))
                }
            }
        }

        if (outdoorRoutePreviewing && outdoorRoute != null && !outdoorNavigating) {
            OutdoorRouteEndpointsBar(
                destinationName = outdoorDestBuilding?.name ?: tr("Điểm đến", "Destination"),
                onClose = { stopOutdoorNav() },
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .zIndex(46f)
                    .padding(top = 8.dp),
            )
            OutdoorRoutePreviewPanel(
                destinationName = outdoorDestBuilding?.name ?: tr("Điểm đến", "Destination"),
                distanceM = outdoorRoute?.distanceM ?: outdoorRemainingM,
                durationS = outdoorRoute?.durationS ?: outdoorEtaS,
                onStart = { startOutdoorNavigation() },
                onShare = { outdoorDestBuilding?.let { sharePlace(it) } },
                onOpenGoogleMaps = { outdoorDestBuilding?.let { openGoogleMapsFallback(it) } },
                onClose = { stopOutdoorNav() },
                panelModifier = Modifier
                    .align(Alignment.BottomCenter)
                    .zIndex(45f),
            )
        }

        if (outdoorNavigating && outdoorRoute != null) {
            OutdoorNavPanel(
                buildingName = outdoorDestBuilding?.name ?: tr("Điểm đến", "Destination"),
                instruction = outdoorInstruction ?: tr("Đang điều hướng", "Navigating"),
                remainingM = outdoorRemainingM,
                etaSeconds = outdoorEtaS,
                arrived = outdoorArrived,
                canEnterIndoor = outdoorDestBuilding?.hasPublishedIndoor == true,
                approachingIndoor = outdoorApproachingIndoor,
                distanceToNextM = outdoorDistanceToNextM,
                maneuver = outdoorManeuver,
                onCancel = { stopOutdoorNav() },
                onOpenGoogleMaps = {
                    outdoorDestBuilding?.let { openGoogleMapsFallback(it) }
                },
                onEnterIndoor = {
                    val b = outdoorDestBuilding
                    stopOutdoorNav()
                    if (b != null) enterIndoor(b)
                },
                panelModifier = Modifier
                    .align(Alignment.BottomCenter)
                    .zIndex(45f),
            )
        }

        if (showHandoffDialog && outdoorDestBuilding?.hasPublishedIndoor == true) {
            val destName = outdoorDestBuilding?.name ?: tr("địa điểm", "place")
            AlertDialog(
                onDismissRequest = { showHandoffDialog = false },
                title = {
                    Text(tr("Đã tới lối vào", "Arrived at entrance"))
                },
                text = {
                    Text(
                        tr(
                            "Bạn đang gần \"$destName\". Chuyển sang bản đồ trong nhà?",
                            "You are near \"$destName\". Switch to the indoor map?",
                        ),
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            val b = outdoorDestBuilding
                            showHandoffDialog = false
                            stopOutdoorNav()
                            if (b != null) enterIndoor(b)
                        },
                    ) {
                        Text(tr("Vào trong nhà", "Enter indoor"))
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showHandoffDialog = false }) {
                        Text(tr("Tiếp tục ngoài trời", "Stay outdoors"))
                    }
                },
            )
        }

        if (chosen != null && !outdoorNavigating && !outdoorRoutePreviewing) {
            PlacePreviewSheet(
                building = chosen,
                explorer = explorer,
                isFavorite = chosen.placeId?.let { it in favoriteIds } == true,
                isFollowing = chosen.placeId?.let { it in followingIds } == true,
                notice = placeNotice,
                isLoggedIn = isLoggedIn,
                sheetExpanded = showPlaceDetail,
                onSheetExpandedChange = { showPlaceDetail = it },
                onDismiss = {
                    selected = null
                    showPlaceDetail = false
                    viewModel.clearBuildingExplorer()
                },
                onDirections = { openDirections(chosen, autoStart = false) },
                onStart = { openDirections(chosen, autoStart = true) },
                onToggleFavorite = {
                    val pid = chosen.placeId ?: return@PlacePreviewSheet
                    viewModel.toggleFavorite(pid, chosen.name)
                },
                onShare = { sharePlace(chosen) },
                onToggleFollow = {
                    val pid = chosen.placeId ?: return@PlacePreviewSheet
                    viewModel.toggleFollowPlace(pid)
                },
                onOpenDetail = { showPlaceDetail = true },
                onPropose = { showProposeDialog = true },
                onEnterIndoor = { enterIndoor(chosen) },
                onLoginRequired = onLoginClick,
                expandedContent = {
                    PlaceDetailScreen(
                        building = chosen,
                        explorer = explorer,
                        explorerLoading = explorerLoading,
                        reviews = placeReviews,
                        reviewsLoading = placeReviewsLoading,
                        isFavorite = chosen.placeId?.let { it in favoriteIds } == true,
                        isFollowing = chosen.placeId?.let { it in followingIds } == true,
                        isLoggedIn = isLoggedIn,
                        embeddedInSheet = true,
                        onBack = {
                            showAllReviews = false
                            showPlaceDetail = false
                        },
                        onDirections = { openDirections(chosen, autoStart = false) },
                        onToggleFavorite = {
                            val pid = chosen.placeId ?: return@PlaceDetailScreen
                            viewModel.toggleFavorite(pid, chosen.name)
                        },
                        onShare = { sharePlace(chosen) },
                        onToggleFollow = {
                            val pid = chosen.placeId ?: return@PlaceDetailScreen
                            viewModel.toggleFollowPlace(pid)
                        },
                        onReview = { stars ->
                            reviewInitialRating = stars.coerceIn(1, 5)
                            showReviewDialog = true
                        },
                        onReport = { showReportDialog = true },
                        onPropose = { showProposeDialog = true },
                        onSeeAllReviews = { showAllReviews = true },
                        onEnterIndoor = { enterIndoor(chosen) },
                        onLoginRequired = onLoginClick,
                    )
                },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .zIndex(40f),
            )
        }

        if (showAllReviews && chosen != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .zIndex(45f)
                    .background(Color.White),
            ) {
                PlaceReviewsScreen(
                    placeName = chosen.name,
                    ratingAvg = explorer?.ratingAvg,
                    ratingCount = explorer?.ratingCount ?: placeReviews.size,
                    reviews = placeReviews,
                    reviewsLoading = placeReviewsLoading,
                    isLoggedIn = isLoggedIn,
                    onBack = { showAllReviews = false },
                    onRate = { stars ->
                        reviewInitialRating = stars.coerceIn(1, 5)
                        showReviewDialog = true
                    },
                    onLoginRequired = onLoginClick,
                )
            }
        }

        if (showReviewDialog && selected?.placeId != null) {
            var rating by remember(showReviewDialog, reviewInitialRating) {
                mutableStateOf(reviewInitialRating.coerceIn(1, 5))
            }
            var comment by remember(showReviewDialog) { mutableStateOf("") }
            AlertDialog(
                onDismissRequest = { showReviewDialog = false },
                title = { Text(tr("Đánh giá địa điểm", "Rate this place")) },
                text = {
                    Column {
                        Text(
                            text = tr(
                                "Đã chọn $rating sao — có thể đổi bên dưới",
                                "Selected $rating stars — you can change below",
                            ),
                            color = Color(0xFF5F6368),
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            (1..5).forEach { n ->
                                Text(
                                    text = if (n <= rating) "★" else "☆",
                                    fontSize = 32.sp,
                                    color = Color(0xFFF9AB00),
                                    modifier = Modifier
                                        .clickable { rating = n }
                                        .padding(4.dp),
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = comment,
                            onValueChange = { comment = it },
                            label = { Text(tr("Nhận xét (tuỳ chọn)", "Comment (optional)")) },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 2,
                        )
                    }
                },
                confirmButton = {
                    TextButton(onClick = {
                        viewModel.submitPlaceReview(
                            selected!!.placeId!!,
                            rating,
                            comment.trim().ifBlank { null },
                        )
                        showReviewDialog = false
                    }) { Text(tr("Gửi", "Submit")) }
                },
                dismissButton = {
                    TextButton(onClick = { showReviewDialog = false }) { Text(tr("Hủy", "Cancel")) }
                },
            )
        }
        if (showReportDialog && selected?.placeId != null) {
            val reportReasons = listOf(
                "WRONG_LOCATION" to tr("Sai vị trí", "Wrong location"),
                "WRONG_FLOOR" to tr("Sai tầng", "Wrong floor"),
                "QR_INVALID" to tr("Mã QR lỗi", "Bad QR code"),
                "ROUTE_ERROR" to tr("Đường đi lỗi", "Route error"),
                "WRONG_NAME" to tr("Sai tên", "Wrong name"),
                "SPAM" to tr("Nội dung rác", "Spam"),
                "DUPLICATE" to tr("Trùng lặp", "Duplicate"),
                "CLOSED" to tr("Đã đóng cửa", "Closed"),
            )
            AlertDialog(
                onDismissRequest = { showReportDialog = false },
                title = { Text(tr("Báo cáo địa điểm", "Report place")) },
                text = { Text(tr("Chọn lý do báo cáo", "Choose a reason")) },
                confirmButton = {
                    Column {
                        reportReasons.forEach { (code, label) ->
                            TextButton(onClick = {
                                viewModel.submitPlaceReport(selected!!.placeId!!, code)
                                showReportDialog = false
                            }) { Text(label) }
                        }
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showReportDialog = false }) { Text(tr("Hủy", "Cancel")) }
                },
            )
        }
        if (showProposeDialog && selected?.placeId != null) {
            val place = selected!!
            ProposeEditSheet(
                placeName = place.name,
                onDismiss = { showProposeDialog = false },
                onSubmit = { type, title, description ->
                    val gps = place.gpsLocation
                    viewModel.submitMapContribution(
                        placeId = place.placeId,
                        buildingId = place.id.takeIf { it.isNotBlank() },
                        type = type,
                        title = title,
                        description = description,
                        mapScope = "OUTDOOR",
                        latitude = gps?.lat,
                        longitude = gps?.lng,
                    )
                    showProposeDialog = false
                },
            )
        }
    }

    LaunchedEffect(filtered, maplibreMap, userPoint) {
        if (didFitBuildings || didCenterOnUser || userPoint != null) return@LaunchedEffect
        val map = maplibreMap ?: return@LaunchedEffect
        val pts = filtered.mapNotNull { b ->
            val g = b.gpsLocation ?: return@mapNotNull null
            if (g.lat == 0.0 && g.lng == 0.0) null else LatLng(g.lat, g.lng)
        }
        if (pts.isEmpty()) return@LaunchedEffect
        didFitBuildings = true
        if (pts.size == 1) {
            animateFollowTo(pts.first(), zoom = 16.0)
        } else {
            val bounds = LatLngBounds.Builder().apply { pts.forEach { include(it) } }.build()
            map.easeCamera(CameraUpdateFactory.newLatLngBounds(bounds, 100), 500)
        }
    }
}

