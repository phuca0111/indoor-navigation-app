# TEST CASE THỦ CÔNG — Giai đoạn G2
## Xoay / zoom map mượt kiểu Google

**Ngày:** 12/07/2026  
**Build:**

```powershell
cd IndoorNavigationApp
.\gradlew.bat installLocalDebug
```

**Mục tiêu Pass:** North-up xoay 2 ngón dễ; Heading-up xoay tay được (offset); la bàn / crosshair reset offset; zoom không đơ.

---

## TC-G2-01 — North-up xoay mượt

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Mode North-up (la bàn về Bắc) | Map thẳng theo Bắc | ☐ |
| 2 | Hai ngón xoay map | Map xoay theo tay, **không** cần “xoay thuần” khó | ☐ |
| 3 | Vừa xoay vừa zoom nhẹ | Vẫn xoay được, không bị khóa | ☐ |

---

## TC-G2-02 — Heading-up có offset tay

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Bật Heading-up (la bàn) | Map xoay theo hướng đi | ☐ |
| 2 | Hai ngón xoay lệch map | Map lệch khỏi hướng đi (offset); mũi tên user vẫn hợp lý | ☐ |
| 3 | Đi/xoay người | Map vẫn bám heading + giữ offset | ☐ |

---

## TC-G2-03 — Reset offset

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Sau khi đã xoay tay (offset) | Map lệch | ☐ |
| 2 | Bấm **crosshair** (căn giữa) | Offset về 0; map về hành vi mặc định mode | ☐ |
| 3 | Xoay tay lại → bấm **la bàn** đổi mode | Offset reset | ☐ |

---

## TC-G2-04 — Zoom mượt

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Pinch zoom liên tục | Zoom mượt, không đơ / nhảy khung | ☐ |
| 2 | Xen kẽ zoom + xoay | Không freeze ngắn | ☐ |

---

## TC-G2-05 — Regression G1 / G1b

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Search chọn đích | Pin, không line | ☐ |
| 2 | Đổi map không QR | Không chấm xanh dính | ☐ |

---

## Tổng hợp

| TC | Pass | Fail |
|----|------|------|
| G2-01 | ☐ | ☐ |
| G2-02 | ☐ | ☐ |
| G2-03 | ☐ | ☐ |
| G2-04 | ☐ | ☐ |
| G2-05 | ☐ | ☐ |

**G2 Pass khi:** G2-01, G2-02, G2-03 Pass.

---

*Hết checklist G2.*
