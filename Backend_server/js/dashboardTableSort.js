/**
 * Phase 4.5 — Sắp xếp bảng Tòa nhà & Tài khoản (browser + Jest)
 */

const BUILDING_STATUS_ORDER = { DRAFT: 0, PUBLISHED: 1 };
const USER_ROLE_ORDER = { BUILDING_ADMIN: 0, ORG_ADMIN: 1, SUPER_ADMIN: 2 };

function getTimestamp(obj, fields) {
  for (let i = 0; i < fields.length; i++) {
    const raw = obj[fields[i]];
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

function orgLabelFor(id, orgLabelFn) {
  if (typeof orgLabelFn === 'function') return orgLabelFn(id) || '';
  return id != null ? String(id) : '';
}

function compareBuildings(a, b, key, dir, orgLabelFn) {
  const mul = dir === 'desc' ? -1 : 1;
  let cmp = 0;
  switch (key) {
    case 'address':
      cmp = String(a.address || '').localeCompare(String(b.address || ''), 'vi', { sensitivity: 'base' });
      break;
    case 'floors':
      cmp = (Number(a.total_floors) || 0) - (Number(b.total_floors) || 0);
      break;
    case 'status':
      cmp = (BUILDING_STATUS_ORDER[a.status] ?? 99) - (BUILDING_STATUS_ORDER[b.status] ?? 99);
      break;
    case 'organization':
      cmp = orgLabelFor(a.organization_id, orgLabelFn)
        .localeCompare(orgLabelFor(b.organization_id, orgLabelFn), 'vi', { sensitivity: 'base' });
      break;
    case 'updated':
      cmp = getTimestamp(a, ['updatedAt', 'updated_at']) - getTimestamp(b, ['updatedAt', 'updated_at']);
      break;
    default:
      cmp = String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' });
  }
  return cmp * mul;
}

function compareUsers(a, b, key, dir, orgLabelFn) {
  const mul = dir === 'desc' ? -1 : 1;
  let cmp = 0;
  switch (key) {
    case 'name':
      cmp = String(a.full_name || a.name || '').localeCompare(String(b.full_name || b.name || ''), 'vi', { sensitivity: 'base' });
      break;
    case 'phone':
      cmp = String(a.phone || '').localeCompare(String(b.phone || ''), 'vi', { sensitivity: 'base' });
      break;
    case 'role':
      cmp = (USER_ROLE_ORDER[a.role] ?? 0) - (USER_ROLE_ORDER[b.role] ?? 0);
      break;
    case 'status':
      cmp = (a.is_active === false ? 0 : 1) - (b.is_active === false ? 0 : 1);
      break;
    case 'organization':
      cmp = orgLabelFor(a.organization_id, orgLabelFn)
        .localeCompare(orgLabelFor(b.organization_id, orgLabelFn), 'vi', { sensitivity: 'base' });
      break;
    case 'created':
      cmp = getTimestamp(a, ['createdAt', 'created_at']) - getTimestamp(b, ['createdAt', 'created_at']);
      break;
    default:
      cmp = String(a.email || '').localeCompare(String(b.email || ''), 'vi', { sensitivity: 'base' });
  }
  return cmp * mul;
}

function sortBuildings(list, key, dir, orgLabelFn) {
  const sortKey = key || 'name';
  const sortDir = dir === 'desc' ? 'desc' : 'asc';
  return list.slice().sort((a, b) => compareBuildings(a, b, sortKey, sortDir, orgLabelFn));
}

function sortUsers(list, key, dir, orgLabelFn) {
  const sortKey = key || 'email';
  const sortDir = dir === 'desc' ? 'desc' : 'asc';
  return list.slice().sort((a, b) => compareUsers(a, b, sortKey, sortDir, orgLabelFn));
}

const dashboardTableSortApi = {
  sortBuildings,
  sortUsers,
  compareBuildings,
  compareUsers,
  BUILDING_STATUS_ORDER,
  USER_ROLE_ORDER
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = dashboardTableSortApi;
}
if (typeof window !== 'undefined') {
  window.DashboardTableSort = dashboardTableSortApi;
}
