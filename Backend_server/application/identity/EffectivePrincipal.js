const TENANT_ROLES = new Set(['ORG_ADMIN', 'BUILDING_ADMIN']);

class EffectivePrincipal {
  constructor({
    userId,
    role,
    organizationId = null,
    buildingIds = [],
    sessionId = null,
    sessionVersion = 0,
    tokenId = null
  }) {
    if (!userId || !role) {
      throw new TypeError('EffectivePrincipal yêu cầu userId và role.');
    }
    if (TENANT_ROLES.has(role) && !organizationId) {
      throw Object.assign(new Error('Principal tenant thiếu organization.'), {
        status: 403,
        code: 'ORG_MISSING'
      });
    }
    this.userId = String(userId);
    this.role = role;
    this.organizationId = organizationId ? String(organizationId) : null;
    this.buildingIds = Object.freeze((buildingIds || []).map(String));
    this.sessionId = sessionId || null;
    this.sessionVersion = Number(sessionVersion) || 0;
    this.tokenId = tokenId || null;
    Object.freeze(this);
  }

  toLegacyClaims() {
    return {
      userId: this.userId,
      role: this.role,
      organization_id: this.organizationId,
      member_building_ids: [...this.buildingIds],
      sid: this.sessionId,
      sv: this.sessionVersion,
      jti: this.tokenId
    };
  }
}

module.exports = { EffectivePrincipal, TENANT_ROLES };
