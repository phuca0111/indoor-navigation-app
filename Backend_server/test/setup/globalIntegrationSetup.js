require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { resolveTestMongoUri } = require('../support/testDatabase');

module.exports = async function globalIntegrationSetup() {
  const uri = resolveTestMongoUri();
  process.env.MONGO_URI = uri;
  await mongoose.connect(uri);

  const Organization = require('../../models/Organization');
  const User = require('../../models/User');
  const Building = require('../../models/Building');
  const Floor = require('../../models/Floor');
  const OrganizationMember = require('../../models/OrganizationMember');
  const WebsiteConfig = require('../../models/WebsiteConfig');

  const password = bcrypt.hashSync('IntegrationTest123!', 10);
  const organization = await Organization.findOneAndUpdate(
    { slug: 'integration-fixture-org' },
    {
      $set: {
        name: 'Integration Fixture Organization',
        plan: 'PRO',
        billing_status: 'ACTIVE',
        plan_started_at: new Date('2026-01-01T00:00:00.000Z'),
        plan_expires_at: new Date('2036-01-01T00:00:00.000Z'),
        publish_permit_key: 'integration-test-permit',
        publish_permit_expires_at: new Date('2036-01-01T00:00:00.000Z'),
        is_active: true
      }
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  const upsertUser = (email, role, extra = {}) => User.findOneAndUpdate(
    { email },
    {
      $set: {
        password,
        role,
        full_name: `Integration ${role}`,
        is_active: true,
        session_version: 0,
        ...extra
      }
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  const superAdmin = await upsertUser('fixture.super@test.local', 'SUPER_ADMIN', {
    organization_id: null,
    assigned_buildings: []
  });
  await upsertUser('fixture.finance@test.local', 'FINANCE_ADMIN', {
    organization_id: null,
    assigned_buildings: []
  });
  const orgAdmin = await upsertUser('fixture.org@test.local', 'ORG_ADMIN', {
    organization_id: organization._id,
    assigned_buildings: []
  });
  const registeredUser = await upsertUser('fixture.personal@test.local', 'REGISTERED_USER', {
    organization_id: null,
    plan: 'PRO',
    plan_expires_at: new Date('2036-01-01T00:00:00.000Z'),
    assigned_buildings: []
  });

  const building = await Building.findOneAndUpdate(
    { name: 'Integration Fixture Building', organization_id: organization._id },
    {
      $set: {
        address: 'Test namespace only',
        total_floors: 5,
        status: 'PUBLISHED',
        visibility: 'PRIVATE',
        is_active: true,
        created_by: superAdmin._id,
        owner_user_id: null
      }
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  const personalBuilding = await Building.findOneAndUpdate(
    { name: 'Integration Fixture Personal Building', owner_user_id: registeredUser._id },
    {
      $set: {
        total_floors: 3,
        status: 'DRAFT',
        visibility: 'PRIVATE',
        is_active: true,
        created_by: registeredUser._id,
        organization_id: null
      }
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  const buildingAdmin = await upsertUser('fixture.building@test.local', 'BUILDING_ADMIN', {
    organization_id: organization._id,
    assigned_buildings: [building._id]
  });

  await Floor.findOneAndUpdate(
    { building_id: building._id, floor_number: 0 },
    {
      $set: {
        floor_name: 'Tầng trệt',
        version: 1,
        published_at: new Date('2026-01-01T00:00:00.000Z'),
        last_modified_by: superAdmin._id,
        map_data: {
          schema_version: 1,
          rooms: [],
          doors: [],
          pois: [],
          nodes: [],
          edges: [],
          walls: [],
          qr_anchors: []
        }
      }
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  await Promise.all([
    OrganizationMember.findOneAndUpdate(
      { organization_id: organization._id, user_id: orgAdmin._id },
      {
        $set: {
          role: 'ORG_ADMIN',
          status: 'ACTIVE',
          building_ids: []
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    ),
    OrganizationMember.findOneAndUpdate(
      { organization_id: organization._id, user_id: buildingAdmin._id },
      {
        $set: {
          role: 'BUILDING_ADMIN',
          status: 'ACTIVE',
          building_ids: [building._id]
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    )
  ]);

  await WebsiteConfig.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default', updated_by: superAdmin._id } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  const { ensureLandingPages } = require('../../services/websiteCmsService');
  await ensureLandingPages();

  registeredUser.assigned_buildings = [personalBuilding._id];
  await registeredUser.save();
  await mongoose.disconnect();
};
