class ActorContext {
  constructor({ principal = null, ipAddress = '', userAgent = '', requestId = '' } = {}) {
    this.principal = principal;
    this.userId = principal?.userId || null;
    this.role = principal?.role || null;
    this.organizationId = principal?.organizationId || null;
    this.ipAddress = String(ipAddress || '').slice(0, 64);
    this.userAgent = String(userAgent || '').slice(0, 500);
    this.requestId = String(requestId || '').slice(0, 128);
    Object.freeze(this);
  }

  static fromRequest(req, principal = req.effectivePrincipal || null) {
    return new ActorContext({
      principal,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      requestId: req.id || req.headers?.['x-request-id']
    });
  }
}

module.exports = { ActorContext };
