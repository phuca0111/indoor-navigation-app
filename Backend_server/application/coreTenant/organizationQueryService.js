const legacyQueries = require('../../services/legacyOrganizationHttpService');
const { invokeLegacyHandler } = require('./legacyHttpAdapter');

function requireSuperAdmin(actor) {
  if (actor?.role !== 'SUPER_ADMIN') {
    throw Object.assign(new Error('Chỉ Super Admin được truy cập.'), {
      status: 403,
      code: 'FORBIDDEN'
    });
  }
}

async function listOrganizations(input) {
  requireSuperAdmin(input.actor);
  return invokeLegacyHandler(legacyQueries.listOrganizations, input);
}

async function getOrganization(input) {
  requireSuperAdmin(input.actor);
  return invokeLegacyHandler(legacyQueries.getOrganization, input);
}

async function getMyOrganizationDetail(input) {
  if (input.actor?.role !== 'ORG_ADMIN' || !input.actor.organization_id) {
    throw Object.assign(
      new Error('Chỉ ORG_ADMIN được xem tổ chức của mình.'),
      { status: 403, code: 'FORBIDDEN' }
    );
  }
  return invokeLegacyHandler(legacyQueries.getMyOrganizationDetail, input);
}

module.exports = {
  listOrganizations,
  getOrganization,
  getMyOrganizationDetail
};
