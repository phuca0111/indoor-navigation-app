package com.khoaluan.indoornav.data.local

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.khoaluan.indoornav.data.model.SavedParkingSpot

/**
 * FILE: ParkingManager.kt
 * MỤC ĐÍCH: Quản lý việc lưu trữ (Save) và tải (Load) vị trí xe vào Local Storage.
 * Sử dụng SharedPreferences và Gson để lưu trữ object một cách nhẹ nhàng, nhanh chóng.
 */
class ParkingManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    companion object {
        private const val PREF_NAME = "indoor_nav_parking_prefs"
        private const val KEY_SAVED_PARKING = "saved_parking_spot"
    }

    /**
     * Lưu vị trí xe vào bộ nhớ cục bộ
     */
    fun saveParkingPosition(spot: SavedParkingSpot) {
        val jsonString = gson.toJson(spot)
        prefs.edit().putString(KEY_SAVED_PARKING, jsonString).apply()
    }

    /**
     * Lấy vị trí xe đã lưu (nếu có)
     */
    fun getSavedParkingPosition(): SavedParkingSpot? {
        val jsonString = prefs.getString(KEY_SAVED_PARKING, null) ?: return null
        return try {
            gson.fromJson(jsonString, SavedParkingSpot::class.java)
        } catch (e: Exception) {
            null // Trả về null nếu data bị lỗi hoặc cũ
        }
    }

    /**
     * Xóa vị trí xe sau khi đã tìm thấy hoặc người dùng muốn hủy
     */
    fun clearParkingPosition() {
        prefs.edit().remove(KEY_SAVED_PARKING).apply()
    }

    /**
     * Kiểm tra nhanh xem có vị trí đỗ xe nào đang được lưu không
     */
    fun hasSavedParking(): Boolean {
        return prefs.contains(KEY_SAVED_PARKING)
    }
}
