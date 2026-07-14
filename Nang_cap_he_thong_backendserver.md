# NÂNG CẤP HỆ THỐNG (`Backend_server` + Admin + Editor)

> **File master:** mọi việc **sẽ làm tiếp theo** sau Phase 7 (đã chốt trên `main`).  
> **Ngày:** 2026-07-14 · **Trạng thái:** 🔵 Đề xuất — chờ user OK rồi mới code  
> **Mô hình SaaS giữ nguyên:** End User miễn phí → Organization trả phí → Super Admin quản lý toàn sàn  

Chi tiết từng phase (DoD / test / file code): xem bảng liên kết cuối file. File này = **bản tóm đủ hạng mục**, không thay WorldFlow khi đang code từng task.

---

## 0. ĐÃ XONG (không làm lại)

| Phase | Nội dung | Trạng thái |
|-------|----------|------------|
| 1A–2 | Auth JWT, Org, Soft Delete, Self-service trial | ✅ |
| 3–4 | Admin dashboard, MapVersion, analytics nền | ✅ |
| 5 | Billing: Subscription, Invoice, quota, grace 7 ngày, VNPay + **TPTP Sandbox** | ✅ |
| 6 | Analytics Super / Org | ✅ |
| 7 | Forgot/reset password, logout-all (`session_version`), SMTP | ✅ |
| Floor | Autosave theo tầng + `?floor=` (fix kèm P7) | ✅ |

**Lõi billing đã có — P9 không xây lại từ đầu:**  
`Organization → Subscription → Invoice → Payment (TPTP/VNPay) → Active / Grace / Expired`

---

## 1. VERSION TIẾP THEO — TỔNG QUAN

```
Version tiếp theo (sau P7)
│
├── Trụ A — Phase 8: Web Collaboration & Publish Safety
│     (Backend draft/lock/permit + Admin UX + Editor)
│
└── Trụ B — Phase 9: Financial Management System (FMS / Thu–Chi)
      (Backend finance APIs + Admin Finance + nâng Billing)
```

### Thứ tự khuyến nghị

```
P8: 8.0 → 8.1 → 8.2 → 8.3 → 8.4 → 8.5 → 8.6 Google OAuth → 8.7 (test)
         ↓
P9: 9.0 → Sóng 1 (9.1 + 9.2 MVP + 9.6)
       → Sóng 2 (9.3 + 9.4 + 9.5)
       → Sóng 3 (9.7 + 9.8)
```

| Nhánh git | Việc |
|-----------|------|
| `giai-doan-8-web-upgrade` | Phase 8 |
| `giai-doan-9-finance` | Phase 9 (sau merge P8, hoặc máy 2 song song nhánh khác) |

**Không thuộc Version này (ưu tiên thấp / sau):** Phase 1C avatar · 2FA · Notification center · OT/realtime collab đầy đủ · WebMapEditor V4 rewrite · Dimension WIP (trừ khi bạn yêu cầu gộp).

---

## 2. PHASE 8 — WEB & PUBLISH SAFETY

**Why:** Nháp ≠ publish; hai người cùng tầng không đè im lặng; chống spam publish / key hợp đồng DN; Profile org rõ; ĐK trial nhẹ.

### 2.1 Việc sẽ làm (checklist)

| Task | Hạng mục | Backend | Frontend |
|------|----------|---------|----------|
| **8.1** | Tooltip admin + Profile ORG (tên org, plan, hạn/grace, gợi ý quota) | API profile/org summary nếu thiếu | Admin dashboard + Profile |
| **8.2** | **Lưu nháp server** ≠ **Xuất bản** (Android chỉ bản published) | `FloorDraft` / draft trên Floor; API save draft / publish | Editor: 2 nút Lưu nháp / Xuất bản |
| **8.3** | Floor edit lock `(buildingId, floor)` + TTL + heartbeat | API acquire / heartbeat / release; 409 conflict | Banner cảnh báo / hỏi cướp quyền |
| **8.4** | Rate limit publish + permit key DN (opt-in env) | `publishLimiter`; `publish_permit_key` / bảng permit | Super cấp/thu hồi key; toast 429/403 |
| **8.5** | ĐK org trial tối giản; PRO checkout bắt buộc hồ sơ; (tuỳ) mail nhắc hết hạn | Validate register/checkout; job nhắc SMTP | Form trial ngắn |
| **8.6** | **Đăng nhập / đăng ký bằng tài khoản Google** (Admin web) | OAuth Google; `google_id` trên User; link email đã có | Nút «Tiếp tục với Google» trên login + register / trial |
| **8.7** | Đóng phase | `npm run test:phase8` | `TEST_VERIFY_PHASE8_WEB.md` + SaaS §3 |

### 2.2 Kết quả Done (K1–K9)

- **K1** Tooltip tiếng Việt nút admin chính  
- **K2** Profile ORG đủ org + plan + hạn  
- **K3** Draft không đổi map public; Publish mới đổi  
- **K4** Hai user/hai máy cùng tầng → cảnh báo/409, không đè im lặng  
- **K5** Spam publish → 429; thiếu permit khi bật env → 403  
- **K6** Trial field tối thiểu; PRO thiếu hồ sơ → 400  
- **K7** (Tuỳ) Mail nhắc sắp hết hạn qua SMTP P7  
- **K8** Đăng nhập / đăng ký (hoặc liên kết) bằng Google → nhận JWT như login thường  
- **K9** test + checklist PASS  

### 2.3 Không làm trong P8

- Collab realtime OT/CRDT  
- Log mọi stroke vẽ lên Mongo  
- Tách app Analytics/Finance riêng  
- Avatar / 2FA (vẫn 1C)  
- Google Sign-In trên **Android chỉ đường** (End User vẫn anonymous)  

### 2.4 KEEP (đã đủ — P8 không đụng)

Lịch sử MapVersion ~50/tầng · RBAC `buildingId` URL · Khóa/mở user · Scheduler hết hạn gói + grace  

---

## 3. PHASE 9 — FINANCIAL MANAGEMENT SYSTEM (FMS)

**Why:** Super phải thấy **tiền vào – tiền ra – lãi**, quản lý gói/hóa đơn/thanh toán chuyên nghiệp kiểu SaaS (Stripe-like), **thu gọn** so với Odoo/SAP — không làm kế toán ERP đầy đủ trong luận văn.

### 3.1 Workflow tổng thể (nghiệp vụ)

```
SUPER ADMIN
  → Quản lý Pricing Plans
  → (Org chọn gói / Super thao tác)
  → Tạo Invoice Subscription
  → Theo dõi Payment
       ├─ Thành công → Gia hạn Org → Ghi nhận Revenue → Dashboard → Báo cáo
       └─ Thất bại   → Cảnh báo / khóa sau ân hạn (đã có grace Phase 5)

ORGANIZATION ADMIN
  → Chọn gói → Invoice → Thanh toán (TPTP/VNPay…)
       ├─ OK  → Subscription Active → Payment + Revenue cập nhật Dashboard
       └─ Fail → Pending / Retry
  → Gia hạn / Nâng cấp → Invoice mới
```

### 3.2 Kiến trúc đích — 12 module FMS (tầm nhìn đầy đủ)

Menu Super (đích):

```
Finance
├── Dashboard          (9.1)
├── Revenue            (view từ Invoice/Payment PAID — không sổ trùng)
├── Expenses           (9.6)
├── Subscriptions      (9.3 + nền P5)
├── Invoices           (9.4)
├── Payments           (9.5)
├── Refunds            (giai đoạn 3 thương mại)
├── Reports            (9.7)
├── Pricing Plans      (9.3 / Pricing Mgmt)
├── Organization Billing — phía Super: danh sách khách (9.2)
└── Audit Logs         (9.7+/giai đoạn 2)
```

**Organization Billing (phía ORG_ADMIN):** trang riêng của org — Subscription / Invoices / Payments / Renew / History (nền Phase 5 tab Gói & TT; P9 bổ sung/làm rõ). **Không** cho ORG thấy revenue/expense toàn sàn.

### 3.3 Chi tiết từng module sẽ làm

| # | Module | Nội dung chính | Task | Sóng |
|---|--------|----------------|------|------|
| 1 | **Dashboard** | KPI: DT hôm nay/tháng/năm, tổng org, active/expired, invoice pending, chi phí, lợi nhuận; chart; top khách; cash flow nhẹ | **9.1** | **1** |
| 2 | **Revenue (Thu)** | Nguồn: Subscription, gia hạn, nâng cấp, TT thủ công… Field giao dịch từ Invoice+Payment (ID, org, plan, amount, discount, VAT, method, status, paid_at, ref). Workflow: Đăng ký → Invoice → Pay → Paid → Sub Active → Revenue+1 | View trong **9.1** (+ sổ Payment **9.5**) | 1–2 |
| 3 | **Expense (Chi)** | Server, Atlas, Render, Domain, CF, Email, SMS, AI, Marketing… CRUD: category, supplier, amount, date, note, (tuỳ) attachment. **MVP:** tạo → Paid ngay (không workflow duyệt) | **9.6** | **1** |
| 4 | **Subscription** | Plan, start/expire, renew, status, payment history — **đã có lõi P5**; P9 làm UI/API rõ + gắn Dashboard | **9.3** + nền P5 | 2 |
| 5 | **Invoice** | Status: Draft / Pending / Paid / Cancelled / Refunded / Expired. Field: số HĐ, org, items, tax, discount, subtotal, total | **9.4** | 2 |
| 6 | **Payment** | VNPay, TPTP, Bank, Manual… Transaction ID, gateway, status, amount, fee, paid time. Workflow: Invoice → Gateway → Callback → Verify → Paid | **9.5** | 2 |
| 7 | **Refund** | Request → Approve → Refund → cập nhật Invoice/Revenue | Roadmap **giai đoạn 3** | Sau |
| 8 | **Accounting (mỏng)** | Revenue + Expense → Profit (+ Tax/Cash Flow nhẹ). **Không** ERP kế toán đầy đủ | Gắn **9.1 + 9.6** | **1** |
| 9 | **Reports** | DT theo tháng/gói/org; chi theo category; profit; top customers; invoice/payment report. Export Excel/CSV/PDF | **9.7** | 3 |
| 10 | **Pricing Management** | Free / Starter / Pro / Enterprise…: price, duration, users, buildings, storage, feature, status | **9.3** | 2 |
| 11 | **Org Billing** | Super: list khách + thao tác; Org Admin: portal billing của mình | **9.2** | **1 MVP** → đủ ở sóng 2 |
| 12 | **Audit Log tài chính** | Invoice created/updated, payment success/fail, refund, plan changed, manual adjustment | Sóng 2–3 / gắn ActivityLog | 2–3 |

### 3.4 Ba giai đoạn FMS (chuẩn chốt — khớp đề xuất chuyên nghiệp)

| Giai đoạn | Phạm vi | Khi nào |
|-----------|---------|---------|
| **GĐ1 — MVP (đóng Version / Sóng 1)** | Dashboard, Pricing/Subscription nền, Invoice+Payment (đọc/siêu chỉnh trên P5), **Revenue view**, **Expense**, Profit | Làm trong Version tiếp theo sau P8 |
| **GĐ2 — Sóng 2–3** | Reports, Cash Flow rõ, Audit log tài chính, catalog Plans đầy, Invoice PDF/email tối thiểu, Payment ledger | Tiếp tục trong P9 |
| **GĐ3 — Thương mại hóa** | Refund workflow, VAT/Tax đầy đủ, nhiều cổng (Momo/Stripe…), đối soát NH, hóa đơn điện tử, Expense duyệt nhiều bước | Sau luận văn / khi go-live thật |

### 3.5 Task code P9 (map WorldFlow)

| Task | Việc | Sóng |
|------|------|------|
| **9.0** | Chốt phạm vi + nhánh `giai-doan-9-finance` | — |
| **9.1** | Finance Dashboard API + UI Super | 1 |
| **9.2** | Org Billing list (Super) + lọc status / sắp hết hạn | 1 MVP |
| **9.3** | Plans catalog CRUD / mở rộng tier | 2 |
| **9.4** | Invoice Management mở rộng (+ PDF/email tối thiểu) | 2 |
| **9.5** | Payment ledger thống nhất | 2 |
| **9.6** | Expense CRUD + Profit = Revenue − Expense | 1 |
| **9.7** | Reports + export CSV/Excel (PDF nếu kịp) | 3 |
| **9.8** | Settings (currency, VAT, prefix…) + (tuỳ) role FINANCE | 3 |
| **9.9** | `test:phase9` + checklist + SaaS.md | Cuối mỗi sóng / cuối phase |

### 3.6 Kết quả Done Sóng 1 (bắt buộc đóng trước)

| Mã | Kết quả |
|----|---------|
| **F1–F5** | Revenue today/month/year + pending + expired + chart + breakdown gói |
| **F2+** | List org billing lọc được |
| **F6–F7** | Expense CRUD + Profit |
| **F8** | ORG_ADMIN **403 / ẩn** Finance sàn |
| **F9** | Test + checklist |

### 3.7 Phân quyền

| Role | Quyền Finance |
|------|----------------|
| **SUPER_ADMIN** | Toàn bộ Dashboard, Revenue, Expense, mọi org |
| **ORG_ADMIN** | Chỉ Subscription / Invoice / Payment / Renew **của org** |
| **BUILDING_ADMIN** | Không Finance (trừ đọc hạn chế sau này — không làm sớm) |
| **FINANCE** (tuỳ GĐ2–3) | Invoice/Payment/Expense/Reports — không Settings nguy hiểm |

### 3.8 Database sẽ đụng

| Đã có (tái sử dụng) | Thêm / mở rộng |
|---------------------|----------------|
| Organization, Subscription, Invoice, billing events, PlanHistory | **Expense** (+ category) — Sóng 1 |
| TPTP / VNPay payment flow | Payment ledger thống nhất — Sóng 2 |
| ActivityLog | Event tài chính rõ hơn — GĐ2 |
| — | tax_settings, invoice_items, currencies — GĐ2–3 |

---

## 4. BACKEND_SERVER — FILE / VÙNG DỰ KIẾN ĐỤNG

### Phase 8

> **Trạng thái (2026-07-14):** code trên `giai-doan-8-web-upgrade` · `npm run test:phase8` **12/12 PASS** · sẵn sàng commit/merge → Phase 9.

| Vùng | Việc |
|------|------|
| `routes` / `controllers` map & floor | Draft save, publish từ draft |
| Model Floor / `FloorDraft` | Snapshot nháp |
| Lock service + routes | acquire / heartbeat / release |
| Middleware rate limit publish | 429 |
| Organization permit field/service | 403 khi thiếu key |
| Auth/org register + checkout validate | Form trial / PRO KYC |
| Google OAuth (8.6) | `GET/POST` callback; `User.google_id`; login/register UI |
| `billingScheduler` + `mailService` | Mail nhắc hết hạn (tuỳ) |

### Phase 9

> **Trạng thái (2026-07-14):** nhánh `giai-doan-9-finance` · Sóng 1 (Dashboard + Org list + Expense) · `npm run test:phase9` **4/4 PASS**.

| Vùng | Việc |
|------|------|
| `services/financeService.js` (mới) | Aggregate revenue, profit, timeseries |
| `models/Expense.js` (mới) | Chi phí |
| `controllers/financeController.js` + routes | API Super-only |
| Mở rộng Invoice / Payment / Plan | Sóng 2 |
| `admin/dashboard` + JS | Tab **Thu – Chi** / menu tài chính |
| Middleware RBAC | Super vs Org tách rõ |

**Không commit:** `.env`, secret SMTP/VNPAY, dump DB.

---

## 5. ROADMAP SAU VERSION NÀY (ghi nhận — chưa code)

| Hạng mục | Ghi chú |
|----------|---------|
| Phase **1C** | Avatar, 2FA, Notification center |
| Collab realtime | OT / CRDT / presence đầy đủ |
| Server stroke audit | Log mọi thao tác vẽ |
| FMS GĐ3 | Refund approve, e-invoice, multi-gateway thương mại, bank reconcile |
| WebMapEditor V4 | Rewrite lớn — ngoài scope |
| Dimension / WIP local | Chỉ merge khi user yêu cầu riêng |

---

## 6. ĐỊNH NGHĨA XONG VERSION (Done cả hai trụ)

| Mã | Ý nghĩa |
|----|---------|
| **V1** | Phase 8: K1–K9 PASS (gồm Google Sign-In) |
| **V2** | Super biết thu hôm nay / tháng / năm |
| **V3** | Liệt kê org đã trả / sắp hết hạn / invoice pending |
| **V4** | Nhập Expense → thấy Profit |
| **V5** | ORG không thấy revenue/expense sàn |
| **V6** | `test:phase8` + `test:phase9` + checklist tay |

---

## 7. LIÊN KẾT FILE CHI TIẾT

| File | Vai trò |
|------|---------|
| `Docs/NANG_CAP_VERSION_TIEP_THEO.md` | Version cha P8+P9 |
| `Docs/NANG_CAP_WEB_SAAS_P8.md` | Backlog + DoD Phase 8 |
| `Docs/WORLDFLOW_PHASE8_WEB_UPGRADES.md` | Quy trình task 8.0–8.7 (gồm Google OAuth) |
| `Docs/NANG_CAP_FINANCE_FMS.md` | Backlog FMS |
| `Docs/WORLDFLOW_PHASE9_FINANCE.md` | Quy trình task 9.1–9.8 |
| `SaaS.md` §3 | Vị trí roadmap sản phẩm |
| `Docs/DEBUG_PROMPT.md` | Khi debug lỗi |

---

## 8. CÂU CHỐT CHO USER

- **「OK Version tiếp theo」** — chốt làm P8 rồi P9 (FMS GĐ1 = Sóng 1 trước; GĐ2–3 tiếp tục)  
- **「OK FMS theo 3 giai đoạn」** — chốt chuẩn mục §3.4  
- **「OK full FMS」** / **「OK 9.1–9.8」** — làm lần lượt cả 3 sóng P9  
- **「OK P8 trước」** — chỉ mở code Phase 8  
- **「Sửa: …」** — chỉnh danh sách trong file này trước khi code  

---

*Master nâng cấp hệ thống — 2026-07-14 — nguồn tổng hợp từ Version tiếp theo + P8 + P9 + đề xuất FMS 12 module / 3 giai đoạn.*
