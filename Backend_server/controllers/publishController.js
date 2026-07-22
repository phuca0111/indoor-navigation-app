const commands = require('../application/mapLifecycle/publishApplicationService');
const queries = require('../application/mapLifecycle/mapLifecycleQueryService');

function parseFloor(req) {
  const value = Number.parseInt(req.params.floor, 10);
  if (!Number.isFinite(value)) throw Object.assign(new Error('Số tầng không hợp lệ.'), { status: 400 });
  return value;
}

function editSession(req) {
  return String(
    req.headers['x-edit-session'] || req.body?.edit_session_id || req.body?.session_id || ''
  ).trim();
}

function fail(res, error, prefix) {
  return res.status(error.status || 500).json({
    message: error.status ? error.message : `${prefix}: ${error.message}`,
    code: error.code,
    errors: error.details
  });
}

async function validatePublish(req, res) {
  try {
    const result = await commands.validatePublish({
      buildingId: req.params.buildingId,
      floorNumber: parseFloor(req),
      body: req.body || {}
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    return fail(res, error, 'Lỗi validate');
  }
}

async function enqueuePublish(req, res) {
  try {
    const floorNumber = parseFloor(req);
    const job = await commands.requestPublish({
      actor: req.user,
      buildingId: req.params.buildingId,
      floorNumber,
      body: req.body || {},
      editSessionId: editSession(req),
      idempotencyKey: req.headers['idempotency-key'] || req.body?.idempotency_key,
      ip: req.ip || ''
    });
    return res.status(202).json({
      message: 'Đã xếp hàng xuất bản.',
      job_id: String(job._id),
      status: job.status,
      building_id: req.params.buildingId,
      floor_number: floorNumber,
      idempotent_replay: Boolean(job.was_idempotent_replay)
    });
  } catch (error) {
    return fail(res, error, 'Lỗi enqueue publish');
  }
}

function serializeJob(job) {
  return {
    job_id: String(job._id),
    status: job.status,
    building_id: job.building_id?._id || job.building_id,
    building_name: job.building_id?.name || null,
    floor_number: job.floor_number,
    version: job.version,
    floor_id: job.floor_id,
    error: job.error || null,
    attempts: job.attempts || 0,
    max_attempts: job.max_attempts || 5,
    queue_backend: job.queue_backend || 'outbox',
    requested_by: job.requested_by,
    started_at: job.started_at,
    finished_at: job.finished_at,
    last_error_at: job.last_error_at || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

async function getJobStatus(req, res) {
  try {
    const job = await queries.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: 'Không tìm thấy job.', code: 'JOB_NOT_FOUND' });
    if (!(await queries.canAccessJob(req.user, job))) {
      return res.status(403).json({ message: 'Không có quyền xem job này.' });
    }
    return res.status(200).json(serializeJob(job));
  } catch (error) {
    return fail(res, error, 'Lỗi lấy job');
  }
}

async function listJobs(req, res) {
  try {
    const filter = { status: req.query.status, building_id: req.query.building_id };
    const rows = await queries.listAccessibleJobs(req.user, filter, req.query.limit);
    return res.status(200).json({ jobs: rows.map(serializeJob) });
  } catch (error) {
    return fail(res, error, 'Lỗi liệt kê job');
  }
}

async function retryJob(req, res) {
  try {
    const existing = await queries.getJob(req.params.jobId);
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy job.', code: 'JOB_NOT_FOUND' });
    if (!(await queries.canAccessJob(req.user, existing))) {
      return res.status(403).json({ message: 'Không có quyền retry job này.' });
    }
    const job = await commands.retryPublish({
      jobId: req.params.jobId,
      actor: req.user,
      mapData: req.body?.map_data,
      ip: req.ip || ''
    });
    return res.status(202).json({ message: 'Đã xếp lại hàng xuất bản.', ...serializeJob(job) });
  } catch (error) {
    return fail(res, error, 'Lỗi retry');
  }
}

module.exports = { validatePublish, enqueuePublish, getJobStatus, listJobs, retryJob };
