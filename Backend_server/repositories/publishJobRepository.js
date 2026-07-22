const PublishJob = require('../models/PublishJob');

function plain(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function createRequested(input, { session } = {}) {
  const [created] = await PublishJob.create([input], session ? { session } : undefined);
  return { job: plain(created), created: true };
}

async function findIdempotent(requestedBy, idempotencyKey) {
  if (!idempotencyKey) return null;
  return PublishJob.findOne({
    requested_by: requestedBy,
    idempotency_key: idempotencyKey
  }).lean();
}

async function claim(jobId, owner, leaseMs, { session } = {}) {
  const now = new Date();
  return PublishJob.findOneAndUpdate(
    {
      _id: jobId,
      $or: [
        { status: 'QUEUED' },
        { status: 'RUNNING', lease_expires_at: { $lte: now } }
      ]
    },
    {
      $set: {
        status: 'RUNNING',
        started_at: now,
        lease_owner: owner,
        lease_expires_at: new Date(now.getTime() + leaseMs)
      },
      $inc: { attempts: 1, fencing_token: 1 }
    },
    { new: true, session: session || undefined }
  ).lean();
}

async function complete(jobId, owner, fence, result, { session } = {}) {
  return PublishJob.findOneAndUpdate(
    { _id: jobId, status: 'RUNNING', lease_owner: owner, fencing_token: fence },
    {
      $set: {
        status: 'SUCCESS',
        version: result.version,
        floor_id: result.floorId,
        finished_at: new Date(),
        lease_owner: null,
        lease_expires_at: null,
        error: { code: null, message: null, details: [] }
      }
    },
    { new: true, session: session || undefined }
  ).lean();
}

async function fail(job, error, retryable) {
  return PublishJob.findOneAndUpdate(
    { _id: job._id, lease_owner: job.lease_owner, fencing_token: job.fencing_token },
    {
      $set: {
        status: retryable ? 'QUEUED' : 'FAILED',
        finished_at: retryable ? null : new Date(),
        dead_lettered_at: retryable ? null : new Date(),
        last_error_at: new Date(),
        lease_owner: null,
        lease_expires_at: null,
        error: {
          code: error.code || 'PUBLISH_ERROR',
          message: error.message || 'Lỗi publish.',
          details: error.details || []
        }
      }
    },
    { new: true }
  ).lean();
}

async function findById(jobId) {
  return PublishJob.findById(jobId).lean();
}

async function list(filter, limit) {
  const query = {};
  if (filter.status) query.status = String(filter.status).toUpperCase();
  if (filter.building_id) query.building_id = filter.building_id;
  if (filter.requested_by) query.requested_by = filter.requested_by;
  if (filter.building_ids?.length) query.building_id = { $in: filter.building_ids };
  return PublishJob.find(query).select('-map_data').sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .populate('building_id', 'name')
    .populate('requested_by', 'email full_name')
    .lean();
}

async function prepareRetry(jobId, mapData, { session } = {}) {
  const job = await PublishJob.findById(jobId).session(session || null);
  if (!job) return null;
  if (mapData !== undefined) {
    job.map_data = mapData;
    job.markModified('map_data');
  }
  job.status = 'QUEUED';
  job.started_at = null;
  job.finished_at = null;
  job.dead_lettered_at = null;
  job.lease_owner = null;
  job.lease_expires_at = null;
  job.error = { code: null, message: null, details: [] };
  await job.save({ session: session || undefined });
  return plain(job);
}

module.exports = {
  createRequested,
  findIdempotent,
  claim,
  complete,
  fail,
  findById,
  list,
  prepareRetry
};
