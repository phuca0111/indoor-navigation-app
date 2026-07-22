class TenantScope {
  constructor({ organizationId = null, system = false } = {}) {
    if (!system && !organizationId) {
      throw Object.assign(new Error('Tenant scope là bắt buộc.'), {
        status: 403,
        code: 'TENANT_SCOPE_REQUIRED'
      });
    }
    this.organizationId = organizationId ? String(organizationId) : null;
    this.system = system === true;
    Object.freeze(this);
  }

  static forOrganization(organizationId) {
    return new TenantScope({ organizationId });
  }

  static system() {
    return new TenantScope({ system: true });
  }

  static fromPrincipal(principal) {
    if (principal?.role === 'SUPER_ADMIN') return TenantScope.system();
    return TenantScope.forOrganization(principal?.organizationId);
  }

  assertOrganization(organizationId) {
    if (!this.system && String(organizationId) !== this.organizationId) {
      throw Object.assign(new Error('Dữ liệu nằm ngoài tenant scope.'), {
        status: 403,
        code: 'TENANT_SCOPE_VIOLATION'
      });
    }
  }
}

module.exports = { TenantScope };
