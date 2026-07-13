# WORLDFLOW — Phase 7 Enterprise Security

> **Phiên bản:** 1.2 — 2026-07-14  
> **Trạng thái:** ✅ **PASS** — `test:phase7` 16/16 + checklist tay — nhánh `giai-doan-7-bao-mat` (chờ commit/PR)  
> **Không làm trong Phase 7:** Avatar, 2FA, Notification (= 1C); access 15 phút; full `user_sessions` UI; refresh rotation; idle timeout theo role; SMTP bắt buộc; WebMapEditor V4

---

## 1. MỤC TIÊU

Cứng hóa bảo mật vận hành (đồ án → nền nâng production sau):

1. User **tự quên / đặt lại mật khẩu** (sandbox email).
2. Dashboard **multi-tab logout sync**.
3. **Bậc B:** Đăng xuất mọi thiết bị = revoke toàn bộ refresh token của user.
4. JWT **document + env**, **default access vẫn 7 ngày** (không rút 15 phút trong P7).
5. Ghi **production roadmap** (access ngắn / session table / rotation) để mở rộng khi ra thị trường.

---

## 2. QUYẾT ĐỊNH ĐÃ CHỐT

| # | Hạng mục | Chốt |
|---|---------|------|
| 1 | Phạm vi | Security vận hành — **không** gộp 1C |
| 2 | Forgot / reset password | Có — API + UI login |
| 3 | Email | Sandbox / dev có thể trả `resetToken`; prod message chung |
| 4 | Multi-tab sync | Bật lại listener dashboard |
| 5 | JWT access default | **Giữ 7d** — chỉ document `JWT_ACCESS_EXPIRES_IN` |
| 6 | Bậc B | `POST /api/auth/logout-all` (auth) — revoke mọi `RefreshToken` của user; nút Profile |
| 7 | Session list UI / rotation / idle | **Không** trong P7 — để production roadmap |
| 8 | Helmet CSP | Giữ `false` |
| 9 | Test | `npm run test:phase7` |

---

## 3. PRODUCTION ROADMAP (sau P7 — khi ra thị trường)

Không code trong Phase 7; ghi để luận văn / sau go-live:

| Hạng mục | Mục tiêu production |
|----------|---------------------|
| Access token | ~15 phút (Admin/Super có thể ngắn hơn) |
| Refresh token | ~30 ngày (7 ngày nếu không Remember me) |
| `user_sessions` | Lưu thiết bị, IP, UA; UI xem / thu hồi từng phiên |
| Refresh rotation | Mỗi refresh → token mới, thu hồi cũ |
| Idle timeout | Theo role (tuỳ chọn) |
| Step-up auth | Xác thực lại trước thao tác nhạy cảm (billing, xóa tòa…) |
| 2FA | Phase 1C / sau |

Nền đã có sau P7: refresh token DB + **logout-all** → dễ gắn session table sau.

---

## 4. LỘ TRÌNH TASK CODE (thứ tự bắt buộc)

```
7.0  WorldFlow chốt                         ✅
  ↓
7.1  Service reset password (hash, TTL 1h)   ✅
  ↓
7.2  API forgot + reset + rate limit + ActivityLog  ✅
  ↓
7.3  UI login: Quên MK? + trang/modal reset  ✅
  ↓
7.4  Bật multi-tab session sync (dashboard.js)  ✅
  ↓
7.5  Bậc B: logout-all + session_version (thu hồi access JWT)  ✅
  ↓
7.6  JWT: comment + .env.example (default 7d)  ✅
  ↓
7.7  Test phase7 (16/16) + cập nhật SaaS.md   ✅
  ↓
7.8  Checklist tay TEST_VERIFY_PHASE7         ✅ PASS 2026-07-13
```

**Một task / một vòng** khi code (theo `SaaS.md` §7.3): audit ngắn → code → test → báo cáo; không gộp cả phase một commit khổng lồ nếu có thể tách.

---

## 5. API

```
POST /api/auth/forgot-password     { email }
POST /api/auth/reset-password      { token, newPassword, confirmPassword }
POST /api/auth/logout-all          Authorization: Bearer …  → revoke all RefreshToken of user
```

Giữ nguyên: `login`, `refresh`, `logout` (1 token).

---

## 6. FILE DỰ KIẾN ĐỤNG

| File | Việc |
|------|------|
| `models/User.js` (hoặc field reset) | `password_reset_token_hash`, `password_reset_expires` |
| `services/passwordReset.js` (mới) | Tạo / verify / clear token |
| `controllers/authController.js` | forgot, reset, logoutAll |
| `routes/authRoutes.js` | Routes + limiter |
| `middlewares/rateLimit.js` | forgotLimiter |
| `models/ActivityLog.js` | Enum đã có PASSWORD_RESET_* — thêm LOGOUT_ALL nếu cần |
| `admin/index.html` / login UI | Link quên MK |
| `admin/...` reset page hoặc modal | Form đặt MK mới |
| `js/dashboard.js` | Uncomment multi-tab sync; nút logout-all |
| `.env.example` | JWT_ACCESS_EXPIRES_IN, AUTH_RESET_TOKEN_IN_RESPONSE |
| `test/integration/phase7Security.test.js` | Integration |

**Không đụng:** Android, WebMapEditor (trừ khi auth shared bắt buộc), Nest, CSP full.

---

## 7. QUY TRÌNH LÀM VIỆC VỚI AI (mỗi lần code)

```
1. git checkout main && git pull                         ✅
2. git checkout -b giai-doan-7-bao-mat                     ✅
3. User: 「code đi」                                      ✅
4. AI code đúng task, không lan                          ✅
5. npm run test:phase7                                   ✅ 16/16
6. Báo cáo file / cách test / rủi ro                     ✅
7. User test tay → commit/PR (khi user yêu cầu)          ✅ tay PASS — chờ commit/PR
8. Cập nhật SaaS.md mục 3 + 5.7 Phase 7                  ✅ (2026-07-13/14)
```

---

## 8. GÓI MVP CHỐT

```
✅ Forgot + Reset password (sandbox)
✅ Rate limit + ActivityLog
✅ Multi-tab dashboard sync
✅ Logout-all + session_version (bậc B — thu hồi mọi phiên JWT)
✅ JWT default 7d + env document
✅ Production roadmap (mục 3 file này)
✅ test:phase7 16/16 + checklist tay PASS
❌ Access 15 phút, session UI, rotation, idle, 2FA, SMTP bắt buộc
```

---

*Phase 7 — PASS 2026-07-13 — chờ commit/PR merge `main`.*
