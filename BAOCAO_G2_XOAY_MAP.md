# BÁO CÁO GIAI ĐOẠN G2
## Xoay / zoom map kiểu Google

**Ngày:** 12/07/2026  
**Trạng thái:** Code xong · Compile SUCCESS · Unit PASS · chờ test máy  
**Checklist:** `TEST_CASE_G2_XOAY_MAP.md`

---

## 1. Đã làm gì?

### Root cause chính
`detectTransformGestures` trả `rotation` theo **radian**, code cũ cộng thẳng vào góc **độ** và lọc `abs(rotation) >= 2` (≈ 114°) → gần như **không bao giờ xoay được**, cảm giác “khó / đơ”.

### Thay đổi

| File | Thay đổi |
|------|----------|
| `MapRotationMath.kt` *(mới)* | `gestureRotationRadiansToDegrees`, `shouldApplyManualMapRotation`, `computeEffectiveMapRotation` |
| `MapView.kt` | Offset tay dùng **cả 2 mode**; HEADING_UP = `-heading + offset`; bỏ filter xoay thuần; radian→độ; animation 50ms; reset offset khi đổi mode / crosshair |
| `MapRotationMathTest.kt` | Unit tests G2 |

### Công thức

```
NORTH_UP:   mapRotation = userMapBearingOffset
HEADING_UP: mapRotation = -userHeading + userMapBearingOffset
La bàn / Crosshair → userMapBearingOffset = 0
```

---

## 2. Kết quả tự test

| Loại | Kết quả |
|------|---------|
| Smoke compile | **PASS** (lần đầu) |
| Unit `MapRotationMathTest` | **PASS** (lần đầu) |
| Máy thật (feedback 13/07) | G2-02/03/05 Pass; **xoay quá nhạy** (bug toDegrees); G2-03 mũi tên lệch vị trí — xem mục 4 |

---

## 3. Đề xuất

1. Cài bản hotfix G2.1 rồi test lại độ nhạy xoay (phải ~1:1 như Google).  
2. Pass → **G3a** (con trỏ không trôi khi ngồi) — cũng liên quan lệch vị trí sau khi cầm máy test.

---

## 4. Hotfix G2.1 (13/07/2026) — sau test máy

### Google Maps xử lý la bàn / map / mũi tên thế nào?

| Thành phần | Google Maps | App mình (sau G2) |
|------------|-------------|-------------------|
| **Mũi tên xanh** | Luôn chỉ hướng người dùng đang nhìn / đi (heading sensor) | `userHeading` trên marker |
| **Mặt phẳng map** | Heading-up: xoay map để hướng đi ≈ **lên trên màn hình**; North-up: Bắc lên trên | `HEADING_UP` / `NORTH_UP` |
| **Xoay tay 2 ngón** | Thêm **offset** tạm lên map; mũi tên vẫn theo heading thật | `userMapBearingOffset` |
| **Nút la bàn / recenter** | Xóa offset → map về đúng mode | Reset offset = 0 |

### Độ nhạy xoay Google?

Compose `detectTransformGestures` trả góc theo **độ**, **~1:1** với ngón tay (xoay tay 90° → map ~90°).  
G2 lần đầu **nhầm** gọi `toDegrees` lần nữa → ~**57×** quá nhạy (“nhích nhẹ xoay nhiều vòng”).  
**G2.1:** bỏ `toDegrees`; lọc nhiễu khi đang pan/zoom; offset tay áp ngay (đỡ khựng ~90°).

### Ảnh TC-G2-03 — mũi tên “không về vị trí cũ”

**Không phải lỗi reset offset.** Reset chỉ xoay lại mặt phẳng map, **không** kéo `userPos` về điểm QR cũ.

Trên ảnh:
- Card ghi “Vị trí hiện tại: Phòng khách” vì label lấy **phòng có tâm gần nhất** (vẫn gần phòng khách dù chấm đã ra cửa).
- Chấm xanh đã đi dọc path + “Đã tự định lại lộ trình 1 lần” → PDR/TPF đã dịch vị trí lúc test (thuộc **G3**), không phải G2 bearing.

---

*Hết báo cáo G2 (+ hotfix G2.1).*
