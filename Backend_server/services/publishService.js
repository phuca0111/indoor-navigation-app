const application = require('../application/mapLifecycle/publishApplicationService');
const queries = require('../application/mapLifecycle/mapLifecycleQueryService');
const { validateMapData } = require('./publishMapValidate');

async function resolvePublishMapData(buildingId, floorNumber, body) {
  return application.resolveMapData(buildingId, floorNumber, body);
}

async function applyPublish(input) {
  return application.publishInUnitOfWork({
    buildingId: input.buildingId,
    floorNumber: input.floorNum,
    mapData: input.map_data,
    userId: input.userId,
    ip: input.ip
  });
}

async function syncQrCodes(floor) {
  return application.syncPublishedFloorQr(floor);
}

async function enqueuePublishJob(input) {
  return application.requestPublish({
    actor: { userId: input.userId, role: input.role || 'SUPER_ADMIN' },
    buildingId: input.buildingId,
    floorNumber: input.floorNum,
    body: { map_data: input.map_data },
    editSessionId: input.editSessionId,
    idempotencyKey: input.idempotencyKey
  });
}

async function processPublishJob(jobId, options) {
  return application.processPublishJob(jobId, options);
}

async function getPublishJob(jobId) {
  return queries.getJob(jobId);
}

async function listPublishJobs(filter, limit) {
  return queries.listJobs(filter, limit);
}

async function retryPublishJob(jobId, options = {}) {
  return application.retryPublish({
    jobId,
    actor: options.actor || { userId: options.userId },
    mapData: options.map_data
  });
}

module.exports = {
  validateMapData,
  resolvePublishMapData,
  applyPublish,
  syncQrCodes,
  enqueuePublishJob,
  processPublishJob,
  getPublishJob,
  listPublishJobs,
  retryPublishJob,
  normalizeIdempotencyKey: application.normalizeIdempotencyKey
};
