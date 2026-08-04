package com.khoaluan.indoornav.data.api

import com.google.gson.annotations.SerializedName

/** GET /api/weather/current — OpenWeatherMap proxy. */
data class WeatherCurrentResponse(
    val provider: String? = null,
    val cached: Boolean = false,
    val lat: Double? = null,
    val lng: Double? = null,
    @SerializedName("temp_c") val tempC: Double? = null,
    @SerializedName("feels_like_c") val feelsLikeC: Double? = null,
    val humidity: Int? = null,
    val description: String? = null,
    val icon: String? = null,
    @SerializedName("wind_mps") val windMps: Double? = null,
)
