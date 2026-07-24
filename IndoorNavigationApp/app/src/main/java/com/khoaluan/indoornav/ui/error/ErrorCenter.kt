package com.khoaluan.indoornav.ui.error

import com.khoaluan.indoornav.ui.i18n.trStatic
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * #29 Error Center — taxonomy lỗi End User + banner/list.
 */
enum class AppErrorKind {
    NO_INDOOR,
    GPS_WEAK,
    QR_INVALID,
    ROUTE_FAIL,
    NETWORK,
    AUTH,
    OTHER,
}

data class AppError(
    val kind: AppErrorKind,
    val title: String,
    val message: String,
    val actionLabel: String? = null,
    val timestamp: Long = System.currentTimeMillis(),
)

object ErrorCenter {
    private val _latest = MutableStateFlow<AppError?>(null)
    val latest: StateFlow<AppError?> = _latest.asStateFlow()

    private val _history = MutableStateFlow<List<AppError>>(emptyList())
    val history: StateFlow<List<AppError>> = _history.asStateFlow()

    fun report(
        kind: AppErrorKind,
        title: String,
        message: String,
        actionLabel: String? = null,
    ) {
        val err = AppError(kind, title, message, actionLabel)
        _latest.value = err
        _history.value = (listOf(err) + _history.value).take(40)
    }

    fun clearLatest() {
        _latest.value = null
    }

    fun clearAll() {
        _latest.value = null
        _history.value = emptyList()
    }

    fun noIndoor(placeName: String) = report(
        AppErrorKind.NO_INDOOR,
        trStatic("Chưa có bản đồ trong nhà", "No indoor map"),
        trStatic(
            "$placeName chưa có bản đồ trong nhà đã xuất bản.",
            "$placeName has no published indoor map yet.",
        ),
        trStatic("Đề xuất địa điểm / trong nhà", "Suggest place / indoor"),
    )

    fun gpsWeak() = report(
        AppErrorKind.GPS_WEAK,
        trStatic("GPS yếu", "Weak GPS"),
        trStatic(
            "Tín hiệu GPS kém. Hãy ra ngoài trời hoặc bật độ chính xác cao.",
            "Weak GPS signal. Go outdoors or enable high accuracy.",
        ),
        trStatic("Thử lại", "Retry"),
    )

    fun qrInvalid(detail: String) = report(
        AppErrorKind.QR_INVALID,
        trStatic("Mã QR lỗi", "QR error"),
        detail,
        trStatic("Quét lại", "Rescan"),
    )

    fun routeFail(detail: String) = report(
        AppErrorKind.ROUTE_FAIL,
        trStatic("Không tìm được đường", "No route found"),
        detail,
        trStatic("Chọn lại đích", "Pick another destination"),
    )

    fun network(detail: String) = report(
        AppErrorKind.NETWORK,
        trStatic("Mạng lỗi", "Network error"),
        detail,
        trStatic("Thử lại", "Retry"),
    )
}
