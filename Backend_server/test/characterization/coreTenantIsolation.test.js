const {
  tenantFilter
} = require('../../repositories/coreTenantRepository');
const {
  organizationScope,
  buildingCreateScope
} = require('../../application/coreTenant/coreTenantPolicy');

describe('Phase 3 characterization — tenant isolation', () => {
  test('repository fail closed khi thiếu scope', () => {
    expect(() => tenantFilter()).toThrow('Thiếu tenant scope hợp lệ.');
    expect(() => tenantFilter({ kind: 'ORGANIZATION' }))
      .toThrow('Thiếu tenant scope hợp lệ.');
  });

  test('organization scope luôn tạo tenant filter cụ thể', () => {
    expect(tenantFilter({
      kind: 'ORGANIZATION',
      organizationId: 'org-a'
    })).toEqual({ organization_id: 'org-a' });
  });

  test('personal scope không thể đọc building của organization', () => {
    expect(tenantFilter({
      kind: 'PERSONAL',
      userId: 'user-a'
    })).toEqual({ owner_user_id: 'user-a', organization_id: null });
  });

  test('ORG_ADMIN không thể yêu cầu organization khác', () => {
    expect(() => organizationScope({
      role: 'ORG_ADMIN',
      organization_id: 'org-a'
    }, 'org-b')).toThrow('tổ chức khác');
  });

  test('SUPER_ADMIN tạo building phải chỉ định organization', () => {
    expect(() => buildingCreateScope({
      role: 'SUPER_ADMIN',
      userId: 'super-a'
    })).toThrow('Thiếu organization_id');
  });

  test('BUILDING_ADMIN không được tạo building', () => {
    expect(() => buildingCreateScope({
      role: 'BUILDING_ADMIN',
      userId: 'admin-a'
    }, 'org-a')).toThrow('không được tạo');
  });
});
