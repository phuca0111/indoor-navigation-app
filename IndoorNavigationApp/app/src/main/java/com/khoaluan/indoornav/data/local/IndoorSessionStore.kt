package com.khoaluan.indoornav.data.local

import android.content.Context

/**
 * Module #10 — nhớ tầng cuối theo building (quay lại Indoor đúng tầng).
 */
class IndoorSessionStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    fun getLastFloor(buildingId: String, fallback: Int = 0): Int {
        if (buildingId.isBlank()) return fallback
        return prefs.getInt(floorKey(buildingId), fallback).coerceAtLeast(0)
    }

    fun saveLastFloor(buildingId: String, floor: Int) {
        if (buildingId.isBlank()) return
        prefs.edit().putInt(floorKey(buildingId), floor.coerceAtLeast(0)).apply()
    }

    fun clearBuilding(buildingId: String) {
        prefs.edit().remove(floorKey(buildingId)).apply()
    }

    companion object {
        private const val PREF = "indoor_nav_session"
        private fun floorKey(buildingId: String) = "last_floor_$buildingId"
    }
}
