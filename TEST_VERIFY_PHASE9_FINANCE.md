# TEST VERIFY — Phase 9 Finance Sóng 1

> Nhánh: `giai-doan-9-finance`  
> Gate: `cd Backend_server` → `npm run test:phase9`

## Phạm vi Sóng 1
- **9.1** Finance Dashboard KPI (thu hôm nay/tháng/năm, profit, org counts)
- **9.2** Org billing list + lọc + link tab Gói & TT
- **9.6** Expense CRUD + Profit = Revenue − Expense
- **F8** ORG_ADMIN → 403

## Auto
```bash
cd Backend_server
npm run test:phase9
```

| ☐ Pass / ☐ Fail | |

## UI (Super)
1. Login Super → tab **💰 Thu – Chi**
2. Thấy KPI thu/chi/lãi
3. Thêm chi phí Render → Lãi giảm
4. Lọc org FREE/EXPIRED → thấy list
5. Login ORG → không thấy tab Thu – Chi; API 403

Sóng 2–3 (Plans catalog ERP, Reports, Settings): chưa làm — xem WorldFlow P9.
