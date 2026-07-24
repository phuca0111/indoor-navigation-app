package com.khoaluan.indoornav.ui.viewmodel

import android.app.Application
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.khoaluan.indoornav.data.api.CreatorStatsResponse
import com.khoaluan.indoornav.data.api.HubPreferencesDto
import com.khoaluan.indoornav.data.api.HubPrivacyDto
import com.khoaluan.indoornav.data.api.HubLocationPrefsDto
import com.khoaluan.indoornav.data.api.HubNotifPrefsDto
import com.khoaluan.indoornav.data.api.HubSettingsResponse
import com.khoaluan.indoornav.data.api.HubFavoriteItemDto
import com.khoaluan.indoornav.data.api.HubHistoryItemDto
import com.khoaluan.indoornav.data.api.HubWorkspaceDto
import com.khoaluan.indoornav.data.api.NotificationDto
import com.khoaluan.indoornav.data.api.PlaceFollowingItem
import com.khoaluan.indoornav.data.api.PlaceProposalBody
import com.khoaluan.indoornav.data.api.PlaceProposalDto
import com.khoaluan.indoornav.data.api.PlaceReportItemDto
import com.khoaluan.indoornav.data.api.PlaceReviewDto
import com.khoaluan.indoornav.data.api.RetrofitClient
import com.khoaluan.indoornav.data.api.UserProfileResponse
import com.khoaluan.indoornav.data.api.UserSessionDto
import com.khoaluan.indoornav.data.local.AppSettingsStore
import com.khoaluan.indoornav.data.local.FavoriteCollectionsStore
import com.khoaluan.indoornav.data.local.IndoorFavoritesStore
import com.khoaluan.indoornav.data.local.MapCacheManager
import com.khoaluan.indoornav.data.local.SessionManager
import com.khoaluan.indoornav.data.sync.SyncEngine
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface UserListUiState<out T> {
    data object Idle : UserListUiState<Nothing>
    data object Loading : UserListUiState<Nothing>
    data class Success<T>(val data: T) : UserListUiState<T>
    data class Error(val message: String) : UserListUiState<Nothing>
}

/**
 * User Hub + Community (#19–22) + Creator (#23–25) + Offline/Sync (#26–27).
 */
class UserHubViewModel(application: Application) : AndroidViewModel(application) {
    private val session = SessionManager(application)
    private val settingsStore = AppSettingsStore(application)
    private val indoorFavStore = IndoorFavoritesStore(application)
    private val collectionsStore = FavoriteCollectionsStore(application)
    private val mapCache = MapCacheManager(application)
    private val syncEngine = SyncEngine(application)

    private val _profile = MutableStateFlow<UserListUiState<UserProfileResponse>>(UserListUiState.Idle)
    val profile: StateFlow<UserListUiState<UserProfileResponse>> = _profile.asStateFlow()

    private val _favorites = MutableStateFlow<UserListUiState<List<HubFavoriteItemDto>>>(UserListUiState.Idle)
    val favorites: StateFlow<UserListUiState<List<HubFavoriteItemDto>>> = _favorites.asStateFlow()

    private val _indoorFavorites = MutableStateFlow(indoorFavStore.list())
    val indoorFavorites: StateFlow<List<IndoorFavoritesStore.SavedIndoor>> = _indoorFavorites.asStateFlow()

    private val _collections = MutableStateFlow(collectionsStore.list())
    val collections: StateFlow<List<FavoriteCollectionsStore.Collection>> = _collections.asStateFlow()

    private val _history = MutableStateFlow<UserListUiState<List<HubHistoryItemDto>>>(UserListUiState.Idle)
    val history: StateFlow<UserListUiState<List<HubHistoryItemDto>>> = _history.asStateFlow()

    private val _notifications = MutableStateFlow<UserListUiState<List<NotificationDto>>>(UserListUiState.Idle)
    val notifications: StateFlow<UserListUiState<List<NotificationDto>>> = _notifications.asStateFlow()

    private val _unreadCount = MutableStateFlow(0)
    val unreadCount: StateFlow<Int> = _unreadCount.asStateFlow()

    private val _sessions = MutableStateFlow<UserListUiState<List<UserSessionDto>>>(UserListUiState.Idle)
    val sessions: StateFlow<UserListUiState<List<UserSessionDto>>> = _sessions.asStateFlow()

    private val _cachedMaps = MutableStateFlow(mapCache.listCached())
    val cachedMaps: StateFlow<List<MapCacheManager.CachedFloor>> = _cachedMaps.asStateFlow()

    private val _myReviews = MutableStateFlow<UserListUiState<List<PlaceReviewDto>>>(UserListUiState.Idle)
    val myReviews: StateFlow<UserListUiState<List<PlaceReviewDto>>> = _myReviews.asStateFlow()

    private val _myReports = MutableStateFlow<UserListUiState<List<PlaceReportItemDto>>>(UserListUiState.Idle)
    val myReports: StateFlow<UserListUiState<List<PlaceReportItemDto>>> = _myReports.asStateFlow()

    private val _proposals = MutableStateFlow<UserListUiState<List<PlaceProposalDto>>>(UserListUiState.Idle)
    val proposals: StateFlow<UserListUiState<List<PlaceProposalDto>>> = _proposals.asStateFlow()

    private val _following = MutableStateFlow<UserListUiState<List<PlaceFollowingItem>>>(UserListUiState.Idle)
    val following: StateFlow<UserListUiState<List<PlaceFollowingItem>>> = _following.asStateFlow()

    private val _workspaces = MutableStateFlow<UserListUiState<List<HubWorkspaceDto>>>(UserListUiState.Idle)
    val workspaces: StateFlow<UserListUiState<List<HubWorkspaceDto>>> = _workspaces.asStateFlow()

    private val _creatorStats = MutableStateFlow<UserListUiState<CreatorStatsResponse>>(UserListUiState.Idle)
    val creatorStats: StateFlow<UserListUiState<CreatorStatsResponse>> = _creatorStats.asStateFlow()

    private val _syncPending = MutableStateFlow(0)
    val syncPending: StateFlow<Int> = _syncPending.asStateFlow()

    private val _theme = MutableStateFlow(settingsStore.theme)
    val theme: StateFlow<String> = _theme.asStateFlow()

    private val _locale = MutableStateFlow(settingsStore.locale.also {
        com.khoaluan.indoornav.ui.i18n.AppLocaleHolder.set(it)
    })
    val locale: StateFlow<String> = _locale.asStateFlow()

    private val _voiceGuidance = MutableStateFlow(settingsStore.voiceGuidance)
    val voiceGuidance: StateFlow<Boolean> = _voiceGuidance.asStateFlow()

    private val _preferElevator = MutableStateFlow(settingsStore.preferElevator)
    val preferElevator: StateFlow<Boolean> = _preferElevator.asStateFlow()

    private val _sharePrecise = MutableStateFlow(settingsStore.sharePreciseLocation)
    val sharePrecise: StateFlow<Boolean> = _sharePrecise.asStateFlow()

    private val _showActivity = MutableStateFlow(settingsStore.showActivity)
    val showActivity: StateFlow<Boolean> = _showActivity.asStateFlow()

    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    fun clearNotice() {
        _notice.value = null
    }

    fun postNotice(msg: String) {
        _notice.value = msg
    }

    fun loadProfile() {
        if (!session.isLoggedIn) {
            _profile.value = UserListUiState.Error("Cần đăng nhập")
            return
        }
        viewModelScope.launch {
            _profile.value = UserListUiState.Loading
            try {
                val res = RetrofitClient.getApiService().getUserMe()
                if (res.isSuccessful && res.body() != null) {
                    _profile.value = UserListUiState.Success(res.body()!!)
                } else {
                    _profile.value = UserListUiState.Error(res.message().ifBlank { "Không tải được hồ sơ (${res.code()})" })
                }
            } catch (e: Exception) {
                _profile.value = UserListUiState.Error(e.message ?: "Lỗi mạng")
            }
        }
    }

    fun loadFavorites() {
        if (!session.isLoggedIn) {
            _favorites.value = UserListUiState.Error("Cần đăng nhập để xem Place đã lưu")
            _indoorFavorites.value = indoorFavStore.list()
            _collections.value = collectionsStore.list()
            return
        }
        viewModelScope.launch {
            _favorites.value = UserListUiState.Loading
            _indoorFavorites.value = indoorFavStore.list()
            _collections.value = collectionsStore.list()
            try {
                val res = RetrofitClient.getApiService().listFavorites()
                if (res.isSuccessful) {
                    _favorites.value = UserListUiState.Success(res.body()?.favorites.orEmpty())
                } else {
                    _favorites.value = UserListUiState.Error("Không tải favorites (${res.code()})")
                }
            } catch (e: Exception) {
                _favorites.value = UserListUiState.Error(e.message ?: "Lỗi mạng")
            }
        }
    }

    fun removeFavoritePlace(placeId: String) {
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().removeFavorite(placeId)
                if (res.isSuccessful) {
                    loadFavorites()
                    _notice.value = "Đã bỏ yêu thích"
                } else {
                    _notice.value = "Không bỏ được (${res.code()})"
                }
            } catch (e: Exception) {
                _notice.value = e.message
            }
        }
    }

    fun saveIndoor(buildingId: String, name: String, totalFloors: Int) {
        indoorFavStore.save(
            IndoorFavoritesStore.SavedIndoor(buildingId, name, totalFloors),
        )
        _indoorFavorites.value = indoorFavStore.list()
        _notice.value = "Đã lưu Indoor"
    }

    fun removeIndoor(buildingId: String) {
        indoorFavStore.remove(buildingId)
        _indoorFavorites.value = indoorFavStore.list()
    }

    fun createCollection(name: String) {
        if (name.isBlank()) return
        collectionsStore.create(name)
        _collections.value = collectionsStore.list()
    }

    fun deleteCollection(id: String) {
        collectionsStore.delete(id)
        _collections.value = collectionsStore.list()
    }

    fun addPlaceToCollection(collectionId: String, placeId: String) {
        collectionsStore.addPlace(collectionId, placeId)
        _collections.value = collectionsStore.list()
    }

    fun loadHistory() {
        if (!session.isLoggedIn) {
            _history.value = UserListUiState.Error("Cần đăng nhập")
            return
        }
        viewModelScope.launch {
            _history.value = UserListUiState.Loading
            try {
                val res = RetrofitClient.getApiService().listHistory()
                if (res.isSuccessful) {
                    _history.value = UserListUiState.Success(res.body()?.history.orEmpty())
                } else {
                    _history.value = UserListUiState.Error("Không tải lịch sử (${res.code()})")
                }
            } catch (e: Exception) {
                _history.value = UserListUiState.Error(e.message ?: "Lỗi mạng")
            }
        }
    }

    fun clearAllHistory() {
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().clearHistory()
                if (res.isSuccessful) {
                    _notice.value = "Đã xóa ${res.body()?.deleted ?: 0} mục"
                    loadHistory()
                } else {
                    _notice.value = "Xóa thất bại (${res.code()})"
                }
            } catch (e: Exception) {
                _notice.value = e.message
            }
        }
    }

    fun loadNotifications() {
        if (!session.isLoggedIn) {
            _notifications.value = UserListUiState.Error("Cần đăng nhập")
            return
        }
        viewModelScope.launch {
            _notifications.value = UserListUiState.Loading
            try {
                val api = RetrofitClient.getApiService()
                val list = api.listNotifications(limit = 40)
                val count = api.notificationUnreadCount()
                if (list.isSuccessful) {
                    _notifications.value = UserListUiState.Success(list.body()?.items.orEmpty())
                } else {
                    _notifications.value = UserListUiState.Error("Không tải thông báo (${list.code()})")
                }
                if (count.isSuccessful) {
                    _unreadCount.value = count.body()?.unreadCount ?: 0
                }
            } catch (e: Exception) {
                _notifications.value = UserListUiState.Error(e.message ?: "Lỗi mạng")
            }
        }
    }

    fun refreshUnreadOnly() {
        if (!session.isLoggedIn) return
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().notificationUnreadCount()
                if (res.isSuccessful) _unreadCount.value = res.body()?.unreadCount ?: 0
            } catch (e: Exception) {
                Log.w("UserHub", "unread: ${e.message}")
            }
        }
    }

    fun markRead(id: String) {
        viewModelScope.launch {
            try {
                RetrofitClient.getApiService().markNotificationRead(id)
                loadNotifications()
            } catch (e: Exception) {
                _notice.value = e.message
            }
        }
    }

    fun markAllRead() {
        viewModelScope.launch {
            try {
                RetrofitClient.getApiService().markAllNotificationsRead()
                loadNotifications()
            } catch (e: Exception) {
                _notice.value = e.message
            }
        }
    }

    fun loadSessions() {
        if (!session.isLoggedIn) {
            _sessions.value = UserListUiState.Error("Cần đăng nhập")
            return
        }
        viewModelScope.launch {
            _sessions.value = UserListUiState.Loading
            try {
                val res = RetrofitClient.getApiService().listUserSessions()
                if (res.isSuccessful) {
                    _sessions.value = UserListUiState.Success(res.body().orEmpty())
                } else {
                    _sessions.value = UserListUiState.Error("Không tải thiết bị (${res.code()})")
                }
            } catch (e: Exception) {
                _sessions.value = UserListUiState.Error(e.message ?: "Lỗi mạng")
            }
        }
    }

    fun revokeSession(sessionId: String) {
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().revokeUserSession(sessionId)
                if (res.isSuccessful) {
                    _notice.value = "Đã thu hồi phiên"
                    loadSessions()
                } else {
                    _notice.value = "Thu hồi thất bại (${res.code()})"
                }
            } catch (e: Exception) {
                _notice.value = e.message
            }
        }
    }

    fun loadSettingsFromServer() {
        if (!session.isLoggedIn) return
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().getHubSettings()
                val body = res.body() ?: return@launch
                body.preferences?.theme?.let {
                    settingsStore.theme = it
                    _theme.value = it
                }
                body.preferences?.locale?.let {
                    val normalized = if (it.equals("en", ignoreCase = true)) "en" else "vi"
                    settingsStore.locale = normalized
                    _locale.value = normalized
                    com.khoaluan.indoornav.ui.i18n.AppLocaleHolder.set(normalized)
                }
                body.preferences?.location?.sharePrecise?.let {
                    settingsStore.sharePreciseLocation = it
                    _sharePrecise.value = it
                }
                body.preferences?.privacy?.showActivity?.let {
                    settingsStore.showActivity = it
                    _showActivity.value = it
                }
            } catch (e: Exception) {
                Log.w("UserHub", "settings: ${e.message}")
            }
        }
        refreshCachedMaps()
    }

    fun setTheme(value: String) {
        settingsStore.theme = value
        _theme.value = value
        syncSettings()
    }

    fun setLocale(value: String) {
        val normalized = if (value.equals("en", ignoreCase = true)) "en" else "vi"
        settingsStore.locale = normalized
        _locale.value = normalized
        com.khoaluan.indoornav.ui.i18n.AppLocaleHolder.set(normalized)
        syncSettings()
    }

    fun setVoiceGuidance(on: Boolean) {
        settingsStore.voiceGuidance = on
        _voiceGuidance.value = on
    }

    fun setPreferElevator(on: Boolean) {
        settingsStore.preferElevator = on
        _preferElevator.value = on
    }

    fun setSharePrecise(on: Boolean) {
        settingsStore.sharePreciseLocation = on
        _sharePrecise.value = on
        syncSettings()
    }

    fun setShowActivity(on: Boolean) {
        settingsStore.showActivity = on
        _showActivity.value = on
        syncSettings()
    }

    private fun syncSettings() {
        if (!session.isLoggedIn) return
        viewModelScope.launch {
            try {
                val body = HubSettingsResponse(
                    preferences = HubPreferencesDto(
                        locale = settingsStore.locale,
                        theme = settingsStore.theme,
                        privacy = HubPrivacyDto(
                            showEmail = false,
                            showActivity = settingsStore.showActivity,
                        ),
                        location = HubLocationPrefsDto(
                            sharePrecise = settingsStore.sharePreciseLocation,
                            defaultRadiusM = 1500,
                        ),
                    ),
                    notificationPreferences = HubNotifPrefsDto(
                        emailSecurity = true,
                        emailProduct = true,
                        inApp = true,
                    ),
                )
                RetrofitClient.getApiService().putHubSettings(body)
            } catch (e: Exception) {
                Log.w("UserHub", "put settings: ${e.message}")
            }
        }
    }

    fun refreshCachedMaps() {
        _cachedMaps.value = mapCache.listCached()
    }

    fun downloadBuildingOffline(buildingId: String) {
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().getFullBuildingMap(buildingId)
                if (!res.isSuccessful) {
                    _notice.value = "Tải offline thất bại (${res.code()})"
                    return@launch
                }
                val body = res.body() ?: return@launch
                body.floors.forEach { doc ->
                    val md = doc.map_data ?: return@forEach
                    mapCache.save(
                        buildingId,
                        doc.floor_number,
                        com.khoaluan.indoornav.data.model.MapResponse(
                            mapData = md,
                            buildingId = buildingId,
                            floorNumber = doc.floor_number,
                            version = doc.version,
                        ),
                    )
                }
                refreshCachedMaps()
                _notice.value = "Đã tải ${body.floors.size} tầng offline"
            } catch (e: Exception) {
                _notice.value = e.message
            }
        }
    }

    fun clearCachedBuilding(buildingId: String) {
        mapCache.clearBuilding(buildingId)
        refreshCachedMaps()
    }

    fun clearAllCache() {
        mapCache.clearAll()
        refreshCachedMaps()
        _notice.value = "Đã xóa cache offline"
    }

    fun loadMyReviews() {
        if (!session.isLoggedIn) {
            _myReviews.value = UserListUiState.Error("Cần đăng nhập")
            return
        }
        viewModelScope.launch {
            _myReviews.value = UserListUiState.Loading
            try {
                val res = RetrofitClient.getApiService().myReviews()
                if (res.isSuccessful) {
                    _myReviews.value = UserListUiState.Success(res.body()?.reviews.orEmpty())
                } else {
                    _myReviews.value = UserListUiState.Error("Không tải reviews (${res.code()})")
                }
            } catch (e: Exception) {
                _myReviews.value = UserListUiState.Error(e.message ?: "Lỗi mạng")
            }
        }
    }

    fun loadMyReports() {
        if (!session.isLoggedIn) {
            _myReports.value = UserListUiState.Error("Cần đăng nhập")
            return
        }
        viewModelScope.launch {
            _myReports.value = UserListUiState.Loading
            try {
                val res = RetrofitClient.getApiService().myReports()
                if (res.isSuccessful) {
                    _myReports.value = UserListUiState.Success(res.body()?.reports.orEmpty())
                } else {
                    _myReports.value = UserListUiState.Error("Không tải reports (${res.code()})")
                }
            } catch (e: Exception) {
                _myReports.value = UserListUiState.Error(e.message ?: "Lỗi mạng")
            }
        }
    }

    fun loadProposals() {
        if (!session.isLoggedIn) {
            _proposals.value = UserListUiState.Error("Cần đăng nhập")
            return
        }
        viewModelScope.launch {
            _proposals.value = UserListUiState.Loading
            try {
                val res = RetrofitClient.getApiService().listHubProposals()
                if (res.isSuccessful) {
                    _proposals.value = UserListUiState.Success(res.body()?.proposals.orEmpty())
                } else {
                    _proposals.value = UserListUiState.Error("Không tải proposals (${res.code()})")
                }
            } catch (e: Exception) {
                _proposals.value = UserListUiState.Error(e.message ?: "Lỗi mạng")
            }
        }
    }

    fun createProposal(
        name: String,
        latitude: Double,
        longitude: Double,
        address: String? = null,
        category: String? = null,
        description: String? = null,
    ) {
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().createPlaceProposal(
                    PlaceProposalBody(name, latitude, longitude, address, category, description),
                )
                if (res.isSuccessful) {
                    _notice.value = res.body()?.message ?: "Đã gửi đề xuất"
                    loadProposals()
                } else {
                    _notice.value = "Gửi đề xuất thất bại (${res.code()})"
                }
            } catch (e: Exception) {
                _notice.value = if (!syncEngine.isOnline()) {
                    "Offline — cần mạng để gửi đề xuất"
                } else {
                    e.message
                }
            }
        }
    }

    fun loadFollowing() {
        if (!session.isLoggedIn) {
            _following.value = UserListUiState.Error("Cần đăng nhập")
            return
        }
        viewModelScope.launch {
            _following.value = UserListUiState.Loading
            try {
                val res = RetrofitClient.getApiService().listFollowing()
                if (res.isSuccessful) {
                    _following.value = UserListUiState.Success(res.body()?.following.orEmpty())
                } else {
                    _following.value = UserListUiState.Error("Không tải following (${res.code()})")
                }
            } catch (e: Exception) {
                _following.value = UserListUiState.Error(e.message ?: "Lỗi mạng")
            }
        }
    }

    fun unfollowPlace(placeId: String) {
        viewModelScope.launch {
            try {
                val res = RetrofitClient.getApiService().unfollowPlace(placeId)
                if (res.isSuccessful) {
                    loadFollowing()
                    _notice.value = "Đã bỏ theo dõi"
                } else if (!syncEngine.isOnline()) {
                    syncEngine.enqueue(
                        com.khoaluan.indoornav.data.local.SyncQueueStore.TYPE_UNFOLLOW,
                        com.khoaluan.indoornav.data.api.PlaceFollowBody(placeId),
                    )
                    refreshSyncPending()
                    _notice.value = "Đã xếp hàng bỏ theo dõi (offline)"
                } else {
                    _notice.value = "Không bỏ theo dõi (${res.code()})"
                }
            } catch (e: Exception) {
                syncEngine.enqueue(
                    com.khoaluan.indoornav.data.local.SyncQueueStore.TYPE_UNFOLLOW,
                    com.khoaluan.indoornav.data.api.PlaceFollowBody(placeId),
                )
                refreshSyncPending()
                _notice.value = "Offline — đã xếp hàng bỏ theo dõi"
            }
        }
    }

    fun loadWorkspaces() {
        if (!session.isLoggedIn) {
            _workspaces.value = UserListUiState.Error("Cần đăng nhập")
            return
        }
        viewModelScope.launch {
            _workspaces.value = UserListUiState.Loading
            try {
                val res = RetrofitClient.getApiService().listHubWorkspaces()
                if (res.isSuccessful) {
                    val body = res.body()
                    val list = body?.workspaces.orEmpty().ifEmpty { body?.buildings.orEmpty() }
                    _workspaces.value = UserListUiState.Success(list)
                } else {
                    _workspaces.value = UserListUiState.Error("Không tải workspace (${res.code()})")
                }
            } catch (e: Exception) {
                _workspaces.value = UserListUiState.Error(e.message ?: "Lỗi mạng")
            }
        }
    }

    fun loadCreatorStats() {
        if (!session.isLoggedIn) {
            _creatorStats.value = UserListUiState.Error("Cần đăng nhập")
            return
        }
        viewModelScope.launch {
            _creatorStats.value = UserListUiState.Loading
            try {
                val res = RetrofitClient.getApiService().getCreatorStats()
                if (res.isSuccessful && res.body() != null) {
                    _creatorStats.value = UserListUiState.Success(res.body()!!)
                } else {
                    _creatorStats.value = UserListUiState.Error("Không tải stats (${res.code()})")
                }
            } catch (e: Exception) {
                _creatorStats.value = UserListUiState.Error(e.message ?: "Lỗi mạng")
            }
        }
    }

    fun refreshSyncPending() {
        _syncPending.value = syncEngine.pendingCount()
    }

    fun flushSyncQueue() {
        viewModelScope.launch {
            val n = syncEngine.flush()
            refreshSyncPending()
            _notice.value = if (n > 0) "Đã đồng bộ $n việc" else "Không có việc mới / offline"
        }
    }

    fun sessionEmail(): String? = session.email
    fun sessionName(): String? = session.displayName
    fun isLoggedIn(): Boolean = session.isLoggedIn
}
