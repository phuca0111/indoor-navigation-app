package com.khoaluan.indoornav.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
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
import androidx.compose.ui.zIndex
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.khoaluan.indoornav.data.model.Building
import com.khoaluan.indoornav.ui.components.PlacePreviewSheet
import com.khoaluan.indoornav.ui.components.SearchResultPanel
import com.khoaluan.indoornav.ui.i18n.LocalAppLocale
import com.khoaluan.indoornav.ui.i18n.PlaceCategoryLabels
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.search.SearchFuzzy
import com.khoaluan.indoornav.ui.viewmodel.BuildingListUiState
import com.khoaluan.indoornav.ui.viewmodel.MapViewModel
import com.khoaluan.indoornav.ui.viewmodel.PlaceListUiState
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.MapView as OsmMapView

private const val USER_MARKER_ID = "user_location"
private const val USER_ACCURACY_ID = "user_accuracy"

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
 * Màn Địa điểm — OSM map + con trỏ GPS (chấm xanh) kiểu Google Maps.
 */
@Composable
fun BuildingListScreen(
    viewModel: MapViewModel,
    onBuildingClick: (String) -> Unit,
    onTestPDR: () -> Unit = {},
    isLoggedIn: Boolean = false,
    accountLabel: String? = null,
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
    val indoorHits by viewModel.indoorSearchHits.collectAsState()
    val indoorSearchLoading by viewModel.indoorSearchLoading.collectAsState()
    var query by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<Building?>(null) }
    var showPlaceDetail by remember { mutableStateOf(false) }
    var showSearchResults by remember { mutableStateOf(false) }
    var showReviewDialog by remember { mutableStateOf(false) }
    var showReportDialog by remember { mutableStateOf(false) }
    var mapViewRef by remember { mutableStateOf<OsmMapView?>(null) }
    var userPoint by remember { mutableStateOf<GeoPoint?>(null) }
    var userAccuracyM by remember { mutableStateOf(0f) }
    var didCenterOnUser by remember { mutableStateOf(false) }
    var didFitBuildings by remember { mutableStateOf(false) }
    var hasLocationPermission by remember {
        mutableStateOf(ContextHasLocationPermission(context))
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
            val matchCat = cat.isEmpty() ||
                (b.category?.contains(cat, ignoreCase = true) == true)
            matchCat
        }
        if (q.isEmpty()) base
        else SearchFuzzy.filterRankedBy(
            query = q,
            items = base,
            nameOf = { listOfNotNull(it.name, it.address, it.category).joinToString(" ") },
            limit = 40,
        )
    }
    val searchLoading = placeListState is PlaceListUiState.Loading

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

    fun openDirections(building: Building) {
        val gps = building.gpsLocation ?: return
        val uri = Uri.parse(
            "https://www.google.com/maps/dir/?api=1&destination=${gps.lat},${gps.lng}",
        )
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    }

    LaunchedEffect(query, category) {
        kotlinx.coroutines.delay(350)
        viewModel.fetchPlaces(
            query = query.trim().ifEmpty { null },
            category = category.trim().ifEmpty { null },
        )
        val q = query.trim()
        if (q.length >= 2) viewModel.searchIndoorPois(q)
        else viewModel.clearIndoorSearch()
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
            if (g != null && mapViewRef != null) {
                mapViewRef?.controller?.animateTo(GeoPoint(g.lat, g.lng))
                mapViewRef?.controller?.setZoom(17.0)
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
        Configuration.getInstance().load(
            context,
            context.getSharedPreferences("osmdroid", 0),
        )
        Configuration.getInstance().userAgentValue = context.packageName
        // Chưa có quyền → xin ngay khi vào map
        if (!hasLocationPermission) {
            requestLocationPermission()
        }
    }

    // Lắng nghe GPS → cập nhật con trỏ
    DisposableEffect(hasLocationPermission, state is BuildingListUiState.Success) {
        if (!hasLocationPermission || state !is BuildingListUiState.Success) {
            return@DisposableEffect onDispose { }
        }
        val lm = context.getSystemService(LocationManager::class.java)
            ?: return@DisposableEffect onDispose { }

        fun applyFix(loc: Location) {
            userPoint = GeoPoint(loc.latitude, loc.longitude)
            userAccuracyM = loc.accuracy.coerceAtLeast(8f)
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
                    1500L,
                    3f,
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

    DisposableEffect(Unit) {
        onDispose {
            mapViewRef?.onPause()
            mapViewRef?.onDetach()
            mapViewRef = null
        }
    }

    LaunchedEffect(userPoint, userAccuracyM, mapViewRef) {
        val map = mapViewRef ?: return@LaunchedEffect
        val point = userPoint ?: return@LaunchedEffect

        val toRemove = map.overlays.filter { o ->
            (o is Marker && o.id == USER_MARKER_ID) ||
                (o is Polygon && o.id == USER_ACCURACY_ID)
        }
        map.overlays.removeAll(toRemove.toSet())

        val accuracy = Polygon(map).apply {
            id = USER_ACCURACY_ID
            points = Polygon.pointsAsCircle(point, userAccuracyM.toDouble())
            fillPaint.color = 0x332D8CFF.toInt()
            outlinePaint.color = 0x882D8CFF.toInt()
            outlinePaint.strokeWidth = 2f
        }
        map.overlays.add(0, accuracy)

        val userMarker = Marker(map).apply {
            id = USER_MARKER_ID
            position = point
            title = "Bạn đang ở đây"
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
            icon = BitmapDrawable(context.resources, createBlueDotBitmap())
            setInfoWindow(null)
        }
        map.overlays.add(userMarker)
        map.invalidate()

        if (!didCenterOnUser) {
            didCenterOnUser = true
            map.controller.animateTo(point)
            map.controller.setZoom(16.5)
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
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        OsmMapView(ctx).apply {
                            setTileSource(TileSourceFactory.MAPNIK)
                            setMultiTouchControls(true)
                            controller.setZoom(14.0)
                            controller.setCenter(GeoPoint(10.762622, 106.660172))
                            mapViewRef = this
                            onResume()

                            overlays.add(
                                MapEventsOverlay(object : MapEventsReceiver {
                                    override fun singleTapConfirmedHelper(p: GeoPoint?): Boolean {
                                        selected = null
                                        showPlaceDetail = false
                                        return true
                                    }
                                    override fun longPressHelper(p: GeoPoint?): Boolean = false
                                }),
                            )
                        }
                    },
                    update = { map ->
                        val keep = map.overlays.filter { o ->
                            o is MapEventsOverlay ||
                                (o is Marker && o.id == USER_MARKER_ID) ||
                                (o is Polygon && o.id == USER_ACCURACY_ID)
                        }
                        map.overlays.clear()
                        map.overlays.addAll(keep)

                        filtered.forEach { building ->
                            val gps = building.gpsLocation ?: return@forEach
                            if (gps.lat == 0.0 && gps.lng == 0.0) return@forEach
                            val marker = Marker(map)
                            marker.position = GeoPoint(gps.lat, gps.lng)
                            marker.title = building.name
                            marker.snippet = building.address
                            marker.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                            marker.relatedObject = building
                            marker.setOnMarkerClickListener { m, _ ->
                                selected = m.relatedObject as? Building
                                showSearchResults = false
                                true
                            }
                            map.overlays.add(marker)
                        }
                        map.invalidate()
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
                            showSearchResults = it.isNotBlank()
                            if (it.isBlank()) showSearchResults = false
                        },
                        modifier = Modifier.weight(1f),
                        placeholder = {
                            Text(
                                text = tr("Tìm địa điểm, tòa nhà…", "Search places, buildings…"),
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
                                    showSearchResults = false
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
                    IconButton(
                        onClick = {
                            if (isLoggedIn) onOpenProfile()
                            else onLoginClick()
                        },
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Person,
                            contentDescription = if (isLoggedIn) {
                                tr("Tài khoản", "Account")
                            } else {
                                tr("Đăng nhập", "Sign in")
                            },
                            tint = if (isLoggedIn) Color(0xFF1A73E8) else Color(0xFF5F6368),
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
                        "Khách · chạm biểu tượng người để đăng nhập",
                        "Guest · tap the person icon to sign in",
                    ),
                    fontSize = 11.sp,
                    color = Color(0xFF5F6368),
                    modifier = Modifier.padding(start = 16.dp, top = 6.dp),
                )
            }
            val locale = LocalAppLocale.current
            val categories = PlaceCategoryLabels.filterChips(locale)
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
                            if (query.isNotBlank()) showSearchResults = true
                        },
                        label = { Text(label, fontSize = 12.sp) },
                    )
                }
            }

            if (showSearchResults && query.isNotBlank() && selected == null && !showPlaceDetail) {
                Spacer(modifier = Modifier.height(8.dp))
                SearchResultPanel(
                    query = query.trim(),
                    results = filtered,
                    loading = searchLoading,
                    indoorHits = indoorHits,
                    indoorLoading = indoorSearchLoading,
                    onSelect = { b ->
                        selected = b
                        showSearchResults = false
                        val g = b.gpsLocation
                        if (g != null && mapViewRef != null) {
                            mapViewRef?.controller?.animateTo(GeoPoint(g.lat, g.lng))
                            mapViewRef?.controller?.setZoom(17.0)
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
                )
            }
        }

        FloatingActionButton(
            onClick = {
                if (!hasLocationPermission) {
                    requestLocationPermission()
                    return@FloatingActionButton
                }
                val map = mapViewRef ?: return@FloatingActionButton
                val point = userPoint
                if (point != null) {
                    map.controller.animateTo(point)
                    map.controller.setZoom(17.0)
                    return@FloatingActionButton
                }
                val lm = context.getSystemService(LocationManager::class.java) ?: return@FloatingActionButton
                @Suppress("DEPRECATION")
                val last = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                    ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                if (last != null) {
                    val gp = GeoPoint(last.latitude, last.longitude)
                    userPoint = gp
                    userAccuracyM = last.accuracy.coerceAtLeast(8f)
                    map.controller.animateTo(gp)
                    map.controller.setZoom(17.0)
                }
            },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = if (selected != null) 180.dp else 100.dp),
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
                viewModel.recordHistory(
                    type = "VIEW_PLACE",
                    placeId = pid,
                    buildingId = chosen?.id,
                    label = chosen?.name,
                )
            }
        }

        if (chosen != null && !showPlaceDetail) {
            PlacePreviewSheet(
                building = chosen,
                explorer = explorer,
                isFavorite = chosen.placeId?.let { it in favoriteIds } == true,
                isFollowing = chosen.placeId?.let { it in followingIds } == true,
                notice = placeNotice,
                isLoggedIn = isLoggedIn,
                onDismiss = {
                    selected = null
                    viewModel.clearBuildingExplorer()
                },
                onDirections = { openDirections(chosen) },
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
                onEnterIndoor = { enterIndoor(chosen) },
                onLoginRequired = onLoginClick,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }

        if (showPlaceDetail && chosen != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .zIndex(40f)
                    .background(Color(0xFFF8F9FA)),
            ) {
                PlaceDetailScreen(
                    building = chosen,
                    explorer = explorer,
                    explorerLoading = explorerLoading,
                    isFavorite = chosen.placeId?.let { it in favoriteIds } == true,
                    isFollowing = chosen.placeId?.let { it in followingIds } == true,
                    isLoggedIn = isLoggedIn,
                    onBack = { showPlaceDetail = false },
                    onDirections = { openDirections(chosen) },
                    onToggleFavorite = {
                        val pid = chosen.placeId ?: return@PlaceDetailScreen
                        viewModel.toggleFavorite(pid, chosen.name)
                    },
                    onShare = { sharePlace(chosen) },
                    onToggleFollow = {
                        val pid = chosen.placeId ?: return@PlaceDetailScreen
                        viewModel.toggleFollowPlace(pid)
                    },
                    onReview = { showReviewDialog = true },
                    onReport = { showReportDialog = true },
                    onEnterIndoor = { enterIndoor(chosen) },
                    onLoginRequired = onLoginClick,
                )
            }
        }

        if (showReviewDialog && selected?.placeId != null) {
            var rating by remember { mutableStateOf(5) }
            var comment by remember { mutableStateOf("") }
            AlertDialog(
                onDismissRequest = { showReviewDialog = false },
                title = { Text(tr("Đánh giá địa điểm", "Rate this place")) },
                text = {
                    Column {
                        Text(tr("Chọn số sao (1–5)", "Choose stars (1–5)"))
                        Row {
                            (1..5).forEach { n ->
                                TextButton(onClick = { rating = n }) {
                                    Text(if (n <= rating) "★" else "☆", color = Color(0xFFF9AB00))
                                }
                            }
                        }
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
    }

    LaunchedEffect(filtered, mapViewRef, userPoint) {
        if (didFitBuildings || didCenterOnUser || userPoint != null) return@LaunchedEffect
        val map = mapViewRef ?: return@LaunchedEffect
        val pts = filtered.mapNotNull { b ->
            val g = b.gpsLocation ?: return@mapNotNull null
            if (g.lat == 0.0 && g.lng == 0.0) null else GeoPoint(g.lat, g.lng)
        }
        if (pts.isEmpty()) return@LaunchedEffect
        didFitBuildings = true
        if (pts.size == 1) {
            map.controller.animateTo(pts.first())
            map.controller.setZoom(16.0)
        } else {
            map.zoomToBoundingBox(BoundingBox.fromGeoPoints(pts), true, 100)
        }
    }
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
