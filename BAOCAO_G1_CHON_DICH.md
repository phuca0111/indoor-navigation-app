# BÁO CÁO GIAI ĐOẠN G1
## Chọn đích ≠ tự hiện đường

**Ngày:** 11/07/2026  
**Trạng thái:** Code xong · Compile SUCCESS · Unit/Integration (JVM) PASS  
**Checklist thủ công:** `TEST_CASE_G1_CHON_DICH.md` (thư mục gốc repo)

---

## 1. Đã làm gì?

### Vấn đề
Khi search chọn phòng/POI, `setDestination*` gọi `updatePath` ngay → `navState.path` có dữ liệu → MapView vẽ line dù chưa bấm **Xem đường**.

### Thay đổi

| File | Thay đổi |
|------|----------|
| `MapViewModel.kt` | `setDestination` / `setDestinationPoi`: chỉ lưu `destinationNodeId` + `destinationMarkerPos`, **`path = null`**, không gọi `updatePath`. Path chỉ khi `previewPath()` / `startNavigationMode()`. |
| `NavigationUiFlags.kt` *(mới)* | Tách cờ UI: không còn spinner “Đang tìm đường…” chỉ vì `path == null`. |
| `MapScreen.kt` | Dùng `computeNavigationUiFlags(...)`. |
| `BottomInfoCard.kt` | Khi chưa có path: hiện *“Đã chọn điểm đến. Nhấn Xem đường…”*; **Bắt đầu** vẫn disabled nếu `distanceMeters <= 0`. |
| `MapView.kt` | Pin đỏ dùng `path.last` **hoặc** `destinationMarkerPos` (pin khi chưa có line). |
| Unit tests | `NavigationUiFlagsTest`, `DestinationSelectionG1Test` |

### Luồng sau G1

```
Search chọn đích → pin + tên (path = null)
       ↓
Bấm "Xem đường" → previewPath() → updatePath → line mỏng
       ↓
Bấm "Bắt đầu" → isNavigatingMode = true → line đậm
```

---

## 2. Kết quả tự test

| Loại test | Phạm vi G1 | Cách chạy / bằng chứng | Kết quả |
|-----------|------------|------------------------|---------|
| **Smoke** | Compile Kotlin flavor `localDebug` | `:app:compileLocalDebugKotlin` | **PASS** (BUILD SUCCESSFUL) |
| **Unit** | Cờ UI G1 (5 case) | `NavigationUiFlagsTest` | **PASS** |
| **Unit / Integration (logic)** | Resolve node phòng/POI + A* khi preview | `DestinationSelectionG1Test` + `AStarPathfinderTest` + `GraphModelTest` | **PASS** |
| **Regression (JVM)** | Graph/A* không vỡ sau đổi VM | Cùng lệnh test trên | **PASS** |
| **System / UI trên máy** | Flow search → pin → Xem đường → Bắt đầu | Cần `installLocalDebug` + checklist | **CHỜ USER** |
| **Performance** | G1 chỉ bỏ 1 lần A* khi chọn đích → nhẹ hơn trước | Không đo benchmark riêng | **N/A / chấp nhận được** |
| **Instrumented (device)** | Espresso/UI Automator | Chưa có test instrumented cho G1 | **CHƯA CHẠY** |

---

## 3. Giải thích ngắn

1. Tách “chọn đích” và “tính đường”.  
2. Pin vẫn hiện nhờ `destinationMarkerPos`.  
3. Không sửa PDR / la bàn / xoay map.  
4. `findMyCar()` vẫn gọi `updatePath` ngay (cố ý).

---

## 4. Đề xuất

| # | Đề xuất | Ưu tiên |
|---|---------|---------|
| 1 | Chạy `TEST_CASE_G1_CHON_DICH.md` trên điện thoại | Bắt buộc trước G2 |
| 2 | Sau Pass G1 → **G2** | Tiếp theo |
| 3 | Snackbar khi Xem đường mà chưa QR | Trung bình |

---

## 5. Test thủ công

1. `.\gradlew.bat installLocalDebug` trong `IndoorNavigationApp`  
2. Mở `TEST_CASE_G1_CHON_DICH.md` (gốc repo)  
3. Pass tối thiểu: G1-01, G1-03, G1-04  

---

*Hết báo cáo G1.*
