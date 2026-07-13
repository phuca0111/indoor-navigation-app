# BÁO CÁO GIAI ĐOẠN G1b
## Đổi map → clear vị trí (không dính chấm xanh)

**Ngày:** 12/07/2026  
**Trạng thái:** Code xong · Compile SUCCESS · Unit PASS · chờ test máy  
**Checklist thủ công:** `TEST_CASE_G1b_DOI_MAP.md`

---

## 1. Đã làm gì?

### Vấn đề
QR map A → quay ra → mở map B không QR → chấm xanh tự hiện giữa khoảng trống (tọa độ / engine map cũ còn dính). Đổi tầng qua `refreshMap` cũng không clear `userPos` / không `stop()` engine cũ.

### Thay đổi

| File | Thay đổi |
|------|----------|
| `MapViewModel.kt` | `clearLocalizationSession()`: stop engine, xóa `userPos`/path, null graph. Gọi đầu mỗi `fetchMap` + `exitIndoorNavigation`. |
| `MapViewModel.kt` | `localizationMapKey` = `buildingId\|floor` — chỉ nhận `onLocationUpdated` khi đã QR đúng map. |
| `MapViewModel.kt` | Hủy `fetchMapJob` cũ khi đổi map liên tục. |
| `NavigationUiFlags.kt` | `buildMapSessionKey`, `shouldDrawUserMarker` (contract G1b). |
| Tests | `NavigationUiFlagsTest` (+G1b), `MapSessionG1bTest` |

### Luồng sau G1b

```
Đổi building / tầng → clearLocalizationSession()
       → userPos = null (không vẽ chấm xanh)
       → Quét QR trên map hiện tại → localizationMapKey = map hiện tại
       → onLocationUpdated mới cập nhật userPos
```

---

## 2. Kết quả tự test

| Loại test | Phạm vi G1b | Kết quả |
|-----------|-------------|---------|
| **Smoke** | `compileLocalDebugKotlin` | **PASS** |
| **Unit** | `NavigationUiFlagsTest` (G1b) + `MapSessionG1bTest` | **PASS** |
| **System trên máy** | TC-G1b-01 / 02 | **Chờ user** |
| **Performance** | Clear session nhẹ | N/A |

---

## 3. Giải thích ngắn

1. Root cause: đổi map/tầng tạo `LocationEngine` mới nhưng **không stop** engine cũ và **không xóa** `userPos`.  
2. Fix: mỗi `fetchMap` gọi `clearLocalizationSession()`; chỉ cập nhật vị trí khi `localizationMapKey` khớp map đã QR.  
3. Không đụng G2 (xoay/zoom) trong giai đoạn này.

---

## 4. Đề xuất

1. Chạy `TEST_CASE_G1b_DOI_MAP.md` trên điện thoại (bắt buộc G1b-01, G1b-02).  
2. Pass → sang **G2** (xoay/zoom mượt).  
3. Zoom/xoay đơ (B8) thuộc G2 — chưa sửa trong G1b.

---

## 5. Test thủ công

1. `.\gradlew.bat installLocalDebug` trong `IndoorNavigationApp`  
2. Mở `TEST_CASE_G1b_DOI_MAP.md`  
3. Pass tối thiểu: G1b-01, G1b-02  

---

*Hết báo cáo G1b.*
