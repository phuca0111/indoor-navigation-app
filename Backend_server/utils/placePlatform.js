/**
 * Indoor Mapping Platform — hằng số lifecycle Place / Workspace / Proposal / Validation
 * GĐ1: chuẩn hóa status & ownership (tương thích Place.status legacy ACTIVE/LOCKED/MERGED).
 */

const PUBLICATION_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED'
});
const PUBLICATION_STATUS_VALUES = Object.freeze(Object.values(PUBLICATION_STATUS));

const WORKSPACE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  PUBLISHED: 'PUBLISHED',
  DEPRECATED: 'DEPRECATED',
  ARCHIVED: 'ARCHIVED'
});
const WORKSPACE_STATUS_VALUES = Object.freeze(Object.values(WORKSPACE_STATUS));

const OWNER_TYPE = Object.freeze({
  UNCLAIMED: 'UNCLAIMED',
  COMMUNITY: 'COMMUNITY',
  ORGANIZATION: 'ORGANIZATION',
  SYSTEM: 'SYSTEM'
});
const OWNER_TYPE_VALUES = Object.freeze(Object.values(OWNER_TYPE));

const VERIFICATION_STATUS = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  CLAIM_PENDING: 'CLAIM_PENDING',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  REVOKED: 'REVOKED'
});
const VERIFICATION_STATUS_VALUES = Object.freeze(Object.values(VERIFICATION_STATUS));

const PROPOSAL_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
});
const PROPOSAL_STATUS_VALUES = Object.freeze(Object.values(PROPOSAL_STATUS));

const VALIDATION_RISK = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH'
});

const MODERATION_ROUTE = Object.freeze({
  AUTO: 'AUTO',
  ORG_MOD: 'ORG_MOD',
  MAP_MOD: 'MAP_MOD',
  ESCALATE: 'ESCALATE'
});

/** Map legacy Place.status → publication_status kiến trúc. */
function publicationFromLegacyStatus(legacyStatus) {
  const s = String(legacyStatus || '').toUpperCase();
  if (s === 'ACTIVE') return PUBLICATION_STATUS.PUBLISHED;
  if (s === 'DRAFT') return PUBLICATION_STATUS.DRAFT;
  if (s === 'LOCKED' || s === 'MERGED') return PUBLICATION_STATUS.ARCHIVED;
  return PUBLICATION_STATUS.DRAFT;
}

/** Map publication_status → legacy status (giữ editor / governance cũ). */
function legacyStatusFromPublication(publicationStatus) {
  const p = String(publicationStatus || '').toUpperCase();
  if (p === PUBLICATION_STATUS.PUBLISHED) return 'ACTIVE';
  if (p === PUBLICATION_STATUS.ARCHIVED) return 'LOCKED';
  if (p === PUBLICATION_STATUS.PENDING) return 'DRAFT';
  return 'DRAFT';
}

function normalizePublicationStatus(value, fallback = PUBLICATION_STATUS.DRAFT) {
  const v = String(value || '').trim().toUpperCase();
  return PUBLICATION_STATUS_VALUES.includes(v) ? v : fallback;
}

function normalizeOwnerType(value, fallback = OWNER_TYPE.UNCLAIMED) {
  const v = String(value || '').trim().toUpperCase();
  return OWNER_TYPE_VALUES.includes(v) ? v : fallback;
}

function normalizeWorkspaceStatus(value, fallback = WORKSPACE_STATUS.DRAFT) {
  const v = String(value || '').trim().toUpperCase();
  return WORKSPACE_STATUS_VALUES.includes(v) ? v : fallback;
}

/**
 * Đồng bộ owner_type từ owner_org_id (không ghi đè SYSTEM).
 */
function deriveOwnerType({ owner_type, owner_org_id }) {
  if (owner_type === OWNER_TYPE.SYSTEM) return OWNER_TYPE.SYSTEM;
  if (owner_org_id) return OWNER_TYPE.ORGANIZATION;
  if (owner_type === OWNER_TYPE.COMMUNITY) return OWNER_TYPE.COMMUNITY;
  if (owner_type && OWNER_TYPE_VALUES.includes(owner_type)) return owner_type;
  return OWNER_TYPE.UNCLAIMED;
}

/**
 * Building.status DRAFT|PUBLISHED → gợi ý workspace_status (không đụng DEPRECATED/ARCHIVED/IN_REVIEW).
 */
function syncWorkspaceStatusFromBuildingStatus(buildingStatus, currentWorkspaceStatus) {
  const cur = normalizeWorkspaceStatus(currentWorkspaceStatus, WORKSPACE_STATUS.DRAFT);
  if (cur === WORKSPACE_STATUS.DEPRECATED || cur === WORKSPACE_STATUS.ARCHIVED || cur === WORKSPACE_STATUS.IN_REVIEW) {
    return cur;
  }
  if (buildingStatus === 'PUBLISHED') return WORKSPACE_STATUS.PUBLISHED;
  return WORKSPACE_STATUS.DRAFT;
}

/** Place có được list public (Registry) không. */
function isPlacePubliclyListed(place) {
  if (!place) return false;
  const pub = place.publication_status
    ? normalizePublicationStatus(place.publication_status)
    : publicationFromLegacyStatus(place.status);
  if (pub !== PUBLICATION_STATUS.PUBLISHED) return false;
  const legacy = String(place.status || '').toUpperCase();
  if (legacy === 'LOCKED' || legacy === 'MERGED') return false;
  return true;
}

/** Mongo filter Place public. */
function placePublicMongoFilter(extra = {}) {
  const publishedClause = {
    $or: [
      { publication_status: PUBLICATION_STATUS.PUBLISHED },
      {
        $and: [
          {
            $or: [
              { publication_status: null },
              { publication_status: { $exists: false } },
              { publication_status: '' }
            ]
          },
          { status: 'ACTIVE' }
        ]
      }
    ]
  };
  return {
    status: { $nin: ['LOCKED', 'MERGED'] },
    ...extra,
    $and: [
      publishedClause,
      ...(extra.$and || [])
    ]
  };
}

module.exports = {
  PUBLICATION_STATUS,
  PUBLICATION_STATUS_VALUES,
  WORKSPACE_STATUS,
  WORKSPACE_STATUS_VALUES,
  OWNER_TYPE,
  OWNER_TYPE_VALUES,
  VERIFICATION_STATUS,
  VERIFICATION_STATUS_VALUES,
  PROPOSAL_STATUS,
  PROPOSAL_STATUS_VALUES,
  VALIDATION_RISK,
  MODERATION_ROUTE,
  publicationFromLegacyStatus,
  legacyStatusFromPublication,
  normalizePublicationStatus,
  normalizeOwnerType,
  normalizeWorkspaceStatus,
  deriveOwnerType,
  syncWorkspaceStatusFromBuildingStatus,
  isPlacePubliclyListed,
  placePublicMongoFilter
};
