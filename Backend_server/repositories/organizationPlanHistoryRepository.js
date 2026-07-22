const OrganizationPlanHistory = require('../models/OrganizationPlanHistory');

async function recordPlanChange(input, { session } = {}) {
  const [created] = await OrganizationPlanHistory.create(
    [input],
    session ? { session } : undefined
  );
  return typeof created.toObject === 'function' ? created.toObject() : created;
}

module.exports = { recordPlanChange };
