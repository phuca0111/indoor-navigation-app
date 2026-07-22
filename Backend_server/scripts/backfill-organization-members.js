const mongoose = require('mongoose');
const User = require('../models/User');
const OrganizationMember = require('../models/OrganizationMember');
const { requireSafeMigrationUri } = require('./migration-safety');

function expectedMemberProjection(user) {
  return {
    role: user.role,
    building_ids: (user.assigned_buildings || []).map(String).sort(),
    status: user.is_active === false ? 'SUSPENDED' : 'ACTIVE'
  };
}

function memberMatchesUser(member, user) {
  if (!member) return false;
  const expected = expectedMemberProjection(user);
  return member.role === expected.role &&
    member.status === expected.status &&
    JSON.stringify((member.building_ids || []).map(String).sort()) ===
      JSON.stringify(expected.building_ids);
}

async function run() {
  const apply = process.argv.includes('--apply');
  const verifyOnly = process.argv.includes('--verify');
  await mongoose.connect(requireSafeMigrationUri());
  const users = await User.find({
    organization_id: { $ne: null },
    role: { $in: ['ORG_ADMIN', 'BUILDING_ADMIN'] }
  }).select('_id organization_id role assigned_buildings is_active').lean();
  let missing = 0;
  let mismatched = 0;
  let upserted = 0;
  for (const user of users) {
    const member = await OrganizationMember.findOne({
      organization_id: user.organization_id,
      user_id: user._id
    }).select('role building_ids status').lean();
    if (!member) {
      missing += 1;
    } else {
      if (!memberMatchesUser(member, user)) {
        mismatched += 1;
      }
    }
    if (apply && !verifyOnly) {
      await OrganizationMember.updateOne(
        { organization_id: user.organization_id, user_id: user._id },
        {
          $setOnInsert: { joined_at: new Date() },
          $set: {
            role: user.role,
            building_ids: user.assigned_buildings || [],
            status: user.is_active === false ? 'SUSPENDED' : 'ACTIVE'
          }
        },
        { upsert: true }
      );
      upserted += 1;
    }
  }
  const eligibleIds = users.map((user) => user._id);
  const orphanMembers = await OrganizationMember.countDocuments({
    status: { $ne: 'LEFT' },
    user_id: { $nin: eligibleIds }
  });
  console.log(JSON.stringify({
    mode: verifyOnly ? 'verify' : apply ? 'apply' : 'dry-run',
    eligible_users: users.length,
    missing_members: apply && !verifyOnly ? 0 : missing,
    mismatched_members: apply && !verifyOnly ? 0 : mismatched,
    orphan_members: orphanMembers,
    upserted
  }));
  if (verifyOnly && (missing > 0 || mismatched > 0 || orphanMembers > 0)) process.exitCode = 2;
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error('[member-backfill] failed:', error.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { run, expectedMemberProjection, memberMatchesUser };
