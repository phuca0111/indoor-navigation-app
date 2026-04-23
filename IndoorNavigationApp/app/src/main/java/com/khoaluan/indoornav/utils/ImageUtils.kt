package com.khoaluan.indoornav.utils

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap

/**
 * FILE: ImageUtils.kt
 * MỤC ĐÍCH: Tiện ích xử lý hình ảnh, đặc biệt là giải mã Base64 thành ảnh nền
 */
object ImageUtils {

    /**
     * Bóc tách chuỗi Base64 (từ MongoDB) và nén thành ImageBitmap để Compose vẽ
     * Chuỗi thường có dạng: "data:image/png;base64,iVBORw0KGgo..."
     */
    fun decodeBase64ToImageBitmap(base64String: String?): ImageBitmap? {
        if (base64String.isNullOrEmpty()) return null

        try {
            // Cắt bỏ phần đầu thừa (data:image/png;base64,) chỉ lấy phần mã cốt lõi
            val cleanBase64 = if (base64String.contains(",")) {
                base64String.substringAfter(",")
            } else {
                base64String
            }

            // Giải mã ngược chuỗi thành các hạt Pixel byte[]
            val imageBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
            
            // Dựng lại khung ảnh vật lý
            val bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
            
            // Xoay sang định dạng cho Compose (ImageBitmap)
            return bitmap?.asImageBitmap()
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        }
    }
}
