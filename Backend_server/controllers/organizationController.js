const organizationQueries = require('../application/coreTenant/organizationQueryService');
const organizationCommands = require('../application/coreTenant/organizationApplicationService');
const legacy = require('../services/legacyOrganizationHttpService');

function send(res, result) {
  return res.status(result.status || 200).json(result.body);
}

function endpoint(useCase) {
  return async (req, res) => {
    try {
      return send(res, await useCase({
        actor: req.user || null,
        params: req.params || {},
        query: req.query || {},
        body: req.body || {},
        ip: req.ip || ''
      }));
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.status ? error.message : `Lỗi máy chủ: ${error.message}`,
        ...(error.code ? { code: error.code } : {})
      });
    }
  };
}

module.exports = {
  listOrganizations: endpoint(organizationQueries.listOrganizations),
  getOrganization: endpoint(organizationQueries.getOrganization),
  getMyOrganizationDetail: endpoint(organizationQueries.getMyOrganizationDetail),
  updateOrganization: endpoint(organizationCommands.updateOrganization),
  updateMyOrganizationContact: endpoint(organizationCommands.updateMyOrganizationContact),
  createWithAdmin: legacy.createWithAdmin,
  createOrganizationFromPersonal: legacy.createOrganizationFromPersonal,
  createOrgForUserCore: legacy.createOrgForUserCore,
  createOrganizationBillingEvent: legacy.createOrganizationBillingEvent,
  getOrganizationSubscription: legacy.getOrganizationSubscription,
  activateOrganizationSubscription: legacy.activateOrganizationSubscription,
  cancelOrganizationSubscription: legacy.cancelOrganizationSubscription,
  expireOrganizationSubscription: legacy.expireOrganizationSubscription,
  setOrganizationPublishPermit: legacy.setOrganizationPublishPermit,
  clearOrganizationPublishPermit: legacy.clearOrganizationPublishPermit
};
