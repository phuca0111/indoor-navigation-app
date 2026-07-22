const IdentityChallenge = require('../models/IdentityChallenge');

function options(session) {
  return session ? { session } : undefined;
}

async function countRecent(userId, purpose, since, { session } = {}) {
  let query = IdentityChallenge.countDocuments({
    user_id: userId,
    purpose,
    createdAt: { $gte: since }
  });
  if (session) query = query.session(session);
  return query;
}

async function create(input, { session } = {}) {
  const [created] = await IdentityChallenge.create([input], options(session));
  return typeof created.toObject === 'function' ? created.toObject() : created;
}

async function findForConsume(challengeId, userId, purpose, { session } = {}) {
  let query = IdentityChallenge.findOne({
    _id: challengeId,
    user_id: userId,
    purpose
  }).select('+challenge_hash');
  if (session) query = query.session(session);
  return query.lean();
}

async function incrementAttemptByCompareAndSet(challenge, { session } = {}) {
  const result = await IdentityChallenge.updateOne(
    {
      _id: challenge._id,
      consumed_at: null,
      attempts: Number(challenge.attempts || 0)
    },
    { $inc: { attempts: 1 } },
    options(session)
  );
  return Number(result.modifiedCount || 0) === 1;
}

async function consumeByCompareAndSet(challenge, now, { session } = {}) {
  const result = await IdentityChallenge.updateOne(
    {
      _id: challenge._id,
      consumed_at: null,
      attempts: Number(challenge.attempts || 0),
      expires_at: { $gt: now }
    },
    { $set: { consumed_at: now } },
    options(session)
  );
  return Number(result.modifiedCount || 0) === 1;
}

async function findOwner(challengeId, purpose, { session } = {}) {
  let query = IdentityChallenge.findOne({ _id: challengeId, purpose }).select('user_id');
  if (session) query = query.session(session);
  return query.lean();
}

module.exports = {
  countRecent,
  create,
  findForConsume,
  incrementAttemptByCompareAndSet,
  consumeByCompareAndSet,
  findOwner
};
