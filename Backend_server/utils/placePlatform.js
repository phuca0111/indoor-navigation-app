/**
 * Indoor Mapping Platform — hằng số lifecycle Place / Workspace / Proposal / Validation
 * Canonical enums cho Place Platform (Product Roadmap).
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

/** End-user Place Report reasons */
const PLACE_REPORT_REASON = Object.freeze({
  WRONG_LOCATION: 'WRONG_LOCATION',
  WRONG_NAME: 'WRONG_NAME',
  WRONG_FLOOR: 'WRONG_FLOOR',
  QR_INVALID: 'QR_INVALID',
  ROUTE_ERROR: 'ROUTE_ERROR',
  SPAM: 'SPAM',
  DUPLICATE: 'DUPLICATE',
  CLOSED: 'CLOSED',
  OTHER: 'OTHER'
});
const PLACE_REPORT_REASON_VALUES = Object.freeze(Object.values(PLACE_REPORT_REASON));

const PLACE_REPORT_STATUS = Object.freeze({
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
  CLOSED: 'CLOSED'
});
const PLACE_REPORT_STATUS_VALUES = Object.freeze(Object.values(PLACE_REPORT_STATUS));

/** Claim org category (Business / School / Hospital / Organization) */
const CLAIM_CATEGORY = Object.freeze({
  ORGANIZATION: 'ORGANIZATION',
  BUSINESS: 'BUSINESS',
  SCHOOL: 'SCHOOL',
  HOSPITAL: 'HOSPITAL'
});
const CLAIM_CATEGORY_VALUES = Object.freeze(Object.values(CLAIM_CATEGORY));

/** Place Event stub types */
const PLACE_EVENT_TYPE = Object.freeze({
  PROMOTION: 'PROMOTION',
  TEMPORARY_CLOSE: 'TEMPORARY_CLOSE',
  CONSTRUCTION: 'CONSTRUCTION'
});
const PLACE_EVENT_TYPE_VALUES = Object.freeze(Object.values(PLACE_EVENT_TYPE));

function publicationFromLegacyStatus(legacyStatus) {
  const s = String(legacyStatus || '').toUpperCase();
  if (s === 'ACTIVE') return PUBLICATION_STATUS.PUBLISHED;
  if (s === 'DRAFT') return PUBLICATION_STATUS.DRAFT;
  if (s === 'LOCKED' || s === 'MERGED') return PUBLICATION_STATUS.ARCHIVED;
  return PUBLICATION_STATUS.DRAFT;
}

function legacyStatusFromPublication(publicationStatus) {
  const p = String(publicationStatus || '').toUpperCase();
  if (p === PUBLICATION_STATUS.PUBLISHED) return 'ACTIVE';
  if (p === PUBLICATION_STATUS.ARCHIVED) return 'LOCKED';
  if (p === PUBLICATION_STATUS.PENDING) return 'DRAFT';
  return 'DRAFT';
}

function canonicalizePublicationInput(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'PUBLIC') return PUBLICATION_STATUS.PUBLISHED;
  if (v === 'UNLISTED') return PUBLICATION_STATUS.DRAFT;
  return v;
}

function normalizePublicationStatus(value, fallback = PUBLICATION_STATUS.DRAFT) {
  const v = canonicalizePublicationInput(value);
  return PUBLICATION_STATUS_VALUES.includes(v) ? v : fallback;
}

function canonicalizeOwnerInput(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'PLATFORM') return OWNER_TYPE.SYSTEM;
  if (v === 'PERSONAL') return OWNER_TYPE.COMMUNITY;
  return v;
}

function normalizeOwnerType(value, fallback = OWNER_TYPE.UNCLAIMED) {
  const v = canonicalizeOwnerInput(value);
  return OWNER_TYPE_VALUES.includes(v) ? v : fallback;
}

function normalizeWorkspaceStatus(value, fallback = WORKSPACE_STATUS.DRAFT) {
  const v = String(value || '').trim().toUpperCase();
  return WORKSPACE_STATUS_VALUES.includes(v) ? v : fallback;
}

function normalizeReportReason(value, fallback = PLACE_REPORT_REASON.OTHER) {
  const v = String(value || '').trim().toUpperCase();
  return PLACE_REPORT_REASON_VALUES.includes(v) ? v : fallback;
}

function normalizeClaimCategory(value, fallback = CLAIM_CATEGORY.ORGANIZATION) {
  const v = String(value || '').trim().toUpperCase();
  return CLAIM_CATEGORY_VALUES.includes(v) ? v : fallback;
}

function deriveOwnerType({ owner_type, owner_org_id }) {
  if (owner_type === OWNER_TYPE.SYSTEM) return OWNER_TYPE.SYSTEM;
  if (owner_org_id) return OWNER_TYPE.ORGANIZATION;
  if (owner_type === OWNER_TYPE.COMMUNITY) return OWNER_TYPE.COMMUNITY;
  if (owner_type && OWNER_TYPE_VALUES.includes(owner_type)) return owner_type;
  return OWNER_TYPE.UNCLAIMED;
}

function syncWorkspaceStatusFromBuildingStatus(buildingStatus, currentWorkspaceStatus) {
  const cur = normalizeWorkspaceStatus(currentWorkspaceStatus, WORKSPACE_STATUS.DRAFT);
  if (cur === WORKSPACE_STATUS.DEPRECATED || cur === WORKSPACE_STATUS.ARCHIVED || cur === WORKSPACE_STATUS.IN_REVIEW) {
    return cur;
  }
  if (buildingStatus === 'PUBLISHED') return WORKSPACE_STATUS.PUBLISHED;
  return WORKSPACE_STATUS.DRAFT;
}

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

function placePublicMongoFilter(extra = {}) {
  const publishedClause = {
    $or: [
      { publication_status: PUBLICATION_STATUS.PUBLISHED },
      // Legacy registry (trước khi canonical PUBLISHED)
      { publication_status: 'PUBLIC' },
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

function slugifyPlaceName(name) {
  const base = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'place';
}

async function ensureUniquePlaceSlug(PlaceModel, name, excludeId = null) {
  const base = slugifyPlaceName(name);
  let candidate = base;
  let n = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const filter = { slug: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    const exists = await PlaceModel.exists(filter);
    if (!exists) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
    if (n > 200) {
      candidate = `${base}-${Date.now().toString(36)}`;
      return candidate;
    }
  }
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
  PLACE_REPORT_REASON,
  PLACE_REPORT_REASON_VALUES,
  PLACE_REPORT_STATUS,
  PLACE_REPORT_STATUS_VALUES,
  CLAIM_CATEGORY,
  CLAIM_CATEGORY_VALUES,
  PLACE_EVENT_TYPE,
  PLACE_EVENT_TYPE_VALUES,
  publicationFromLegacyStatus,
  legacyStatusFromPublication,
  canonicalizePublicationInput,
  canonicalizeOwnerInput,
  normalizePublicationStatus,
  normalizeOwnerType,
  normalizeWorkspaceStatus,
  normalizeReportReason,
  normalizeClaimCategory,
  deriveOwnerType,
  syncWorkspaceStatusFromBuildingStatus,
  isPlacePubliclyListed,
  placePublicMongoFilter,
  slugifyPlaceName,
  ensureUniquePlaceSlug
};
