const User = require('../models/User');

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function findBillingUserById(userId, { session } = {}) {
  const query = User.findById(userId)
    .select('+personal_payment_fulfillments')
    .lean();
  return withSession(query, session);
}

async function findPersonalPlanById(userId, { session } = {}) {
  const query = User.findById(userId)
    .select('email phone plan plan_expires_at organization_id role')
    .lean();
  return withSession(query, session);
}

async function fulfillPersonalPlan(
  userId,
  { plan, planExpiresAt, fulfillmentKey },
  { session } = {}
) {
  return User.findOneAndUpdate(
    {
      _id: userId,
      personal_payment_fulfillments: { $ne: fulfillmentKey }
    },
    {
      $set: { plan, plan_expires_at: planExpiresAt },
      $addToSet: { personal_payment_fulfillments: fulfillmentKey }
    },
    {
      returnDocument: 'after',
      ...(session ? { session } : {})
    }
  )
    .select('+personal_payment_fulfillments')
    .lean();
}

async function updateBillingUser(userId, changes, { session } = {}) {
  return User.findByIdAndUpdate(
    userId,
    { $set: changes },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  )
    .select('+personal_payment_fulfillments')
    .lean();
}

module.exports = {
  findBillingUserById,
  findPersonalPlanById,
  fulfillPersonalPlan,
  updateBillingUser
};
