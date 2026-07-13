# TEST CASE THỦ CÔNG — Giai đoạn G1b
## Đổi map không dính chấm xanh / clear phiên định vị

**Ngày:** 12/07/2026  
**Build trước khi test:**

```powershell
cd IndoorNavigationApp
.\gradlew.bat installLocalDebug
```

**Mục tiêu Pass:** Quét QR map A → quay ra / đổi map B **không** quét QR → **không** còn chấm xanh giữa khoảng trống. Chỉ sau khi quét QR trên map B mới có chấm xanh đúng chỗ.

---

## Chuẩn bị

| # | Việc | Pass |
|---|------|------|
| P0 | App mở được, có ≥ 2 map/tòa (hoặc 2 tầng) để đổi | ☐ |

---

## TC-G1b-01 — Đổi tòa / map khác không QR

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Mở map A, quét QR | Chấm xanh đúng vị trí (vd. cổng) | ☐ |
| 2 | Quay ra danh sách tòa (**không tắt app**) | Về list | ☐ |
| 3 | Chọn map B, **không** quét QR | Map B hiện; **không** có chấm xanh giữa khoảng trống | ☐ |
| 4 | (Tuỳ chọn) Overlay trống / nút Quét QR vẫn hợp lý | Không crash | ☐ |

---

## TC-G1b-02 — Quét QR lại trên map mới

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Sau TC-G1b-01, quét QR trên map B | Chấm xanh đúng vị trí QR map B | ☐ |

---

## TC-G1b-03 — Đổi tầng trong cùng tòa

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Map A tầng 0, đã QR | Có chấm xanh | ☐ |
| 2 | Chọn tầng khác (Floor selector) **không** QR lại | Chấm xanh **biến mất** (không dính tọa độ tầng cũ) | ☐ |
| 3 | Quét QR tầng mới | Chấm xanh đúng | ☐ |

---

## TC-G1b-04 — Regression G1

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Sau QR, search chọn phòng | Pin đỏ, **không** line | ☐ |
| 2 | Xem đường → Bắt đầu | Line OK | ☐ |

---

## Bảng tổng hợp

| TC | Pass | Fail | Ghi chú |
|----|------|------|---------|
| G1b-01 | ☐ | ☐ | **Bắt buộc** |
| G1b-02 | ☐ | ☐ | **Bắt buộc** |
| G1b-03 | ☐ | ☐ | Khuyến nghị |
| G1b-04 | ☐ | ☐ | Khuyến nghị |

**G1b Pass khi:** G1b-01 và G1b-02 Pass.

---

*Hết checklist G1b.*
