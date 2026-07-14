# CHECKLIST TEST TAY — PHASE 6 ANALYTICS

> Ngày: 2026-07-11 · Server: `http://localhost:5000` · Dashboard: `/admin/dashboard.html`

**Tự động (bắt buộc trước khi test tay):**
```bash
cd Backend_server
npm run test:phase6
```

---

## A. SUPER_ADMIN

| # | Bước | Kỳ vọng | Pass? |
|---|------|---------|-------|
| A01 | Đăng nhập Super Admin | Vào dashboard | ☐ |
| A02 | Thấy tab **📊 Phân tích** | Tab hiện, BUILDING_ADMIN không thấy | ☐ |
| A03 | Mở tab Phân tích (range 30d mặc định) | Super: thẻ **Doanh thu** + gợi ý → Gói & TT | ☐ |
| A03b | Bấm “Xem hóa đơn chi tiết” | Chuyển sang tab Gói & Thanh toán | ☐ |
| A04 | Đổi **7 ngày** → Làm mới | Series ngắn hơn; số tổng có thể đổi | ☐ |
| A05 | Đổi **90 ngày** | Biểu đồ dài hơn | ☐ |
| A06 | Có org GRACE/EXPIRED (nếu có trong DB) | Hiện trong khối Cảnh báo | ☐ |
| A07 | Postman: `GET /api/analytics/overview?range=7d` + Bearer Super | 200, `scope: platform` | ☐ |

---

## B. ORG_ADMIN

| # | Bước | Kỳ vọng | Pass? |
|---|------|---------|-------|
| B01 | Đăng nhập ORG_ADMIN | Thấy tab Phân tích | ☐ |
| B02 | Mở Phân tích | Intro nói chi phí gói; thẻ **Chi phí đã trả** (không gọi Doanh thu) | ☐ |
| B02b | Bấm “Xem hóa đơn chi tiết” | Vào tab Gói; thấy danh sách HĐ | ☐ |
| B03 | Phân bố gói | Chỉ 1 gói = 1 (gói org hiện tại) | ☐ |
| B04 | Postman overview | 200, `scope: organization` | ☐ |

---

## C. BUILDING_ADMIN / RBAC

| # | Bước | Kỳ vọng | Pass? |
|---|------|---------|-------|
| C01 | Đăng nhập BUILDING_ADMIN | **Không** thấy tab Phân tích | ☐ |
| C02 | Gọi API overview bằng token BA | **403** | ☐ |
| C03 | Không token | **401** | ☐ |

---

## D. HỒI QUY NHANH

| # | Bước | Kỳ vọng | Pass? |
|---|------|---------|-------|
| D01 | Tab Gói & Thanh toán vẫn mở bình thường | Không regress Phase 5 | ☐ |
| D02 | Thẻ tổng quan Phase 4.6 đầu trang vẫn hiện | Snapshot giữ nguyên | ☐ |
| D03 | Tab Lịch sử vẫn lọc/log như cũ | Không đụng Phase 4 logs | ☐ |

---

## Ghi chú kết quả

- Ngày test: ________  
- Người test: ________  
- Pass / Fail tổng: ________  
- Ghi chú bug (nếu có): ________
