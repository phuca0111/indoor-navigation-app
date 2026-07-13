# TEST CASE TAY — Phase 7 Enterprise Security

> Nhánh: `giai-doan-7-bao-mat`  
> API đã pass: `npm run test:phase7` → **16/16**  
> Checklist tay: ✅ **PASS** (2026-07-13) — đủ để commit/PR

**Chuẩn bị**

1. `cd Backend_server` → `node server.js` (cổng 5000)
2. Mở `http://localhost:5000/admin/index.html`
3. Có sẵn 1 tài khoản active (vd `admin@test.com`) và biết mật khẩu
4. Dev: forgot trả `resetToken` trên trang (không cần email thật)

---

## A. Quên mật khẩu + đặt lại (UI)

### TC-A1 — Link từ trang login

| | |
|--|--|
| **Bước** | Login page → bấm **「Quên mật khẩu?」** |
| **Kỳ vọng** | Vào `/admin/forgot-password.html` |
| ☐ Pass / ☐ Fail | Ghi chú: |

### TC-A2 — Forgot email hợp lệ (có tài khoản)

| | |
|--|--|
| **Bước** | Nhập email đúng → **Gửi yêu cầu** |
| **Kỳ vọng** | Thông báo xanh/thành công; hiện box **dev token** + nút mở trang reset |
| ☐ Pass / ☐ Fail | |

### TC-A3 — Forgot email không tồn tại

| | |
|--|--|
| **Bước** | Nhập `abcxyz_khong_co@test.local` → Gửi |
| **Kỳ vọng** | Vẫn message kiểu “Nếu email tồn tại…”; **không** hiện token |
| ☐ Pass / ☐ Fail | |

### TC-A4 — Forgot email sai format

| | |
|--|--|
| **Bước** | Nhập `abc` → Gửi |
| **Kỳ vọng** | Báo email không hợp lệ (không đi tiếp) |
| ☐ Pass / ☐ Fail | |

### TC-A5 — Đặt lại MK thành công (qua link dev)

| | |
|--|--|
| **Bước** | Sau A2 → bấm link đặt lại → nhập MK mới mạnh (vd `NewPass1!`) + xác nhận khớp → Submit |
| **Kỳ vọng** | Thành công → về login; **login bằng MK mới OK**; MK cũ **không** vào được |
| ☐ Pass / ☐ Fail | |

### TC-A6 — Đặt lại: MK yếu / confirm lệch

| | |
|--|--|
| **Bước** | Token hợp lệ → MK `123` hoặc confirm khác nhau |
| **Kỳ vọng** | Báo lỗi, không đổi MK |
| ☐ Pass / ☐ Fail | |

### TC-A7 — Mở `reset-password.html` không có `?token=`

| | |
|--|--|
| **Bước** | Vào thẳng `/admin/reset-password.html` → submit |
| **Kỳ vọng** | Báo thiếu token |
| ☐ Pass / ☐ Fail | |

### TC-A8 — Dùng lại link/token sau khi đã đổi MK

| | |
|--|--|
| **Bước** | Sau A5 thành công: **copy URL/token đã dùng** (không bấm「Gửi yêu cầu」lại — lần gửi mới tạo token khác). Mở lại URL cũ hoặc paste token cũ → submit |
| **Kỳ vọng** | Lỗi token không hợp lệ / hết hạn (`RESET_TOKEN_INVALID`) |
| ☐ Pass / ☐ Fail | |
| **Lưu ý** | Token trên box dev sau khi bấm Gửi yêu cầu **lần 2** là token mới — đổi MK bằng token đó là đúng, không phải A8 |

---

## B. Đăng xuất mọi thiết bị (Profile)

### TC-B1 — Nút trên Profile

| | |
|--|--|
| **Bước** | Login → tab **Thông Tin Cá Nhân** → thấy nút **「Thu hồi mọi phiên đăng nhập」** |
| **Kỳ vọng** | Có nút + mô tả ngắn (mọi trình duyệt/máy đã login admin) |
| ☐ Pass / ☐ Fail | |

### TC-B2 — Bấm logout-all

| | |
|--|--|
| **Bước** | Bấm nút → Confirm OK |
| **Kỳ vọng** | Về trang login; login lại bằng đúng MK vẫn được |
| ☐ Pass / ☐ Fail | |

### TC-B3 — Hai trình duyệt / hai profile

| | |
|--|--|
| **Bước** | Chrome login + Edge (hoặc Incognito) login cùng user → ở Chrome bấm **Thu hồi mọi phiên** → sang Edge: **F5** hoặc chuyển tab rồi quay lại (để gọi `/users/me`) |
| **Kỳ vọng** | Edge bị đá về login (`SESSION_REVOKED`); refresh token cũ không gia hạn được |
| ☐ Pass / ☐ Fail | |
| **Lưu ý** | Edge không tự logout ngay nếu đang đứng yên không gọi API — cần F5 / đổi tab |

---

## C. Multi-tab sync (dashboard)

### TC-C1 — Logout một tab → tab kia

| | |
|--|--|
| **Bước** | Mở **2 tab** cùng dashboard (cùng trình duyệt) → Tab A bấm **Đăng xuất** → nhìn Tab B (đổi tab hoặc đợi) |
| **Kỳ vọng** | Tab B cũng về login / mất session (không còn thao tác được như đã login) |
| ☐ Pass / ☐ Fail | |

### TC-C2 — Logout-all một tab → tab kia

| | |
|--|--|
| **Bước** | 2 tab dashboard → Tab A **Thu hồi mọi phiên** → Tab B |
| **Kỳ vọng** | Tab B cũng bị đá về login |
| ☐ Pass / ☐ Fail | |

---

## D. Hồi quy nhanh (không phá cũ)

### TC-D1 — Login / logout thường

| | |
|--|--|
| **Bước** | Login → Dashboard → Logout thường (nút header) |
| **Kỳ vọng** | Về login; F5 không vào lại dashboard |
| ☐ Pass / ☐ Fail | |

### TC-D2 — Đổi mật khẩu (Profile — đã có từ trước)

| | |
|--|--|
| **Bước** | Profile → Đổi MK → thành công |
| **Kỳ vọng** | Bị logout; login bằng MK mới |
| ☐ Pass / ☐ Fail | |

### TC-D3 — Tab Tòa Nhà / Analytics vẫn mở được (role tương ứng)

| | |
|--|--|
| **Bước** | SUPER: vài tab; ORG: Billing/Analytics nếu có |
| **Kỳ vọng** | Không lỗi console `Cannot read ... null`; không mojibake |
| ☐ Pass / ☐ Fail | |

---

## E. Không cần test tay (đã cover API)

Các case sau **đã có** trong `npm run test:phase7` — chỉ test tay nếu nghi ngờ:

- Email không tồn tại không leak  
- Token sai / hết hạn / reuse  
- MK yếu / confirm lệch  
- User inactive không cấp token  
- `logout-all` không JWT → 401  
- Refresh sau logout-all → 401  
- Flag không trả `resetToken`  

---

## Kết quả tổng

| Nhóm | Pass | Fail | Ghi chú |
|------|------|------|---------|
| A Quên/đặt MK UI | 8 / 8 | 0 | |
| B Logout-all | 3 / 3 | 0 | session_version — mọi phiên |
| C Multi-tab | 2 / 2 | 0 | |
| D Hồi quy | 3 / 3 | 0 | |

**Ngày test:** 2026-07-13  
**Người test:** User (manual)  
**Kết luận:** ☑ Đủ để commit/PR · ☐ Cần sửa bug: ________
