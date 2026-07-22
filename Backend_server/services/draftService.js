const application = require('../application/mapLifecycle/draftApplicationService');
const drafts = require('../repositories/draftRepository');
const {
  draftEtag,
  parseExpectedRevision
} = require('../domain/mapLifecyclePolicies');

async function getByFloor(buildingId, floorNumber) {
  return drafts.findActive(buildingId, floorNumber);
}

async function load(buildingId, floorNumber, actor = { role: 'SUPER_ADMIN' }) {
  return application.loadDraft({ actor, buildingId, floorNumber });
}

async function save(buildingId, floorNumber, payload, userId, options = {}) {
  return application.saveDraft({
    actor: { userId, role: options.role || 'SUPER_ADMIN' },
    buildingId,
    floorNumber,
    payload,
    expectedRevision: options.expectedVersion,
    editSessionId: options.editSessionId,
    ip: options.ip
  });
}

async function softDelete(buildingId, floorNumber, userId, retentionDays = 30) {
  const days = Math.max(1, Number(retentionDays) || 30);
  return drafts.softDelete(
    buildingId,
    floorNumber,
    userId,
    new Date(Date.now() + days * 86400000)
  );
}

module.exports = {
  getByFloor,
  load,
  save,
  softDelete,
  purgeExpired: drafts.purgeExpired,
  draftEtag,
  parseExpectedVersion: parseExpectedRevision
};
