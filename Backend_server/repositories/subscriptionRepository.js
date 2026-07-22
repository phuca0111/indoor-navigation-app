const Subscription = require('../models/Subscription');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function findCurrentByOrganization(organizationId, { session } = {}) {
  const query = Subscription.findOne({
    organization_id: organizationId,
    is_current: true
  }).lean();
  return withSession(query, session);
}

async function findByBillingEvent(billingEventId, { session } = {}) {
  if (!billingEventId) return null;
  const query = Subscription.findOne({ billing_event_id: billingEventId }).lean();
  return withSession(query, session);
}

async function findById(subscriptionId, { session } = {}) {
  const query = Subscription.findById(subscriptionId).lean();
  return withSession(query, session);
}

async function deactivateCurrentForOrganization(organizationId, { session } = {}) {
  return Subscription.updateMany(
    { organization_id: organizationId, is_current: true },
    { $set: { is_current: false } },
    session ? { session } : undefined
  );
}

async function createCurrent(input, { session } = {}) {
  const [created] = await Subscription.create([input], session ? { session } : undefined);
  return toDto(created);
}

async function updateState(subscriptionId, changes, { session } = {}) {
  const query = Subscription.findByIdAndUpdate(
    subscriptionId,
    { $set: changes },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
  return query;
}

async function countCurrentUsingPlan(planCode) {
  return Subscription.countDocuments({ plan: planCode, is_current: true });
}

async function claimExpiryNotification(subscriptionId, staleBefore, { session } = {}) {
  return Subscription.findOneAndUpdate(
    {
      _id: subscriptionId,
      'metadata.expiry_email_notified_at': { $exists: false },
      $or: [
        { 'metadata.expiry_email_claimed_at': { $exists: false } },
        { 'metadata.expiry_email_claimed_at': { $lt: staleBefore } }
      ]
    },
    { $set: { 'metadata.expiry_email_claimed_at': new Date() } },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function completeExpiryNotification(subscriptionId, sent, { session } = {}) {
  const update = {
    $unset: { 'metadata.expiry_email_claimed_at': '' }
  };
  if (sent) update.$set = { 'metadata.expiry_email_notified_at': new Date() };
  return Subscription.updateOne(
    { _id: subscriptionId },
    update,
    session ? { session } : undefined
  );
}

module.exports = {
  findCurrentByOrganization,
  findByBillingEvent,
  findById,
  deactivateCurrentForOrganization,
  createCurrent,
  updateState,
  countCurrentUsingPlan,
  claimExpiryNotification,
  completeExpiryNotification
};
