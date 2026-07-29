/**
 * Phân loại phạm vi dữ liệu (bounded context) — hợp đồng kiến trúc.
 * Dùng cho verify script + tài liệu; không tự migrate DB.
 *
 * scope:
 * - ORGANIZATION — bắt buộc organization_id (fail-closed khi query)
 * - PERSONAL_OR_ORG — Building: org_id hoặc owner_user_id
 * - GLOBAL_REGISTRY — catalog toàn cục (Place…); ownership qua field riêng
 * - BUILDING_SCOPED — scope qua building_id (Floor, MapData…)
 * - PLATFORM — hệ thống / Super Admin (Plan catalog, CMS…)
 * - ACTOR_SCOPED — gắn user thực hiện / thiết bị
 */

const DATA_DOMAINS = {
  identity: {
    label: 'Identity & tenant',
    models: {
      User: { scope: 'ORGANIZATION', soft: 'is_active', notes: 'organization_id null = end-user/personal' },
      Organization: { scope: 'PLATFORM', soft: 'is_active' },
      OrganizationMember: { scope: 'ORGANIZATION', soft: 'status' },
      OrganizationInvite: { scope: 'ORGANIZATION', soft: null },
      OrganizationJoinRequest: { scope: 'ORGANIZATION', soft: null },
      Department: { scope: 'ORGANIZATION', soft: null },
      RefreshToken: { scope: 'ACTOR_SCOPED', soft: null },
      IdentityChallenge: { scope: 'ACTOR_SCOPED', soft: null }
    }
  },
  coreMap: {
    label: 'Tòa & bản đồ',
    models: {
      Building: { scope: 'PERSONAL_OR_ORG', soft: 'is_active' },
      Floor: { scope: 'BUILDING_SCOPED', soft: null },
      MapData: { scope: 'BUILDING_SCOPED', soft: null },
      MapVersion: { scope: 'BUILDING_SCOPED', soft: null },
      Draft: { scope: 'BUILDING_SCOPED', soft: null },
      FloorEditLock: { scope: 'BUILDING_SCOPED', soft: null },
      PublishJob: { scope: 'BUILDING_SCOPED', soft: null },
      IndoorWorkspace: { scope: 'ACTOR_SCOPED', soft: null }
    }
  },
  places: {
    label: 'Place registry (global) & moderation',
    models: {
      Place: { scope: 'GLOBAL_REGISTRY', soft: 'status', notes: 'owner_org_id optional; LOCKED/MERGED ≠ soft is_active' },
      PlaceProposal: { scope: 'GLOBAL_REGISTRY', soft: null },
      PlaceOwnershipRequest: { scope: 'GLOBAL_REGISTRY', soft: null },
      PlaceMergeRequest: { scope: 'GLOBAL_REGISTRY', soft: null },
      MapContribution: { scope: 'GLOBAL_REGISTRY', soft: null },
      MapModerationReport: { scope: 'GLOBAL_REGISTRY', soft: null },
      MapReviewRequest: { scope: 'BUILDING_SCOPED', soft: null }
    }
  },
  billing: {
    label: 'Billing & finance',
    models: {
      Plan: { scope: 'PLATFORM', soft: 'is_active' },
      Subscription: { scope: 'ORGANIZATION', soft: null },
      Invoice: { scope: 'ORGANIZATION', soft: null },
      Payment: { scope: 'ORGANIZATION', soft: null },
      PersonalPayment: { scope: 'ACTOR_SCOPED', soft: null },
      Refund: { scope: 'ORGANIZATION', soft: null }
    }
  },
  emergency: {
    label: 'Emergency',
    models: {
      Incident: { scope: 'ORGANIZATION', soft: null },
      HazardZone: { scope: 'ORGANIZATION', soft: 'active' },
      EmergencyBroadcast: { scope: 'ORGANIZATION', soft: null },
      EmergencyLocation: { scope: 'ORGANIZATION', soft: null },
      EmergencyPolicy: { scope: 'ORGANIZATION', soft: null },
      SeismicShakeReport: { scope: 'ORGANIZATION', soft: null }
    }
  },
  cms: {
    label: 'Website CMS',
    models: {
      CmsArticle: { scope: 'PLATFORM', soft: 'deleted_at' },
      CmsRevision: { scope: 'PLATFORM', soft: null },
      CmsAuditLog: { scope: 'PLATFORM', soft: null },
      WebsiteConfig: { scope: 'PLATFORM', soft: null },
      WebsiteBanner: { scope: 'PLATFORM', soft: null },
      LandingPage: { scope: 'PLATFORM', soft: null },
      LandingMedia: { scope: 'PLATFORM', soft: null },
      Asset: { scope: 'PLATFORM', soft: null }
    }
  },
  audit: {
    label: 'Audit & activity',
    models: {
      ActivityLog: { scope: 'ORGANIZATION', soft: null, notes: 'organization_id optional; Org Admin còn lọc theo actor' },
      AuditLog: { scope: 'PLATFORM', soft: null },
      DomainEvent: { scope: 'PLATFORM', soft: null }
    }
  }
};

function listAllModelEntries() {
  const rows = [];
  for (const [domainId, domain] of Object.entries(DATA_DOMAINS)) {
    for (const [modelName, meta] of Object.entries(domain.models)) {
      rows.push({ domainId, domainLabel: domain.label, modelName, ...meta });
    }
  }
  return rows;
}

function getModelMeta(modelName) {
  return listAllModelEntries().find((r) => r.modelName === modelName) || null;
}

module.exports = {
  DATA_DOMAINS,
  listAllModelEntries,
  getModelMeta
};
