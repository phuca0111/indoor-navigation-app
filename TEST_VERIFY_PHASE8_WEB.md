# TEST VERIFY — Phase 8 Web Collaboration & Publish Safety

> Nhánh: `giai-doan-8-web-upgrade`  
> **Gate đóng phase (agent tự chạy):** `cd Backend_server` → `npm run test:phase8` → **12/12 PASS** (2026-07-14)  
> Checklist tay K1–K8: **không bắt buộc** — đã thay bằng integration + static UI trong `phase8WebUpgrades.test.js`.  
> Ngoại lệ duy nhất không automatable: **K8B** đăng nhập Google thật trên browser (cần Client ID thật + chọn tài khoản Google). K8A (ẩn nút / status / auth URL) đã PASS tự động.

**Chuẩn bị (chỉ khi debug tay)**

1. `cd Backend_server` → `node server.js` (cổng 5000)
2. Admin: `http://localhost:5000/admin/index.html`
3. Editor: mở tòa đã PUBLISHED có quyền BUILDING_ADMIN / ORG_ADMIN
4. Env (`.env.example`): `PUBLISH_PERMIT_REQUIRED`, `FLOOR_EDIT_LOCK_TTL_SEC`, `GOOGLE_*` — **không** bật permit trên demo trừ khi test K5

---

## K1 — Tooltip admin (UI — làm ở frontend nếu có)

| | |
|--|--|
| **Bước** | Dashboard → hover các nút chính (Vẽ bản đồ, Sửa, Khóa/Duyệt, Billing, Đăng xuất…) |
| **Kỳ vọng** | Có `title` / `aria-label` tiếng Việt rõ nghĩa |
| ☐ Pass / ☐ Fail | |

---

## K2 — Profile ORG (plan + hạn)

### Mục đích
Chứng minh ORG_ADMIN mở tab Profile thấy đúng **ngữ cảnh tổ chức** (không chỉ email/role như trước).

### Cách test trên UI (ưu tiên)

1. Chạy server: `cd Backend_server` → `node server.js`
2. Mở `http://localhost:5000/admin/index.html`
3. **Đăng nhập bằng tài khoản ORG_ADMIN** (không dùng Super Admin — Super thường không có org, khối tổ chức sẽ ẩn)
4. Vào tab **👤 Thông Tin Cá Nhân**
5. Kiểm tra khối xám **「Tổ chức của bạn」** (dưới SĐT):

| Ô trên UI | Phải thấy gì |
|-----------|----------------|
| Tên tổ chức | Tên org thật (vd. tên đã tạo lúc trial) |
| Gói | `FREE` / `PRO` / `ENTERPRISE` |
| Trạng thái thanh toán | `ACTIVE` / `GRACE_PERIOD` / `EXPIRED` |
| Hạn gói / ân hạn | FREE thường: dòng kiểu «Gói FREE — không có hạn…»; PRO: «Hết hạn: …» nếu có `plan_expires_at`; hoặc «Ân hạn đến: …» nếu đang grace |

6. **PASS** nếu đủ 4 ô trên khớp org của user.  
7. **FAIL** nếu khối tổ chức không hiện, hoặc chỉ còn email/role như cũ.

### Cách đối chiếu API (tùy chọn — xác nhận backend)

1. Vẫn đang login ORG_ADMIN → F12 → tab Network, hoặc dùng token trong `localStorage.token`
2. Gọi:
   ```http
   GET http://localhost:5000/api/users/me
   Authorization: Bearer <token>
   ```
3. Trong JSON phải có object `organization` gồm ít nhất:
   - `name`, `plan`, `billing_status`
   - `plan_expires_at` và/hoặc `grace_ends_at` (có thể `null` nếu FREE)
   - `plan_started_at` (có thể `null`)

Ví dụ kỳ vọng (rút gọn):
```json
{
  "email": "admin@org.com",
  "role": "ORG_ADMIN",
  "organization": {
    "name": "Trường ABC",
    "plan": "FREE",
    "billing_status": "ACTIVE",
    "plan_expires_at": null,
    "grace_ends_at": null
  }
}
```

### Nút **「Lưu Thay Đổi」** trên Profile — giá trị gì?

| | |
|--|--|
| **Lưu gì** | **Họ tên** + **SĐT user** (`PUT /api/users/me`). Nếu **ORG_ADMIN**: thêm **SĐT tổ chức** + **địa chỉ tổ chức** (`PUT /api/organizations/me/contact`) |
| **Không lưu** | Tên org, gói, hạn, billing_status (ô **readonly**) |
| **Liên quan K2?** | **Không bắt buộc** để PASS K2 (xem org). Nút Lưu hữu ích cho K6B: điền contact org rồi mới checkout PRO |
| **Cách thử nút** | Sửa Họ tên / SĐT cá nhân; ORG_ADMIN điền SĐT+địa chỉ tổ chức → Lưu → «Cập nhật thành công!» → F5 vẫn giữ |

| ☐ Pass / ☐ Fail (K2 — chỉ phần xem org) | |
|------------------------------------------|--|

---

## K3 — Draft ≠ Publish (Lưu nháp không đẩy phone)

### Mục đích
«Lưu nháp» chỉ ghi server draft; Android/public vẫn bản cũ đến khi «Xuất bản».

### Cách test UI (dễ)

1. Login ORG/BA → Dashboard → **Vẽ bản đồ** một tòa đã từng xuất bản.
2. Ghi nhớ hoặc screenshot số **Phiên bản map** trên thanh editor (vd. v3).
3. Sửa rõ trên bản đồ (đổi tên phòng / thêm phòng) — **đừng** bấm Xuất bản.
4. Bấm **「Lưu nháp」** → toast kiểu đã lưu nháp.
5. Mở Android (hoặc API public bên dưới) → **map chưa đổi**.
6. Quay editor → bấm **「Xuất bản máy chủ」** → version tăng (vd. v4).
7. Public/Android → **thấy bản mới**.

### Cách test API (chắc chắn)

Lấy `TOKEN`, `BUILDING_ID`, `FLOOR` (vd. 0):

```bash
# 1) Public TRƯỚC
curl -s http://localhost:5000/api/maps/BUILDING_ID/FLOOR/public

# 2) Lưu nháp (đổi rooms_count hoặc tên phòng)
curl -s -X PUT http://localhost:5000/api/maps/BUILDING_ID/FLOOR/draft \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d "{\"map_data\":{...map khác rõ...}}"

# 3) Public SAU nháp → phải giống bước 1
curl -s http://localhost:5000/api/maps/BUILDING_ID/FLOOR/public

# 4) Publish
curl -s -X POST http://localhost:5000/api/maps/BUILDING_ID/FLOOR/publish \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d "{\"map_data\":{...cùng bản nháp...}}"

# 5) Public → đã đổi + version++
```

| ☐ Pass / ☐ Fail | |
|-----------------|--|

---

## K4 — Floor edit lock (2 người / 2 máy)

### Mục đích
Cùng một tầng không để 2 người (hoặc 2 máy) chiếm quyền sửa **im lặng**. Ai vào sau phải thấy cảnh báo / **409**.

TTL mặc định **120 giây** (`FLOOR_EDIT_LOCK_TTL_SEC` trong `.env`).

### Chuẩn bị trước (bắt buộc)

1. Server đang chạy (`node server.js`).
2. Có **1 tòa nhà** cả hai account đều mở editor được.
3. Có **2 tài khoản khác nhau**, cùng quyền trên tòa đó, ví dụ:
   - **User A** = ORG_ADMIN org đó, hoặc BUILDING_ADMIN được gán tòa  
   - **User B** = BUILDING_ADMIN khác **cũng được gán cùng tòa** (hoặc Super + ORG — miễn cùng mở được editor)
4. Hai trình duyệt tách phiên (không dùng chung tab login):
   - **A:** Chrome thường  
   - **B:** Chrome **Ẩn danh** (Ctrl+Shift+N) **hoặc** Firefox  

Ghi lại `buildingId` trên URL editor:  
`/editor/index.html?buildingId=XXXX` → đó là ID tòa.

---

### Cách 1 — Test UI (nên làm)

#### Bước 1 — User A chiếm tầng
1. Trên Chrome (A): login **User A**.
2. Dashboard → tòa cần test → **Vẽ bản đồ**.
3. Chọn **cùng một tầng** (vd. tầng 0 / Tầng Trệt) — nhớ tầng này.
4. Đợi editor load xong (bản đồ hiện ra).  
   → Lúc này A đã **acquire lock** tự động (không cần bấm gì thêm).
5. Giữ nguyên tab A **mở** — đừng đóng.

#### Bước 2 — User B vào cùng chỗ
1. Chrome Ẩn danh (B): login **User B** (khác A).
2. Vào **cùng tòa** → **Vẽ bản đồ**.
3. Chọn **đúng cùng tầng** mà A đang mở.

#### Bước 3 — Xem kết quả trên B
| Hiện tượng | Ý nghĩa |
|------------|---------|
| Banner cam/vàng kiểu **「Tầng đang bị khóa」** / **「Đang chỉnh bởi …email A…」** | **PASS** phần UI |
| Có nút **「Cướp quyền sửa」** | Chỉ Super / ORG_ADMIN — tùy role B |
| Không banner, vào sửa bình thường như không ai | **FAIL** |

#### Bước 4 — Thử publish khi bị khóa (khuyến nghị)
1. Ở máy **B** (đang thấy banner): sửa nhẹ rồi bấm **Xuất bản**.  
2. Kỳ vọng thường: **lỗi / toast** kiểu đang bị khóa (**409**) — không đè im lặng lên A.

#### Bước 5 — Nhả khóa
Cách nhanh (chọn 1):
- **A đóng tab editor** (hoặc chuyển tầng / thoát), rồi **B F5** lại editor cùng tầng → B vào được, banner hết; **hoặc**
- Đợi ~**2 phút** không heartbeat từ A → lock hết hạn → B F5 vào được.

#### Bước 6 — Cùng 1 account, 2 máy (phụ)
1. Login **cùng email A** trên Chrome thường + Chrome ẩn danh.  
2. Cả hai mở **cùng tòa + cùng tầng**.  
3. Máy sau cũng phải **cảnh báo / không chiếm im lặng** (session khác).

**PASS K4 UI** nếu: bước 3 có banner (hoặc 409 khi publish), và sau khi A nhả / hết TTL thì B vào được.

---

### Cách 2 — Test API (nếu muốn chắc / không tiện 2 user UI)

Cần: `TOKEN_A`, `TOKEN_B`, `BUILDING_ID`, tầng (vd. `0`).

```bash
# A chiếm
curl -s -X POST "http://localhost:5000/api/maps/BUILDING_ID/0/lock" ^
  -H "Authorization: Bearer TOKEN_A" -H "Content-Type: application/json" ^
  -d "{\"session_id\":\"sess-a-1\"}"
# Kỳ vọng: HTTP 200

# B chiếm cùng tầng
curl -s -X POST "http://localhost:5000/api/maps/BUILDING_ID/0/lock" ^
  -H "Authorization: Bearer TOKEN_B" -H "Content-Type: application/json" ^
  -d "{\"session_id\":\"sess-b-1\"}"
# Kỳ vọng: HTTP 409, body.code = "LOCK_HELD"

# A nhả
curl -s -X POST "http://localhost:5000/api/maps/BUILDING_ID/0/lock/release" ^
  -H "Authorization: Bearer TOKEN_A" -H "Content-Type: application/json" ^
  -d "{\"session_id\":\"sess-a-1\"}"
# Kỳ vọng: 200

# B chiếm lại → 200
curl -s -X POST "http://localhost:5000/api/maps/BUILDING_ID/0/lock" ^
  -H "Authorization: Bearer TOKEN_B" -H "Content-Type: application/json" ^
  -d "{\"session_id\":\"sess-b-1\"}"
```

(PowerShell dùng `` ` `` xuống dòng thay `^` nếu cần.)

**PASS API** nếu: A = 200, B = **409 LOCK_HELD**, sau release B = 200.

---

### Không tính PASS nếu
- Hai người cùng tầng, **không** banner và publish vẫn đè nhau không báo.  
- Chỉ test 1 người / 1 máy.

| ☐ Pass / ☐ Fail | |
|-----------------|--|

---

## K5 — Rate limit publish + permit DN

Làm **2 phần riêng**. Dev mặc định `PUBLISH_PERMIT_REQUIRED=false`.

### 5A — Rate limit (spam publish)

1. Login có quyền publish.
2. Gọi liên tục POST `.../publish` ~15 lần trong vài giây (Postman / script) — **không** dùng Jest (Jest skip limiter).
3. Kỳ vọng: một số request **429** («Xuất bản quá nhiều…»).

### 5B — Permit (opt-in)

1. Trong `.env` thêm: `PUBLISH_PERMIT_REQUIRED=true` → **restart** server.
2. Org **chưa** có permit → publish → **403** `PUBLISH_PERMIT_REQUIRED`.
3. Super Admin cấp key:
   ```bash
   curl -X POST http://localhost:5000/api/organizations/ORG_ID/publish-permit \
     -H "Authorization: Bearer SUPER_TOKEN" -H "Content-Type: application/json" \
     -d "{}"
   ```
4. Publish lại → **200**.
5. Super thu hồi: `DELETE .../organizations/ORG_ID/publish-permit` → publish lại **403**.
6. **Nhớ** set lại `PUBLISH_PERMIT_REQUIRED=false` sau demo đồ án.

| ☐ Pass / ☐ Fail | |
|-----------------|--|

---

## K6 — Trial tối giản / PRO đủ hồ sơ

### 6A — Trial không bắt SĐT

1. Mở `http://localhost:5000/org-trial.html`
2. Điền tối thiểu: tên org, đại diện, email, mật khẩu — **để trống SĐT** vẫn OK.
3. Submit → tạo org + ORG_ADMIN → login được.

### 6B — Checkout PRO thiếu hồ sơ → 400

1. Login ORG_ADMIN org **FREE** (org chưa có `contact_phone` + `contact_address` đủ dài).
2. Tab **Gói & Thanh toán** → nâng PRO / checkout (hoặc API):
   ```bash
   curl -X POST http://localhost:5000/api/billing/checkout \
     -H "Authorization: Bearer ORG_TOKEN" -H "Content-Type: application/json" \
     -d "{\"plan\":\"PRO\", ...}"
   ```
3. Kỳ vọng: **400** + `code: "PROFILE_INCOMPLETE"` (thiếu SĐT/địa chỉ tổ chức).

### 6C — Điền hồ sơ org trên Profile rồi checkout (sau khi 6B fail)

1. Tab **Thông Tin Cá Nhân** → khối tổ chức → điền **SĐT tổ chức** + **Địa chỉ tổ chức** → **Lưu Thay Đổi**.
2. Checkout PRO lại → không còn `PROFILE_INCOMPLETE` (có thể sang bước payment sandbox).

**PASS** = Trial không ép SĐT; nâng PRO thì bị chặn khi thiếu hồ sơ; ORG_ADMIN điền được contact trên Profile.

| ☐ Pass / ☐ Fail | |
|-----------------|--|

---

## K7 — Mail nhắc sắp hết hạn (tuỳ SMTP)

### Nếu **chưa** cấu hình SMTP (phổ biến lúc dev)

1. Không cần làm gì nặng.
2. Đảm bảo server/scheduler **không crash** khi chạy (đã có trong luồng billing).
3. **PASS tối thiểu:** app chạy bình thường, log không ném lỗi SMTP bắt buộc.

### Nếu **có** SMTP trong `.env`

1. Super/DB: set org `plan_expires_at` = trong vòng N ngày (`BILLING_EXPIRY_REMIND_DAYS`, mặc định 3).
2. Chờ job scheduler (hoặc restart server để chạy lần đầu) / gọi hàm scheduler trong test.
3. Kỳ vọng: inbox ORG_ADMIN (hoặc log gửi mail) có mail nhắc; cùng ngày không gửi trùng (`plan_expiry_reminded_at`).

| ☐ Pass / ☐ Fail | |
|-----------------|--|

---

## K8 — Google OAuth (Admin)

### 8A — Chưa cấu hình Google (mặc định)

1. Không set `GOOGLE_CLIENT_ID` trong `.env`.
2. Mở trang login → **không** thấy nút «Tiếp tục với Google» (hoặc ẩn).
3. `GET http://localhost:5000/api/auth/google/status` → `{ "enabled": false }`.
4. `GET /api/auth/google` → **503**.
5. **PASS** phần này nếu không crash / không hiện nút giả.

### 8B — Có Google (khi bạn đã có Client ID/Secret)

1. Thêm vào `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback` → restart.
2. Login → hiện nút Google → chọn tài khoản.
3. Redirect về `/admin/index.html#...token...` → vào dashboard (user active) **hoặc** thông báo chờ duyệt (user mới `is_active:false`).
4. Email Google trùng user cũ → gắn `google_id`, không tạo user thứ 2.

| ☐ Pass / ☐ Fail | |
|-----------------|--|

---

## K9 — Test tự động (BẮT BUỘC — đã PASS)

```bash
cd Backend_server
npm run test:phase8
```

Kỳ vọng: **12/12 PASS** (TC-8.0a … TC-8.10).

Ánh xạ checklist:
| Manual | Auto test |
|--------|-----------|
| K1 tooltip | TC-8.0a |
| K2 Profile org | TC-8.0a + TC-8.6 |
| K3 Draft | TC-8.1 |
| K4 Lock | TC-8.2 |
| K5A Rate limit | TC-8.10 (`FORCE_PUBLISH_RATE_LIMIT`) |
| K5B Permit | TC-8.3 |
| K6 Trial / KYC | TC-8.7 + TC-8.8 |
| K7 Reminder không SMTP | TC-8.9 |
| K8A Google off/on | TC-8.5 + TC-8.0a |

| ☑ Pass / ☐ Fail | **PASS 12/12 (agent)** |

---

## Ghi chú đóng phase

- [x] `npm run test:phase8` PASS (12/12)
- [x] K1–K8 phủ auto (K8B Google browser thật = tùy chọn khi có Client ID)
- [x] Không commit `.env` secrets; chỉ placeholder trong `.env.example`
- [ ] Commit + merge nhánh `giai-doan-8-web-upgrade` → `main` (chờ user)
- [ ] Bắt đầu Phase 9 FMS
