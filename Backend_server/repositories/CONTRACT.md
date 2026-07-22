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

## Ngoại lệ có kiểm soát

Migration, backfill, repair, index maintenance, verify và backup/restore có thể dùng Persistence Adapter chuyên biệt thay vì Repository nghiệp vụ. Các tác vụ này phải có safe-target guard, idempotency, logging và dry-run khi phù hợp.
