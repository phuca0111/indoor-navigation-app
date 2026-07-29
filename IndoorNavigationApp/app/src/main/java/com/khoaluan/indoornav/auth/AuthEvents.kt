package com.khoaluan.indoornav.auth

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Cầu nối đăng nhập Google: Credential Manager có thể recreate Activity,
 * nên không phụ thuộc Compose callback cũ.
 */
object AuthEvents {
    private val _loggedIn = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val loggedIn: SharedFlow<Unit> = _loggedIn.asSharedFlow()

    private val _error = MutableSharedFlow<String>(extraBufferCapacity = 1)
    val error: SharedFlow<String> = _error.asSharedFlow()

    private val _loading = MutableSharedFlow<Boolean>(extraBufferCapacity = 1)
    val loading: SharedFlow<Boolean> = _loading.asSharedFlow()

    fun emitLoggedIn() {
        _loggedIn.tryEmit(Unit)
    }

    fun emitError(message: String) {
        _error.tryEmit(message)
    }

    fun emitLoading(value: Boolean) {
        _loading.tryEmit(value)
    }
}
