function deny(message) {
  throw Object.assign(new Error(message), { status: 403, code: 'FORBIDDEN' });
}

function systemScope(actor) {
  if (actor?.role !== 'SUPER_ADMIN') deny('Chỉ Super Admin được thực hiện thao tác này.');
  return { kind: 'SYSTEM' };
}

function organizationScope(actor, organizationId) {
  if (!actor) deny('Yêu cầu đăng nhập.');
  if (actor.role === 'SUPER_ADMIN') return { kind: 'SYSTEM' };
  if (actor.role !== 'ORG_ADMIN') deny('Bạn không có quyền quản trị tòa nhà.');
  if (!actor.organization_id) deny('Tài khoản chưa được gán tổ chức.');
  if (organizationId && String(organizationId) !== String(actor.organization_id)) {
    deny('Bạn không được thao tác dữ liệu của tổ chức khác.');
  }
  return { kind: 'ORGANIZATION', organizationId: actor.organization_id };
}

function buildingCreateScope(actor, requestedOrganizationId) {
  if (!actor) deny('Yêu cầu đăng nhập.');
  if (actor.role === 'BUILDING_ADMIN') {
    deny('Building Admin không được tạo tòa nhà mới.');
  }
  if (actor.role === 'REGISTERED_USER') {
    return { kind: 'PERSONAL', userId: actor.userId };
  }
  if (actor.role === 'SUPER_ADMIN') {
    if (!requestedOrganizationId) {
      throw Object.assign(
        new Error('Thiếu organization_id. Super Admin phải chỉ định organization khi tạo building.'),
        { status: 400, code: 'ORGANIZATION_REQUIRED' }
      );
    }
    return { kind: 'ORGANIZATION', organizationId: requestedOrganizationId };
  }
  return organizationScope(actor, requestedOrganizationId);
}

module.exports = {
  systemScope,
  organizationScope,
  buildingCreateScope
};
