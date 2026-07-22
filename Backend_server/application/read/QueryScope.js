/**
 * Explicit query scopes for Dashboard / Analytics / Finance read models.
 * System scope must be passed explicitly — never inferred from an empty filter.
 */
const SCOPES = Object.freeze({
  SYSTEM: 'SYSTEM',
  ORGANIZATION: 'ORGANIZATION',
  BUILDINGS: 'BUILDINGS',
  PERSONAL: 'PERSONAL'
});

class QueryScope {
  constructor({
    type,
    organizationId = null,
    buildingIds = null,
    ownerUserId = null,
    actorRole = null,
    filterOrganizationId = null
  }) {
    if (!Object.values(SCOPES).includes(type)) {
      throw Object.assign(new Error('Query scope không hợp lệ.'), {
        status: 400,
        code: 'QUERY_SCOPE_INVALID'
      });
    }
    this.type = type;
    this.organizationId = organizationId ? String(organizationId) : null;
    this.buildingIds = Array.isArray(buildingIds)
      ? buildingIds.map(String)
      : buildingIds;
    this.ownerUserId = ownerUserId ? String(ownerUserId) : null;
    this.actorRole = actorRole || null;
    this.filterOrganizationId = filterOrganizationId
      ? String(filterOrganizationId)
      : null;
    Object.freeze(this);
  }

  static system({ actorRole = null, filterOrganizationId = null } = {}) {
    return new QueryScope({
      type: SCOPES.SYSTEM,
      actorRole,
      filterOrganizationId
    });
  }

  static organization(organizationId, { actorRole = null } = {}) {
    if (!organizationId) {
      throw Object.assign(new Error('Thiếu organization scope.'), {
        status: 403,
        code: 'TENANT_SCOPE_REQUIRED'
      });
    }
    return new QueryScope({
      type: SCOPES.ORGANIZATION,
      organizationId,
      actorRole
    });
  }

  static buildings(buildingIds, {
    organizationId = null,
    actorRole = null
  } = {}) {
    const ids = Array.isArray(buildingIds) ? buildingIds.map(String) : [];
    return new QueryScope({
      type: SCOPES.BUILDINGS,
      buildingIds: ids,
      organizationId,
      actorRole
    });
  }

  static personal(ownerUserId, { actorRole = null } = {}) {
    if (!ownerUserId) {
      throw Object.assign(new Error('Thiếu personal scope.'), {
        status: 403,
        code: 'PERSONAL_SCOPE_REQUIRED'
      });
    }
    return new QueryScope({
      type: SCOPES.PERSONAL,
      ownerUserId,
      actorRole
    });
  }

  get isSystem() {
    return this.type === SCOPES.SYSTEM;
  }

  get effectiveOrganizationId() {
    if (this.type === SCOPES.SYSTEM) {
      return this.filterOrganizationId;
    }
    return this.organizationId;
  }

  /**
   * Legacy analytics shape: { role, orgId } without masquerading FINANCE_ADMIN
   * as SUPER_ADMIN.
   */
  toLegacyAnalytics() {
    const orgId = this.effectiveOrganizationId;
    if (this.isSystem && !orgId) {
      return {
        role: this.actorRole === 'FINANCE_ADMIN' ? 'FINANCE_ADMIN' : 'SUPER_ADMIN',
        orgId: null,
        scopeType: this.type,
        system: true
      };
    }
    if (this.type === SCOPES.BUILDINGS) {
      return {
        role: this.actorRole || 'BUILDING_ADMIN',
        orgId: this.organizationId,
        buildingIds: this.buildingIds,
        scopeType: this.type,
        system: false
      };
    }
    return {
      role: this.actorRole || 'ORG_ADMIN',
      orgId,
      scopeType: this.type,
      system: false
    };
  }

  assertBuildingAllowed(buildingId, { allowedBuildingIds = null } = {}) {
    if (!buildingId) return;
    const id = String(buildingId);
    if (this.isSystem) return;
    if (this.type === SCOPES.BUILDINGS) {
      const allowed = this.buildingIds || [];
      if (!allowed.includes(id)) {
        throw Object.assign(new Error('building_id nằm ngoài phạm vi được gán.'), {
          status: 403,
          code: 'FOREIGN_BUILDING_ID'
        });
      }
      return;
    }
    if (this.type === SCOPES.ORGANIZATION || this.type === SCOPES.PERSONAL) {
      // Require explicit allow-list from caller (org buildings resolved upstream).
      if (!Array.isArray(allowedBuildingIds)) {
        throw Object.assign(new Error('Thiếu danh sách building được phép cho scope.'), {
          status: 403,
          code: 'FOREIGN_BUILDING_ID'
        });
      }
      if (!allowedBuildingIds.map(String).includes(id)) {
        throw Object.assign(new Error('building_id nằm ngoài phạm vi tổ chức.'), {
          status: 403,
          code: 'FOREIGN_BUILDING_ID'
        });
      }
    }
  }

  toJSON() {
    return {
      type: this.type,
      organizationId: this.organizationId,
      buildingIds: this.buildingIds,
      ownerUserId: this.ownerUserId,
      actorRole: this.actorRole,
      filterOrganizationId: this.filterOrganizationId
    };
  }
}

module.exports = { QueryScope, SCOPES };
