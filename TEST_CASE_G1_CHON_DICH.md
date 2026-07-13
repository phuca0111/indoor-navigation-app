# TEST CASE THỦ CÔNG — Giai đoạn G1
## Chọn đích ≠ tự hiện đường

**Ngày:** 11/07/2026  
**Build trước khi test:**

```powershell
cd IndoorNavigationApp
.\gradlew.bat installLocalDebug
```

**Mục tiêu Pass:** Search chọn phòng/POI → chỉ thấy **pin đỏ + tên** trên card; **không** có line xanh. Bấm **Xem đường** mới có line. Bấm **Bắt đầu** mới vào điều hướng.

---

## Chuẩn bị

| # | Việc | Pass |
|---|------|------|
| P0 | App mở được, vào được 1 tòa nhà / map | ☐ |
| P1 | Quét QR thành công (chấm xanh hiện) — khuyến nghị trước khi Xem đường | ☐ |

---

## TC-G1-01 — Chọn phòng từ search: chưa có line

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Mở map (đã hoặc chưa quét QR) | Map hiện | ☐ |
| 2 | Gõ tên phòng vào search, chọn 1 phòng | Card dưới hiện tên điểm đến | ☐ |
| 3 | Quan sát map | **Pin đỏ** tại phòng; **không** có line xanh/cyan | ☐ |
| 4 | Đọc card | Có chữ kiểu: *Đã chọn điểm đến. Nhấn "Xem đường"…*; nút **Xem đường** bật; **Bắt đầu** tắt/disabled | ☐ |
| 5 | Không thấy spinner "Đang tìm đường..." mãi | Không kẹt spinner | ☐ |

---

## TC-G1-02 — Chọn POI từ search: chưa có line

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Search chọn POI (WC / cầu thang…) | Card hiện tên POI | ☐ |
| 2 | Map | Pin đỏ tại POI; **không** line | ☐ |

---

## TC-G1-03 — Bấm Xem đường → mới có preview

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Đã chọn đích (TC-G1-01) + đã quét QR | Có userPos | ☐ |
| 2 | Bấm **Xem đường** | Line preview (mỏng) xuất hiện | ☐ |
| 3 | Card | Hiện khoảng cách + ETA; **Bắt đầu** enable | ☐ |
| 4 | Chưa bấm Bắt đầu | `isNavigating` chưa chạy (không badge điều hướng đậm) | ☐ |

---

## TC-G1-04 — Bấm Bắt đầu → điều hướng

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Sau TC-G1-03, bấm **Bắt đầu** | Line đậm hơn; card "Đang điều hướng…" | ☐ |

---

## TC-G1-05 — Chưa QR mà bấm Xem đường

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Chọn đích, **không** quét QR | Pin + card, không line | ☐ |
| 2 | Bấm **Xem đường** | Không line (hoặc báo lỗi / không tính được); không crash | ☐ |

---

## TC-G1-06 — Đổi đích khác

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Đã Xem đường (có line) | Có line cũ | ☐ |
| 2 | Search chọn phòng/POI khác | Line **biến mất**; pin nhảy sang đích mới; lại chờ Xem đường | ☐ |

---

## TC-G1-07 — Regression nhanh

| Bước | Thao tác | Kết quả mong đợi | Pass/Fail |
|------|----------|------------------|-----------|
| 1 | Quét QR | Chấm xanh vẫn OK | ☐ |
| 2 | La bàn North/Heading | Vẫn đổi mode được | ☐ |
| 3 | Zoom/pan map | Vẫn mượt, không crash | ☐ |

---

## Bảng tổng hợp

| TC | Pass | Fail | Ghi chú |
|----|------|------|---------|
| G1-01 | ☐ | ☐ | |
| G1-02 | ☐ | ☐ | |
| G1-03 | ☐ | ☐ | |
| G1-04 | ☐ | ☐ | |
| G1-05 | ☐ | ☐ | |
| G1-06 | ☐ | ☐ | |
| G1-07 | ☐ | ☐ | |

**G1 Pass khi:** G1-01, G1-03, G1-04 Pass (còn lại khuyến nghị).

---

*Hết checklist G1.*
