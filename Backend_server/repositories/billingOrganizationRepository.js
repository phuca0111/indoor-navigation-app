const Organization = require('../models/Organization');

async function findBillingOrganizationById(organizationId, { session } = {}) {
  const query = Organization.findById(organizationId).lean();
  return session ? query.session(session) : query;
}

async function updateBillingState(organizationId, changes, { session } = {}) {
  return Organization.findByIdAndUpdate(
    organizationId,
    { $set: changes },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function countOrganizationsUsingPlan(planCode) {
  return Organization.countDocuments({ plan: planCode });
}

async function listActiveBillingOrganizations() {
  return Organization.find({ is_active: { $ne: false } })
    .select('_id name plan billing_status grace_ends_at plan_expires_at plan_expiry_reminded_at')
    .lean();
}

async function listExpiryReminderCandidates(from, to) {
  return Organization.find({
    is_active: { $ne: false },
    billing_status: 'ACTIVE',
    plan_expires_at: { $ne: null, $gte: from, $lte: to }
  })
    .select('_id name plan_expires_at plan_expiry_reminded_at')
    .lean();
}

async function claimExpiryReminder(organizationId, dayStart, staleBefore) {
  return Organization.findOneAndUpdate(
    {
      _id: organizationId,
      $and: [
        {
          $or: [
            { plan_expiry_reminded_at: null },
            { plan_expiry_reminded_at: { $lt: dayStart } }
          ]
        },
        {
          $or: [
            { plan_expiry_reminder_claimed_at: null },
            { plan_expiry_reminder_claimed_at: { $lt: staleBefore } }
          ]
        }
      ]
    },
    { $set: { plan_expiry_reminder_claimed_at: new Date() } },
    { returnDocument: 'after' }
  ).lean();
}

async function completeExpiryReminder(organizationId, sent) {
  const update = {
    $set: { plan_expiry_reminder_claimed_at: null }
  };
  if (sent) update.$set.plan_expiry_reminded_at = new Date();
  return Organization.updateOne({ _id: organizationId }, update);
}

module.exports = {
  findBillingOrganizationById,
  updateBillingState,
  countOrganizationsUsingPlan,
  listActiveBillingOrganizations,
  listExpiryReminderCandidates,
  claimExpiryReminder,
  completeExpiryReminder
};
