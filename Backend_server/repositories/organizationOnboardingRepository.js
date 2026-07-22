const Organization = require('../models/Organization');
const User = require('../models/User');
const Building = require('../models/Building');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function slugExists(slug, { session } = {}) {
  const query = Organization.exists({ slug });
  return Boolean(await (session ? query.session(session) : query));
}

async function createOrganization(input, { session } = {}) {
  const [created] = await Organization.create(
    [input],
    session ? { session } : undefined
  );
  return toDto(created);
}

async function promoteUserToOrganizationAdmin(userId, organizationId, { session } = {}) {
  return User.findByIdAndUpdate(
    userId,
    {
      $set: {
        role: 'ORG_ADMIN',
        organization_id: organizationId
      }
    },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function migratePersonalBuildings(userId, organizationId, { session } = {}) {
  return Building.updateMany(
    { owner_user_id: userId },
    { $set: { organization_id: organizationId, owner_user_id: null } },
    session ? { session } : undefined
  );
}

module.exports = {
  slugExists,
  createOrganization,
  promoteUserToOrganizationAdmin,
  migratePersonalBuildings
};
