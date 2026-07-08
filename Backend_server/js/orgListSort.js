/**
 * Phase 4.2d — Sắp xếp danh sách tổ chức (dùng chung browser + Jest)
 */

const PLAN_ORDER = { FREE: 0, PRO: 1, ENTERPRISE: 2 };

function getOrgCreatedTime(org) {
  const raw = org.createdAt || org.created_at;
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function compareOrganizations(a, b, key, dir) {
  const mul = dir === 'desc' ? -1 : 1;
  let cmp = 0;
  switch (key) {
    case 'name':
      cmp = String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' });
      break;
    case 'slug':
      cmp = String(a.slug || '').localeCompare(String(b.slug || ''), 'vi', { sensitivity: 'base' });
      break;
    case 'plan':
      cmp = (PLAN_ORDER[a.plan || 'FREE'] ?? 0) - (PLAN_ORDER[b.plan || 'FREE'] ?? 0);
      break;
    case 'status':
      cmp = (a.is_active === false ? 0 : 1) - (b.is_active === false ? 0 : 1);
      break;
    case 'buildings':
      cmp = (Number(a.building_count) || 0) - (Number(b.building_count) || 0);
      break;
    case 'users':
      cmp = (Number(a.user_count) || 0) - (Number(b.user_count) || 0);
      break;
    case 'created':
      cmp = getOrgCreatedTime(a) - getOrgCreatedTime(b);
      break;
    default:
      cmp = String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' });
  }
  return cmp * mul;
}

function sortOrganizations(list, key, dir) {
  const sortKey = key || 'name';
  const sortDir = dir === 'desc' ? 'desc' : 'asc';
  return list.slice().sort((a, b) => compareOrganizations(a, b, sortKey, sortDir));
}

const orgListSortApi = { sortOrganizations, compareOrganizations, getOrgCreatedTime, PLAN_ORDER };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = orgListSortApi;
}
if (typeof window !== 'undefined') {
  window.OrgListSort = orgListSortApi;
}
