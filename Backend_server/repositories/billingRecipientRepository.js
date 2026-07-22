const User = require('../models/User');

async function findActiveOrganizationAdmin(organizationId) {
  return User.findOne({
    organization_id: organizationId,
    role: 'ORG_ADMIN',
    is_active: { $ne: false }
  })
    .select('email')
    .lean();
}

module.exports = { findActiveOrganizationAdmin };
