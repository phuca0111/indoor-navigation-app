# WORLDFLOW — Gửi email xác minh đặt lại mật khẩu (SMTP)

> **Phiên bản:** 1.1 — 2026-07-14  
> **Trạng thái:** ✅ **PASS** — code + test API TC-7.17 + checklist tay email thật (2026-07-14)  
> **Nền đã có:** Phase 7 forgot/reset API + UI (sandbox hiện token trên trang)  
> **Không làm trong gói này:** Email verification khi đăng ký tài khoản mới, 2FA, marketing mail, Nest rewrite

---

## 1. MỤC TIÊU (WHY)

Hiện tại (dev): biết email → trang trả `resetToken` → đổi được MK → **chưa chứng minh** “chỉ chủ hộp thư mới reset được”.

**Mục tiêu gói này:**  
Người dùng quên MK → nhận **email thật** chứa link → chỉ ai **đọc được email** mới đặt lại MK được.

---

## 2. KẾT QUẢ MONG ĐỢI (DONE = gì)

| # | Kết quả | Cách kiểm chứng |
|---|---------|-----------------|
| **K1** | Cấu hình SMTP qua `.env` (không commit secret) | `.env.example` có đủ biến; `.env` local có giá trị thật |
| **K2** | Forgot password **gửi email** khi SMTP đã cấu hình | Inbox nhận mail trong ~1 phút |
| **K3** | Nội dung mail có **link** `…/admin/reset-password.html?token=…` | Bấm link → mở form đặt MK |
| **K4** | Khi SMTP bật: API **không** trả `resetToken` JSON (trừ khi ép flag dev) | Network tab / test API |
| **K5** | SMTP **chưa** cấu hình: giữ hành vi sandbox cũ (box dev token) để vẫn demo được | Local không SMTP vẫn test tay được |
| **K6** | Reset thành công như P7: đổi MK, token 1 lần, thu hồi phiên | Login bằng MK mới; token cũ 400 |
| **K7** | Test tự động: mock transporter (không gửi mail thật trong CI) | `npm run test:phase7` (hoặc script mới) vẫn xanh |
| **K8** | Tài liệu: WorldFlow + vài dòng `SaaS.md` / `.env.example` | Reviewer / hội đồng hiểu được luồng |

**Không tính là xong nếu:** chỉ viết UI “đã gửi email” mà không có đường gửi thật hoặc mock có kiểm chứng.

---

## 3. PHẠM VI

### Có làm
- Service gửi mail (Nodemailer)
- Template email đơn giản (tiếng Việt): tiêu đề + link + TTL nhắc 1 giờ
- Gọi gửi mail trong `forgotPassword` sau khi issue token
- Env: `SMTP_*`, dùng sẵn `PUBLIC_BASE_URL` (hoặc `APP_PUBLIC_URL`) để ghép link
- Fallback sandbox khi thiếu SMTP
- Test với mock (không phụ thuộc Gmail trong CI)

### Không làm
- Xác minh email lúc **đăng ký** (verify account) — task khác
- Đổi email / thông báo bảo mật khác
- Hàng đợi Redis / retry phức tạp (MVP: gửi sync; lỗi → log + message chung)
- Multi-language mail

---

## 4. QUYẾT ĐỊNH KỸ THUẬT (đề xuất — chờ OK)

| # | Hạng mục | Đề xuất |
|---|---------|---------|
| 1 | Thư viện | **Nodemailer** |
| 2 | Provider demo | **Gmail App Password** (hoặc SMTP bất kỳ) |
| 3 | Khi nào gửi mail | `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` đủ → gửi |
| 4 | Khi nào hiện token UI | Không đủ SMTP **hoặc** `AUTH_RESET_TOKEN_IN_RESPONSE=true` |
| 5 | Production an toàn | `NODE_ENV=production` → **không** trả token JSON dù flag quên tắt (cứng trong code) |
| 6 | Lỗi gửi mail | Vẫn trả message chung (không leak); log server; **không** xóa token đã tạo (user có thể thử lại / admin hỗ trợ) |
| 7 | Rate limit | Giữ limiter forgot hiện có |

---

## 5. QUY TRÌNH NGHIỆP VỤ (user nhìn thấy)

```
1. User mở /admin/forgot-password.html
2. Nhập email → Gửi yêu cầu
3. UI luôn hiện: “Nếu email tồn tại… đã gửi hướng dẫn”
4a. [SMTP OK]  → User mở Gmail/Outlook → bấm link trong mail
4b. [Chưa SMTP] → Box dev hiện token (như Phase 7) — chỉ local/demo
5. Trang reset-password → nhập MK mới + xác nhận
6. Thành công → về login → đăng nhập MK mới
7. Mọi phiên cũ bị thu hồi (đã có session_version / logout-all logic P7)
```

---

## 6. QUY TRÌNH KỸ THUẬT (AI / dev làm theo thứ tự)

```
S.0  User OK WorldFlow này                    ✅
  ↓
S.1  nodemailer + .env.example                ✅
  ↓
S.2  services/mailService.js                  ✅
  ↓
S.3  forgotPassword gửi mail + expose token   ✅
  ↓
S.4  UI mailHint / ẩn box khi đã gửi mail     ✅
  ↓
S.5  Test mock TC-7.17 — test:phase7 17/17    ✅
  ↓
S.6  Cập nhật SaaS.md + WorldFlow             ✅
```

**Một vòng:** audit ngắn → code → test → báo cáo. Không gộp 1C / JWT 15 phút.

---

## 7. BIẾN MÔI TRƯỜNG (dự kiến)

```env
# Đã có
PUBLIC_BASE_URL=http://localhost:5000
AUTH_RESET_TOKEN_IN_RESPONSE=true   # local: true; production: false

# Mới
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=xxxx_app_password_xxxx
SMTP_FROM="Indoor Nav <your@gmail.com>"
```

Link trong mail:

`{PUBLIC_BASE_URL}/admin/reset-password.html?token={rawToken}`

---

## 8. CHECKLIST TAY (khi đã code)

| TC | Bước | Kỳ vọng |
|----|------|---------|
| E1 | SMTP đủ trong `.env` → forgot email thật của bạn | Có mail; **không** (hoặc không cần) box token |
| E2 | Bấm link trong mail | Form reset đúng token |
| E3 | Đặt MK mới → login | OK; token reuse → lỗi |
| E4 | Tắt SMTP / xóa `SMTP_PASS` → forgot | Box dev hiện lại (sandbox) |
| E5 | Email không tồn tại | Message chung; không mail; không token |

---

## 9. RỦI RO & GIẢM THIỂU

| Rủi ro | Giảm |
|--------|------|
| Commit App Password | Chỉ `.env`; `.gitignore` đã chặn |
| Gmail chặn “less secure” | Dùng **App Password** + 2FA Google |
| Mail vào Spam | Subject rõ; nhắc user kiểm tra Spam |
| Demo hội đồng không có mạng/SMTP | Fallback sandbox (K5) |

---

## 10. CHỐT / TỪ CHỐI

Trả lời một trong các ý:

- **「OK SMTP」** / **「code đi」** → làm S.1–S.6  
- **「Chỉ document」** → giữ file này, không code (đủ viết báo cáo “hướng production”)  
- **「Sửa: …」** → chỉnh WorldFlow rồi mới code  

---

*Gói SMTP password reset — PASS 2026-07-14 (code + tay email thật).*
