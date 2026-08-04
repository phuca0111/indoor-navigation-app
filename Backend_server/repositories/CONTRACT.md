# Repository Contract — Target Architecture v2.x

Tài liệu này là hợp đồng bắt buộc cho Repository mới và module đã migrate.

## Command Repository

- Là persistence boundary của command side.
- Chỉ thư mục `repositories/` hoặc `modules/*/infrastructure/` được import Mongoose Model sau khi module đã migrate.
- Dùng tên hàm theo nghiệp vụ; không tạo generic `find(filter)`, `update(filter, data)` hoặc `delete(filter)`.
- Luôn nhận tenant/building scope rõ ràng đối với dữ liệu có phạm vi.
- Tenant repository phải fail closed nếu thiếu scope.
- System scope phải được truyền tường minh; không suy diễn Super Admin từ scope rỗng.
- Không kiểm tra role hoặc authorization. Permission thuộc Application Service/Policy.
- Không tự mở transaction. Nhận `session` từ Application Service/Unit of Work.
- Không trả `mongoose.Query`, Mongoose Model hoặc Document.
- Trả Domain Object hoặc DTO đã materialize.

Ví dụ:

```javascript
async function findCurrentActive(organizationId, scope, { session } = {}) {
  const row = await Subscription.findOne({
    organization_id: scope.requireOrganization(organizationId),
    status: 'ACTIVE'
  })
    .session(session || null)
    .lean();

  return row ? mapSubscriptionDto(row) : null;
}
```

## Read Repository

- Dùng cho Dashboard, Analytics, Search và báo cáo khi nhu cầu đọc khác command side.
- Vẫn bắt buộc Permission Policy và tenant/building scope trước khi truy vấn.
- Có thể sử dụng aggregation, projection hoặc read model.
- Cache chỉ được thêm khi có benchmark và chiến lược invalidation.
- Không trả Mongoose Query/Document cho Query Service.

## Unit of Work

Application Service là lớp mở transaction:

```javascript
const { withMongoUnitOfWork } = require('../shared/persistence/mongoUnitOfWork');

return withMongoUnitOfWork(async (session) => {
  const subscription = await subscriptionRepository.save(input, { session });
  await ledgerRepository.append(entries, { session });
  await auditRepository.insert(audit, { session });
  await outboxRepository.insert(event, { session });
  return subscription;
});
```

Repository không commit, rollback hoặc `endSession`.

## Phạm vi dữ liệu (Data domain)

Nguồn máy đọc được: `shared/persistence/dataDomainRegistry.js`.

| Scope | Ý nghĩa | Ví dụ |
|-------|---------|--------|
| `ORGANIZATION` | Bắt buộc `organization_id`; thiếu scope → fail | Subscription, Incident, Member |
| `PERSONAL_OR_ORG` | Org **hoặc** `owner_user_id` (workspace cá nhân) | Building |
| `BUILDING_SCOPED` | Scope qua `building_id` (tenant gián tiếp) | Floor, MapData, Draft |
| `GLOBAL_REGISTRY` | Catalog toàn cục; ownership optional | Place, PlaceProposal |
| `PLATFORM` | Hệ thống / Super Admin | Plan, CMS, Organization master |
| `ACTOR_SCOPED` | Gắn user/device | RefreshToken, PersonalPayment |

**Quy tắc:**

1. Module mới **không** được query Place như “chỉ org của tôi” trừ khi lọc rõ `owner_org_id` / claim.
2. Building luôn đi qua `coreTenantRepository.tenantFilter` (SYSTEM / ORGANIZATION / PERSONAL).
3. Không suy diễn tenant từ document thiếu field — fail closed.

## Soft-delete / lifecycle

Helper: `shared/persistence/softActive.js`.

| Nhóm | Convention |
|------|------------|
| Tenant core (User, Building, Organization, Plan) | `is_active !== false` = active; vô hiệu = `is_active: false` |
| Place | `status` (`ACTIVE` / `LOCKED` / `MERGED`…) — **không** dùng `is_active` |
| CMS | `deleted_at` / status DELETED |
| HazardZone | field `active` boolean |

**Không** xóa cứng document nghiệp vụ trừ script maintenance có `migration-safety` guard.

## An toàn dữ liệu khi siết kiến trúc

| Việc làm | Ảnh hưởng document MongoDB |
|----------|----------------------------|
| Cập nhật CONTRACT / registry / softActive helper | **Không** — chỉ code |
| Siết repository fail-closed (thiếu scope → 403) | **Không** ghi DB; có thể **đổi hành vi API** nếu trước đó query lỏng |
| Backfill field thiếu (`organization_id`, …) | **Có** — chỉ **additive** (thêm/điền field), chạy trên URI test/staging trước |
| Đổi Place sang org-scoped bắt buộc | **Có rủi ro** — **chưa làm** trong Phase 1 |

Phase 1 hiện tại: registry + helper + `scripts/verify-data-domain-contract.js` (read-only). **Không migrate / không ghi đè dữ liệu production.**

## Ngoại lệ có kiểm soát

Migration, backfill, repair, index maintenance, verify và backup/restore có thể dùng Persistence Adapter chuyên biệt thay vì Repository nghiệp vụ. Các tác vụ này phải có safe-target guard, idempotency, logging và dry-run khi phù hợp.
